import { Modal, type App } from 'obsidian';
import { t } from '../../i18n';
import { textButton } from '../helpers';

export interface ChoiceItem {
	text: string;
	/** 選ぶと何が起きるか（「2 セット × 6-9 回・元の位置に戻します」） */
	desc?: string;
	/** おすすめの選択肢は目立たせる */
	cta?: boolean;
	onChoose: () => void;
}

export interface ChoiceOptions {
	title: string;
	message: string;
	choices: readonly ChoiceItem[];
	/** どれも選ばずに閉じたとき */
	onDismiss?: () => void;
}

/** いくつかの選択肢から 1 つを選ぶ（大きなボタンに説明を添える）。キャンセルもできる */
export class ChoiceModal extends Modal {
	private chosen = false;

	constructor(
		app: App,
		private readonly options: ChoiceOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle(options.title);
		contentEl.createEl('p', { text: options.message });
		const list = contentEl.createDiv({ cls: 'fitness-log-choices' });
		for (const choice of options.choices) {
			const button = list.createEl('button', {
				cls: 'fitness-log-choice',
				attr: { type: 'button' },
			});
			button.toggleClass('mod-cta', choice.cta === true);
			button.createSpan({
				cls: 'fitness-log-choice-title',
				text: choice.text,
			});
			if (choice.desc)
				button.createSpan({
					cls: 'fitness-log-choice-desc',
					text: choice.desc,
				});
			button.addEventListener('click', () => {
				this.chosen = true;
				this.close();
				choice.onChoose();
			});
		}
		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(buttons, t('confirm.cancel'), () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.chosen) this.options.onDismiss?.();
	}
}
