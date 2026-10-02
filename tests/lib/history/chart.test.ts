import { describe, expect, it } from 'vitest';
import {
	areaPath,
	barPath,
	buildChartGeometry,
	monthStarts,
	nearestPoint,
	niceStep,
	niceTicks,
	sparkline,
	spreadLabels,
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
	const one = (points: Array<{ date: string; value: number }>) => [
		{ key: 'a', points },
	];

	it('x は日付に比例し、y は目盛りの範囲に収まる', () => {
		const g = buildChartGeometry(
			one([
				{ date: '2026-10-11', value: 12 },
				{ date: '2026-10-01', value: 10 },
				{ date: '2026-10-03', value: 11 },
			]),
			options,
		);
		const points = g.series[0]!.points;
		expect(points.map((p) => p.date)).toEqual([
			'2026-10-01',
			'2026-10-03',
			'2026-10-11',
		]);
		expect(points.map((p) => p.x)).toEqual([40, 88, 280]);
		for (const p of points) {
			expect(p.y).toBeGreaterThanOrEqual(g.plot.top);
			expect(p.y).toBeLessThanOrEqual(g.plot.bottom);
		}
		expect(g.series[0]!.linePath).toBe(
			`M40 ${points[0]!.y} L88 ${points[1]!.y} L280 ${points[2]!.y}`,
		);
		expect(areaPath(g.series[0]!, 110).endsWith('L280 110 L40 110 Z')).toBe(
			true,
		);
		expect(g.xTicks.map((t) => [t.date, t.kind])).toEqual([
			['2026-10-01', 'day'],
			['2026-10-03', 'day'],
			['2026-10-11', 'day'],
		]);
		expect(g.yTicks[0]!.y).toBe(110);
	});

	it('1 点だけなら中央に置き、線も面も描かない', () => {
		const g = buildChartGeometry(
			one([{ date: '2026-10-01', value: 10 }]),
			options,
		);
		expect(g.series[0]!.points[0]!.x).toBe(160);
		expect(g.series[0]!.linePath).toBe('');
		expect(areaPath(g.series[0]!, 110)).toBe('');
	});

	it('複数の系列は同じ軸に載る', () => {
		const g = buildChartGeometry(
			[
				{
					key: 'a',
					points: [
						{ date: '2026-10-01', value: 40 },
						{ date: '2026-10-11', value: 50 },
					],
				},
				{ key: 'b', points: [{ date: '2026-10-06', value: 30 }] },
			],
			options,
		);
		expect(g.series.map((s) => s.key)).toEqual(['a', 'b']);
		expect(g.series[1]!.points[0]!.x).toBe(160);
		expect(g.yTicks[0]!.value).toBeLessThanOrEqual(30);
		expect(g.yTicks[g.yTicks.length - 1]!.value).toBeGreaterThanOrEqual(50);
	});

	it('日付の目盛りは多くても 4 つ。長い期間は月の初めに', () => {
		const points = Array.from({ length: 20 }, (_, i) => ({
			date: `2026-10-${String(i + 1).padStart(2, '0')}`,
			value: i,
		}));
		const g = buildChartGeometry(one(points), options);
		expect(g.xTicks.length).toBeLessThanOrEqual(4);
		expect(g.xTicks[0]!.date).toBe('2026-10-01');
		expect(g.xTicks[g.xTicks.length - 1]!.date).toBe('2026-10-20');

		const long = buildChartGeometry(
			one([
				{ date: '2026-07-13', value: 1 },
				{ date: '2026-10-01', value: 2 },
			]),
			options,
		);
		expect(long.xTicks.map((t) => [t.date, t.kind])).toEqual([
			['2026-08-01', 'month'],
			['2026-09-01', 'month'],
			['2026-10-01', 'month'],
		]);
	});

	it('月の目盛りは年をまたぎ、多ければ間引く', () => {
		expect(monthStarts('2026-11-15', '2027-02-01')).toEqual([
			'2026-12-01',
			'2027-01-01',
			'2027-02-01',
		]);
		expect(
			monthStarts('2026-01-01', '2027-12-31').length,
		).toBeLessThanOrEqual(6);
	});

	it('十字線は最も近い点にスナップする（系列をまたいで）', () => {
		const g = buildChartGeometry(
			[
				{
					key: 'a',
					points: [
						{ date: '2026-10-01', value: 1 },
						{ date: '2026-10-11', value: 2 },
					],
				},
				{ key: 'b', points: [{ date: '2026-10-11', value: 1 }] },
			],
			options,
		);
		expect(nearestPoint(g.series, 100, 60)?.point.date).toBe('2026-10-01');
		const right = nearestPoint(g.series, 280, g.plot.bottom);
		expect(right?.series.key).toBe('b');
		expect(nearestPoint([], 0, 0)).toBeNull();
	});
});

describe('sparkline', () => {
	it('値の無い回を飛ばして横いっぱいに並べる', () => {
		const line = sparkline([10, null, 20, 15], 76, 26);
		expect(line?.points).toBe('3,23 38,3 73,13');
		expect(line?.last).toEqual({ x: 73, y: 13 });
	});

	it('2 点未満なら描かない。変化が無ければ平ら', () => {
		expect(sparkline([10, null], 76, 26)).toBeNull();
		expect(sparkline([5, 5], 76, 26)?.points).toBe('3,13 73,13');
	});
});

describe('barPath', () => {
	it('上の角だけ丸める', () => {
		expect(barPath(0, 10, 10, 20, 4)).toBe(
			'M0 30 L0 14 Q0 10 4 10 L6 10 Q10 10 10 14 L10 30 Z',
		);
		// 細い棒は幅の半分まで
		expect(barPath(0, 0, 4, 10, 4)).toContain('Q0 0 2 0');
	});
});

describe('spreadLabels', () => {
	it('近いラベルは間をあけ、入力の順で返す', () => {
		expect(spreadLabels([50, 45, 100], 14, 0, 200)).toEqual([59, 45, 100]);
	});

	it('下にはみ出したら上へ戻す', () => {
		expect(spreadLabels([198, 199], 14, 0, 200)).toEqual([186, 200]);
		expect(spreadLabels([-10], 14, 0, 200)).toEqual([0]);
	});
});
