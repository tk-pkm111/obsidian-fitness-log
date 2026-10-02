import { Modal, Platform, type App } from 'obsidian';
import { t } from '../../i18n';
import { nearestIndex, repsChoices, weightChoices } from '../../lib/picker';
import { parseNumberInput, stepValue } from '../../lib/units';
import { iconButton, textButton } from '../helpers';
import type { Wheel } from '../wheel';
import { renderWheelRow } from './wheel-picker-modal';

export interface NumberPromptOptions {
	/** モーダルの見出し（種目名など） */
	title: string;
	/** 問いかけ（「今日は何 kg？」） */
	question: string;
	/** 入力欄の右に出す単位 */
	unit: string;
	initial: number | null;
	/** ワンタップで確定できる候補（回数なら 6 7 8 9 10）。押すとそのまま確定する */
	quick?: number[];
	/** ＋／− の刻み */
	step: number;
	/** 小数を入力するか（重量）。false なら数字キーボード（回数） */
	decimal: boolean;
	/** 前回の記録などの補足 */
	hint?: string;
	submitText: string;
	/** 空欄で確定してよいか（null を返す） */
	allowEmpty: boolean;
	/** スマホのホイールの上限（重量。lb なら大きく）。回数は 50 */
	wheelMax?: number;
	onSubmit: (value: number | null) => void;
}

/**
 * 重量・回数の入力。ジムで片手で押せるよう、ワンタップの候補（6 7 8 9 10 など）と、
 * 大きな入力欄・＋／− ボタンにしている。Enter で確定。
 * スマホでは入力欄の代わりにスクロールで選ぶホイールを出す（「キーボードで入力」で入力欄に切り替え）。
 */
export class NumberPromptModal extends Modal {
	private submitted = false;

	constructor(
		app: App,
		private readonly options: NumberPromptOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle(options.title);
		contentEl.addClass('fitness-log-number-prompt');
		contentEl.createDiv({
			cls: 'fitness-log-prompt-question',
			text: options.question,
		});
		if (options.hint)
			contentEl.createDiv({
				cls: 'fitness-log-prompt-hint',
				text: options.hint,
			});

		const quick = options.quick ?? [];
		const chips =
			quick.length > 0
				? contentEl.createDiv({ cls: 'fitness-log-quick-values' })
				: null;
		const row = contentEl.createDiv({ cls: 'fitness-log-number-row' });
		const input = createEl('input', {
			cls: 'fitness-log-number-input',
			type: 'text',
			value: options.initial === null ? '' : String(options.initial),
			attr: {
				inputmode: options.decimal ? 'decimal' : 'numeric',
				enterkeyhint: 'done',
				'aria-label': options.question,
				autocomplete: 'off',
			},
		});
		const error = contentEl.createDiv({ cls: 'fitness-log-prompt-error' });

		const nudge = (direction: 1 | -1) => {
			const current = parseNumberInput(input.value);
			const base =
				typeof current === 'number' ? current : (options.initial ?? 0);
			input.value = String(stepValue(base, options.step, direction));
			error.setText('');
		};
		iconButton(
			row,
			'minus',
			t('prompt.decrease'),
			() => nudge(-1),
			'fitness-log-step-button',
		);
		row.appendChild(input);
		row.createSpan({ cls: 'fitness-log-number-unit', text: options.unit });
		iconButton(
			row,
			'plus',
			t('prompt.increase'),
			() => nudge(1),
			'fitness-log-step-button',
		);

		// スマホ: 入力欄の代わりにホイール（刻みは重量の刻み、回数は 1）
		let wheel: Wheel | null = null;
		const choices: (number | null)[] = options.decimal
			? weightChoices(
					options.initial,
					options.step,
					options.wheelMax ?? 250,
					options.allowEmpty,
				)
			: repsChoices(options.initial);
		if (Platform.isMobile) {
			const wheels: Wheel[] = [];
			const box = renderWheelRow(
				contentEl,
				{
					columns: [
						{
							items: choices.map((v) =>
								v === null ? t('wheel.none') : String(v),
							),
							index: nearestIndex(choices, options.initial),
							label: options.question,
							width: options.decimal ? 5 : 4,
						},
					],
					unit: options.unit,
				},
				wheels,
			);
			contentEl.insertBefore(box, row);
			wheel = wheels[0] ?? null;
			row.hide();
			const toggle = createEl('button', {
				cls: 'fitness-log-keyboard-toggle',
				text: t('wheel.keyboard'),
				attr: { type: 'button' },
			});
			contentEl.insertAfter(toggle, box);
			toggle.addEventListener('click', () => {
				const value = wheel ? choices[wheel.index()] : null;
				input.value =
					value === null || value === undefined ? '' : String(value);
				wheel = null;
				box.hide();
				toggle.hide();
				row.show();
				input.focus();
				input.select();
			});
		}

		const finish = (value: number | null) => {
			if (this.submitted) return;
			this.submitted = true;
			this.close();
			options.onSubmit(value);
		};
		if (chips)
			for (const value of quick) {
				const chip = chips.createEl('button', {
					cls: 'fitness-log-quick-value',
					text: String(value),
					attr: {
						type: 'button',
						'aria-label': `${value} ${options.unit}`,
					},
				});
				chip.toggleClass('is-current', value === options.initial);
				chip.addEventListener('click', () => finish(value));
			}
		if (chips)
			contentEl.insertAfter(
				createDiv({
					cls: 'fitness-log-quick-hint',
					text: t(
						Platform.isMobile
							? 'prompt.quickHintWheel'
							: 'prompt.quickHint',
						{ action: options.submitText },
					),
				}),
				chips,
			);

		const submit = () => {
			if (wheel) {
				finish(choices[wheel.index()] ?? null);
				return;
			}
			const value = parseNumberInput(input.value);
			if (
				value === undefined ||
				(value === null && !options.allowEmpty) ||
				(value !== null && value < 0)
			) {
				error.setText(t('prompt.invalidNumber'));
				input.focus();
				return;
			}
			finish(value);
		};
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && !event.isComposing) {
				event.preventDefault();
				submit();
			}
		});

		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(buttons, t('prompt.cancel'), () => this.close());
		textButton(buttons, options.submitText, submit, { cta: true });

		// スマホはホイールで選ぶので、キーボードを出さない（入力欄にフォーカスしない）
		if (!Platform.isMobile)
			window.setTimeout(() => {
				input.focus();
				input.select();
			}, 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
