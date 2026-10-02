/**
 * ログページの月ごとの一覧。
 */
import type { DayLog } from '../model/types';
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
