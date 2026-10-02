import { Modal, type App } from 'obsidian';
import { t } from '../../i18n';
import { textButton } from '../helpers';

export interface ConfirmOptions {
	title: string;
	message: string;
	confirmText?: string;
	/** 削除など取り消せない操作は警告色にする */
	danger?: boolean;
	onConfirm: () => void;
}

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly options: ConfirmOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle(options.title);
		contentEl.createEl('p', { text: options.message });
		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(buttons, t('confirm.cancel'), () => this.close());
		const ok = textButton(
			buttons,
			options.confirmText ?? t('confirm.ok'),
			() => {
				this.close();
				options.onConfirm();
			},
			{ cta: !options.danger },
		);
		if (options.danger) ok.addClass('mod-warning');
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
