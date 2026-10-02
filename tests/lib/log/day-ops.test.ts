import { describe, expect, it } from 'vitest';
import {
	appendSet,
	cloneDay,
	countSets,
	DayLogError,
	deleteSet,
	endPastSession,
	endSession,
	resumeSession,
	startSession,
	removeSession,
	setSessionNote,
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
					note: '',
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
			sessions: [{ name: null, note: '', exercises: [] }],
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
					note: '',
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
				note: '',
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
	it('メモを設定する（無ければセッションを作る）', () => {
		const day: DayLog = { date: '2026-10-01', sessions: [] };
		setSessionNote(day, exact('A'), 'A', '  調子よし ');
		expect(day.sessions).toEqual([
			{ name: 'A', note: '調子よし', exercises: [] },
		]);
	});

	it('セットの無いセッションは外せる。記録があれば外さない', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{ name: 'A', note: '', exercises: [] },
				{
					name: 'B',
					note: '',
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
});

describe('位置の確かめ（レビューで見つかった不具合の再発防止）', () => {
	it('「その他」が 2 つあっても、位置で指したセットを書き換える', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: null,
					note: '',
					exercises: [{ name: 'X', sets: [set(10, 8)] }],
				},
				{
					name: null,
					note: '',
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
					note: '',
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

describe('筋トレ（セッション）の開始・終了', () => {
	const match = (name: string | null) => (other: string | null) =>
		other === name;

	it('開始でセッションを作って開始時刻、終了で終了時刻、再開で終了時刻を消す', () => {
		const day: DayLog = { date: '2026-10-01', sessions: [] };
		startSession(day, match('PUSH A'), 'PUSH A', '18:30:05');
		expect(day.sessions[0]).toEqual({
			name: 'PUSH A',
			note: '',
			exercises: [],
			start: '18:30:05',
		});
		endSession(day, match('PUSH A'), '19:20:00');
		expect(day.sessions[0]?.end).toBe('19:20:00');
		resumeSession(day, match('PUSH A'));
		expect(day.sessions[0]).not.toHaveProperty('end');
		// もう一度「開始」しても最初の開始時刻は変えない
		startSession(day, match('PUSH A'), 'PUSH A', '20:00:00');
		expect(day.sessions[0]?.start).toBe('18:30:05');
	});

	it('開始していないセッションは終了できない', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [{ name: 'A', note: '', exercises: [] }],
		};
		expect(() => endSession(day, match('A'), '19:00:00')).toThrow(
			DayLogError,
		);
	});
});

describe('過去の日の筋トレを終える', () => {
	it('最後のセットの終了を終了時刻にする（セットが無ければ開始）', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'PUSH A',
					note: '',
					start: '22:40:00',
					exercises: [
						{
							name: 'X',
							sets: [
								{
									...set(10, 8),
									start: '22:41:00',
									end: '22:41:30',
								},
								{
									...set(10, 8),
									start: '23:45:00',
									end: '23:46:10',
								},
							],
						},
					],
				},
				{ name: 'B', note: '', start: '10:00:00', exercises: [] },
			],
		};
		expect(endPastSession(day, exact('PUSH A')).end).toBe('23:46:10');
		expect(endPastSession(day, exact('B')).end).toBe('10:00:00');
		expect(() => endPastSession(day, exact('none'))).toThrow(DayLogError);
	});
});
