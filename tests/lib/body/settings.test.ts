import { describe, expect, it } from 'vitest';
import {
	addBodyItem,
	applyBodySettingsToFrontmatter,
	bodySettingsFromFrontmatter,
	defaultBodySettings,
	moveBodyItem,
	removeBodyGoal,
	removeBodyItem,
	setBodyEnabled,
	setBodyGoal,
	setBodyItemUnit,
} from '../../../src/lib/body/settings';

describe('体組成の設定（設定ノート）', () => {
	it('キーが無ければ既定（オフ・体重・体脂肪率・筋肉量・目標なし）', () => {
		expect(bodySettingsFromFrontmatter(null)).toEqual(
			defaultBodySettings(),
		);
		expect(bodySettingsFromFrontmatter({ categories: ['胸'] })).toEqual(
			defaultBodySettings(),
		);
		expect(defaultBodySettings().items.map((i) => i.name)).toEqual([
			'体重',
			'体脂肪率',
			'筋肉量',
		]);
	});

	it('読めない値・重なり・部位の項目は除く。単位が無ければ知っている単位', () => {
		const settings = bodySettingsFromFrontmatter({
			body_composition: 'yes',
			body_items: [
				{ name: '体重', unit: 'kg' },
				'基礎代謝量',
				{ name: '体重', unit: 'lb' },
				{ name: '左腕 筋肉量', unit: 'kg' },
				{ name: '' },
				{ name: '骨格筋率' },
				{ name: 'BMI', unit: '' },
			],
			body_goals: [
				{ name: '体重', target: 68, since: '2026-07-02' },
				{ name: '体重', target: 70, since: '2026-07-03' },
				{ name: '体脂肪率', target: '17', since: '2026-08-27' },
				{ name: '筋肉量', target: 'たくさん', since: '2026-08-27' },
				{ name: '筋肉量', target: 52, since: '昨日' },
				{ name: '左腕 筋肉量', target: 3, since: '2026-08-27' },
			],
		});
		expect(settings.enabled).toBe(false);
		expect(settings.items).toEqual([
			{ name: '体重', unit: 'kg' },
			{ name: '基礎代謝量', unit: 'kcal' },
			{ name: '骨格筋率', unit: '' },
			{ name: 'BMI', unit: '' },
		]);
		expect(settings.goals).toEqual([
			{ name: '体重', target: 68, since: '2026-07-02' },
			{ name: '体脂肪率', target: 17, since: '2026-08-27' },
		]);
	});

	it('frontmatter への往復。ほかのキーは残す', () => {
		const settings = setBodyGoal(
			setBodyEnabled(defaultBodySettings(), true),
			'体重',
			68,
			'2026-10-25',
		);
		const fm: Record<string, unknown> = { categories: ['胸'], tags: ['x'] };
		applyBodySettingsToFrontmatter(fm, settings);
		expect(fm.categories).toEqual(['胸']);
		expect(fm.tags).toEqual(['x']);
		expect(fm.body_composition).toBe(true);
		expect(bodySettingsFromFrontmatter(fm)).toEqual(settings);
	});

	it('項目を足す・外す・並べ替える・単位を変える', () => {
		let s = defaultBodySettings();
		s = addBodyItem(s, ' 骨格筋率 ', ' % ');
		expect(s.items[3]).toEqual({ name: '骨格筋率', unit: '%' });
		expect(() => addBodyItem(s, '体重', 'kg')).toThrow('もうあります');
		expect(() => addBodyItem(s, '  ', '')).toThrow();
		expect(() => addBodyItem(s, '左腕 筋肉量', 'kg')).toThrow('部位');
		s = moveBodyItem(s, 3, 0);
		expect(s.items.map((i) => i.name)[0]).toBe('骨格筋率');
		expect(moveBodyItem(s, 0, 9)).toBe(s);
		s = setBodyItemUnit(s, 0, 'pt');
		expect(s.items[0]?.unit).toBe('pt');
		s = removeBodyItem(s, 0);
		expect(s.items.map((i) => i.name)).toEqual([
			'体重',
			'体脂肪率',
			'筋肉量',
		]);
	});

	it('目標の値を変えても、決めた日（起点）はそのまま。消す', () => {
		let s = setBodyGoal(defaultBodySettings(), '体重', 68, '2026-07-02');
		s = setBodyGoal(s, '体重', 69, '2026-10-25');
		expect(s.goals).toEqual([
			{ name: '体重', target: 69, since: '2026-07-02' },
		]);
		expect(setBodyGoal(s, '左腕 筋肉量', 3, '2026-10-25')).toBe(s);
		expect(removeBodyGoal(s, '体重').goals).toEqual([]);
	});
});
