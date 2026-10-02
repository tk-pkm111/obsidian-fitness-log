import type { DataStore } from '../data/data-store';
import type { LogIndex } from '../data/log-index';
import type { LogRepository } from '../data/log-repository';
import {
	appendSet,
	deleteSet,
	endPastSession,
	endSession,
	ensureExercise,
	ensureSession,
	removeSession,
	resumeSession,
	setSessionNote,
	setsInSession,
	startSession,
	updateSet,
	type AppendSetTarget,
	type ExerciseMatcher,
	type SessionMatcher,
	type SetAddress,
} from '../lib/log/day-ops';
import { createResolver } from '../lib/model/resolve';
import type {
	ActiveSet,
	DayLog,
	Exercise,
	Package,
	SetLog,
} from '../lib/model/types';
import { setDayOrder } from '../lib/today/groups';
import { formatTime, todayString } from '../lib/time/date';

/** 利用者に見せるエラー（Notice にそのまま出す） */
export class SessionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SessionError';
	}
}

/** 今日ページのセクションの指し方 */
export interface SessionRef {
	/** パッケージのセクションならその id */
	packageId: string | null;
	/** ノート上のセッション名（パッケージで解決できないセッション用） */
	sessionName: string | null;
}

export const OTHER_SESSION: SessionRef = { packageId: null, sessionName: null };

/**
 * セットの開始・終了・修正などの手順。画面（UI）とデータ層の間に立つ。
 * 日ノートへの書き込みは LogRepository、索引への即時反映は LogIndex、
 * 進行中セットは data.json（DataStore）。
 */
export class SessionController {
	/** 終了の処理中（連打で同じセットを 2 回書かないため、処理中は同じ Promise を返す） */
	private finishing: Promise<DayLog> | null = null;
	private starting = false;

	constructor(
		private readonly store: DataStore,
		private readonly repository: LogRepository,
		private readonly index: LogIndex,
		private readonly now: () => Date = () => new Date(),
	) {}

	get activeSet(): ActiveSet | null {
		return this.store.current.activeSet;
	}

	// -------------------------------------------------------------------------
	// 名前の照合

	private packageById(id: string | null): Package | undefined {
		return id === null
			? undefined
			: this.store.current.packages.find((p) => p.id === id);
	}

	exerciseById(id: string): Exercise | undefined {
		return this.store.current.exercises.find((e) => e.id === id);
	}

	/** セッションの照合（パッケージは本名・別名、それ以外はノートの表記そのまま） */
	sessionMatcher(ref: SessionRef): {
		match: SessionMatcher;
		name: string | null;
	} {
		const pkg = this.packageById(ref.packageId);
		if (pkg) {
			const resolver = createResolver([pkg]);
			return {
				match: (name) => name !== null && resolver.matches(pkg, name),
				name: pkg.name,
			};
		}
		if (ref.sessionName !== null) {
			const sessionName = ref.sessionName;
			return { match: (name) => name === sessionName, name: sessionName };
		}
		return { match: (name) => name === null, name: null };
	}

	exerciseMatcher(exercise: Exercise): ExerciseMatcher {
		const resolver = createResolver([exercise]);
		return (name) => resolver.matches(exercise, name);
	}

	private target(ref: SessionRef, exercise: Exercise): AppendSetTarget {
		const session = this.sessionMatcher(ref);
		return {
			matchSession: session.match,
			sessionName: session.name,
			matchExercise: this.exerciseMatcher(exercise),
			exerciseName: exercise.name,
		};
	}

	private requireExercise(id: string): Exercise {
		const exercise = this.exerciseById(id);
		if (!exercise)
			throw new SessionError(
				'種目が見つかりません（削除された可能性があります）',
			);
		return exercise;
	}

	/** その日のそのセクションで、その種目を終えたセット（欄が分かれていてもやった順につなげる。索引から） */
	doneSets(date: string, ref: SessionRef, exerciseId: string): SetLog[] {
		const exercise = this.exerciseById(exerciseId);
		const day = this.index.day(date);
		if (!exercise || !day) return [];
		const { match } = this.sessionMatcher(ref);
		const session = day.sessions.find((s) => match(s.name));
		return setsInSession(session, this.exerciseMatcher(exercise));
	}

