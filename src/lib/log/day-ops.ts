/**
 * DayLog への変更操作（純粋関数）。日ノートの書き込みは
 * 「読む → 解析 → ここで変更 → 再生成」の順に 1 回の原子的な書き込みで行う（LogRepository）。
 *
 * セッションは「パッケージ名（その他は null）」、種目は「種目名」で特定する。
 * 名前の照合（本名＋別名）は呼び出し側が matcher で渡す。
 */
import type { DayLog, ExerciseLog, SessionLog, SetLog } from '../model/types';
import { sessionSpan } from './summary';

export type SessionMatcher = (sessionName: string | null) => boolean;
export type ExerciseMatcher = (exerciseName: string) => boolean;

/**
 * ノート上の 1 セットの位置。位置（何番目のセッション・種目・セット）で指し、
 * 名前（ノートの表記そのまま）と、分かっていれば修正前の値で「同じセットか」を確かめる。
 * 画面を描いた後にノートが手編集・Sync で変わっていたら、別のセットを書き換えずにエラーにする。
 */
export interface SetAddress {
	/** day.sessions の中の位置（0 始まり） */
	sessionIndex: number;
	/** session.exercises の中の位置（0 始まり） */
	exerciseIndex: number;
	/** 0 始まり */
	setIndex: number;
	sessionName: string | null;
	exerciseName: string;
	/** 画面に出していたときの値。違っていればノートが変わったとみなす */
	expected?: SetLog;
}

function sameSet(a: SetLog, b: SetLog): boolean {
	return (
		a.weight === b.weight &&
		a.reps === b.reps &&
		a.start === b.start &&
		a.end === b.end &&
		a.note === b.note
	);
}

export class DayLogError extends Error {}

export function cloneDay(day: DayLog): DayLog {
	return {
		date: day.date,
		sessions: day.sessions.map((session) => ({
			...session,
			exercises: session.exercises.map((exercise) => ({
				...exercise,
				sets: exercise.sets.map((set) => ({ ...set })),
			})),
		})),
	};
}

export function findSession(
	day: DayLog,
	matches: SessionMatcher,
): SessionLog | undefined {
	return day.sessions.find((session) => matches(session.name));
}

/**
 * セッションを探し、無ければ作る。パッケージのセッションは「その他」より前に入れる
 * （ノートを読んだときにパッケージ → その他 の順に並ぶように）。
 */
export function ensureSession(
	day: DayLog,
	matches: SessionMatcher,
	name: string | null,
): SessionLog {
	const found = findSession(day, matches);
	if (found) return found;
	const session: SessionLog = { name, note: '', exercises: [] };
	const otherIndex = day.sessions.findIndex((s) => s.name === null);
	if (name !== null && otherIndex >= 0)
		day.sessions.splice(otherIndex, 0, session);
	else day.sessions.push(session);
	return session;
}

export function ensureExercise(
	session: SessionLog,
	matches: ExerciseMatcher,
	name: string,
): ExerciseLog {
	const found = session.exercises.find((exercise) => matches(exercise.name));
	if (found) return found;
	const exercise: ExerciseLog = { name, sets: [] };
	session.exercises.push(exercise);
	return exercise;
}

export interface AppendSetTarget {
	matchSession: SessionMatcher;
	sessionName: string | null;
	matchExercise: ExerciseMatcher;
	exerciseName: string;
}

/** 最後にセットを記録した種目の欄の位置（無ければ -1） */
export function lastPerformedIndex(session: SessionLog): number {
	for (let i = session.exercises.length - 1; i >= 0; i--)
		if ((session.exercises[i]?.sets.length ?? 0) > 0) return i;
	return -1;
}

/**
 * セットを足し、そのセットの位置を返す。日ノートの種目の欄は「やった順」に並べる:
 * - 最後に記録した欄が同じ種目なら、そこに続けて足す
 * - 違えば、最後に記録した欄のすぐ後ろに欄を作る（同じ種目を後でもう一度やったら 2 つ目の欄になる）。
 *   まだ記録の無い欄（「種目を追加」したもの）があれば、それをそこへ移して使う
 */
