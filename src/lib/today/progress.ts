/**
 * セクション（パッケージ 1 つ分）の進み: 何種目のうち何種目やったか・何セットやったか。
 * 同じ種目が 2 枚（やり直し）あっても 1 種目と数える。
 * その日の筋トレ全体（パッケージ・単発の種目をまとめて 1 日の筋トレ）の状態も、ここで決める。
 */
import type { SectionModel } from './day-model';

export interface SectionProgress {
	doneExercises: number;
	totalExercises: number;
	sets: number;
}

export function sectionProgress(section: SectionModel): SectionProgress {
	const key = (c: SectionModel['cards'][number]) => c.exercise?.id ?? c.name;
	const all = new Set(section.cards.map(key));
	const done = new Set(
		section.cards.filter((c) => c.sets.length > 0).map(key),
	);
	return {
		doneExercises: done.size,
		totalExercises: all.size,
		sets: section.cards.reduce((sum, c) => sum + c.sets.length, 0),
	};
}

/**
 * その日の筋トレ全体の状態（今日の画面のいちばん下の「筋トレを終了」「お疲れ様でした」を決める）
 * - running: 筋トレ中のパッケージがある。今日は、記録があってまだ終えていない単発の種目も筋トレ中
 * - finished: 筋トレ中のものが無く、終えたもの（記録のあるもの）がある
 * - none: どちらでもない（予定だけ・何も無い）
 */
export type DayStatus = 'none' | 'running' | 'finished';

export function dayStatus(
	sections: readonly SectionModel[],
	isToday: boolean,
): DayStatus {
	// 単発の種目は、時刻のあるセットがあるときだけ（終えるときに最初のセットの開始を書くので。day-ops の endDay）
	const timed = (s: SectionModel) =>
		s.cards.some((c) => c.sets.some((set) => set.start || set.end));
	const running = sections.some(
		(s) =>
			s.status === 'in-progress' ||
			(isToday && s.status === 'manual' && timed(s)),
	);
	if (running) return 'running';
	return sections.some((s) => s.status === 'finished') ? 'finished' : 'none';
}
