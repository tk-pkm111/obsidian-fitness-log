import { describe, expect, it } from 'vitest';
import {
	addSessionNote,
	appendSet,
	cloneDay,
	countSets,
	DayLogError,
	deleteSet,
	editSessionNote,
	endDay,
	resumeDay,
	resumeSession,
	startSession,
	removeExercise,
	removeSession,
	renameSession,
	setsInSession,
	updateSet,
} from '../../../src/lib/log/day-ops';
import type { DayLog, SetLog } from '../../../src/lib/model/types';

const set = (weight: number | null, reps: number | null): SetLog => ({
	weight,
	reps,
	start: '10:00:00',
	end: '10:01:00',
	note: '',
});

const exact = (name: string | null) => (other: string | null) => other === name;

describe('appendSet', () => {
	it('セッション・種目が無ければ作り、あれば末尾に足す', () => {
		const day: DayLog = { date: '2026-10-01', sessions: [] };
		const target = {
			matchSession: exact('PUSH A'),
			sessionName: 'PUSH A',
			matchExercise: (n: string) => n === 'ディップス',
			exerciseName: 'ディップス',
		};
		expect(appendSet(day, target, set(null, 8))).toEqual({
			sessionIndex: 0,
			exerciseIndex: 0,
			setIndex: 0,
			sessionName: 'PUSH A',
			exerciseName: 'ディップス',
		});
		expect(appendSet(day, target, set(null, 7)).setIndex).toBe(1);
		expect(day.sessions).toHaveLength(1);
		expect(countSets(day)).toBe(2);
	});

	it('別名で一致した既存の見出しに追記し、見出しの表記は変えない', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: '旧パッケージ名',
					notes: [],
					exercises: [{ name: 'DBカール', sets: [] }],
				},
			],
		};
		const address = appendSet(
			day,
			{
				matchSession: (n) =>
					n === '旧パッケージ名' || n === '新パッケージ名',
				sessionName: '新パッケージ名',
				matchExercise: (n) =>
					n === 'DBカール' || n === 'ダンベルカール',
				exerciseName: 'ダンベルカール',
			},
			set(10, 10),
		);
		expect(address).toEqual({
			sessionIndex: 0,
			exerciseIndex: 0,
			setIndex: 0,
			sessionName: '旧パッケージ名',
			exerciseName: 'DBカール',
		});
	});

	it('パッケージのセッションは「その他」より前に入る', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [{ name: null, notes: [], exercises: [] }],
		};
		appendSet(
			day,
			{
				matchSession: exact('PULL A'),
				sessionName: 'PULL A',
				matchExercise: () => false,
				exerciseName: 'X',
			},
			set(1, 1),
		);
		expect(day.sessions.map((s) => s.name)).toEqual(['PULL A', null]);
	});
});

describe('appendSet（やった順）', () => {
	const target = (name: string) => ({
		matchSession: exact('PUSH A'),
		sessionName: 'PUSH A',
		matchExercise: (n: string) => n === name,
		exerciseName: name,
	});
	const names = (day: DayLog) =>
		day.sessions[0]?.exercises.map((e) => [e.name, e.sets.length]);

	it('最後にやった種目なら同じ欄、違えば下に欄を足す（前にやった種目でももう 1 欄）', () => {
		const day: DayLog = { date: '2026-10-01', sessions: [] };
		appendSet(day, target('プレス'), set(10, 9));
		appendSet(day, target('レッグプレス'), set(50, 12));
		const again = appendSet(day, target('プレス'), set(10, 8));
		expect(again).toMatchObject({ exerciseIndex: 2, setIndex: 0 });
		expect(appendSet(day, target('プレス'), set(10, 7))).toMatchObject({
			exerciseIndex: 2,
			setIndex: 1,
		});
		expect(names(day)).toEqual([
			['プレス', 1],
			['レッグプレス', 1],
			['プレス', 2],
		]);
		expect(
			setsInSession(day.sessions[0], (n) => n === 'プレス').map(
				(s) => s.reps,
			),
		).toEqual([9, 8, 7]);
	});

	it('セットの無い欄（予定だけの種目）は、やった種目のすぐ下に移して使う', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'PUSH A',
					notes: [],
					exercises: [
						{ name: 'ディップス', sets: [] },
						{ name: 'カール', sets: [] },
						{ name: 'Yレイズ', sets: [set(10, 9)] },
					],
				},
			],
		};
		expect(appendSet(day, target('カール'), set(8, 10))).toMatchObject({
			exerciseIndex: 1,
			setIndex: 0,
		});
		expect(names(day)).toEqual([
			['Yレイズ', 1],
			['カール', 1],
			['ディップス', 0],
		]);
	});
});

