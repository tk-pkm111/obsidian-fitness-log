/**
 * パッケージ別のログ（ログページ）。
 * 同じ種目でもパッケージ（やる順番・その前の疲れ）で扱える重量が変わるので、
 * 記録は「どのパッケージでやったか」と組にして見る。
 * 記録はいつも日ノートから読むので、パッケージから外した種目・消したパッケージの記録も消えない。
 */
import { createResolver, nameKey } from '../model/resolve';
import type {
	DayLog,
	Exercise,
	Package,
	RecordType,
	SetLog,
} from '../model/types';
import {
	effectiveMetric,
	metricValue,
	newBestFlags,
	sessionDelta,
	type Delta,
	type Metric,
} from './metrics';
import { sessionStat, type SessionStat } from './stats';

/** パッケージ外（その他）の記録のまとまり */
export const OUTSIDE_GROUP = 'outside';

export type LogGroupKind = 'package' | 'removed-package' | 'outside';

/** 記録のまとまり: 今あるパッケージ・消したパッケージ（日ノートに名前だけ残る）・パッケージ外 */
export interface LogGroup {
	/** パッケージの id。消したパッケージは 'name:<正規化した名前>'、パッケージ外は OUTSIDE_GROUP */
	key: string;
	name: string;
	kind: LogGroupKind;
	package?: Package;
}

export interface LogExercise {
	/** 種目の id。種目ノートに無い名前は 'name:<正規化した名前>' */
	key: string;
	name: string;
	recordType: RecordType;
	exercise?: Exercise;
}

/** あるセッションである種目を行った記録（同じセッションに同じ種目の欄が 2 つあればまとめる） */
export interface LogEntry {
	date: string;
	/** その日の何番目のセッションか */
	session: number;
	group: string;
	exercise: string;
	stat: SessionStat;
}

/** 1 回の筋トレ（セッション）のまとめ */
export interface LogSession {
	date: string;
	session: number;
	group: string;
	exercises: number;
	sets: number;
	/** Σ 重量 × 回数（kg） */
	volume: number;
}

export interface LogData {
	/** 今のパッケージ（一覧の順）→ 消したパッケージ（最初に出た順）→ パッケージ外 */
	groups: LogGroup[];
	/** 記録のある種目 */
	exercises: Map<string, LogExercise>;
	/** 古い順 */
	entries: LogEntry[];
	/** 古い順 */
	sessions: LogSession[];
}

function inferRecordType(sets: readonly SetLog[]): RecordType {
	if (sets.some((s) => s.weight !== null)) return 'weight-reps';
	if (sets.some((s) => s.reps !== null)) return 'reps';
	return 'duration';
}

export function buildLogData(
	days: readonly DayLog[],
	packages: readonly Package[],
	exercises: readonly Exercise[],
): LogData {
	const packageResolver = createResolver(packages);
	const exerciseResolver = createResolver(exercises);
	const removed = new Map<string, LogGroup>();
	let hasOutside = false;
	const logExercises = new Map<string, LogExercise>();
	/** 種目ノートに無い種目のセット（記録タイプを推し量る） */
	const unknownSets = new Map<string, SetLog[]>();
	const entries: LogEntry[] = [];
	const sessions: LogSession[] = [];

	const groupOf = (name: string | null): string => {
		if (name === null) {
			hasOutside = true;
			return OUTSIDE_GROUP;
		}
		const pkg = packageResolver.resolve(name);
		if (pkg) return pkg.id;
		const key = `name:${nameKey(name)}`;
		// 名前は最後に使われたもの
		removed.set(key, {
			key,
			name: name.trim(),
			kind: 'removed-package',
		});
		return key;
	};

	const sorted = [...days].sort((a, b) =>
		a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
	);
	for (const day of sorted) {
		day.sessions.forEach((session, index) => {
			const merged = new Map<string, SetLog[]>();
			for (const log of session.exercises) {
				if (log.sets.length === 0) continue;
				const exercise = exerciseResolver.resolve(log.name);
				const key = exercise?.id ?? `name:${nameKey(log.name)}`;
				merged.set(key, [...(merged.get(key) ?? []), ...log.sets]);
				if (exercise)
					logExercises.set(key, {
						key,
						name: exercise.name,
						recordType: exercise.recordType,
						exercise,
					});
				else {
					unknownSets.set(key, [
						...(unknownSets.get(key) ?? []),
						...log.sets,
					]);
					logExercises.set(key, {
						key,
						name: log.name.trim(),
						recordType: 'weight-reps',
					});
				}
			}
			if (merged.size === 0) return;
			const group = groupOf(session.name);
			let sets = 0;
			let volume = 0;
			for (const [exercise, exerciseSets] of merged) {
				const stat = sessionStat({
					date: day.date,
					sessionName: session.name,
					exerciseName: logExercises.get(exercise)?.name ?? exercise,
					sets: exerciseSets,
				});
				entries.push({
					date: day.date,
					session: index,
					group,
					exercise,
					stat,
				});
				sets += exerciseSets.length;
				volume += stat.volume;
			}
			sessions.push({
				date: day.date,
				session: index,
				group,
				exercises: merged.size,
				sets,
				volume: Math.round(volume * 10) / 10,
			});
		});
	}
	for (const [key, sets] of unknownSets) {
		const exercise = logExercises.get(key);
		if (exercise) exercise.recordType = inferRecordType(sets);
	}

	const groups: LogGroup[] = [
		...packages.map((pkg): LogGroup => ({
			key: pkg.id,
			name: pkg.name,
			kind: 'package',
			package: pkg,
		})),
		...removed.values(),
	];
	if (hasOutside)
		groups.push({ key: OUTSIDE_GROUP, name: '', kind: 'outside' });
	return { groups, exercises: logExercises, entries, sessions };
}

