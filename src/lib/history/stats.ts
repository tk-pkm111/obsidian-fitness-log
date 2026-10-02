/**
 * 種目の推移と自己ベスト（ログページ）。
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

/** 古い順のセッション統計（チャート用） */
export function exerciseTimeline(
	occurrences: readonly ExerciseOccurrence[],
): SessionStat[] {
	return occurrences.map(sessionStat).reverse();
}

export interface Best {
	value: number;
	date: string;
	/** 最大重量のときの回数など、値の補足 */
	detail?: string;
}

export interface PersonalBests {
	maxWeight?: Best;
	maxVolume?: Best;
	estimatedOneRepMax?: Best;
	maxReps?: Best;
	maxDurationSec?: Best;
}

/**
 * 自己ベスト。同じ値なら古い方（最初に達成した日）を採用する。
 * maxWeight の detail は、その重量でできた最大回数。
 */
export function personalBests(stats: readonly SessionStat[]): PersonalBests {
	const ordered = [...stats].sort((a, b) =>
		a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
	);
	const bests: PersonalBests = {};
	const consider = (
		key: keyof PersonalBests,
		value: number | null,
		date: string,
		detail?: string,
	) => {
		if (value === null || value <= 0) return;
		const current = bests[key];
		if (!current || value > current.value)
			bests[key] = { value, date, detail };
	};
	for (const stat of ordered) {
		if (stat.maxWeight !== null) {
			const repsAtMax = stat.sets
				.filter((s) => s.weight === stat.maxWeight && s.reps !== null)
				.reduce((max, s) => Math.max(max, s.reps ?? 0), 0);
			consider(
				'maxWeight',
				stat.maxWeight,
				stat.date,
				repsAtMax > 0 ? String(repsAtMax) : undefined,
			);
		}
		consider('maxVolume', stat.volume, stat.date);
		consider('estimatedOneRepMax', stat.estimatedOneRepMax, stat.date);
		consider('maxReps', stat.maxReps, stat.date);
		consider('maxDurationSec', stat.durationSec, stat.date);
	}
	return bests;
}
