/**
 * 今日ページに並べるもの（セクション＝パッケージ、カード＝種目）を組み立てる。実装計画 §5.2。
 *
 * 表示するセクション = その日の日ノートにあるセッション ∪ ルーチンで予定されたパッケージ
 *   ∪ 進行中セットのパッケージ（まだノートに無い場合）。「その他」は最後。
 * カードの並び = やった順（日ノートの種目の欄の順。同じ種目を後でもう一度やれば 2 枚目）
 *   → 進行中のセットの種目（やった種目のすぐ下に移る）→ まだやっていない種目（パッケージの順 → 追加した種目）
 */
import { createResolver, nameKey } from '../model/resolve';
import type {
	ActiveSet,
	DayLog,
	Exercise,
	ExerciseLog,
	Package,
	PackageItem,
	RecordType,
	Routine,
	SessionLog,
	SetLog,
} from '../model/types';
import { restsBeforeSets, type RestBefore } from '../log/set-rest';
import { routinesForDate } from '../schedule/routine';
import { circularRange, parseTime } from '../time/date';

export interface CardModel {
	key: string;
	/** 種目マスターで解決できなかったノートの種目は null（開始できない） */
	exercise: Exercise | null;
	/** 表示名（マスターの本名。解決できなければノートの表記） */
	name: string;
	/** ノート上の表記（記録済みのとき。セットの修正・削除の位置指定に使う） */
	noteName: string | null;
	/** ノート上の位置（記録済みのとき）。day.sessions[sessionIndex].exercises[exerciseIndex] */
	source: { sessionIndex: number; exerciseIndex: number } | null;
	/** パッケージの目標（パッケージ外・追加した種目は null） */
	item: PackageItem | null;
	/** この欄のセット（やった順） */
	sets: SetLog[];
	/** 同じ種目を前の欄で行ったセット数（セット番号はこの続きから数える） */
	setOffset: number;
	/** 各セットの直前の休憩（sets と同じ並び。前のセットが無い・時刻が無いときは null） */
	rests: Array<RestBefore | null>;
	/** 進行中セットがこのカード */
	active: boolean;
	recordType: RecordType;
}

/**
 * セクションの状態（今日ページの表示を切り替える）
 * - planned: まだ始めていない（ルーチンの予定・追加しただけ）。畳んで「筋トレを開始」
 * - in-progress: 筋トレ中。種目カードを出す
 * - finished: 終了した（または開始せずに記録だけある）。まとめを出して畳む
 * - manual: パッケージ外（その他）。開始・終了は無く、いつも種目カードを出す
 */
export type SectionStatus = 'planned' | 'in-progress' | 'finished' | 'manual';

export interface SectionModel {
	key: string;
	status: SectionStatus;
	/** 筋トレの開始・終了の時刻（'HH:mm:ss'。ノートに無ければ undefined） */
	start?: string;
	end?: string;
	/** パッケージ外（その他）・解決できないセッション名は null */
	pkg: Package | null;
	/** ノート上のセッション名（ノートに無ければ null）。その他も null */
	sessionName: string | null;
	isOther: boolean;
	title: string;
	/** 日ノートにセッションがある */
	inNote: boolean;
	/** ルーチンで予定されていて、まだノートに無い */
	plannedBy: Routine | null;
	note: string;
	cards: CardModel[];
}

export interface DayModelInput {
	date: string;
	day: DayLog | undefined;
	packages: readonly Package[];
	exercises: readonly Exercise[];
	routines: readonly Routine[];
	activeSet: ActiveSet | null;
	/** その日だけの並び（今日の画面のセクションのキー → まだやっていない種目のカードのキー） */
	orders?: Readonly<Record<string, readonly string[]>>;
}