/** あるまとまりでのある種目の記録（古い順）。group が null ならすべて */
export function entriesFor(
	data: LogData,
	group: string | null,
	exercise: string,
): LogEntry[] {
	return data.entries.filter(
		(e) => e.exercise === exercise && (group === null || e.group === group),
	);
}

export interface Trend {
	entries: LogEntry[];
	metric: Metric;
	/** entries と同じ順の値（値の無い記録は null） */
	values: (number | null)[];
	last: LogEntry;
	/** 前回比（2 回目以降） */
	delta: Delta | null;
	/** 最後の記録が、それまでの最高を超えた（自己ベスト） */
	isBest: boolean;
	/** 最高の値と、最初にその値に達した日 */
	best: { value: number; date: string } | null;
}

/** 推移（entries は古い順） */
export function trendOf(
	entries: readonly LogEntry[],
	recordType: RecordType,
	requested?: Metric | null,
): Trend | null {
	const last = entries[entries.length - 1];
	if (!last) return null;
	const stats = entries.map((e) => e.stat);
	const metric = effectiveMetric(recordType, stats, requested);
	const values = stats.map((s) => metricValue(s, metric));
	const prev = entries[entries.length - 2];
	const flags = newBestFlags(values);
	let best: Trend['best'] = null;
	for (let i = 0; i < values.length; i++) {
		const value = values[i];
		const entry = entries[i];
		if (value == null || !entry) continue;
		if (best === null || value > best.value)
			best = { value, date: entry.date };
	}
	return {
		entries: [...entries],
		metric,
		values,
		last,
		delta: prev ? sessionDelta(prev.stat, last.stat, recordType) : null,
		isBest: flags[flags.length - 1] ?? false,
		best,
	};
}

export interface PackageLogRow {
	exercise: LogExercise;
	/** そのまとまりでの推移（まだ記録が無ければ null） */
	trend: Trend | null;
	/** パッケージを始めた後から加わった種目は、そのパッケージで最初にやった日 */
	since: string | null;
}

export interface PackageLog {
	group: LogGroup;
	/** 古い順 */
	sessions: LogSession[];
	/** 今のパッケージの種目（並び順）。パッケージ外・消したパッケージは記録のある種目（最近やった順） */
	current: PackageLogRow[];
	/** 今の内容に無いが、このパッケージで記録のある種目（外した種目・その日だけ足した種目。最近やった順） */
	others: PackageLogRow[];
}

function lastDateDesc(a: PackageLogRow, b: PackageLogRow): number {
	const da = a.trend?.last.date ?? '';
	const db = b.trend?.last.date ?? '';
	return da < db ? 1 : da > db ? -1 : 0;
}

