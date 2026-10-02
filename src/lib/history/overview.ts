/**
 * ログページの一覧（月ごとの記録・記録のある種目）。
 */
import { createResolver } from '../model/resolve';
import type { DayLog, Exercise } from '../model/types';
import { monthOf } from '../time/date';
import { summarizeDay, type DaySummary } from '../log/summary';

export interface DayOverview extends DaySummary {
	date: string;
}

export interface MonthOverview {
	/** 'YYYY-MM' */
	month: string;
	days: DayOverview[];
	sets: number;
	volumeKg: number;
	/** 記録のあった日数 */
	activeDays: number;
}

/** 月ごとの一覧（新しい月・新しい日から）。セットの無い日（予定だけ）は数えない。 */
export function monthlyOverview(days: readonly DayLog[]): MonthOverview[] {
	const months = new Map<string, MonthOverview>();
	for (const day of days) {
		const summary = summarizeDay(day);
		if (summary.sets === 0) continue;
		const key = monthOf(day.date);
		const month = months.get(key) ?? {
			month: key,
			days: [],
			sets: 0,
			volumeKg: 0,
			activeDays: 0,
		};
		month.days.push({ date: day.date, ...summary });
		month.sets += summary.sets;
		month.volumeKg =
			Math.round((month.volumeKg + summary.volumeKg) * 10) / 10;
		month.activeDays++;
		months.set(key, month);
	}
	return [...months.values()]
		.sort((a, b) => (a.month < b.month ? 1 : -1))
		.map((m) => ({
			...m,
			days: m.days.sort((a, b) => (a.date < b.date ? 1 : -1)),
		}));
}

export interface ExerciseActivity {
	exercise: Exercise;
	lastDate: string;
	/** 記録のある日数 */
	sessions: number;
}

/** 記録のある種目（最後に行った日が新しい順）。名前は本名・別名で解決する。 */
export function exercisesWithHistory(
	days: readonly DayLog[],
	exercises: readonly Exercise[],
): ExerciseActivity[] {
	const resolver = createResolver(exercises);
	const activity = new Map<string, ExerciseActivity>();
	for (const day of days) {
		const seen = new Set<string>();
		for (const session of day.sessions)
			for (const log of session.exercises) {
				if (log.sets.length === 0) continue;
				const exercise = resolver.resolve(log.name);
				if (!exercise || seen.has(exercise.id)) continue;
				seen.add(exercise.id);
				const current = activity.get(exercise.id);
				activity.set(exercise.id, {
					exercise,
					lastDate:
						current && current.lastDate > day.date
							? current.lastDate
							: day.date,
					sessions: (current?.sessions ?? 0) + 1,
				});
			}
	}
	return [...activity.values()].sort((a, b) =>
		a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0,
	);
}
