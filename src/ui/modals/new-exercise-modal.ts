import { Modal, setIcon, type App } from 'obsidian';
import { t, type MessageKey } from '../../i18n';
import type { ExerciseCategory } from '../../lib/model/types';
import { textButton } from '../helpers';
import { CATEGORIES } from './exercise-edit-modal';

/** 部位の補足（プッシュ・プルだけでは分かりにくいので） */
const CATEGORY_HINTS: Partial<Record<ExerciseCategory, MessageKey>> = {
	push: 'newExercise.hint.push',
	pull: 'newExercise.hint.pull',
};

export interface NewExerciseOptions {
	name: string;
	/** 部位を選んだとき（その場で作る。器具・記録のしかたなどはあとで「種目」から） */
	onCreate: (category: ExerciseCategory) => void;
	/** 「詳細を設定する」: 種目の編集画面（「種目」のページと同じ）を開く */
	onDetails: () => void;
}

/**
 * 筋トレ中・パッケージの編集中に、新しい種目を手早く作る。決めることは部位だけ（押したら作って閉じる）。
 * 細かい設定をしたい人は「詳細を設定する」で、種目のページと同じ編集画面を開く。
 */
export class NewExerciseModal extends Modal {
	constructor(
		app: App,
		private readonly options: NewExerciseOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle(options.name);
		contentEl.addClass('fitness-log-new-exercise');
		contentEl.createEl('p', { text: t('newExercise.question') });
		const grid = contentEl.createDiv({ cls: 'fitness-log-category-grid' });
		for (const category of CATEGORIES) {
			const button = grid.createEl('button', {
				cls: 'fitness-log-category-choice',
				attr: { type: 'button' },
			});
			button.createSpan({
				cls: 'fitness-log-category-name',
				text: t(`category.${category}` as MessageKey),
			});
			const hint = CATEGORY_HINTS[category];
			if (hint)
				button.createSpan({
					cls: 'fitness-log-category-hint',
					text: t(hint),
				});
			button.addEventListener('click', () => {
				this.close();
				options.onCreate(category);
			});
		}
		const details = contentEl.createEl('button', {
			cls: 'fitness-log-setup-toggle fitness-log-new-exercise-details',
			attr: { type: 'button' },
		});
		details.createSpan({ text: t('newExercise.details') });
		setIcon(details.createSpan(), 'chevron-right');
		details.addEventListener('click', () => {
			this.close();
			options.onDetails();
		});
		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(buttons, t('confirm.cancel'), () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
