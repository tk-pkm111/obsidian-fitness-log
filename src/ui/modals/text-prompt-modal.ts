import { Modal, type App } from 'obsidian';
import { t } from '../../i18n';
import { textButton } from '../helpers';

export interface TextPromptOptions {
	title: string;
	initial: string;
	placeholder?: string;
	submitText: string;
	/** 1 行入力（名前など）。false なら複数行（メモ） */
	singleLine?: boolean;
	/** 文字列を返すと拒否してその文言を表示する */
	validate?: (value: string) => string | undefined;
	onSubmit: (value: string) => void;
}

export class TextPromptModal extends Modal {
	constructor(
		app: App,
		private readonly options: TextPromptOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle(options.title);
		contentEl.addClass('fitness-log-text-prompt');
		const input = options.singleLine
			? contentEl.createEl('input', {
					type: 'text',
					cls: 'fitness-log-text-input',
					value: options.initial,
					attr: { placeholder: options.placeholder ?? '' },
				})
			: contentEl.createEl('textarea', {
					cls: 'fitness-log-textarea',
					text: options.initial,
					attr: { placeholder: options.placeholder ?? '', rows: '4' },
				});
		const error = contentEl.createDiv({ cls: 'fitness-log-prompt-error' });
		const submit = () => {
			const message = options.validate?.(input.value);
			if (message) {
				error.setText(message);
				return;
			}
			this.close();
			options.onSubmit(input.value);
		};
		const inputEl: HTMLElement = input;
		inputEl.addEventListener('keydown', (event) => {
			const enterSubmits =
				options.singleLine || event.metaKey || event.ctrlKey;
			if (event.key === 'Enter' && enterSubmits && !event.isComposing) {
				event.preventDefault();
				submit();
			}
		});
		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(buttons, t('prompt.cancel'), () => this.close());
		textButton(buttons, options.submitText, submit, { cta: true });
		window.setTimeout(() => input.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
