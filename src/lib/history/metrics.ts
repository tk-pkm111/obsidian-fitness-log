/**
 * ログの指標（推移・前回比・自己ベスト）。値は基準の単位（kg・回・秒）で、表示の単位への換算は画面側。
 */
import type { RecordType } from '../model/types';
import type { SessionStat } from './stats';

export type Metric =
	| 'estimatedOneRepMax'
	| 'maxWeight'
	| 'volume'
	| 'totalReps'
	| 'maxReps'
	| 'duration';

/** 記録タイプごとに選べる指標。先頭が既定（推移・自己ベストの基準） */
export const METRICS: Record<RecordType, readonly Metric[]> = {
	'weight-reps': ['estimatedOneRepMax', 'maxWeight', 'volume'],
	reps: ['totalReps', 'maxReps'],
	duration: ['duration'],
};

export function metricValue(stat: SessionStat, metric: Metric): number | null {
	switch (metric) {
		case 'estimatedOneRepMax':
			return stat.estimatedOneRepMax;
		case 'maxWeight':
			return stat.maxWeight;
		case 'volume':
			return stat.volume > 0 ? stat.volume : null;
		case 'totalReps':
			return stat.totalReps > 0 ? stat.totalReps : null;
		case 'maxReps':
			return stat.maxReps;
		case 'duration':
			return stat.durationSec > 0 ? stat.durationSec : null;
	}
}

/**
 * 実際に使う指標。重量×回数の種目でも重量を一度も書いていなければ（自重でやっている）合計回数で見る。
 * requested が選べない指標なら既定にする。
 */
export function effectiveMetric(
	recordType: RecordType,
	stats: readonly SessionStat[],
	requested?: Metric | null,
): Metric {
	const available = availableMetrics(recordType, stats);
	return requested && available.includes(requested)
		? requested
		: (available[0] ?? 'totalReps');
}

export function availableMetrics(
	recordType: RecordType,
	stats: readonly SessionStat[],
): readonly Metric[] {
	if (
		recordType === 'weight-reps' &&
		stats.length > 0 &&
		stats.every((s) => s.maxWeight === null)
	)
		return METRICS.reps;
	return METRICS[recordType];
}

/** 前回との差（事実だけ。良い悪いの判断はしない） */
export type Delta =
	| { kind: 'weight'; diff: number }
	| { kind: 'reps'; diff: number }
	| { kind: 'duration'; diff: number };

/**
 * 前回比。重量×回数はトップセットの重量が変わればその差、同じなら合計回数の差。
 * 自重は合計回数、時間は合計時間の差。
 */
export function sessionDelta(
	prev: SessionStat,
	last: SessionStat,
	recordType: RecordType,
): Delta {
	if (recordType === 'duration')
		return { kind: 'duration', diff: last.durationSec - prev.durationSec };
	if (
		recordType === 'weight-reps' &&
		last.maxWeight !== null &&
		prev.maxWeight !== null &&
		last.maxWeight !== prev.maxWeight
	)
		return {
			kind: 'weight',
			diff: Math.round((last.maxWeight - prev.maxWeight) * 100) / 100,
		};
	return { kind: 'reps', diff: last.totalReps - prev.totalReps };
}

/**
 * それぞれの記録が、その時点までの最高を超えたか（最初の記録は数えない。同じ値は超えたとしない）。
 * 値の無い記録は false。
 */
export function newBestFlags(values: readonly (number | null)[]): boolean[] {
	let best: number | null = null;
	return values.map((value) => {
		if (value === null) return false;
		const isNew = best !== null && value > best;
		if (best === null || value > best) best = value;
		return isNew;
	});
}

/** 最高の値と、最初にその値に達した位置 */
export function bestOf(
	values: readonly (number | null)[],
): { value: number; index: number } | null {
	let result: { value: number; index: number } | null = null;
	values.forEach((value, index) => {
		if (value !== null && (result === null || value > result.value))
			result = { value, index };
	});
	return result;
}