export function buildDayModel(input: DayModelInput): SectionModel[] {
	const exerciseResolver = createResolver(input.exercises);
	const packageResolver = createResolver(input.packages);
	const exerciseById = new Map(input.exercises.map((e) => [e.id, e]));
	const packageById = new Map(input.packages.map((p) => [p.id, p]));

	/** sessionIndex: ノート上のセッションの位置（ノートに無い予定のセクションは -1） */
	const buildCards = (
		items: readonly PackageItem[],
		logged: readonly ExerciseLog[],
		sessionIndex: number,
	): CardModel[] => {
		const cards: CardModel[] = [];
		const counts = new Map<string, number>();
		const keyOf = (exercise: Exercise | null, name: string) =>
			exercise ? exercise.id : `name:${nameKey(name)}`;
		const itemFor = (exercise: Exercise | null) =>
			exercise
				? (items.find((i) => i.exerciseId === exercise.id) ?? null)
				: null;

		// 1. やった順（セットのある欄）
		const rests = restsBeforeSets(logged);
		logged.forEach((log, exerciseIndex) => {
			if (log.sets.length === 0) return;
			const exercise = exerciseResolver.resolve(log.name) ?? null;
			const key = keyOf(exercise, log.name);
			const offset = counts.get(key) ?? 0;
			counts.set(key, offset + log.sets.length);
			cards.push(
				card(
					exercise,
					exercise?.name ?? log.name,
					{ log, source: { sessionIndex, exerciseIndex } },
					itemFor(exercise),
					offset,
					rests[exerciseIndex],
				),
			);
		});

		// 2. まだやっていない種目（パッケージの順 → ノートにある空の欄＝追加した種目）
		const usedEmpty = new Set<number>();
		const emptyBlockFor = (exercise: Exercise) =>
			logged.findIndex(
				(l, i) =>
					l.sets.length === 0 &&
					!usedEmpty.has(i) &&
					exerciseResolver.matches(exercise, l.name),
			);
		for (const item of items) {
			const exercise = exerciseById.get(item.exerciseId);
			if (!exercise || counts.has(exercise.id)) continue; // 削除された種目・もうやった種目
			if (
				cards.some(
					(c) =>
						c.sets.length === 0 && c.exercise?.id === exercise.id,
				)
			)
				continue;
			const emptyIndex = emptyBlockFor(exercise);
			const empty = logged[emptyIndex];
			if (empty) usedEmpty.add(emptyIndex);
			cards.push(
				card(
					exercise,
					exercise.name,
					empty
						? {
								log: empty,
								source: {
									sessionIndex,
									exerciseIndex: emptyIndex,
								},
							}
						: null,
					item,
					0,
				),
			);
		}
		logged.forEach((log, exerciseIndex) => {
			if (log.sets.length > 0 || usedEmpty.has(exerciseIndex)) return;
			const exercise = exerciseResolver.resolve(log.name) ?? null;
			if (counts.has(keyOf(exercise, log.name))) return; // もうやった種目の空の欄は出さない
			cards.push(
				card(
					exercise,
					exercise?.name ?? log.name,
					{ log, source: { sessionIndex, exerciseIndex } },
					null,
					0,
				),
			);
		});
		return uniqueKeys(cards);
	};

	const sections: SectionModel[] = [];
	const usedPackages = new Set<string>();
	for (const [sessionIndex, session] of (
		input.day?.sessions ?? []
	).entries()) {
		if (session.name === null) {
			// 手編集で「その他」が 2 つになっていても、表示は 1 つにまとめる
			const existing = sections.find((s) => s.isOther);
			if (existing) {
				existing.cards = uniqueKeys([
					...existing.cards,
					...buildCards([], session.exercises, sessionIndex),
				]);
				continue;
			}
			sections.push({
				key: 'other',
				status: 'manual',
				pkg: null,
				sessionName: null,
				isOther: true,
				title: '',
				inNote: true,
				plannedBy: null,
				note: session.note,
				cards: buildCards([], session.exercises, sessionIndex),
			});
			continue;
		}
		const resolved = packageResolver.resolve(session.name);
		const pkg =
			resolved && !usedPackages.has(resolved.id) ? resolved : null;
		if (pkg) usedPackages.add(pkg.id);
		sections.push({
			key: pkg ? `pkg:${pkg.id}` : `name:${session.name}`,
			status: sessionStatus(session),
			...(session.start ? { start: session.start } : {}),
			...(session.end ? { end: session.end } : {}),
			pkg,
			sessionName: session.name,
			isOther: false,
			title: pkg?.name ?? session.name,
			inNote: true,
			plannedBy: null,
			note: session.note,
			cards: buildCards(
				pkg?.items ?? [],
				session.exercises,
				sessionIndex,
			),
		});
	}

	for (const routine of routinesForDate(input.routines, input.date)) {
		const pkg = packageById.get(routine.packageId);
		if (!pkg || usedPackages.has(pkg.id)) continue;
		usedPackages.add(pkg.id);
		sections.push(
			plannedSection(pkg, routine, buildCards(pkg.items, [], -1)),
		);
	}

	// その日だけの並び（ドラッグした順）。やった種目はやった順のまま、まだの種目だけを並べ替える
	for (const section of sections) {
		const order = input.orders?.[section.key];
		if (order) section.cards = applyDayOrder(section.cards, order);
	}

	const active = input.activeSet;
	if (active && active.date === input.date) {
		let section = sections.find((s) =>
			active.packageId === null
				? s.isOther
				: s.pkg?.id === active.packageId,
		);
		if (!section) {
			const pkg = active.packageId
				? packageById.get(active.packageId)
				: undefined;
			section = pkg
				? plannedSection(pkg, null, buildCards(pkg.items, [], -1))
				: {
						key: 'other',
						status: 'manual',
						pkg: null,
						sessionName: null,
						isOther: true,
						title: '',
						inNote: false,
						plannedBy: null,
						note: '',
						cards: [],
					};
			sections.push(section);
		}
		// 進行中のセットのカード: 最後にやった種目と同じならそのカード（続きのセット）。
		// 違えば、やった種目のすぐ下に出す（まだやっていない種目なら下から移す。前にやった種目ならもう 1 枚）
		const cards = section.cards;
		const lastIndex = cards.reduce(
			(last, c, i) => (c.sets.length > 0 ? i : last),
			-1,
		);
		const last = cards[lastIndex];
		const exercise = exerciseById.get(active.exerciseId);
		if (last && last.exercise?.id === active.exerciseId) {
			last.active = true;
		} else if (exercise) {
			const done = cards
				.filter((c) => c.exercise?.id === exercise.id)
				.reduce((sum, c) => sum + c.sets.length, 0);
			const pendingIndex = cards.findIndex(
				(c) => c.sets.length === 0 && c.exercise?.id === exercise.id,
			);
			const pending =
				pendingIndex >= 0
					? (cards.splice(pendingIndex, 1)[0] as CardModel)
					: card(
							exercise,
							exercise.name,
							null,
							section.pkg?.items.find(
								(i) => i.exerciseId === exercise.id,
							) ?? null,
							done,
						);
			pending.active = true;
			pending.setOffset = done;
			cards.splice(lastIndex + 1, 0, pending);
			section.cards = uniqueKeys(cards);
		}
		// 進行中のセットがあるセクションは筋トレ中として出す（開始の記録が無い古いノートでも）
		if (section.status !== 'manual') section.status = 'in-progress';
	}

	// パッケージ（ノートの順 → 予定）→ その他
	return [
		...sections.filter((s) => !s.isOther && s.inNote),
		...sections.filter((s) => !s.isOther && !s.inNote),
		...sections.filter((s) => s.isOther),
	];
}

