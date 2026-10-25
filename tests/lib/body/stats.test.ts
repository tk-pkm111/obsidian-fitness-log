import { describe, expect, it } from 'vitest';
import { isPartKey, splitPartKey } from '../../../src/lib/body/items';
import type { BodyMeasurement } from '../../../src/lib/body/note';
import {
	atOrBeforeIndex,
	changeFrom,
	discColumns,
	firstIndex,
	goalProgress,
	panelAfter,
	partMeasuresIn,
	periodStart,
	previousIndex,
	seriesPoints,
	sideBalance,
	wholeItemsIn,
} from '../../../src/lib/body/stats';

function m(date: string, values: Record<string, number>): BodyMeasurement {
	return { date, time: null, path: `b/${date}.md`, values };
}

const ms = [
	m('2026-04-23', { 体重: 64.0, 体脂肪率: 19.6 }),
	m('2026-07-02', { 体重: 65.2, 体脂肪率: 19.0 }),
	m('2026-09-24', { 体重: 66.1 }),
	m('2026-10-15', { 体重: 66.7, 体脂肪率: 18.9, '左腕 筋肉量': 2.9 }),
	m('2026-10-22', {
		体重: 66.7,
		体脂肪率: 18.5,
		'左腕 筋肉量': 2.9,
		'右腕 筋肉量': 2.9,
		'左脚 筋肉量': 9.5,
		'右脚 筋肉量': 9.8,
		'右脚 脂肪率': 19.8,
	}),
];

describe('前回・初回', () => {
	it('その項目の無い測定は飛ばす', () => {
		expect(previousIndex(ms, 3, '体脂肪率')).toBe(1);
		expect(previousIndex(ms, 0, '体重')).toBe(-1);
		expect(firstIndex(ms, '左腕 筋肉量')).toBe(3);
		expect(atOrBeforeIndex(ms, 2, '体脂肪率')).toBe(1);
	});

	it('差は 今 − 前。前が無い・同じ測定なら null', () => {
		expect(changeFrom(ms, 4, '体脂肪率', 3)).toBeCloseTo(-0.4);
		expect(changeFrom(ms, 4, '体重', -1)).toBeNull();
		expect(changeFrom(ms, 2, '体脂肪率', 1)).toBeNull();
		expect(changeFrom(ms, 0, '体重', 0)).toBeNull();
	});
});

describe('期間', () => {
	it('最後の測定の日から数える。すべてなら全部', () => {
		expect(periodStart('2026-10-22', '1m')).toBe('2026-09-21');
		expect(periodStart('2026-10-22', 'all')).toBeNull();
		expect(seriesPoints(ms, '体重', '1m').map((p) => p.date)).toEqual([
			'2026-09-24',
			'2026-10-15',
			'2026-10-22',
		]);
		expect(seriesPoints(ms, '体重', 'all')).toHaveLength(5);
		expect(seriesPoints([], '体重', '1m')).toEqual([]);
	});

	it('ノートにある全身の項目・部位の項目', () => {
		expect(wholeItemsIn(ms, isPartKey)).toEqual(['体重', '体脂肪率']);
		expect(partMeasuresIn(ms, splitPartKey)).toEqual(['筋肉量', '脂肪率']);
	});
});

describe('目標までの進み具合', () => {
	it('増やす目標: 決めた日以前で最後の測定が起点', () => {
		const p = goalProgress(ms, 4, {
			name: '体重',
			target: 68,
			since: '2026-07-10',
		});
		expect(p).toMatchObject({
			start: 65.2,
			current: 66.7,
			direction: 1,
			reached: false,
		});
		expect(p?.left).toBeCloseTo(1.3);
		expect(p?.progress).toBeCloseTo(1.5 / 2.8);
	});

	it('減らす目標', () => {
		const p = goalProgress(ms, 4, {
			name: '体脂肪率',
			target: 17,
			since: '2026-07-02',
		});
		expect(p?.direction).toBe(-1);
		expect(p?.left).toBeCloseTo(-1.5);
		expect(p?.progress).toBeCloseTo(0.5 / 2);
	});

	it('届いた（越えた）ら 1、離れたら 0', () => {
		expect(
			goalProgress(ms, 4, {
				name: '体重',
				target: 66,
				since: '2026-04-23',
			}),
		).toMatchObject({ reached: true, progress: 1 });
		expect(
			goalProgress(ms, 4, {
				name: '体脂肪率',
				target: 18.5,
				since: '2026-10-01',
			}),
		).toMatchObject({ reached: true, progress: 1 });
		const away = goalProgress(ms, 1, {
			name: '体重',
			target: 63,
			since: '2026-04-23',
		});
		expect(away).toMatchObject({
			direction: -1,
			reached: false,
			progress: 0,
		});
	});

	it('起点が無ければ最初の測定。起点と目標が同じなら今との差の向き', () => {
		expect(
			goalProgress(ms, 4, {
				name: '体重',
				target: 70,
				since: '2025-01-01',
			})?.start,
		).toBe(64);
		const same = goalProgress(ms, 4, {
			name: '体重',
			target: 64,
			since: '2026-04-23',
		});
		expect(same).toMatchObject({
			direction: -1,
			progress: 0,
			reached: false,
		});
	});

	it('今見ている測定に無ければ、それ以前の値。記録が無ければ null', () => {
		expect(
			goalProgress(ms, 2, {
				name: '体脂肪率',
				target: 17,
				since: '2026-04-23',
			}),
		).toMatchObject({ current: 19.0, currentDate: '2026-07-02' });
		expect(
			goalProgress(ms, 4, {
				name: 'BMI',
				target: 22,
				since: '2026-04-23',
			}),
		).toBeNull();
	});
});

describe('左右の差・丸の並び', () => {
	it('左右とも有る組だけ。差は 右 − 左', () => {
		const balance = sideBalance(ms[4], '筋肉量');
		expect(balance.map((b) => b.group)).toEqual(['腕', '脚']);
		expect(balance[1]?.diff).toBeCloseTo(0.3);
		expect(sideBalance(ms[4], '脂肪率')).toEqual([]);
		expect(sideBalance(undefined, '筋肉量')).toEqual([]);
	});

	it('列の数は幅から 3〜6。パネルは開いた丸の段の最後の後', () => {
		expect(discColumns(358)).toBe(3);
		expect(discColumns(2000)).toBe(6);
		expect(discColumns(100)).toBe(3);
		expect(panelAfter(0, 9, 3)).toBe(2);
		expect(panelAfter(4, 9, 3)).toBe(5);
		expect(panelAfter(6, 7, 3)).toBe(6);
		expect(panelAfter(-1, 9, 3)).toBe(-1);
	});
});
