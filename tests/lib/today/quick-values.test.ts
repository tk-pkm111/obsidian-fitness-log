import { describe, expect, it } from 'vitest';
import { quickReps, quickWeights } from '../../../src/lib/today/quick-values';

describe('ワンタップの候補', () => {
	it('回数: 前回の前後、無ければ目標の幅、それも無ければよく使う回数', () => {
		expect(quickReps(8)).toEqual([6, 7, 8, 9, 10]);
		expect(quickReps(1)).toEqual([1, 2, 3, 4, 5]);
		expect(quickReps(null, '6-9')).toEqual([5, 6, 7, 8, 9, 10]);
		expect(quickReps(null, '8')).toEqual([7, 8, 9]);
		expect(quickReps(null, 'AMRAP')).toEqual([5, 6, 8, 10, 12]);
		expect(quickReps(null)).toEqual([5, 6, 8, 10, 12]);
	});

	it('重量: 引き継いだ重量と刻みでの前後（0 以下と重複は除く）', () => {
		expect(quickWeights(20, 2.5)).toEqual([17.5, 20, 22.5]);
		expect(quickWeights(21, 2.5)).toEqual([20, 21, 22.5]);
		expect(quickWeights(2.5, 2.5)).toEqual([2.5, 5]);
		expect(quickWeights(null, 2.5)).toEqual([]);
	});
});
