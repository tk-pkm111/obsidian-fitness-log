import { describe, expect, it } from 'vitest';
import { CatalogError } from '../../../src/lib/model/catalog';
import {
	addListName,
	addRecordType,
	applyListsToFrontmatter,
	categoryName,
	categoryOrder,
	defaultLists,
	equipmentName,
	isListsNote,
	listsFromFrontmatter,
	moveListItem,
	recordTypeName,
	removeListItem,
	renameListItem,
} from '../../../src/lib/model/lists';

describe('種目の選択肢（カテゴリ・器具・記録のしかた）', () => {
	it('既定のカテゴリに「肩」があり、記録のしかたは項目から名前を付ける', () => {
		const lists = defaultLists();
		expect(lists.categories).toEqual([
			'プッシュ',
			'プル',
			'脚',
			'肩',
			'腕',
			'体幹',
			'有酸素',
			'その他',
		]);
		expect(lists.recordTypes).toEqual([
			{ name: '重量 × 回数', type: 'weight-reps' },
			{ name: '回数のみ', type: 'reps' },
			{ name: '時間のみ', type: 'duration' },
			{ name: '重量 × 時間', type: 'weight-duration' },
			{ name: '距離 × 時間', type: 'distance-duration' },
		]);
		expect(recordTypeName('reps-distance', lists)).toBe('回数 × 距離');
	});

	it('以前の版の英語のキーは既定の名前で読み、ほかの名前はそのまま', () => {
		expect(categoryName('push')).toBe('プッシュ');
		expect(categoryName(' 胸 ')).toBe('胸');
		expect(categoryName(undefined)).toBe('');
		expect(equipmentName('cable')).toBe('ケーブル');
		expect(equipmentName('')).toBeUndefined();
	});

	it('設定ノートの frontmatter と往復でき、無い・読めないキーは既定', () => {
		const lists = addRecordType(
			addListName(defaultLists(), 'categories', '胸'),
			'reps-duration',
			'',
		);
		const fm: Record<string, unknown> = { tags: ['自分のタグ'], memo: 'x' };
		applyListsToFrontmatter(fm, lists);
		expect(fm.tags).toEqual(['自分のタグ', 'fitness-settings']);
		expect(fm.memo).toBe('x');
		expect(isListsNote(fm)).toBe(true);
		expect(listsFromFrontmatter(fm)).toEqual(lists);
		const partial = listsFromFrontmatter({
			categories: ['胸', '胸', '', '背中'],
			record_types: [{ fields: ['duration'] }, { name: '?', type: 'x' }],
		});
		expect(partial.categories).toEqual(['胸', '背中']);
		expect(partial.equipment).toEqual(defaultLists().equipment);
		expect(partial.recordTypes).toEqual([
			{ name: '時間のみ', type: 'duration' },
		]);
		expect(listsFromFrontmatter({ record_types: [] }).recordTypes).toEqual(
			defaultLists().recordTypes,
		);
	});

	it('足す・名前を変える・消す・並べ替える（空・重なりはエラー）', () => {
		const lists = defaultLists();
		expect(() => addListName(lists, 'categories', ' ')).toThrow(
			CatalogError,
		);
		expect(() => addListName(lists, 'categories', '肩')).toThrow(
			'「肩」はもうあります',
		);
		expect(() => addRecordType(lists, 'duration', '')).toThrow(
			CatalogError,
		);
		const renamed = renameListItem(lists, 'categories', 0, '押す');
		expect(renamed.categories[0]).toBe('押す');
		expect(lists.categories[0]).toBe('プッシュ'); // 元の一覧は変えない
		expect(() => renameListItem(lists, 'categories', 0, 'プル')).toThrow(
			CatalogError,
		);
		expect(removeListItem(lists, 'equipment', 0).equipment).not.toContain(
			'マシン',
		);
		const one = {
			...lists,
			recordTypes: lists.recordTypes.slice(0, 1),
		};
		expect(() => removeListItem(one, 'recordTypes', 0)).toThrow(
			CatalogError,
		);
		expect(moveListItem(lists, 'categories', 3, 0).categories[0]).toBe(
			'肩',
		);
	});

	it('画面のカテゴリの並び: 一覧 → 一覧に無いが使っている名前 → 未設定', () => {
		expect(
			categoryOrder(defaultLists(), ['肩', '胸', '', '胸']).slice(-2),
		).toEqual(['胸', '']);
	});
});
