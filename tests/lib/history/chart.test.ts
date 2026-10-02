import { describe, expect, it } from 'vitest';
import {
	buildChartGeometry,
	nearestPoint,
	niceStep,
	niceTicks,
} from '../../../src/lib/history/chart';

describe('目盛り', () => {
	it('きりのよい刻み', () => {
		expect(niceStep(10, 4)).toBe(2.5);
		expect(niceStep(37, 4)).toBe(10);
		expect(niceStep(0.8, 4)).toBe(0.2);
		expect(niceStep(0, 4)).toBe(1);
	});

	it('値の範囲を覆う目盛り（0 からにしない）', () => {
		expect(niceTicks(52.5, 60)).toEqual([52, 54, 56, 58, 60]);
		expect(niceTicks(10, 12.5)).toEqual([10, 11, 12, 13]);
		expect(niceTicks(40, 40)).toEqual([36, 38, 40, 42, 44]);
		expect(niceTicks(0, 0)).toEqual([-1, -0.5, 0, 0.5, 1]);
	});
});

describe('buildChartGeometry', () => {
	const options = {
		width: 300,
		height: 140,
		padding: { left: 40, right: 20, top: 10, bottom: 30 },
	};

	it('x は日付に比例し、y は目盛りの範囲に収まる', () => {
		const g = buildChartGeometry(
			[
				{ date: '2026-10-11', value: 12 },
				{ date: '2026-10-01', value: 10 },
				{ date: '2026-10-03', value: 11 },
			],
			options,
		);
		expect(g.points.map((p) => p.date)).toEqual([
			'2026-10-01',
			'2026-10-03',
			'2026-10-11',
		]);
		expect(g.points.map((p) => p.x)).toEqual([40, 88, 280]);
		for (const p of g.points) {
			expect(p.y).toBeGreaterThanOrEqual(g.plot.top);
			expect(p.y).toBeLessThanOrEqual(g.plot.bottom);
		}
		expect(g.linePath).toBe(
			`M40 ${g.points[0]!.y} L88 ${g.points[1]!.y} L280 ${g.points[2]!.y}`,
		);
		expect(g.areaPath.endsWith(`L280 110 L40 110 Z`)).toBe(true);
		expect(g.xTicks.map((t) => t.date)).toEqual([
			'2026-10-01',
			'2026-10-03',
			'2026-10-11',
		]);
		expect(g.yTicks[0]!.y).toBe(110);
	});

	it('1 点だけなら中央に置き、面は描かない', () => {
		const g = buildChartGeometry(
			[{ date: '2026-10-01', value: 10 }],
			options,
		);
		expect(g.points[0]!.x).toBe(160);
		expect(g.areaPath).toBe('');
	});

	it('日付の目盛りは多くても 4 つ', () => {
		const points = Array.from({ length: 20 }, (_, i) => ({
			date: `2026-10-${String(i + 1).padStart(2, '0')}`,
			value: i,
		}));
		const g = buildChartGeometry(points, options);
		expect(g.xTicks.length).toBeLessThanOrEqual(4);
		expect(g.xTicks[0]!.date).toBe('2026-10-01');
		expect(g.xTicks[g.xTicks.length - 1]!.date).toBe('2026-10-20');
	});

	it('十字線は最も近い点にスナップする', () => {
		const g = buildChartGeometry(
			[
				{ date: '2026-10-01', value: 1 },
				{ date: '2026-10-11', value: 2 },
			],
			options,
		);
		expect(nearestPoint(g.points, 100)?.date).toBe('2026-10-01');
		expect(nearestPoint(g.points, 200)?.date).toBe('2026-10-11');
		expect(nearestPoint([], 0)).toBeNull();
	});
});
