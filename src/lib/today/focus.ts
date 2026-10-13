/**
 * 今日の画面（筋トレ中）の種目の見せ方。いま取り組んでいる種目を開いてセットをサブタスクとして並べ、
 * 終わった種目は 1 行にたたみ、まだの種目は ▶ だけの行にする。
 * - いまの種目: 実行中のセットの種目 → 最後にセットを終えた種目。利用者がたたまない限り開いたまま
 *   （終わった種目を見るために開いても、いまの種目は閉じない）
 * - 利用者が開いた種目（終わった種目を押したとき）も、たたむまで開いたまま
 * - 実行中のセットの種目はいつも開く
 * - おすすめの ▶（塗りつぶし）: いまの種目が目標のセット数に届いたら（セット中でなければ）、並び順で最初のまだの種目。
 *   まだ何もしていなければ最初の種目
 */
import type { CardModel, LastSet, SectionModel } from './day-model';

export type CardRole = 'current' | 'done' | 'upcoming';

/**
 * 利用者が開いた・たたんだ種目（セクションごと。ビューを開いている間だけ覚える）。
 * キーはカードのキー。いまの種目をたたんだときも collapsed に入る（そのセットを始めたら外す）
 */
export interface FocusState {
	opened: Set<string>;
	collapsed: Set<string>;
}

export function emptyFocus(): FocusState {
	return { opened: new Set(), collapsed: new Set() };
}

export interface CardLayout {
	/** いま取り組んでいる種目（たたんでいても変わらない。おすすめの ▶ と強調に使う） */
	currentKey: string | null;
	/** 開いて見せる種目（いまの種目＋利用者が開いた種目。たたんだものは除く。実行中はいつも開く） */
	openKeys: ReadonlySet<string>;
	/** おすすめの ▶ を付けるまだの種目 */
	suggestedKey: string | null;
}

/** その種目の今日のセット数（同じ種目を 2 欄に分けてやっていても合計） */
export function totalSets(section: SectionModel, exerciseId: string): number {
	return section.cards
		.filter((c) => c.exercise?.id === exerciseId)
		.reduce((sum, c) => sum + c.sets.length, 0);
}

export function cardLayout(
	section: SectionModel,
	lastSet: LastSet | null,
	focus: FocusState | null,
): CardLayout {
	const cards = section.cards;
	const current =
		cards.find((c) => c.active) ??
		(lastSet
			? cards.find(
					(c) =>
						c.source?.sessionIndex === lastSet.sessionIndex &&
						c.source.exerciseIndex === lastSet.exerciseIndex,
				)
			: undefined) ??
		null;
	const collapsed = focus?.collapsed ?? new Set<string>();
	const openKeys = new Set<string>();
	for (const card of cards) {
		if (card.active) openKeys.add(card.key);
		else if (collapsed.has(card.key)) continue;
		else if (card === current) openKeys.add(card.key);
		else if (card.sets.length > 0 && focus?.opened.has(card.key))
			openKeys.add(card.key);
	}
	const firstUpcoming =
		cards.find(
			(c) => c.sets.length === 0 && !c.active && c.exercise !== null,
		) ?? null;
	let suggested: CardModel | null = null;
	if (!current) {
		if (!cards.some((c) => c.sets.length > 0)) suggested = firstUpcoming;
	} else if (!current.active && current.exercise) {
		const target = current.item?.targetSets;
		if (
			target !== undefined &&
			totalSets(section, current.exercise.id) >= target
		)
			suggested = firstUpcoming;
	}
	return {
		currentKey: current?.key ?? null,
		openKeys,
		suggestedKey: suggested?.key ?? null,
	};
}

/** current: 開いて見せる（セットをサブタスクで並べる）。done: 1 行にたたむ。upcoming: ▶ だけ */
export function cardRole(card: CardModel, layout: CardLayout): CardRole {
	if (layout.openKeys.has(card.key)) return 'current';
	return card.sets.length > 0 ? 'done' : 'upcoming';
}
