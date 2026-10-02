import { Modal, Setting, type App } from 'obsidian';
import { t } from '../../i18n';
import type { RecordType, SetLog, WeightUnit } from '../../lib/model/types';
import { normalizeTime } from '../../lib/time/date';
import {
	fromDisplayWeight,
	parseNumberInput,
	toDisplayWeight,
} from '../../lib/units';
import { textButton } from '../helpers';
import { ConfirmModal } from './confirm-modal';

export interface SetEditOptions {
	title: string;
	/** 種目名など */
	subtitle: string;
	initial: SetLog;
	unit: WeightUnit;
	recordType: RecordType;
	onSave: (set: SetLog) => void;
	/** 渡すと削除ボタンを出す */
	onDelete?: () => void;
}

/** セットの修正（重量・回数・時刻・メモ）と、手入力での追加 */
export class SetEditModal extends Modal {
	constructor(
		app: App,
		private readonly options: SetEditOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle(options.title);
		contentEl.addClass('fitness-log-set-edit');
		contentEl.createDiv({
			cls: 'fitness-log-prompt-hint',
			text: options.subtitle,
		});

		const initial = options.initial;
		const fields = {
			weight:
				initial.weight === null
					? ''
					: String(toDisplayWeight(initial.weight, options.unit)),
			reps: initial.reps === null ? '' : String(initial.reps),
			start: initial.start ?? '',
			end: initial.end ?? '',
			note: initial.note,
		};
		const showWeightReps = options.recordType !== 'duration';
		if (showWeightReps) {
			new Setting(contentEl)
				.setName(t('setEdit.weight', { unit: options.unit }))
				.addText((text) => {
					text.inputEl.inputMode = 'decimal';
					text.setValue(fields.weight).onChange(
						(v) => (fields.weight = v),
					);
				});
			new Setting(contentEl)
				.setName(t('setEdit.reps'))
				.addText((text) => {
					text.inputEl.inputMode = 'numeric';
					text.setValue(fields.reps).onChange(
						(v) => (fields.reps = v),
					);
				});
		}
		new Setting(contentEl).setName(t('setEdit.start')).addText((text) =>
			text
				.setPlaceholder('18:30:00')
				.setValue(fields.start)
				.onChange((v) => (fields.start = v)),
		);
		new Setting(contentEl).setName(t('setEdit.end')).addText((text) =>
			text
				.setPlaceholder('18:31:00')
				.setValue(fields.end)
				.onChange((v) => (fields.end = v)),
		);
		new Setting(contentEl)
			.setName(t('setEdit.note'))
			.addText((text) =>
				text.setValue(fields.note).onChange((v) => (fields.note = v)),
			);
		const error = contentEl.createDiv({ cls: 'fitness-log-prompt-error' });

		const save = () => {
			// 時間タイプでは重量・回数の欄を出さないので、元の値をそのまま残す
			const weight = showWeightReps
				? parseNumberInput(fields.weight)
				: initial.weight;
			const reps = showWeightReps
				? parseNumberInput(fields.reps)
				: initial.reps;
			if (
				weight === undefined ||
				reps === undefined ||
				(weight ?? 0) < 0 ||
				(reps ?? 0) < 0
			) {
				error.setText(t('prompt.invalidNumber'));
				return;
			}
			const time = (value: string): string | null | undefined =>
				value.trim() === ''
					? null
					: (normalizeTime(value.normalize('NFKC')) ?? undefined);
			const start = time(fields.start);
			const end = time(fields.end);
			if (start === undefined || end === undefined) {
				error.setText(t('setEdit.invalidTime'));
				return;
			}
			this.close();
			options.onSave({
				weight:
					!showWeightReps || weight === null
						? weight
						: fromDisplayWeight(weight, options.unit),
				reps,
				start,
				end,
				note: fields.note.trim(),
			});
		};

		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		const onDelete = options.onDelete;
		if (onDelete) {
			const remove = textButton(buttons, t('setEdit.delete'), () => {
				new ConfirmModal(this.app, {
					title: options.title,
					message: t('setEdit.deleteConfirm'),
					confirmText: t('confirm.delete'),
					danger: true,
					onConfirm: () => {
						this.close();
						onDelete();
					},
				}).open();
			});
			remove.addClass('mod-warning', 'fitness-log-button-left');
		}
		textButton(buttons, t('prompt.cancel'), () => this.close());
		textButton(buttons, t('setEdit.save'), save, { cta: true });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