	private async write(
		date: string,
		mutate: (day: DayLog) => void,
	): Promise<DayLog> {
		const day = await this.repository.updateDay(date, mutate);
		this.index.setDay(day);
		return day;
	}

	// -------------------------------------------------------------------------
	// 進行中セット

	async startSet(params: {
		date: string;
		packageId: string | null;
		exerciseId: string;
		weight: number | null;
	}): Promise<ActiveSet> {
		if (this.activeSet || this.starting)
			throw new SessionError(
				'進行中のセットがあります。先に終了してください',
			);
		this.starting = true;
		try {
			return await this.doStartSet(params);
		} finally {
			this.starting = false;
		}
	}

	private async doStartSet(params: {
		date: string;
		packageId: string | null;
		exerciseId: string;
		weight: number | null;
	}): Promise<ActiveSet> {
		this.requireExercise(params.exerciseId);
		const ref: SessionRef = {
			packageId: params.packageId,
			sessionName: null,
		};
		const active: ActiveSet = {
			date: params.date,
			packageId: params.packageId,
			exerciseId: params.exerciseId,
			setIndex:
				this.doneSets(params.date, ref, params.exerciseId).length + 1,
			startedAt: this.now().toISOString(),
		};
		if (params.weight !== null) active.weight = params.weight;
		await this.store.update((data) => {
			data.activeSet = active;
		});
		return active;
	}

	async updateActiveWeight(weight: number | null): Promise<void> {
		await this.store.update((data) => {
			if (!data.activeSet) return;
			if (weight === null) delete data.activeSet.weight;
			else data.activeSet.weight = weight;
		});
	}

	async cancelSet(): Promise<void> {
		await this.store.update((data) => {
			data.activeSet = null;
		});
	}

	/**
	 * 進行中セットを終えて日ノートに書く。書き込みに失敗したら進行中のまま残す（記録を失わない）。
	 */
	finishSet(reps: number | null, note = ''): Promise<DayLog> {
		this.finishing ??= this.doFinishSet(reps, note).finally(() => {
			this.finishing = null;
		});
		return this.finishing;
	}

	private async doFinishSet(
		reps: number | null,
		note: string,
	): Promise<DayLog> {
		const active = this.activeSet;
		if (!active) throw new SessionError('進行中のセットがありません');
		const exercise = this.requireExercise(active.exerciseId);
		const ref: SessionRef = this.packageById(active.packageId)
			? { packageId: active.packageId, sessionName: null }
			: OTHER_SESSION;
		const set: SetLog = {
			weight: active.weight ?? null,
			reps,
			start: formatTime(new Date(active.startedAt)),
			end: formatTime(this.now()),
			note: note.trim(),
		};
		const day = await this.write(active.date, (d) => {
			appendSet(d, this.target(ref, exercise), set);
		});
		await this.store.update((data) => {
			data.activeSet = null;
		});
		return day;
	}

	// -------------------------------------------------------------------------
	// 記録の追加・修正

	/** 手入力でセットを足す（記録し忘れ・過去日） */
	async addSet(
		date: string,
		ref: SessionRef,
		exerciseId: string,
		set: SetLog,
	): Promise<DayLog> {
		const exercise = this.requireExercise(exerciseId);
		return this.write(date, (d) => {
			appendSet(d, this.target(ref, exercise), set);
		});
	}

	async editSet(
		date: string,
		address: SetAddress,
		patch: Partial<SetLog>,
	): Promise<DayLog> {
		return this.write(date, (d) => updateSet(d, address, patch));
	}

	async deleteSet(date: string, address: SetAddress): Promise<DayLog> {
		return this.write(date, (d) => deleteSet(d, address));
	}

	/** パッケージをその日に追加する（日ノートにセッションの見出しを作る） */
	async addPackageToDay(date: string, packageId: string): Promise<DayLog> {
		const { match, name } = this.sessionMatcher({
			packageId,
			sessionName: null,
		});
		if (name === null) throw new SessionError('パッケージが見つかりません');
		return this.write(date, (d) => {
			ensureSession(d, match, name);
		});
	}

