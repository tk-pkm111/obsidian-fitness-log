import { describe, expect, it } from 'vitest';
import {
	newBestFlags,
	sessionDelta,
	effectiveMetric,
} from '../../../src/lib/history/metrics';
import {
	buildLogData,
	defaultGroup,
	exerciseLog,
	OUTSIDE_GROUP,
	packageLog,
	recentExercises,
	searchExercises,
	trendOf,
} from '../../../src/lib/history/package-log';
import { sessionStat } from '../../../src/lib/history/stats';
import type {
	DayLog,
	Exercise,
	Package,
	RecordType,
	SessionLog,
	SetLog,
} from '../../../src/lib/model/types';

const s = (weight: number | null, reps: number | null): SetLog => ({
	weight,
	reps,
	start: null,
	end: null,
	note: '',
});
const session = (
	name: string | null,
	exercises: Array<[string, SetLog[]]>,
): SessionLog => ({
	name,
	note: '',
	exercises: exercises.map(([n, sets]) => ({ name: n, sets })),
});
const day = (date: string, ...sessions: SessionLog[]): DayLog => ({
	date,
	sessions,
});
const ex = (
	id: string,
	name: string,
	recordType: RecordType = 'weight-reps',
	aliases: string[] = [],
): Exercise => ({
	id,
	name,
	category: 'legs',
	recordType,
	aliases,
	createdAt: '',
});
const pkg = (
	id: string,
	name: string,
	exerciseIds: string[],
	aliases: string[] = [],
): Package => ({
	id,
	name,
	items: exerciseIds.map((exerciseId) => ({
		exerciseId,
		targetSets: 2,
		targetReps: '8-12',
	})),
	aliases,
	createdAt: '',
});
const stat = (date: string, sets: SetLog[]) =>
	sessionStat({ date, sessionName: 'A', exerciseName: 'X', sets });

const exercises = [
	ex('calf', 'シーテッドカーフレイズ', 'weight-reps', ['カーフ']),
	ex('curl', 'レッグカール'),
	ex('ext', 'レッグエクステンション'),
	ex('hlr', 'ハンギングレッグレイズ', 'reps'),
];
const packages = [
	pkg('legsa', 'LEGS A', ['calf', 'curl', 'hlr'], ['LEGS-A']),
	pkg('legb', 'LEG B', ['calf']),
];
const days = [
	day(
		'2026-09-01',
		session('LEGS A', [
			['シーテッドカーフレイズ', [s(40, 10), s(40, 9)]],
			['レッグエクステンション', [s(30, 12)]],
		]),
	),
	day(
		'2026-09-04',
		session('LEG B', [['カーフ', [s(30, 15)]]]),
		session(null, [['ハンギングレッグレイズ', [s(null, 10)]]]),
	),
	day(
		'2026-09-08',
		session('LEGS-A', [
			['シーテッドカーフレイズ', [s(40, 12)]],
			// 同じ種目の欄が 2 つ（セット番号は続く）→ 1 つの記録にまとめる
			['シーテッドカーフレイズ', [s(40, 10)]],
			['レッグカール', [s(25, 10)]],
			['ハンギングレッグレイズ', [s(null, 12), s(null, 10)]],
		]),
	),
	day(
		'2026-09-10',
		session('PULL（消した）', [['懸垂', [s(null, 8)]]]),
		session('LEGS A', [['ノルディック', []]]), // セットが無い記録は数えない
	),
	day(
		'2026-09-15',
		session('LEGS A', [
			['シーテッドカーフレイズ', [s(42.5, 8), s(42.5, 8)]],
			['レッグカール', [s(25, 12)]],
		]),
	),
];

