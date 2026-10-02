import type { Exercise } from '../lib/model/types';
import { ExerciseSuggestModal } from './modals/exercise-suggest-modal';
import type { PageContext } from './page-context';

/**
 * 種目を選ぶ（本名・別名で検索）。該当が無ければその場で新しい種目（ノート）を作る。
 * exclude の種目は候補から外す（既にパッケージ・セクションにあるもの）。
 */
export function chooseExercise(
	ctx: PageContext,
	onChoose: (exercise: Exercise) => void,
	exclude?: ReadonlySet<string>,
): void {
	new ExerciseSuggestModal(ctx.app, {
		exercises: ctx.services.store.current.exercises,
		exclude,
		// 種目ノートを作る（設定は frontmatter に。フォームやコツは後からノートに書ける）
		onCreate: (name) =>
			ctx.run(async () =>
				onChoose(await ctx.services.library.create({ name })),
			),
		onChoose,
	}).open();
}
