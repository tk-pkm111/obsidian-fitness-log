/**
 * 今日の画面（筋トレ中）の種目の見せ方。いま取り組んでいる種目だけを開いてセットをサブタスクとして並べ、
 * 終わった種目は 1 行にたたみ、まだの種目は ▶ だけの行にする。
 * - いまの種目: 実行中のセットの種目 → 利用者が開いた種目（終わった種目を押したとき）→ 最後にセットを終えた種目
 * - 次の印: いまの種目が目標のセット数に届いたら（セット中でなければ）、並び順で最初のまだの種目。
 *   まだ何もしていなければ最初の種目
 */
import type { CardModel, LastSet, SectionModel } from './day-model';

export type CardRole = 'current' | 'done' | 'upcoming';

export interface CardLayout {
	currentKey: string | null;
	/** 「次」の印を付けるまだの種目 */
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
	focusKey: string | null,
): CardLayout {
	const cards = section.cards;
	const current =
		cards.find((c) => c.active) ??
		(focusKey
			? cards.find((c) => c.key === focusKey && c.sets.length > 0)
			: undefined) ??
		(lastSet
			? cards.find(
					(c) =>
						c.source?.sessionIndex === lastSet.sessionIndex &&
						c.source.exerciseIndex === lastSet.exerciseIndex,
				)
			: undefined) ??
		null;
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
		suggestedKey: suggested?.key ?? null,
	};
}

export function cardRole(card: CardModel, layout: CardLayout): CardRole {
	if (card.key === layout.currentKey) return 'current';
	return card.sets.length > 0 ? 'done' : 'upcoming';
}
