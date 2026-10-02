/**
 * ルーチンのカレンダー（月ごと）。各日に、やった（日ノートに記録がある）・予定（ルーチン）・スキップしたパッケージを出す。
 */
import { createResolver } from '../model/resolve';
import type { DayLog, Package, Routine } from '../model/types';
import { addDays, mondayOf, monthOf } from '../time/date';
import { isScheduledOn, routinesForDate } from './routine';

/** 'YYYY-MM' を delta か月ずらす */
export function addMonths(month: string, delta: number): string {
	const [y = 0, m = 1] = month.split('-').map(Number);
	const total = y * 12 + (m - 1) + delta;
	const year = Math.floor(total / 12);
	return `${year}-${String(total - year * 12 + 1).padStart(2, '0')}`;
}

/** その月を含む週（月曜始まり、各 7 日）。前後の月の日も含む */
export function monthWeeks(month: string): string[][] {
	const weeks: string[][] = [];
	let monday = mondayOf(`${month}-01`);
	do {
		const start = monday;
		weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
		monday = addDays(monday, 7);
	} while (monthOf(monday) === month);
	return weeks;
}

export interface CalendarEntry {
	/** パッケージ外（その他）・解決できないセッション名は null */
	packageId: string | null;
	/** パッケージ名（その他は null。表示側で「その他」にする） */
	name: string | null;
	/** done: 記録がある（開始した・セットがある）、planned: 予定（ルーチン・追加しただけ）、skipped: スキップした予定 */
	kind: 'done' | 'planned' | 'skipped';
	/** 予定・スキップのもとになったルーチン（追加しただけの予定は null） */
	routine: Routine | null;
}

/** その日のカレンダーの中身: やった → 予定 → スキップ。同じパッケージは 1 回だけ */
export function calendarEntries(
	date: string,
	routines: readonly Routine[],
	packages: readonly Package[],
	day: DayLog | undefined,
): CalendarEntry[] {
	const resolver = createResolver(packages);
	const entries: CalendarEntry[] = [];
	const seen = new Set<string>();
	const add = (entry: CalendarEntry) => {
		const key = entry.packageId ?? `name:${entry.name ?? ''}`;
		if (seen.has(key)) return;
		seen.add(key);
		entries.push(entry);
	};
	const sessions = day?.sessions ?? [];
	const started = (s: (typeof sessions)[number]) =>
		s.start !== undefined || s.exercises.some((e) => e.sets.length > 0);
	const fromSession = (
		s: (typeof sessions)[number],
		kind: 'done' | 'planned',
	): CalendarEntry => {
		const pkg = s.name === null ? undefined : resolver.resolve(s.name);
		return {
			packageId: pkg?.id ?? null,
			name: pkg?.name ?? s.name,
			kind,
			routine: null,
		};
	};
	for (const s of sessions.filter(started)) add(fromSession(s, 'done'));
	for (const s of sessions.filter((x) => !started(x) && x.name !== null))
		add(fromSession(s, 'planned'));
	const nameOf = (id: string) =>
		packages.find((p) => p.id === id)?.name ?? null;
	for (const routine of routinesForDate(routines, date))
		add({
			packageId: routine.packageId,
			name: nameOf(routine.packageId),
			kind: 'planned',
			routine,
		});
	for (const routine of routines)
		if (
			routine.skipDates.includes(date) &&
			isScheduledOn({ ...routine, skipDates: [] }, date)
		)
			add({
				packageId: routine.packageId,
				name: nameOf(routine.packageId),
				kind: 'skipped',
				routine,
			});
	return entries;
}

/**
 * パッケージの色の番号（0〜count-1）。作った順で決め、並べ替えても変わらないようにする
 * （色はパッケージに付いて回る。数が多いときだけ繰り返す）。
 */
export function packageColorIndex(
	packages: readonly Package[],
	packageId: string,
	count: number,
): number | null {
	const order = [...packages].sort(
		(a, b) =>
			a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
	);
	const index = order.findIndex((p) => p.id === packageId);
	return index < 0 ? null : index % count;
}
