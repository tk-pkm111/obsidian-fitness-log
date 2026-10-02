import { describe, expect, it } from 'vitest';
import {
	joinRepRange,
	nearestIndex,
	repsChoices,
	secondChoices,
	splitClock,
	splitDuration,
	splitRepRange,
	stepRange,
	weightChoices,
	withValue,
} from '../../src/lib/picker';

describe('ホイールの選択肢', () => {
	it('刻み（小数の誤差を丸める）', () => {
		expect(stepRange(0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1]);
		expect(stepRange(0, 0.3, 0.1)).toEqual([0, 0.1, 0.2, 0.3]);
		expect(stepRange(0, 1, 0)).toEqual([]);
	});

	it('刻みに乗らない値は昇順の位置に差し込む', () => {
		expect(withValue([0, 2.5, 5], 3)).toEqual([0, 2.5, 3, 5]);
		expect(withValue([0, 2.5, 5], 2.5)).toEqual([0, 2.5, 5]);
	});

	it('重量: 刻みで上限まで。重い値なら広げ、なしも選べる', () => {
		const values = weightChoices(22.75, 2.5, 100, true);
		expect(values[0]).toBeNull();
		expect(values.slice(1, 4)).toEqual([2.5, 5, 7.5]);
		expect(values).toContain(22.75);
		expect(values[values.length - 1]).toBe(100);
		expect(weightChoices(180, 2.5, 100, false).at(-1)).toBe(270);
		expect(weightChoices(null, 5, 20, false)).toEqual([5, 10, 15, 20]);
		expect(weightChoices(0, 5, 10, false)).toEqual([0, 5, 10]);
	});

	it('回数は 0〜50（多ければそこまで）', () => {
		expect(repsChoices(8)).toHaveLength(51);
		expect(repsChoices(80).at(-1)).toBe(80);
	});

	it('いちばん近い選択肢', () => {
		expect(nearestIndex([null, 0, 2.5, 5], 3)).toBe(2);
		expect(nearestIndex([null, 0, 2.5], null)).toBe(0);
		expect(nearestIndex([0, 2.5], null)).toBe(0);
	});

	it('時刻・時間を列に分ける', () => {
		expect(splitClock(22 * 3600 + 40 * 60 + 1)).toEqual([22, 40, 1]);
		expect(splitDuration(150)).toEqual([2, 30]);
		expect(splitDuration(3725)).toEqual([62, 5]);
		expect(secondChoices(15)).toEqual([0, 15, 30, 45]);
		expect(secondChoices(15, 33)).toEqual([0, 15, 30, 33, 45]);
	});

	it('回数の目標を下限・上限に分けて戻す', () => {
		expect(splitRepRange('6-9')).toEqual([6, 9]);
		expect(splitRepRange('8')).toEqual([8, null]);
		expect(splitRepRange('AMRAP')).toBeNull();
		expect(splitRepRange('')).toBeNull();
		expect(joinRepRange(6, 9)).toBe('6-9');
		expect(joinRepRange(8, null)).toBe('8');
		expect(joinRepRange(9, 6)).toBe('6-9');
		expect(joinRepRange(8, 8)).toBe('8');
	});
});