export function packageLog(
	data: LogData,
	groupKey: string,
	library: readonly Exercise[],
): PackageLog | null {
	const group = data.groups.find((g) => g.key === groupKey);
	if (!group) return null;
	const sessions = data.sessions.filter((s) => s.group === groupKey);
	const firstDate = sessions[0]?.date ?? null;
	const performed = new Map<string, LogEntry[]>();
	for (const entry of data.entries)
		if (entry.group === groupKey)
			performed.set(entry.exercise, [
				...(performed.get(entry.exercise) ?? []),
				entry,
			]);

	const row = (exercise: LogExercise, isCurrent: boolean): PackageLogRow => {
		const entries = performed.get(exercise.key) ?? [];
		const trend = trendOf(entries, exercise.recordType);
		const first = entries[0]?.date ?? null;
		return {
			exercise,
			trend,
			since:
				isCurrent &&
				group.kind === 'package' &&
				first !== null &&
				firstDate !== null &&
				first > firstDate
					? first
					: null,
		};
	};

	const current: PackageLogRow[] = [];
	const seen = new Set<string>();
	if (group.package) {
		const byId = new Map(library.map((e) => [e.id, e]));
		for (const item of group.package.items) {
			if (seen.has(item.exerciseId)) continue;
			const exercise = byId.get(item.exerciseId);
			if (!exercise) continue;
			seen.add(exercise.id);
			current.push(
				row(
					data.exercises.get(exercise.id) ?? {
						key: exercise.id,
						name: exercise.name,
						recordType: exercise.recordType,
						exercise,
					},
					true,
				),
			);
		}
	}
	const rest: PackageLogRow[] = [];
	for (const key of performed.keys()) {
		const exercise = data.exercises.get(key);
		if (!exercise || seen.has(key)) continue;
		rest.push(row(exercise, false));
	}
	rest.sort(lastDateDesc);
	return group.package
		? { group, sessions, current, others: rest }
		: { group, sessions, current: rest, others: [] };
}

export interface ExerciseGroupLog {
	group: LogGroup;
	trend: Trend;
}

/** 種目の記録をまとまりごとに（groups の順。記録のあるまとまりだけ） */
export function exerciseLog(
	data: LogData,
	exerciseKey: string,
	metric?: Metric | null,
): ExerciseGroupLog[] {
	const exercise = data.exercises.get(exerciseKey);
	if (!exercise) return [];
	const all = entriesFor(data, null, exerciseKey);
	// どのまとまりでも同じ指標で比べる
	const shared = effectiveMetric(
		exercise.recordType,
		all.map((e) => e.stat),
		metric,
	);
	const result: ExerciseGroupLog[] = [];
	for (const group of data.groups) {
		const trend = trendOf(
			all.filter((e) => e.group === group.key),
			exercise.recordType,
			shared,
		);
		if (trend) result.push({ group, trend });
	}
	return result;
}

/** 最近やった種目（新しい順） */
export function recentExercises(data: LogData, limit: number): LogExercise[] {
	const result: LogExercise[] = [];
	const seen = new Set<string>();
	for (let i = data.entries.length - 1; i >= 0; i--) {
		const key = data.entries[i]?.exercise;
		if (key === undefined || seen.has(key)) continue;
		seen.add(key);
		const exercise = data.exercises.get(key);
		if (exercise) result.push(exercise);
		if (result.length >= limit) break;
	}
	return result;
}

/** 記録のある種目を名前・別名で探す（最近やった順） */
export function searchExercises(data: LogData, query: string): LogExercise[] {
	const q = nameKey(query);
	if (q.length === 0) return [];
	return recentExercises(data, Number.POSITIVE_INFINITY).filter((e) =>
		[e.name, ...(e.exercise?.aliases ?? [])].some((name) =>
			nameKey(name).includes(q),
		),
	);
}

/** 最初に開くまとまり: 最後にやったパッケージ（無ければ一覧の先頭） */
export function defaultGroup(data: LogData): string | null {
	for (let i = data.sessions.length - 1; i >= 0; i--) {
		const group = data.sessions[i]?.group;
		if (
			group !== undefined &&
			data.groups.some((g) => g.key === group && g.kind === 'package')
		)
			return group;
	}
	return (
		data.sessions[data.sessions.length - 1]?.group ??
		data.groups[0]?.key ??
		null
	);
}