describe('updateSet / deleteSet', () => {
	const base = (): DayLog => ({
		date: '2026-10-01',
		sessions: [
			{
				name: 'A',
				notes: [],
				exercises: [
					{ name: 'X', sets: [set(10, 8), set(12.5, 6)] },
					{ name: 'Y', sets: [set(20, 5)] },
				],
			},
		],
	});

	it('位置を指定して修正する', () => {
		const day = base();
		updateSet(
			day,
			{
				sessionIndex: 0,
				exerciseIndex: 0,
				sessionName: 'A',
				exerciseName: 'X',
				setIndex: 1,
			},
			{ reps: 7, note: '補助あり' },
		);
		expect(day.sessions[0]?.exercises[0]?.sets[1]).toMatchObject({
			weight: 12.5,
			reps: 7,
			note: '補助あり',
		});
	});

	it('最後のセットを消すと種目の見出しも消える（セッションは残る）', () => {
		const day = base();
		deleteSet(day, {
			sessionIndex: 0,
			exerciseIndex: 1,
			sessionName: 'A',
			exerciseName: 'Y',
			setIndex: 0,
		});
		expect(day.sessions[0]?.exercises.map((e) => e.name)).toEqual(['X']);
		expect(day.sessions).toHaveLength(1);
	});

	it('見つからない位置はエラー（ノートが変わった場合）', () => {
		const day = base();
		expect(() =>
			deleteSet(day, {
				sessionIndex: 0,
				exerciseIndex: 0,
				sessionName: 'A',
				exerciseName: 'X',
				setIndex: 5,
			}),
		).toThrow(DayLogError);
		expect(() =>
			updateSet(
				day,
				{
					sessionIndex: 0,
					exerciseIndex: 0,
					sessionName: 'B',
					exerciseName: 'X',
					setIndex: 0,
				},
				{},
			),
		).toThrow(DayLogError);
	});

	it('cloneDay は深いコピー', () => {
		const day = base();
		const copy = cloneDay(day);
		updateSet(
			copy,
			{
				sessionIndex: 0,
				exerciseIndex: 0,
				sessionName: 'A',
				exerciseName: 'X',
				setIndex: 0,
			},
			{ reps: 1 },
		);
		expect(day.sessions[0]?.exercises[0]?.sets[0]?.reps).toBe(8);
	});
});

describe('セッションの操作', () => {
	it('全体のコメントを 1 件ずつ後ろに足す（無ければセッションを作る。空は足さない）', () => {
		const day: DayLog = { date: '2026-10-01', sessions: [] };
		addSessionNote(day, exact('A'), 'A', '  調子よし ');
		addSessionNote(day, exact('A'), 'A', 'スクワットはスミスマシンで');
		addSessionNote(day, exact('A'), 'A', '   ');
		expect(day.sessions).toEqual([
			{
				name: 'A',
				notes: ['調子よし', 'スクワットはスミスマシンで'],
				exercises: [],
			},
		]);
	});

	it('コメントを 1 件だけ直す・空にしたら消す。ノートが変わっていたら書き換えない', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [{ name: 'A', notes: ['一', '二', '三'], exercises: [] }],
		};
		editSessionNote(day, exact('A'), 1, '二', ' 2 件目 ');
		expect(day.sessions[0]?.notes).toEqual(['一', '2 件目', '三']);
		editSessionNote(day, exact('A'), 0, '一', '');
		expect(day.sessions[0]?.notes).toEqual(['2 件目', '三']);
		// 画面に出していた文とノートが違う（手編集・Sync）・無いセッション
		expect(() => editSessionNote(day, exact('A'), 0, '一', 'x')).toThrow(
			DayLogError,
		);
		expect(() => editSessionNote(day, exact('B'), 0, '一', 'x')).toThrow(
			DayLogError,
		);
		expect(day.sessions[0]?.notes).toEqual(['2 件目', '三']);
	});

	it('cloneDay はコメントの配列も写す（元の日を変えない）', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [{ name: 'A', notes: ['一'], exercises: [] }],
		};
		const copy = cloneDay(day);
		addSessionNote(copy, exact('A'), 'A', '二');
		expect(day.sessions[0]?.notes).toEqual(['一']);
	});

	it('セットの無いセッションは外せる。記録があれば外さない', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{ name: 'A', notes: [], exercises: [] },
				{
					name: 'B',
					notes: [],
					exercises: [{ name: 'X', sets: [set(1, 1)] }],
				},
			],
		};
		removeSession(day, exact('A'));
		expect(day.sessions.map((s) => s.name)).toEqual(['B']);
		expect(() => removeSession(day, exact('B'))).toThrow(DayLogError);
		removeSession(day, exact('無い')); // 無ければ何もしない
		expect(day.sessions).toHaveLength(1);
	});

	it('withSets なら記録ごと外す（筋トレ中・終了後のパッケージを外す）', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'B',
					notes: [],
					start: '10:00:00',
					exercises: [{ name: 'X', sets: [set(1, 1)] }],
				},
			],
		};
		removeSession(day, exact('B'), { withSets: true });
		expect(day.sessions).toEqual([]);
	});

	it('別のパッケージにするときは見出しの名前だけ変える（開始・セット・コメントはそのまま）', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'A',
					notes: ['メモ'],
					start: '10:00:00',
					exercises: [{ name: 'X', sets: [set(1, 1)] }],
				},
			],
		};
		expect(renameSession(day, exact('A'), 'B')).toBe(true);
		expect(day.sessions).toEqual([
			{
				name: 'B',
				notes: ['メモ'],
				start: '10:00:00',
				exercises: [{ name: 'X', sets: [set(1, 1)] }],
			},
		]);
		expect(renameSession(day, exact('無い'), 'C')).toBe(false);
	});
});

