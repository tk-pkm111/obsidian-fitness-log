/**
 * 種目の 1 回分の記録の統計（ログページの推移・自己ベスト）。
 */
import type { SetLog } from '../model/types';
import { spanSeconds } from '../time/date';
import type { ExerciseOccurrence } from './carry-over';

/** 推定 1RM（Epley: w × (1 + reps/30)）。1 回なら重量そのもの。 */
export function estimateOneRepMax(weight: number, reps: number): number {
	if (reps <= 1) return weight;
	return weight * (1 + reps / 30);
}

export function setDurationSec(set: SetLog): number {
	if (set.start === null || set.end === null) return 0;
	return spanSeconds(set.start, set.end) ?? 0;
}

export interface SessionStat {
	date: string;
	sessionName: string | null;
	sets: SetLog[];
	/** 最大重量（重量の記録が無ければ null） */
	maxWeight: number | null;
	/** Σ 重量 × 回数 */
	volume: number;
	/** セットごとの推定 1RM の最大 */
	estimatedOneRepMax: number | null;
	totalReps: number;
	maxReps: number | null;
	/** セットの開始〜終了の合計（秒） */
	durationSec: number;
}

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}

export function sessionStat(occurrence: ExerciseOccurrence): SessionStat {
	let maxWeight: number | null = null;
	let volume = 0;
	let e1rm: number | null = null;
	let totalReps = 0;
	let maxReps: number | null = null;
	let durationSec = 0;
	for (const set of occurrence.sets) {
		if (set.weight !== null)
			maxWeight =
				maxWeight === null
					? set.weight
					: Math.max(maxWeight, set.weight);
		if (set.reps !== null) {
			totalReps += set.reps;
			maxReps = maxReps === null ? set.reps : Math.max(maxReps, set.reps);
		}
		if (set.weight !== null && set.reps !== null && set.reps > 0) {
			volume += set.weight * set.reps;
			const estimate = estimateOneRepMax(set.weight, set.reps);
			e1rm = e1rm === null ? estimate : Math.max(e1rm, estimate);
		}
		durationSec += setDurationSec(set);
	}
	return {
		date: occurrence.date,
		sessionName: occurrence.sessionName,
		sets: occurrence.sets,
		maxWeight,
		volume: round1(volume),
		estimatedOneRepMax: e1rm === null ? null : round1(e1rm),
		totalReps,
		maxReps,
		durationSec,
	};
}
