/**
 * 日付をまたいだ筋トレ（23:45 に始めて 0 時を過ぎても続けている）。前の日の筋トレが続いていれば、その日も
 * 「いまの日」として扱う: 今日の画面はその日のまま（0 時に今日へ切り替えない）、タイマーで記録でき、
 * 終えた時刻は押した時刻。
 * - 続いている: 前の日に筋トレ中のもの（進行中のセット・筋トレ中のパッケージ・終えていない単発の種目）があるか、
 *   0 時を過ぎてから終えた（再開できるように）。どちらも最後の記録から 3 時間以内のときだけ
 *   （終え忘れたまま翌日に開いたときは、ふつうの過去の日）
 * - 今日の筋トレを始めたら（開始・時刻のあるセット・進行中のセット）、前の日の筋トレは続いていない
 */
import { isRunningSession } from '../log/day-ops';
import { sessionSpan } from '../log/summary';
import type { ActiveSet, DayLog } from '../model/types';
import {
	addDays,
	circularRange,
	parseTime,
	startOfDayMs,
	todayString,
} from '../time/date';

/** 最後の記録からこれより空いたら、前の日の筋トレは続いていない */
export const OVERNIGHT_IDLE_SEC = 3 * 60 * 60;

export interface Overnight {
	/** 前の日（'YYYY-MM-DD'） */
	date: string;
	/** 筋トレ中（まだ終えていない）。false は 0 時を過ぎてから終えたもの */
	running: boolean;
}

export function overnightWorkout(input: {
	now: Date;
	activeSet: ActiveSet | null;
	day: (date: string) => DayLog | undefined;
}): Overnight | null {
	const { now, activeSet } = input;
	const today = todayString(now);
	if (activeSet?.date === today || hasStarted(input.day(today))) return null;
	const date = addDays(today, -1);
	const day = input.day(date);
	const active = activeSet?.date === date ? activeSet : null;
	const running =
		active !== null ||
		(day?.sessions.some((s) => isRunningSession(s, true)) ?? false);
	const last = lastActivityMs(date, day, active, now);
	if (last === null) return null;
	if (!running && last < startOfDayMs(today)) return null;
	if (now.getTime() - last > OVERNIGHT_IDLE_SEC * 1000) return null;
	return { date, running };
}

/** 今日の筋トレを始めたか（開始を押した・時刻のあるセットがある） */
function hasStarted(day: DayLog | undefined): boolean {
	return (
		day?.sessions.some(
			(s) => Boolean(s.start) || sessionSpan(s) !== null,
		) ?? false
	);
}

/**
 * その日のノートの最後の記録（開始・終了・セットの時刻と進行中のセットの開始）の時刻（ミリ秒）。
 * ノートの時刻には日付が無いので、24 時間の円の上でいちばん早い時刻をその日とし、そこからの経過で
 * 0 時を過ぎた分を翌日にする。今より先になるもの（同じ日の朝の筋トレなど、円の読み違い）は除く
 */
function lastActivityMs(
	date: string,
	day: DayLog | undefined,
	active: ActiveSet | null,
	now: Date,
): number | null {
	const times: number[] = [];
	for (const session of day?.sessions ?? []) {
		const values: Array<string | null | undefined> = [
			session.start,
			session.end,
		];
		for (const exercise of session.exercises)
			for (const set of exercise.sets) values.push(set.start, set.end);
		for (const value of values) {
			const sec = value ? parseTime(value) : null;
			if (sec !== null) times.push(sec);
		}
	}
	const candidates: number[] = [];
	const range = circularRange(times);
	if (range) {
		const midnight = startOfDayMs(date);
		for (const sec of times) {
			const offset = (sec - range.first + 86_400) % 86_400;
			candidates.push(midnight + (range.first + offset) * 1000);
		}
	}
	if (active) {
		const started = Date.parse(active.startedAt);
		if (!Number.isNaN(started)) candidates.push(started);
	}
	const past = candidates.filter((ms) => ms <= now.getTime());
	return past.length === 0 ? null : Math.max(...past);
}
