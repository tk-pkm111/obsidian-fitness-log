/**
 * 休憩の表示先: 最後にセットを終えた種目のカード（その種目のすぐ下に、休憩の経過と目安に対する進みを出す）。
 * 筋トレ中（パッケージ）かパッケージ外（その他）のときだけ。終えた筋トレ・過去の日・セットの実行中は出さない
 * （筋トレを終了したあとに休憩が数え続けないように）。
 */
import type { CardModel, LastSet, SectionModel } from './day-model';

export interface RestState {
	section: SectionModel;
	/** 最後にセットを終えた種目のカード */
	card: CardModel;
	/** 最後のセットの終了 'HH:mm:ss' */
	lastEnd: string;
	/** 休憩の目安（パッケージの設定。無ければ null） */
	restSec: number | null;
}

export function restState(
	sections: readonly SectionModel[],
	lastSet: LastSet | null,
	isToday: boolean,
): RestState | null {
	if (!isToday || !lastSet) return null;
	if (sections.some((s) => s.cards.some((c) => c.active))) return null;
	for (const section of sections) {
		if (section.status !== 'in-progress' && section.status !== 'manual')
			continue;
		const card = section.cards.find(
			(c) =>
				c.source?.sessionIndex === lastSet.sessionIndex &&
				c.source.exerciseIndex === lastSet.exerciseIndex,
		);
		if (card)
			return {
				section,
				card,
				lastEnd: lastSet.end,
				restSec: card.item?.restSec ?? null,
			};
	}
	return null;
}
