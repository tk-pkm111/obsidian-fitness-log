import { t, type MessageKey } from '../../i18n';
import type { Routine, RoutineRule } from '../model/types';
import { diffDays, mondayOf, weekdayOf } from '../time/date';

/** ルールがその日に当たるか（有効・期間・スキップは見ない） */
export function ruleMatches(
	rule: RoutineRule,
	startDate: string,
	date: string,
): boolean {
	if (date < startDate) return false;
	switch (rule.type) {
		case 'weekly': {
			if (!rule.weekdays.includes(weekdayOf(date))) return false;
			const interval = Math.max(1, Math.floor(rule.intervalWeeks));
			// 週の起点は月曜固定。開始日を含む週を 0 週目として数える。
			const weeks = diffDays(mondayOf(startDate), mondayOf(date)) / 7;
			return weeks % interval === 0;
		}
		case 'everyNDays': {
			const interval = Math.max(1, Math.floor(rule.intervalDays));
			return diffDays(startDate, date) % interval === 0;
		}
	}
}

/** そのルーチンがその日に予定されているか */
export function isScheduledOn(routine: Routine, date: string): boolean {
	if (!routine.enabled) return false;
	if (routine.endDate !== undefined && date > routine.endDate) return false;
	if (routine.skipDates.includes(date)) return false;
	return ruleMatches(routine.rule, routine.startDate, date);
}

/**
 * その日に予定されているルーチン。同じパッケージが複数のルーチンで当たっても 1 回だけ
 * （先に並んでいるルーチンを採用）。
 */
export function routinesForDate(
	routines: readonly Routine[],
	date: string,
): Routine[] {
	const seen = new Set<string>();
	const result: Routine[] = [];
	for (const routine of routines) {
		if (!isScheduledOn(routine, date)) continue;
		if (seen.has(routine.packageId)) continue;
		seen.add(routine.packageId);
		result.push(routine);
	}
	return result;
}

/** 曜日の並び（月曜始まり）。UI の曜日ボタンの順にも使う。 */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function weekdayLabel(weekday: number): string {
	return t(`weekday.${weekday}` as MessageKey);
}

/** 「毎週 月・木」「2 週ごと 火」「3 日ごと」「毎日」 */
export function describeRule(rule: RoutineRule): string {
	switch (rule.type) {
		case 'weekly': {
			const days = WEEKDAY_ORDER.filter((d) => rule.weekdays.includes(d))
				.map(weekdayLabel)
				.join(t('weekday.separator'));
			const label = days.length > 0 ? days : t('routine.rule.noWeekday');
			return rule.intervalWeeks > 1
				? t('routine.rule.weeklyInterval', {
						n: rule.intervalWeeks,
						days: label,
					})
				: t('routine.rule.weekly', { days: label });
		}
		case 'everyNDays':
			return rule.intervalDays <= 1
				? t('routine.rule.daily')
				: t('routine.rule.everyNDays', { n: rule.intervalDays });
	}
}
