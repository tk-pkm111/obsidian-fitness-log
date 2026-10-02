/**
 * 前回値の引き継ぎ（入力の手間を減らす）。実装計画 §4.3。
 *
 * パッケージ P の種目 E で「セット n」を始めるときの初期値:
 * 1. 同じセッション内にセット n−1 があれば、その値
 * 2. なければ P で E を行った直近のセッション（表示中の日付より前）のセット n（n が多ければ最後のセット）
 * 3. P での履歴がなければ、他のパッケージ（その他を含む）での E の直近
 * 4. それもなければ空
 */
import type { DayLog, SetLog } from '../model/types';

/** ある日のあるセッションで、ある種目を行った記録 */
export interface ExerciseOccurrence {
	date: string;
	sessionName: string | null;
	exerciseName: string;
	sets: SetLog[];
}

/**
 * 日ノート群から種目の出現を集める（新しい順。同じ日はノートの後ろのセッションほど新しいとみなす）。
 * セットが 0 の出現は含めない。
 */
export function collectOccurrences(
	days: Iterable<DayLog>,
	matchesExercise: (name: string) => boolean,
): ExerciseOccurrence[] {
	const result: ExerciseOccurrence[] = [];
	for (const day of days) {
		day.sessions.forEach((session) => {
			for (const exercise of session.exercises) {
				if (
					exercise.sets.length === 0 ||
					!matchesExercise(exercise.name)
				)
					continue;
				result.push({
					date: day.date,
					sessionName: session.name,
					exerciseName: exercise.name,
					sets: exercise.sets,
				});
			}
		});
	}
	// 安定ソート: 日付の降順。同じ日はノート内の順序の逆（後ろほど新しい）。
	return result
		.map((occurrence, order) => ({ occurrence, order }))
		.sort((a, b) =>
			a.occurrence.date === b.occurrence.date
				? b.order - a.order
				: a.occurrence.date < b.occurrence.date
					? 1
					: -1,
		)
		.map(({ occurrence }) => occurrence);
}

export type CarryOverSource =
	'previous-set' | 'same-package' | 'other-package' | 'none';

export interface CarryOver {
	weight: number | null;
	reps: number | null;
	source: CarryOverSource;
	/** source が same-package / other-package のときの日付 */
	date?: string;
}

export interface CarryOverInput {
	/** collectOccurrences の結果（新しい順） */
	occurrences: readonly ExerciseOccurrence[];
	/** 表示中の日付。これより前の記録だけを「前回」とみなす */
	date: string;
	isSamePackage: (sessionName: string | null) => boolean;
	/** 始めようとしているセットの番号（1 始まり） */
	setIndex: number;
	/** 同じセッションで既に終えたこの種目のセット */
	currentSets: readonly SetLog[];
}

function pickSet(
	sets: readonly SetLog[],
	setIndex: number,
): SetLog | undefined {
	return sets[setIndex - 1] ?? sets[sets.length - 1];
}

/** 表示中の日付より前の直近の出現（同じパッケージ優先） */
export function lastPerformance(
	occurrences: readonly ExerciseOccurrence[],
	date: string,
	isSamePackage: (sessionName: string | null) => boolean,
): { occurrence: ExerciseOccurrence; samePackage: boolean } | null {
	const before = occurrences.filter((o) => o.date < date);
	const same = before.find((o) => isSamePackage(o.sessionName));
	if (same) return { occurrence: same, samePackage: true };
	const other = before[0];
	return other ? { occurrence: other, samePackage: false } : null;
}

export function carryOver(input: CarryOverInput): CarryOver {
	const previous =
		input.currentSets[input.setIndex - 2] ??
		input.currentSets[input.currentSets.length - 1];
	if (previous)
		return {
			weight: previous.weight,
			reps: previous.reps,
			source: 'previous-set',
		};
	const last = lastPerformance(
		input.occurrences,
		input.date,
		input.isSamePackage,
	);
	const set = last
		? pickSet(last.occurrence.sets, input.setIndex)
		: undefined;
	if (!last || !set) return { weight: null, reps: null, source: 'none' };
	return {
		weight: set.weight,
		reps: set.reps,
		source: last.samePackage ? 'same-package' : 'other-package',
		date: last.occurrence.date,
	};
}