describe('buildLogData', () => {
	const data = buildLogData(days, packages, exercises);

	it('セッションをパッケージ（別名も）・消したパッケージ・パッケージ外にまとめる', () => {
		expect(data.groups.map((g) => [g.key, g.kind])).toEqual([
			['legsa', 'package'],
			['legb', 'package'],
			['name:pull(消した)', 'removed-package'],
			[OUTSIDE_GROUP, 'outside'],
		]);
		expect(data.groups[2]?.name).toBe('PULL（消した）');
		expect(
			data.sessions.map((x) => [x.date, x.group, x.exercises, x.sets]),
		).toEqual([
			['2026-09-01', 'legsa', 2, 3],
			['2026-09-04', 'legb', 1, 1],
			['2026-09-04', OUTSIDE_GROUP, 1, 1],
			['2026-09-08', 'legsa', 3, 5],
			['2026-09-10', 'name:pull(消した)', 1, 1],
			['2026-09-15', 'legsa', 2, 3],
		]);
		expect(data.sessions[0]?.volume).toBe(40 * 10 + 40 * 9 + 30 * 12);
	});

	it('同じセッションの同じ種目はまとめ、種目ノートに無い名前は記録から記録タイプを推し量る', () => {
		const calf = data.entries.filter(
			(e) => e.exercise === 'calf' && e.date === '2026-09-08',
		);
		expect(calf).toHaveLength(1);
		expect(calf[0]?.stat.sets).toHaveLength(2);
		expect(data.exercises.get('name:懸垂')).toMatchObject({
			name: '懸垂',
			recordType: 'reps',
		});
	});
});

describe('trendOf', () => {
	const data = buildLogData(days, packages, exercises);
	const calfA = data.entries.filter(
		(e) => e.exercise === 'calf' && e.group === 'legsa',
	);

	it('推定 1RM の推移・前回比・自己ベスト', () => {
		const trend = trendOf(calfA, 'weight-reps');
		expect(trend?.metric).toBe('estimatedOneRepMax');
		expect(trend?.values).toEqual([53.3, 56, 53.8]);
		// トップセットの重量が変わったので重量の差
		expect(trend?.delta).toEqual({ kind: 'weight', diff: 2.5 });
		expect(trend?.isBest).toBe(false);
		expect(trend?.best).toEqual({ value: 56, date: '2026-09-08' });
	});

	it('最後の記録が最高を超えたら自己ベスト。1 回目は数えない', () => {
		const curl = data.entries.filter((e) => e.exercise === 'curl');
		const trend = trendOf(curl, 'weight-reps');
		expect(trend?.isBest).toBe(true);
		expect(trend?.delta).toEqual({ kind: 'reps', diff: 2 });
		expect(trendOf(curl.slice(0, 1), 'weight-reps')?.isBest).toBe(false);
		expect(trendOf([], 'weight-reps')).toBeNull();
	});
});

describe('packageLog', () => {
	const data = buildLogData(days, packages, exercises);

	it('今のパッケージの種目を並び順で。途中から加わった種目は始めた日', () => {
		const log = packageLog(data, 'legsa', exercises);
		expect(log?.sessions.map((x) => x.date)).toEqual([
			'2026-09-01',
			'2026-09-08',
			'2026-09-15',
		]);
		expect(log?.current.map((r) => r.exercise.key)).toEqual([
			'calf',
			'curl',
			'hlr',
		]);
		expect(log?.current.map((r) => r.since)).toEqual([
			null,
			'2026-09-08',
			'2026-09-08',
		]);
		expect(log?.current[2]?.trend?.metric).toBe('totalReps');
	});

	it('今の内容に無い種目（外した・その日だけ足した）も記録が残る', () => {
		const log = packageLog(data, 'legsa', exercises);
		expect(log?.others.map((r) => r.exercise.key)).toEqual(['ext']);
		expect(log?.others[0]?.trend?.last.date).toBe('2026-09-01');
	});

	it('まだ記録の無い種目は推移なし', () => {
		const log = packageLog(data, 'legb', [
			...exercises,
			ex('new', '新しい種目'),
		]);
		expect(
			log?.current.map((r) => [r.exercise.key, r.trend !== null]),
		).toEqual([['calf', true]]);
		const withNew = packageLog(
			buildLogData(
				days,
				[pkg('legb', 'LEG B', ['calf', 'new'])],
				exercises,
			),
			'legb',
			[...exercises, ex('new', '新しい種目')],
		);
		expect(withNew?.current[1]).toMatchObject({
			exercise: { key: 'new' },
			trend: null,
			since: null,
		});
	});

	it('パッケージ外・消したパッケージは記録のある種目を最近やった順に', () => {
		expect(
			packageLog(data, OUTSIDE_GROUP, exercises)?.current.map(
				(r) => r.exercise.key,
			),
		).toEqual(['hlr']);
		expect(
			packageLog(data, 'name:pull(消した)', exercises)?.current.map(
				(r) => r.exercise.name,
			),
		).toEqual(['懸垂']);
		expect(packageLog(data, 'nope', exercises)).toBeNull();
	});
});