describe('removeExercise', () => {
	it('セットの無い欄だけ消す。記録のある欄・他のセッションは残す', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'PUSH A',
					notes: [],
					exercises: [
						{ name: 'ディップス', sets: [set(null, 8)] },
						{ name: 'ケーブルYレイズ', sets: [] },
					],
				},
				{
					name: null,
					notes: [],
					exercises: [{ name: 'ケーブルYレイズ', sets: [] }],
				},
			],
		};
		const isY = (n: string) => n === 'ケーブルYレイズ';
		expect(removeExercise(day, exact('PUSH A'), isY)).toBe(true);
		expect(day.sessions[0]?.exercises.map((e) => e.name)).toEqual([
			'ディップス',
		]);
		expect(day.sessions[1]?.exercises).toHaveLength(1);
		// もう無い・記録のある欄は消さない（false）
		expect(removeExercise(day, exact('PUSH A'), isY)).toBe(false);
		expect(
			removeExercise(day, exact('PUSH A'), (n) => n === 'ディップス'),
		).toBe(false);
		expect(day.sessions[0]?.exercises).toHaveLength(1);
		expect(removeExercise(day, exact('LEGS'), isY)).toBe(false);
	});

	it('withSets のときは記録のある欄も消す（同じ種目の欄が 2 つあればどちらも）', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'PUSH A',
					notes: [],
					exercises: [
						{ name: 'ディップス', sets: [set(null, 8)] },
						{ name: 'ベンチプレス', sets: [set(40, 10)] },
						{ name: 'ディップス', sets: [set(null, 6)] },
					],
				},
			],
		};
		const isDips = (n: string) => n === 'ディップス';
		expect(
			removeExercise(day, exact('PUSH A'), isDips, { withSets: true }),
		).toBe(true);
		expect(day.sessions[0]?.exercises.map((e) => e.name)).toEqual([
			'ベンチプレス',
		]);
	});
});

describe('位置の確かめ（レビューで見つかった不具合の再発防止）', () => {
	it('「その他」が 2 つあっても、位置で指したセットを書き換える', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: null,
					notes: [],
					exercises: [{ name: 'X', sets: [set(10, 8)] }],
				},
				{
					name: null,
					notes: [],
					exercises: [{ name: 'X', sets: [set(50, 5)] }],
				},
			],
		};
		updateSet(
			day,
			{
				sessionIndex: 1,
				exerciseIndex: 0,
				setIndex: 0,
				sessionName: null,
				exerciseName: 'X',
				expected: set(50, 5),
			},
			{ reps: 6 },
		);
		expect(day.sessions.map((s) => s.exercises[0]?.sets[0]?.reps)).toEqual([
			8, 6,
		]);
	});

	it('画面に出していた値とノートの値が違えば（手編集・Sync）書き換えない', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'A',
					notes: [],
					exercises: [{ name: 'X', sets: [set(10, 7)] }],
				},
			],
		};
		expect(() =>
			deleteSet(day, {
				sessionIndex: 0,
				exerciseIndex: 0,
				setIndex: 0,
				sessionName: 'A',
				exerciseName: 'X',
				expected: set(10, 8),
			}),
		).toThrow(DayLogError);
		expect(day.sessions[0]?.exercises[0]?.sets).toHaveLength(1);
	});
});

describe('筋トレの開始・再開', () => {
	const match = (name: string | null) => (other: string | null) =>
		other === name;

	it('開始でセッションを作って開始時刻、再開で終了時刻を消す', () => {
		const day: DayLog = { date: '2026-10-01', sessions: [] };
		startSession(day, match('PUSH A'), 'PUSH A', '18:30:05');
		expect(day.sessions[0]).toEqual({
			name: 'PUSH A',
			notes: [],
			exercises: [],
			start: '18:30:05',
		});
		endDay(day, { time: '19:20:00', includeOther: true });
		expect(day.sessions[0]?.end).toBe('19:20:00');
		resumeSession(day, match('PUSH A'));
		expect(day.sessions[0]).not.toHaveProperty('end');
		// もう一度「開始」しても最初の開始時刻は変えない
		startSession(day, match('PUSH A'), 'PUSH A', '20:00:00');
		expect(day.sessions[0]?.start).toBe('18:30:05');
	});
});