export function appendSet(
	day: DayLog,
	target: AppendSetTarget,
	set: SetLog,
): SetAddress {
	const session = ensureSession(day, target.matchSession, target.sessionName);
	const lastBlock = session.exercises[lastPerformedIndex(session)];
	let exercise: ExerciseLog;
	if (lastBlock && target.matchExercise(lastBlock.name)) {
		exercise = lastBlock;
	} else {
		const emptyIndex = session.exercises.findIndex(
			(e) => e.sets.length === 0 && target.matchExercise(e.name),
		);
		exercise =
			emptyIndex >= 0
				? (session.exercises.splice(emptyIndex, 1)[0] as ExerciseLog)
				: { name: target.exerciseName, sets: [] };
		session.exercises.splice(lastPerformedIndex(session) + 1, 0, exercise);
	}
	exercise.sets.push({ ...set });
	// ノートの並びも画面と同じく「やった種目（やった順）→ まだの種目（セット無しの欄）」に揃える
	session.exercises = [
		...session.exercises.filter((e) => e.sets.length > 0),
		...session.exercises.filter((e) => e.sets.length === 0),
	];
	return {
		sessionIndex: day.sessions.indexOf(session),
		exerciseIndex: session.exercises.indexOf(exercise),
		setIndex: exercise.sets.length - 1,
		sessionName: session.name,
		exerciseName: exercise.name,
	};
}

/** セッションの中で、その種目を記録したセット（欄が分かれていてもやった順につなげる） */
export function setsInSession(
	session: SessionLog | undefined,
	matches: ExerciseMatcher,
): SetLog[] {
	return (session?.exercises ?? [])
		.filter((e) => matches(e.name))
		.flatMap((e) => e.sets);
}

function locate(day: DayLog, address: SetAddress) {
	const session = day.sessions[address.sessionIndex];
	const exercise = session?.exercises[address.exerciseIndex];
	const set = exercise?.sets[address.setIndex];
	if (
		!session ||
		!exercise ||
		!set ||
		session.name !== address.sessionName ||
		exercise.name !== address.exerciseName ||
		(address.expected !== undefined && !sameSet(set, address.expected))
	)
		throw new DayLogError(
			'対象のセットが見つからないか、ノートが変更されています。画面を確かめてからやり直してください',
		);
	return { session, exercise, set };
}

export function getSet(day: DayLog, address: SetAddress): SetLog {
	return locate(day, address).set;
}

export function updateSet(
	day: DayLog,
	address: SetAddress,
	patch: Partial<SetLog>,
): void {
	const { set } = locate(day, address);
	Object.assign(set, patch);
}

/** セットを消す。種目のセットが無くなったら種目の見出しも消す（セッションは残す）。 */
export function deleteSet(day: DayLog, address: SetAddress): void {
	const { session, exercise } = locate(day, address);
	exercise.sets.splice(address.setIndex, 1);
	if (exercise.sets.length === 0)
		session.exercises.splice(session.exercises.indexOf(exercise), 1);
}

export function setSessionNote(
	day: DayLog,
	matches: SessionMatcher,
	name: string | null,
	note: string,
): void {
	ensureSession(day, matches, name).note = note.trim();
}

/** セッションを外す。セットが記録されていれば外さずにエラー（記録を消さない）。 */
export function removeSession(day: DayLog, matches: SessionMatcher): void {
	const index = day.sessions.findIndex((s) => matches(s.name));
	if (index < 0) return;
	const session = day.sessions[index];
	if (session?.exercises.some((e) => e.sets.length > 0))
		throw new DayLogError('セットが記録されているセッションは外せません');
	day.sessions.splice(index, 1);
}

export function countSets(day: DayLog): number {
	let count = 0;
	for (const session of day.sessions)
		for (const exercise of session.exercises) count += exercise.sets.length;
	return count;
}

// ---------------------------------------------------------------------------
// セッション（筋トレ）の開始・終了

/** 「筋トレを開始」: セッションを作り（あれば使い）、開始時刻を入れて終了時刻を消す */
export function startSession(
	day: DayLog,
	matches: SessionMatcher,
	name: string,
	time: string,
): SessionLog {
	const session = ensureSession(day, matches, name);
	session.start ??= time;
	delete session.end;
	delete session.time;
	return session;
}

/** 「筋トレを終了」: 終了時刻を入れる。開始していないセッションはエラー */
export function endSession(
	day: DayLog,
	matches: SessionMatcher,
	time: string,
): SessionLog {
	const session = findSession(day, matches);
	if (!session?.start)
		throw new DayLogError('このパッケージはまだ開始していません');
	session.end = time;
	return session;
}

/**
 * 過去の日の筋トレを終える（「再開」したまま日が変わった等）。今の時刻ではなく、
 * 最後のセットの終了（セットが無ければ開始）を終了時刻にする
 */
export function endPastSession(
	day: DayLog,
	matches: SessionMatcher,
): SessionLog {
	const session = findSession(day, matches);
	if (!session?.start)
		throw new DayLogError('このパッケージはまだ開始していません');
	session.end = sessionSpan(session)?.end ?? session.start;
	return session;
}

/** 終了した筋トレを再開する（終了時刻を消す） */
export function resumeSession(day: DayLog, matches: SessionMatcher): void {
	const session = findSession(day, matches);
	if (!session) throw new DayLogError('セッションが見つかりません');
	delete session.end;
}