describe('種目ごと', () => {
	const data = buildLogData(days, packages, exercises);

	it('パッケージごとの推移を同じ指標で', () => {
		const log = exerciseLog(data, 'calf', 'maxWeight');
		expect(log.map((g) => [g.group.key, g.trend.values])).toEqual([
			['legsa', [40, 40, 42.5]],
			['legb', [30]],
		]);
		expect(exerciseLog(data, 'calf')[0]?.trend.metric).toBe(
			'estimatedOneRepMax',
		);
		expect(exerciseLog(data, 'nope')).toEqual([]);
	});

	it('最近やった種目・名前と別名で探す', () => {
		// 同じセッションでは後に書いた種目ほど新しい
		expect(recentExercises(data, 3).map((e) => e.key)).toEqual([
			'curl',
			'calf',
			'name:懸垂',
		]);
		expect(searchExercises(data, 'カーフ').map((e) => e.key)).toEqual([
			'calf',
		]);
		expect(searchExercises(data, 'レッグ').map((e) => e.key)).toEqual([
			'curl',
			'hlr',
			'ext',
		]);
		expect(searchExercises(data, ' ')).toEqual([]);
	});

	it('最初に開くのは最後にやったパッケージ', () => {
		expect(defaultGroup(data)).toBe('legsa');
		expect(
			defaultGroup(buildLogData([days[1]!], [], exercises)),
		).not.toBeNull();
		expect(defaultGroup(buildLogData([], [], []))).toBeNull();
	});
});

describe('metrics', () => {
	it('前回比: 重量が変われば重量、同じなら合計回数、時間は時間', () => {
		const a = stat('2026-09-01', [s(40, 10), s(40, 9)]);
		const b = stat('2026-09-08', [s(40, 12), s(40, 9)]);
		expect(sessionDelta(a, b, 'weight-reps')).toEqual({
			kind: 'reps',
			diff: 2,
		});
		const c = stat('2026-09-15', [s(37.5, 12)]);
		expect(sessionDelta(b, c, 'weight-reps')).toEqual({
			kind: 'weight',
			diff: -2.5,
		});
		expect(sessionDelta(a, b, 'duration')).toEqual({
			kind: 'duration',
			diff: 0,
		});
	});

	it('その時点の最高を超えた記録に印', () => {
		expect(newBestFlags([10, 12, null, 12, 13, 9])).toEqual([
			false,
			true,
			false,
			false,
			true,
			false,
		]);
	});

	it('重量を書いていない重量×回数の種目は合計回数で見る', () => {
		const stats = [stat('2026-09-01', [s(null, 10)])];
		expect(effectiveMetric('weight-reps', stats)).toBe('totalReps');
		expect(effectiveMetric('weight-reps', stats, 'volume')).toBe(
			'totalReps',
		);
		expect(effectiveMetric('weight-reps', [], 'volume')).toBe('volume');
		expect(effectiveMetric('reps', [], 'volume')).toBe('totalReps');
	});
});
