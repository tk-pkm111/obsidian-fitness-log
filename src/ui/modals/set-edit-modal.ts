import { Modal, Setting, type App } from 'obsidian';
import { t } from '../../i18n';
import type { RecordType, SetLog, WeightUnit } from '../../lib/model/types';
import { normalizeTime } from '../../lib/time/date';
import { hasField, keepsWeight } from '../../lib/model/record-type';
import {
	DISTANCE_UNIT,
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
			distance:
				initial.distance === undefined || initial.distance === null
					? ''
					: String(initial.distance),
			start: initial.start ?? '',
			end: initial.end ?? '',
			note: initial.note,
		};
		// 記録のしかたの項目だけを出す（回数の種目は重りを足した日のために重量も）
		const showWeight = keepsWeight(options.recordType);
		const showReps = hasField(options.recordType, 'reps');
		const showDistance = hasField(options.recordType, 'distance');
		if (showWeight)
			new Setting(contentEl)
				.setName(t('setEdit.weight', { unit: options.unit }))
				.addText((text) => {
					text.inputEl.inputMode = 'decimal';
					text.setValue(fields.weight).onChange(
						(v) => (fields.weight = v),
					);
				});
		if (showReps)
			new Setting(contentEl)
				.setName(t('setEdit.reps'))
				.addText((text) => {
					text.inputEl.inputMode = 'numeric';
					text.setValue(fields.reps).onChange(
						(v) => (fields.reps = v),
					);
				});
		if (showDistance)
			new Setting(contentEl)
				.setName(t('setEdit.distance', { unit: DISTANCE_UNIT }))
				.addText((text) => {
					text.inputEl.inputMode = 'decimal';
					text.setValue(fields.distance).onChange(
						(v) => (fields.distance = v),
					);
				});
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
			// 出していない欄は、元の値をそのまま残す
			const weight = showWeight
				? parseNumberInput(fields.weight)
				: initial.weight;
			const reps = showReps
				? parseNumberInput(fields.reps)
				: initial.reps;
			const distance = showDistance
				? parseNumberInput(fields.distance)
				: initial.distance;
			if (
				weight === undefined ||
				reps === undefined ||
				(showDistance && distance === undefined) ||
				(weight ?? 0) < 0 ||
				(reps ?? 0) < 0 ||
				(distance ?? 0) < 0
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
			const saved: SetLog = {
				weight:
					!showWeight || weight === null
						? weight
						: fromDisplayWeight(weight, options.unit),
				reps,
				start,
				end,
				note: fields.note.trim(),
			};
			if (distance !== undefined) saved.distance = distance;
			options.onSave(saved);
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
