/**
 * 入力画面のワンタップの候補（ジムでキーボードを出さずに記録できるように）。
 */
import { parseRepRange } from '../rep-range';
import { stepValue } from '../units';

/** 回数: 前回（引き継ぎ）の前後 5 つ。無ければ目標の回数の幅（前後 1 つ広げる）、それも無ければよく使う回数 */
export function quickReps(
	initial: number | null,
	targetReps?: string,
): number[] {
	if (initial !== null && initial > 0) {
		const from = Math.max(1, Math.round(initial) - 2);
		return Array.from({ length: 5 }, (_, i) => from + i);
	}
	const range = targetReps ? parseRepRange(targetReps) : null;
	if (range?.kind === 'range') {
		const min = Math.max(1, range.min - 1);
		const max = Math.min(min + 6, range.max + 1);
		return Array.from({ length: max - min + 1 }, (_, i) => min + i);
	}
	return [5, 6, 8, 10, 12];
}

/** 重量: 引き継いだ重量と、刻みでの前後（表示単位）。引き継ぎが無ければ出さない */
export function quickWeights(initial: number | null, step: number): number[] {
	if (initial === null) return [];
	return [
		stepValue(initial, step, -1),
		initial,
		stepValue(initial, step, 1),
	].filter((w, i, all) => w > 0 && all.indexOf(w) === i);
}