function card(
	exercise: Exercise | null,
	name: string,
	found: {
		log: ExerciseLog;
		source: { sessionIndex: number; exerciseIndex: number };
	} | null,
	item: PackageItem | null,
	setOffset = 0,
	rests: Array<RestBefore | null> = [],
): CardModel {
	return {
		key: exercise ? `ex:${exercise.id}` : `note:${name}`,
		setOffset,
		rests,
		exercise,
		name,
		noteName: found?.log.name ?? null,
		source: found?.source ?? null,
		item,
		sets: found?.log.sets ?? [],
		active: false,
		recordType: exercise?.recordType ?? 'weight-reps',
	};
}

function sessionStatus(session: SessionLog): SectionStatus {
	if (session.start) return session.end ? 'finished' : 'in-progress';
	// 開始の記録が無くてもセットがあれば記録済み（手入力・以前の形式のノート）
	return session.exercises.some((e) => e.sets.length > 0)
		? 'finished'
		: 'planned';
}

function plannedSection(
	pkg: Package,
	routine: Routine | null,
	cards: CardModel[],
): SectionModel {
	return {
		key: `pkg:${pkg.id}`,
		status: 'planned',
		pkg,
		sessionName: null,
		isOther: false,
		title: pkg.name,
		inNote: false,
		plannedBy: routine,
		note: '',
		cards,
	};
}

/** その日の並びで使うカードのキー（同じ種目の 2 枚目に付く '#1' は外す） */
export function cardOrderKey(card: CardModel): string {
	return card.key.replace(/#\d+$/, '');
}

/** まだやっていない種目のカードを order の順に（order に無いものは元の順で後ろに） */
function applyDayOrder(
	cards: CardModel[],
	order: readonly string[],
): CardModel[] {
	const rank = (card: CardModel) => {
		const index = order.indexOf(cardOrderKey(card));
		return index < 0 ? order.length : index;
	};
	const done = cards.filter((c) => c.sets.length > 0);
	const rest = cards
		.filter((c) => c.sets.length === 0)
		.map((card, index) => ({ card, index }))
		.sort((a, b) => rank(a.card) - rank(b.card) || a.index - b.index)
		.map(({ card }) => card);
	return [...done, ...rest];
}

/** 同じ種目が 2 回並んだときもキーが重ならないようにする */
function uniqueKeys(cards: CardModel[]): CardModel[] {
	const seen = new Map<string, number>();
	for (const c of cards) {
		const base = c.key.replace(/#\d+$/, '');
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		c.key = count === 0 ? base : `${base}#${count}`;
	}
	return cards;
}

export interface LastSet {
	sessionName: string | null;
	exerciseName: string;
	/** ノート上の位置（休憩タイマーを出すカードの特定。同じ種目が 2 欄あっても区別できる） */
	sessionIndex: number;
	exerciseIndex: number;
	/** 'HH:mm:ss' */
	end: string;
}

/** その日に最後に終えたセット（休憩タイマーの起点）。日付をまたいだ記録も考える */
export function latestFinishedSet(day: DayLog | undefined): LastSet | null {
	const candidates: Array<LastSet & { sec: number }> = [];
	(day?.sessions ?? []).forEach((session, sessionIndex) =>
		session.exercises.forEach((exercise, exerciseIndex) => {
			for (const set of exercise.sets) {
				const sec = set.end === null ? null : parseTime(set.end);
				if (sec === null || set.end === null) continue;
				candidates.push({
					sessionName: session.name,
					exerciseName: exercise.name,
					sessionIndex,
					exerciseIndex,
					end: set.end,
					sec,
				});
			}
		}),
	);
	const range = circularRange(candidates.map((c) => c.sec));
	if (!range) return null;
	// 同じ時刻なら後に記録された方
	const latest = [...candidates].reverse().find((c) => c.sec === range.last);
	if (!latest) return null;
	const { sec: _sec, ...last } = latest;
	return last;
}
