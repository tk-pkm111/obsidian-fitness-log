import { Modal, type App } from 'obsidian';
import { t } from '../../i18n';
import { textButton } from '../helpers';
import { renderWheel, type Wheel } from '../wheel';

export interface WheelColumn {
	items: readonly string[];
	index: number;
	/** 読み上げ用の名前（「時」「分」） */
	label: string;
	/** 列の幅（em） */
	width?: number;
}

export interface WheelPickerOptions {
	title: string;
	/** 補足（種目名・セット番号など） */
	hint?: string;
	columns: readonly WheelColumn[];
	/** 列のあいだの文字（':'・'–'）。列の数 − 1 個 */
	separators?: readonly string[];
	/** 最後の列の右に出す単位（'kg'・'回'） */
	unit?: string;
	submitText: string;
	onSubmit: (indices: number[]) => void;
	/** 「キーボードで入力」: 今の値と確定（false を返すと入力し直し。知らせるのは呼び出し側） */
	keyboard?: {
		value: string;
		inputMode: 'decimal' | 'numeric' | 'text';
		placeholder?: string;
		onSubmit: (text: string) => boolean;
	};
	/** 値を「なし」にするボタン（休憩の目安など） */
	clear?: { text: string; onClear: () => void };
}

/**
 * スクロールで数字を選ぶ（スマホ向け）。列ごとにホイールを並べ、決定で確定する。
 * 直接打ちたいときは「キーボードで入力」に切り替えられる。
 */
export class WheelPickerModal extends Modal {
	constructor(
		app: App,
		private readonly options: WheelPickerOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle(options.title);
		contentEl.addClass('fitness-log-wheel-picker');
		if (options.hint)
			contentEl.createDiv({
				cls: 'fitness-log-prompt-hint',
				text: options.hint,
			});
		const wheels: Wheel[] = [];
		const box = renderWheelRow(contentEl, options, wheels);

		const keyboard = options.keyboard;
		let typing: HTMLInputElement | null = null;
		const submit = () => {
			if (typing && keyboard) {
				if (!keyboard.onSubmit(typing.value.trim())) {
					typing.focus();
					return;
				}
				this.close();
				return;
			}
			this.close();
			options.onSubmit(wheels.map((w) => w.index()));
		};
		if (keyboard) {
			const toggle = contentEl.createEl('button', {
				cls: 'fitness-log-keyboard-toggle',
				text: t('wheel.keyboard'),
				attr: { type: 'button' },
			});
			toggle.addEventListener('click', () => {
				box.hide();
				toggle.hide();
				typing = contentEl.createEl('input', {
					cls: 'fitness-log-number-input fitness-log-wheel-typing',
					type: 'text',
					value: keyboard.value,
					attr: {
						inputmode: keyboard.inputMode,
						enterkeyhint: 'done',
						autocomplete: 'off',
						placeholder: keyboard.placeholder ?? '',
					},
				});
				contentEl.insertAfter(typing, box);
				typing.addEventListener('keydown', (event) => {
					if (event.key === 'Enter' && !event.isComposing) {
						event.preventDefault();
						submit();
					}
				});
				typing.focus();
				typing.select();
			});
		}

		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(buttons, t('prompt.cancel'), () => this.close());
		if (options.clear) {
			const { clear } = options;
			textButton(buttons, clear.text, () => {
				this.close();
				clear.onClear();
			});
		}
		textButton(buttons, options.submitText, submit, { cta: true });
		wheels[0]?.el.focus({ preventScroll: true });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** ホイールの列（区切りの文字・単位つき）を並べる。作ったホイールは wheels に入れる */
export function renderWheelRow(
	parent: HTMLElement,
	options: Pick<WheelPickerOptions, 'columns' | 'separators' | 'unit'>,
	wheels: Wheel[],
): HTMLElement {
	const box = parent.createDiv({ cls: 'fitness-log-wheels' });
	options.columns.forEach((column, i) => {
		if (i > 0)
			box.createSpan({
				cls: 'fitness-log-wheel-separator',
				text: options.separators?.[i - 1] ?? '',
			});
		wheels.push(
			renderWheel(box, {
				items: column.items,
				index: column.index,
				label: column.label,
				width: column.width,
			}),
		);
	});
	if (options.unit)
		box.createSpan({ cls: 'fitness-log-wheel-unit', text: options.unit });
	return box;
}
