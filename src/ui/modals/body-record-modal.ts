import { Modal, Notice, type App } from 'obsidian';
import { t } from '../../i18n';
import {
	BODY_PARTS,
	DEFAULT_PART_MEASURES,
	decimalsOf,
	displayDecimals,
	displayUnit,
	fromDisplayBody,
	partKey,
	partMeasureOrder,
	splitPartKey,
	toDisplayBody,
	unitOf,
} from '../../lib/body/items';
import { normalizeBodyTime } from '../../lib/body/note';
import { lastIndex, partMeasuresIn } from '../../lib/body/stats';
import { isDateString } from '../../lib/time/date';
import { parseNumberInput } from '../../lib/units';
import type { FitnessServices } from '../../services';
import { textButton } from '../helpers';

export interface BodyRecordOptions {
	services: FitnessServices;
	/** 端末の今日（'YYYY-MM-DD'） */
	today: string;
	/** 保存したとき（その測定を見る） */
	onSaved?: (date: string) => void;
}

interface Field {
	name: string;
	input: HTMLInputElement;
}

function nowHm(): string {
	const now = new Date();
	return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * 測定を記録する（手で入れる人向け）。日付・時刻と、丸に出す項目の欄（薄い字で前回の値）。
 * 部位別はたたんでおく。空欄の項目は記録しない。同じ日のノートがあれば入れた項目だけを書き換える
 */
export class BodyRecordModal extends Modal {
	private fields: Field[] = [];

	constructor(
		app: App,
		private readonly options: BodyRecordOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		const { body, store } = options.services;
		body.ensureLoaded();
		this.setTitle(t('body.record'));
		contentEl.addClass('fitness-log-body-record-modal');

		const when = contentEl.createDiv({
			cls: 'fitness-log-body-record-when',
		});
		const dateInput = this.labeled(when, t('body.recordDate')).createEl(
			'input',
			{
				type: 'date',
				cls: 'fitness-log-text-input',
				value: options.today,
			},
		);
		const timeInput = this.labeled(when, t('body.recordTime')).createEl(
			'input',
			{ type: 'time', cls: 'fitness-log-text-input', value: nowHm() },
		);
		contentEl.createDiv({
			cls: 'fitness-log-muted fitness-log-body-record-hint',
			text: t('body.recordHint'),
		});

		const list = contentEl.createDiv({
			cls: 'fitness-log-body-record-fields',
		});
		for (const item of store.bodySettings.items)
			this.field(list, item.name);

		// 部位別（ノートにある部位の項目。無ければ 筋肉量・脂肪率）
		const found = partMeasureOrder(partMeasuresIn(body.all, splitPartKey));
		const measures = found.length > 0 ? found : DEFAULT_PART_MEASURES;
		const details = contentEl.createEl('details', {
			cls: 'fitness-log-body-record-parts',
		});
		details.createEl('summary', { text: t('body.recordParts') });
		const parts = details.createDiv({
			cls: 'fitness-log-body-record-fields',
		});
		for (const measure of measures)
			for (const part of BODY_PARTS)
				this.field(parts, partKey(part, measure));

		const error = contentEl.createDiv({ cls: 'fitness-log-prompt-error' });
		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(buttons, t('confirm.cancel'), () => this.close());
		const save = textButton(
			buttons,
			t('body.save'),
			() => {
				const message = this.validate(dateInput.value);
				if (message) {
					error.setText(message);
					return;
				}
				save.disabled = true;
				void this.save(dateInput.value, timeInput.value).finally(() => {
					save.disabled = false;
				});
			},
			{ cta: true },
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private labeled(parent: HTMLElement, label: string): HTMLElement {
		const box = parent.createEl('label', {
			cls: 'fitness-log-body-record-label',
		});
		box.createSpan({ cls: 'fitness-log-muted', text: label });
		return box;
	}

	private field(parent: HTMLElement, name: string): void {
		const { body, store } = this.options.services;
		const weightUnit = store.settings.weightUnit;
		const unit = unitOf(name, store.bodySettings.items);
		const row = parent.createEl('label', {
			cls: 'fitness-log-body-record-field',
		});
		row.createSpan({ cls: 'fitness-log-body-record-name', text: name });
		const last = lastIndex(body.all, name);
		const lastValue = last >= 0 ? body.all[last]?.values[name] : undefined;
		const values = body.all
			.map((m) => m.values[name])
			.filter((v): v is number => v !== undefined);
		const placeholder =
			lastValue === undefined
				? ''
				: toDisplayBody(lastValue, unit, weightUnit).toFixed(
						displayDecimals(
							decimalsOf(name, values),
							unit,
							weightUnit,
						),
					);
		const input = row.createEl('input', {
			type: 'text',
			cls: 'fitness-log-body-record-input',
			attr: { inputmode: 'decimal', autocomplete: 'off', placeholder },
		});
		row.createSpan({
			cls: 'fitness-log-muted fitness-log-body-record-unit',
			text: displayUnit(unit, weightUnit),
		});
		this.fields.push({ name, input });
	}

	/** 入力の確かめ（文言を返すと保存しない） */
	private validate(date: string): string | undefined {
		if (!isDateString(date)) return t('body.error.date');
		let count = 0;
		for (const { name, input } of this.fields) {
			const value = parseNumberInput(input.value);
			if (value === undefined) return t('body.error.number', { name });
			if (value !== null) count++;
		}
		return count === 0 ? t('body.error.empty') : undefined;
	}

	private async save(date: string, time: string): Promise<void> {
		const { services, onSaved } = this.options;
		const { store, body } = services;
		const values: Record<string, number> = {};
		for (const { name, input } of this.fields) {
			const value = parseNumberInput(input.value);
			if (typeof value !== 'number') continue;
			values[name] = fromDisplayBody(
				value,
				unitOf(name, store.bodySettings.items),
				store.settings.weightUnit,
			);
		}
		try {
			await body.record(date, normalizeBodyTime(time), values);
			this.close();
			onSaved?.(date);
		} catch (error) {
			console.error('[fitness-log] body record', error);
			new Notice(
				t('notice.unexpected', {
					message:
						error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}
}
