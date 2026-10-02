/**
 * 今日の画面の下に固定して出す「いま」（ジムで探さずに次の操作ができるように）。
 * - running: セットの実行中 → タイマーと「■ 記録」
 * - resting: 筋トレ中にセットを終えた後 → 休憩の経過（目安に対する進み）と、次の一手
 * - ready: 筋トレを開始したが、まだ何もしていない → 最初の種目
 * 次の一手は、パッケージの目標セット数（画面には出さない）に達していなければ同じ種目の次のセット、
 * 達していれば並び順で次のまだやっていない種目。全部終わっていれば null（「筋トレを終了」を勧める）。
 */
import type { CardModel, LastSet, SectionModel } from './day-model';

export interface NextStep {
	section: SectionModel;
	card: CardModel;
	/** 次のセットの番号（種目ごとの通し） */
	setNumber: number;
	/** 同じ種目の続き（false なら次の種目に移る） */
	sameExercise: boolean;
}

export type NowState =
	| { kind: 'running'; section: SectionModel; card: CardModel }
	| {
			kind: 'resting';
			section: SectionModel;
			/** 最後にセットを終えた種目のカード */
			card: CardModel;
			/** 最後のセットの終了 'HH:mm:ss' */
			lastEnd: string;
			/** 休憩の目安（パッケージの設定。無ければ null） */
			restSec: number | null;
			next: NextStep | null;
	  }
	| { kind: 'ready'; section: SectionModel; next: NextStep | null };

/** 今日でなければ null（過去の日は記録の修正だけで、タイマーを使わない） */
export function nowState(
	sections: readonly SectionModel[],
	lastSet: LastSet | null,
	isToday: boolean,
): NowState | null {
	if (!isToday) return null;
	for (const section of sections) {
		const card = section.cards.find((c) => c.active);
		if (card) return { kind: 'running', section, card };
	}
	if (lastSet) {
		for (const section of sections) {
			if (section.status !== 'in-progress' && section.status !== 'manual')
				continue;
			const card = section.cards.find(
				(c) =>
					c.source?.sessionIndex === lastSet.sessionIndex &&
					c.source.exerciseIndex === lastSet.exerciseIndex,
			);
			if (!card) continue;
			return {
				kind: 'resting',
				section,
				card,
				lastEnd: lastSet.end,
				restSec: card.item?.restSec ?? null,
				next: nextStep(section, card),
			};
		}
	}
	const running = sections.find((s) => s.status === 'in-progress');
	return running
		? { kind: 'ready', section: running, next: nextStep(running, null) }
		: null;
}

function doneSets(section: SectionModel, exerciseId: string): number {
	return section.cards
		.filter((c) => c.exercise?.id === exerciseId)
		.reduce((sum, c) => sum + c.sets.length, 0);
}

function nextStep(
	section: SectionModel,
	last: CardModel | null,
): NextStep | null {
	const exercise = last?.exercise;
	if (last && exercise) {
		const done = doneSets(section, exercise.id);
		const target = last.item?.targetSets;
		// 目標が無い（パッケージ外・その他）か、まだ届いていなければ同じ種目の続き
		if (target === undefined || done < target)
			return {
				section,
				card: last,
				setNumber: done + 1,
				sameExercise: true,
			};
	}
	const card = section.cards.find(
		(c) => c.sets.length === 0 && !c.active && c.exercise !== null,
	);
	if (!card?.exercise) return null;
	return {
		section,
		card,
		setNumber: doneSets(section, card.exercise.id) + 1,
		sameExercise: false,
	};
}