const timed = (start: string, end: string): SetLog => ({
	...set(10, 8),
	start,
	end,
});

describe('その日の筋トレをまとめて終える（endDay）', () => {
	it('それぞれ最後のセットの終了で終え、最後にやったものだけ押した時刻にする', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'CARDIO',
					notes: [],
					start: '00:57:00',
					exercises: [
						{
							name: 'トレッドミル',
							sets: [timed('00:57:10', '01:00:00')],
						},
					],
				},
				{
					name: null,
					notes: [],
					exercises: [
						{
							name: 'レッグプレス',
							sets: [
								timed('00:59:00', '01:00:16'),
								timed('01:02:00', '01:02:38'),
							],
						},
					],
				},
			],
		};
		const ended = endDay(day, { time: '01:05:00', includeOther: true });
		expect(ended.map((s) => s.name)).toEqual(['CARDIO', null]);
		expect(day.sessions[0]?.end).toBe('01:00:00');
		// 単発の種目は開始の代わりに最初のセットの開始
		expect(day.sessions[1]).toMatchObject({
			start: '00:59:00',
			end: '01:05:00',
		});
	});

	it('終えたもの・開始していないパッケージ・記録の無い単発の種目はそのまま', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'A',
					notes: [],
					start: '18:00:00',
					end: '18:30:00',
					exercises: [],
				},
				{ name: 'B', notes: [], start: '19:00:00', exercises: [] },
				{ name: 'C', notes: [], exercises: [] },
				{ name: null, notes: [], exercises: [] },
			],
		};
		endDay(day, { time: '19:10:00', includeOther: true });
		expect(day.sessions.map((s) => s.end)).toEqual([
			'18:30:00',
			'19:10:00',
			undefined,
			undefined,
		]);
		expect(day.sessions[3]).not.toHaveProperty('start');
	});

	it('日付をまたいでも、最後にやったものを押した時刻で終える', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'A',
					notes: [],
					start: '23:40:00',
					exercises: [
						{ name: 'X', sets: [timed('23:41:00', '23:50:00')] },
					],
				},
				{
					name: 'B',
					notes: [],
					start: '23:55:00',
					exercises: [
						{ name: 'Y', sets: [timed('00:05:00', '00:06:00')] },
					],
				},
			],
		};
		endDay(day, { time: '00:10:00', includeOther: true });
		expect(day.sessions.map((s) => s.end)).toEqual([
			'23:50:00',
			'00:10:00',
		]);
	});

	it('過去の日（time が null）はどれも最後のセットの終了（セットが無ければ開始）。単発の種目は終えない', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'PUSH A',
					notes: [],
					start: '22:40:00',
					exercises: [
						{
							name: 'X',
							sets: [
								timed('22:41:00', '22:41:30'),
								timed('23:45:00', '23:46:10'),
							],
						},
					],
				},
				{ name: 'B', notes: [], start: '10:00:00', exercises: [] },
				{
					name: null,
					notes: [],
					exercises: [
						{ name: 'Y', sets: [timed('11:00:00', '11:01:00')] },
					],
				},
			],
		};
		endDay(day, { time: null, includeOther: false });
		expect(day.sessions.map((s) => s.end)).toEqual([
			'23:46:10',
			'10:00:00',
			undefined,
		]);
	});

	it('筋トレ中のものが無ければエラー', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [{ name: 'A', notes: [], exercises: [] }],
		};
		expect(() =>
			endDay(day, { time: '19:00:00', includeOther: true }),
		).toThrow(DayLogError);
	});
});

describe('その日の筋トレをまとめて再開する（resumeDay）', () => {
	it('終えたものの終了を消す。単発の種目は開始も消す', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'A',
					notes: [],
					start: '18:00:00',
					end: '18:30:00',
					exercises: [],
				},
				{ name: 'B', notes: [], exercises: [] },
				{
					name: null,
					notes: [],
					start: '18:10:00',
					end: '18:40:00',
					exercises: [
						{ name: 'Y', sets: [timed('18:10:00', '18:11:00')] },
					],
				},
			],
		};
		expect(resumeDay(day).map((s) => s.name)).toEqual(['A', null]);
		expect(day.sessions[0]).toMatchObject({ start: '18:00:00' });
		expect(day.sessions[0]).not.toHaveProperty('end');
		expect(day.sessions[2]).not.toHaveProperty('start');
		expect(day.sessions[2]).not.toHaveProperty('end');
		expect(() => resumeDay(day)).toThrow(DayLogError);
	});
});
