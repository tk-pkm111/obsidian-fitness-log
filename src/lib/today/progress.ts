/**
 * セクション（パッケージ 1 つ分）の進み: 何種目のうち何種目やったか・何セットやったか。
 * 同じ種目が 2 枚（やり直し）あっても 1 種目と数える。
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
