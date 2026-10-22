import { defaultRecordType } from '../lib/model/lists';
import type { Exercise } from '../lib/model/types';
import { ExerciseEditModal } from './modals/exercise-edit-modal';
import { ExerciseSuggestModal } from './modals/exercise-suggest-modal';
import { NewExerciseModal } from './modals/new-exercise-modal';
import type { PageContext } from './page-context';

/**
 * 種目を選ぶ（本名・別名で検索）。該当が無ければその場で新しい種目（ノート）を作る。
 * exclude の種目は候補から外す（既にパッケージ・セクションにあるもの）。
 * pinned の種目は先頭に補足付きで出す（以前このパッケージから外した種目）。
 */
export function chooseExercise(
	ctx: PageContext,
	onChoose: (exercise: Exercise) => void,
	exclude?: ReadonlySet<string>,
	pinned?: ReadonlyMap<string, string>,
): void {
	new ExerciseSuggestModal(ctx.app, {
		exercises: ctx.services.store.current.exercises,
		exclude,
		pinned,
		onCreate: (name) => createExercise(ctx, name, onChoose),
		onChoose,
	}).open();
}

/**
 * 新しい種目を作る。まず部位だけを聞き、押したら作る（器具・記録のしかたはあとで「種目」から）。
 * 「詳細を設定する」なら、種目のページと同じ編集画面で全部決めてから作る。
 * 作った種目は種目ノートになる（設定は frontmatter、フォームやコツは後からノートの本文に）
 */
function createExercise(
	ctx: PageContext,
	name: string,
	onChoose: (exercise: Exercise) => void,
): void {
	const { library, lists, store } = ctx.services;
	new NewExerciseModal(ctx.app, {
		name,
		categories: lists.lists.categories,
		onCreate: (category) =>
			ctx.run(async () =>
				onChoose(
					await library.create({
						name,
						category,
						recordType: defaultRecordType(lists.lists),
					}),
				),
			),
		onDetails: () =>
			new ExerciseEditModal(ctx.app, {
				initialName: name,
				lists,
				store,
				onSave: async (fields) =>
					onChoose(await library.create(fields)),
			}).open(),
	}).open();
}
