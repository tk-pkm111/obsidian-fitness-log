import { describe, expect, it } from 'vitest';
import {
	aliasesAfterRename,
	createResolver,
	nameKey,
	parseAliasInput,
} from '../../../src/lib/model/resolve';

const items = [
	{
		id: 'a',
		name: 'ダンベルプリーチャーカール',
		aliases: ['DBプリチャーカール'],
	},
	{ id: 'b', name: 'レッグカール', aliases: [] },
	{ id: 'c', name: 'シーテッドレッグカール', aliases: ['レッグカール'] },
];

describe('nameKey', () => {
	it('全角英数・全角括弧・空白の違いを無視する', () => {
		expect(nameKey('ＤＢ　プリチャーカール（片手）')).toBe(
			nameKey('DBプリチャーカール(片手)'),
		);
		expect(nameKey('SLDL')).toBe(nameKey('sldl'));
	});

	it('NFD（macOS のファイル名など）でも一致する', () => {
		expect(nameKey('ダンベル'.normalize('NFD'))).toBe(nameKey('ダンベル'));
	});
});

describe('createResolver', () => {
	const resolver = createResolver(items);

	it('本名・別名で引ける', () => {
		expect(resolver.resolve('ダンベルプリーチャーカール')?.id).toBe('a');
		expect(resolver.resolve('ＤＢプリチャーカール')?.id).toBe('a');
		expect(resolver.resolve('存在しない')).toBeUndefined();
	});

	it('本名が別名より優先される', () => {
		expect(resolver.resolve('レッグカール')?.id).toBe('b');
	});

	it('matches は本名・別名の両方を見る', () => {
		const [a] = items;
		if (!a) throw new Error('fixture');
		expect(resolver.matches(a, 'DB プリチャーカール')).toBe(true);
		expect(resolver.matches(a, 'レッグカール')).toBe(false);
	});
});

describe('aliasesAfterRename', () => {
	it('旧名を別名に足し、新しい名前と同じ別名は除く', () => {
		expect(aliasesAfterRename('旧名', '新名', ['新名', '別名'])).toEqual([
			'別名',
			'旧名',
		]);
	});

	it('表記ゆれだけの変更では別名を増やさない', () => {
		expect(aliasesAfterRename('ベンチ プレス', 'ベンチプレス', [])).toEqual(
			[],
		);
	});
});

describe('parseAliasInput', () => {
	it('改行・読点・カンマで区切り、空・重複・本名を除く', () => {
		expect(
			parseAliasInput(
				'DB カール、 DBカール\nダンベルカール, ,',
				'ダンベルカール',
			),
		).toEqual(['DB カール']);
	});
});
