import { Modal, type App } from 'obsidian';
import { t } from '../../i18n';
import {
	decimalsOf,
	displayDecimals,
	displayUnit,
	fromDisplayBody,
	toDisplayBody,
	unitOf,
} from '../../lib/body/items';
import { lastIndex } from '../../lib/body/stats';
import { formatMonthDay } from '../../lib/time/date';
import { parseNumberInput } from '../../lib/units';
import type { FitnessServices } from '../../services';
import { runAction, textButton } from '../helpers';

export interface BodyGoalOptions {
	services: FitnessServices;
	/** 端末の今日（新しい目標の起点） */
	today: string;
	/** 項目（null なら、目標の無い項目から選ぶ） */
	name: string | null;
}

/**
 * 目標を決める・変える（全身の項目だけ）。今ある目標は値を変える・消す（消すのはこのボタンを押したときだけなので確認しない）。
 * 目標は設定ノートに書く（ほかの端末とそろう）
 */
export class BodyGoalModal extends Modal {
	constructor(
		app: App,
		private readonly options: BodyGoalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		const { store, lists, body } = options.services;
		body.ensureLoaded();
		const settings = store.bodySettings;
		const weightUnit = store.settings.weightUnit;
		const existing = options.name
			? settings.goals.find((goal) => goal.name === options.name)
			: undefined;
		this.setTitle(
			t(existing ? 'body.goal.titleEdit' : 'body.goal.titleNew'),
		);
		contentEl.addClass('fitness-log-body-goal-modal');

		const free = settings.items
			.map((item) => item.name)
			.filter(
				(name) => !settings.goals.some((goal) => goal.name === name),
			);
		const choices = existing
			? [existing.name]
			: options.name && !free.includes(options.name)
				? [options.name, ...free]
				: free;
		const initial =
			options.name && choices.includes(options.name)
				? options.name
				: choices[0];
		if (initial === undefined) {
			contentEl.createDiv({
				cls: 'fitness-log-muted',
				text: t('body.goal.allSet'),
			});
			const buttons = contentEl.createDiv({
				cls: 'fitness-log-modal-buttons',
			});
			textButton(buttons, t('nav.close'), () => this.close(), {
				cta: true,
			});
			return;
		}

		const unitOfName = (name: string) => unitOf(name, settings.items);
		const shown = (name: string, value: number) => {
			const values = body.all
				.map((m) => m.values[name])
				.filter((v): v is number => v !== undefined);
			const unit = unitOfName(name);
			return toDisplayBody(value, unit, weightUnit).toFixed(
				displayDecimals(decimalsOf(name, values), unit, weightUnit),
			);
		};

		const form = contentEl.createDiv({ cls: 'fitness-log-body-goal-form' });
		const itemBox = form.createEl('label', {
			cls: 'fitness-log-body-record-label',
		});
		itemBox.createSpan({
			cls: 'fitness-log-muted',
			text: t('body.goal.item'),
		});
		const select = itemBox.createEl('select', { cls: 'dropdown' });
		for (const name of choices)
			select.createEl('option', { text: name, value: name });
		select.value = initial;
		select.disabled = existing !== undefined;

		const valueBox = form.createEl('label', {
			cls: 'fitness-log-body-record-label',
		});
		valueBox.createSpan({
			cls: 'fitness-log-muted',
			text: t('body.goal.value'),
		});
		const valueRow = valueBox.createDiv({
			cls: 'fitness-log-body-goal-value',
		});
		const input = valueRow.createEl('input', {
			type: 'text',
			cls: 'fitness-log-body-record-input',
			value: existing ? shown(existing.name, existing.target) : '',
			attr: { inputmode: 'decimal', autocomplete: 'off' },
		});
		const unitEl = valueRow.createSpan({ cls: 'fitness-log-muted' });
		const hint = contentEl.createDiv({
			cls: 'fitness-log-muted fitness-log-body-record-hint',
		});
		const update = () => {
			const name = select.value;
			unitEl.setText(displayUnit(unitOfName(name), weightUnit));
			const last = lastIndex(body.all, name);
			const m = last >= 0 ? body.all[last] : undefined;
			const value = m?.values[name];
			input.placeholder = value === undefined ? '' : shown(name, value);
			hint.setText(
				m && value !== undefined
					? t('body.goal.current', {
							value: `${shown(name, value)} ${displayUnit(unitOfName(name), weightUnit)}`.trim(),
							date: formatMonthDay(m.date),
						})
					: t('body.goal.noRecord'),
			);
		};
		select.addEventListener('change', update);
		update();

		const error = contentEl.createDiv({ cls: 'fitness-log-prompt-error' });
		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		if (existing)
			textButton(
				buttons,
				t('body.goal.remove'),
				() => {
					this.close();
					runAction(this.app, () =>
						lists.removeBodyGoal(existing.name),
					);
				},
				{ cls: 'fitness-log-button-left mod-warning' },
			);
		textButton(buttons, t('confirm.cancel'), () => this.close());
		textButton(
			buttons,
			t('body.save'),
			() => {
				const value = parseNumberInput(input.value);
				if (typeof value !== 'number') {
					error.setText(t('body.error.goalNumber'));
					return;
				}
				const name = select.value;
				const target = fromDisplayBody(
					value,
					unitOfName(name),
					weightUnit,
				);
				this.close();
				runAction(this.app, () =>
					lists.setBodyGoal(name, target, options.today),
				);
			},
			{ cta: true },
		);
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && !event.isComposing) {
				event.preventDefault();
				buttons.querySelector<HTMLButtonElement>('.mod-cta')?.click();
			}
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