	/** セクションに種目を追加する（パッケージの定義は変えず、その日だけ） */
	async addExerciseToDay(
		date: string,
		ref: SessionRef,
		exerciseId: string,
	): Promise<DayLog> {
		const exercise = this.requireExercise(exerciseId);
		const target = this.target(ref, exercise);
		return this.write(date, (d) => {
			const session = ensureSession(
				d,
				target.matchSession,
				target.sessionName,
			);
			ensureExercise(session, target.matchExercise, target.exerciseName);
		});
	}

	async setSessionNote(
		date: string,
		ref: SessionRef,
		note: string,
	): Promise<DayLog> {
		const { match, name } = this.sessionMatcher(ref);
		return this.write(date, (d) => setSessionNote(d, match, name, note));
	}

	/** セットの無いセッションをその日から外す */
	async removeSessionFromDay(date: string, ref: SessionRef): Promise<DayLog> {
		const { match } = this.sessionMatcher(ref);
		return this.write(date, (d) => removeSession(d, match));
	}

	// -------------------------------------------------------------------------
	// 筋トレ（パッケージのセッション）の開始・終了

	/**
	 * 「筋トレを開始」: 日ノートにセッションを作り、開始時刻を書く。
	 * 筋トレ中の別のパッケージがあれば、先に終了してもらう（同時に 1 つ）。
	 */
	async startSession(date: string, packageId: string): Promise<DayLog> {
		const { match, name } = this.sessionMatcher({
			packageId,
			sessionName: null,
		});
		if (name === null) throw new SessionError('パッケージが見つかりません');
		const running = this.index
			.day(date)
			?.sessions.find(
				(s) => s.name !== null && s.start && !s.end && !match(s.name),
			);
		if (running?.name)
			throw new SessionError(
				`「${running.name}」が筋トレ中です。先に終了してください`,
			);
		return this.write(date, (d) => {
			startSession(d, match, name, formatTime(this.now()));
		});
	}

	/** 「筋トレを終了」: 終了時刻を書く。そのパッケージでセットが進行中なら先に終えてもらう */
	async endSession(date: string, ref: SessionRef): Promise<DayLog> {
		const active = this.activeSet;
		if (
			active &&
			active.date === date &&
			active.packageId === ref.packageId
		)
			throw new SessionError(
				'進行中のセットを終了してから、筋トレを終了してください',
			);
		const { match } = this.sessionMatcher(ref);
		// 過去の日（再開したまま日が変わった等）は、今の時刻ではなく最後のセットの終了で終える
		const isToday = date === todayString(this.now());
		return this.write(date, (d) => {
			if (isToday) endSession(d, match, formatTime(this.now()));
			else endPastSession(d, match);
		});
	}

	/** 終了した筋トレを再開する（今日の筋トレだけ。過去の日は続きのセットを計れないので） */
	async resumeSession(date: string, ref: SessionRef): Promise<DayLog> {
		if (date !== todayString(this.now()))
			throw new SessionError('再開できるのは今日の筋トレだけです');
		const { match } = this.sessionMatcher(ref);
		return this.write(date, (d) => resumeSession(d, match));
	}

	/** 今日の画面でドラッグした種目の並び（その日だけ。パッケージの並びは変えない） */
	async reorderDay(
		date: string,
		sectionKey: string,
		keys: readonly string[],
	): Promise<void> {
		await this.store.update((data) =>
			setDayOrder(data, date, sectionKey, keys, todayString(this.now())),
		);
	}

	// -------------------------------------------------------------------------
	// ルーチン

	async skipRoutine(routineId: string, date: string): Promise<void> {
		await this.store.update((data) => {
			const routine = data.routines.find((r) => r.id === routineId);
			if (routine && !routine.skipDates.includes(date))
				routine.skipDates.push(date);
		});
	}

	async unskipRoutine(routineId: string, date: string): Promise<void> {
		await this.store.update((data) => {
			const routine = data.routines.find((r) => r.id === routineId);
			if (routine)
				routine.skipDates = routine.skipDates.filter((d) => d !== date);
		});
	}
}
