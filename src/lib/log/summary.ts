/**
 * 日ノートの集計（frontmatter に書く値）。Bases / Dataview の表やグラフにそのまま使える形にする。
 */
import type { DayLog, SessionLog, SetLog } from '../model/types';
import {
	circularRange,
	parseTime,
	secondsToTime,
	spanSeconds,
} from '../time/date';

export const LOG_TAG = 'fitness-log';

export interface DaySummary {
	/** パッケージ名（その他は含めない。重複なし・出現順） */
	packages: string[];
	/** 種目名（重複なし・出現順） */
	exercises: string[];
	sets: number;
	/** Σ 重量 × 回数（kg） */
	volumeKg: number;
	/** セッションごとの「最初の開始〜最後の終了」の合計（分） */
	durationMin: number;
}

/** セットのボリューム（重量・回数のどちらかが無ければ 0） */
export function setVolume(set: SetLog): number {
	return set.weight !== null && set.reps !== null ? set.weight * set.reps : 0;
}

/**
 * セッションの最初の開始と最後の終了（時刻が無ければ null）。
 * 日付をまたいだセッション（23:50〜00:20）も正しく扱う。
 */
export function sessionSpan(
	session: SessionLog,
): { start: string; end: string } | null {
	const times: number[] = [];
	for (const exercise of session.exercises)
		for (const set of exercise.sets)
			for (const time of [set.start, set.end]) {
				const sec = time === null ? null : parseTime(time);
				if (sec !== null) times.push(sec);
			}
	const range = circularRange(times);
	if (!range) return null;
	return {
		start: secondsToTime(range.first),
		end: secondsToTime(range.last),
	};
}

/**
 * セッションの所要時間（秒）。「筋トレを開始・終了」の時刻があればそれ、
 * 進行中ならセットの最後の終了まで、どちらも無ければセットの時刻から計算する。
 */
export function sessionDurationSec(session: SessionLog): number {
	const span = sessionSpan(session);
	if (session.start) {
		const end = session.end ?? span?.end;
		return end ? (spanSeconds(session.start, end) ?? 0) : 0;
	}
	return span ? (spanSeconds(span.start, span.end) ?? 0) : 0;
}

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}

export function summarizeDay(day: DayLog): DaySummary {
	const packages: string[] = [];
	const exercises: string[] = [];
	let sets = 0;
	let volume = 0;
	let durationSec = 0;
	for (const session of day.sessions) {
		if (session.name !== null && !packages.includes(session.name))
			packages.push(session.name);
		for (const exercise of session.exercises) {
			if (exercise.sets.length > 0 && !exercises.includes(exercise.name))
				exercises.push(exercise.name);
			for (const set of exercise.sets) {
				sets++;
				volume += setVolume(set);
			}
		}
		durationSec += sessionDurationSec(session);
	}
	return {
		packages,
		exercises,
		sets,
		volumeKg: round1(volume),
		durationMin: Math.round(durationSec / 60),
	};
}

/** タグの値（文字列・配列・未設定）に LOG_TAG を足した配列 */
function withLogTag(tags: unknown): unknown[] {
	const list: unknown[] = Array.isArray(tags)
		? [...(tags as unknown[])]
		: typeof tags === 'string'
			? tags.split(/[,\s]+/).filter((tag) => tag.length > 0)
			: [];
	const has = list.some(
		(tag) => typeof tag === 'string' && tag.replace(/^#/, '') === LOG_TAG,
	);
	if (!has) list.push(LOG_TAG);
	return list;
}

/**
 * frontmatter（processFrontMatter のコールバックに渡されるオブジェクト）に集計キーだけを上書きする。
 * 他のキーとユーザーのタグは保持する。
 */
export function applySummaryToFrontmatter(
	frontmatter: Record<string, unknown>,
	day: DayLog,
): void {
	const summary = summarizeDay(day);
	frontmatter.tags = withLogTag(frontmatter.tags);
	frontmatter.date = day.date;
	frontmatter.packages = summary.packages;
	frontmatter.exercises = summary.exercises;
	frontmatter.sets = summary.sets;
	frontmatter.volume_kg = summary.volumeKg;
	frontmatter.duration_min = summary.durationMin;
}

export interface SessionSummary {
	/** 記録した種目の数 */
	exercises: number;
	sets: number;
	volumeKg: number;
	durationMin: number;
}

/** 1 セッション（パッケージ 1 回分）のまとめ（「お疲れ様でした」の表示） */
export function summarizeSession(session: SessionLog): SessionSummary {
	let sets = 0;
	let volume = 0;
	let exercises = 0;
	for (const exercise of session.exercises) {
		if (exercise.sets.length > 0) exercises++;
		for (const set of exercise.sets) {
			sets++;
			volume += setVolume(set);
		}
	}
	return {
		exercises,
		sets,
		volumeKg: round1(volume),
		durationMin: Math.round(sessionDurationSec(session) / 60),
	};
}
