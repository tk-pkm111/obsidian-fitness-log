import { Modal, Setting, type App } from 'obsidian';
import { t, type MessageKey } from '../../i18n';
import { CatalogError } from '../../lib/model/catalog';
import { parseAliasInput } from '../../lib/model/resolve';
import type {
	Equipment,
	Exercise,
	ExerciseCategory,
	RecordType,
} from '../../lib/model/types';
import { textButton } from '../helpers';
import { ConfirmModal } from './confirm-modal';

export const CATEGORIES: readonly ExerciseCategory[] = [
	'push',
	'pull',
	'legs',
	'arms',
	'core',
	'cardio',
	'other',
];
export const EQUIPMENT: readonly Equipment[] = [
	'machine',
	'cable',
	'smith',
	'barbell',
	'dumbbell',
	'bodyweight',
	'band',
	'other',
];
const RECORD_TYPES: readonly RecordType[] = ['weight-reps', 'reps', 'duration'];

export type ExerciseFields = Omit<Exercise, 'id' | 'createdAt' | 'path'>;

export interface ExerciseEditOptions {
	/** 新規なら undefined */
	exercise?: Exercise;
	/** 新規作成時の初期値 */
	initialName?: string;
	/** 保存。CatalogError を投げればモーダルを閉じずに表示する */
	onSave: (fields: ExerciseFields) => Promise<void>;
	onDelete?: () => void;
	/** 削除確認の文言 */
	deleteMessage?: string;
	/** 種目ノートを開く（フォームやコツを書く場所） */
	onOpenNote?: () => void;
}

/** 種目の作成・編集（実装計画 §5.3） */
export class ExerciseEditModal extends Modal {
	constructor(
		app: App,
		private readonly options: ExerciseEditOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		const source = options.exercise;
		this.setTitle(
			source ? t('exerciseEdit.title') : t('exerciseEdit.newTitle'),
		);
		contentEl.addClass('fitness-log-exercise-edit');
		contentEl.createDiv({
			cls: 'fitness-log-prompt-hint fitness-log-modal-lead',
			text: t('exerciseEdit.noteHint'),
		});
		const fields: ExerciseFields = {
			name: source?.name ?? options.initialName ?? '',
			category: source?.category ?? 'other',
			equipment: source?.equipment,
			recordType: source?.recordType ?? 'weight-reps',
			unilateral: source?.unilateral ?? false,
			aliases: [...(source?.aliases ?? [])],
			archived: source?.archived ?? false,
		};
		let aliasText = fields.aliases.join('\n');

		new Setting(contentEl)
			.setName(t('exerciseEdit.name'))
			.setDesc(source ? t('exerciseEdit.nameDesc') : '')
			.addText((text) => {
				text.setValue(fields.name).onChange((v) => (fields.name = v));
				window.setTimeout(() => text.inputEl.focus(), 0);
			});
		new Setting(contentEl)
			.setName(t('exerciseEdit.category'))
			.addDropdown((dropdown) => {
				for (const c of CATEGORIES)
					dropdown.addOption(c, t(`category.${c}` as MessageKey));
				dropdown
					.setValue(fields.category)
					.onChange((v) => (fields.category = v as ExerciseCategory));
			});
		new Setting(contentEl)
			.setName(t('exerciseEdit.equipment'))
			.addDropdown((dropdown) => {
				dropdown.addOption('', t('exerciseEdit.equipmentNone'));
				for (const e of EQUIPMENT)
					dropdown.addOption(e, t(`equipment.${e}` as MessageKey));
				dropdown
					.setValue(fields.equipment ?? '')
					.onChange(
						(v) =>
							(fields.equipment =
								v === '' ? undefined : (v as Equipment)),
					);
			});
		new Setting(contentEl)
			.setName(t('exerciseEdit.recordType'))
			.setDesc(t('exerciseEdit.recordTypeDesc'))
			.addDropdown((dropdown) => {
				for (const r of RECORD_TYPES)
					dropdown.addOption(r, t(`recordType.${r}` as MessageKey));
				dropdown
					.setValue(fields.recordType)
					.onChange((v) => (fields.recordType = v as RecordType));
			});
		new Setting(contentEl)
			.setName(t('exerciseEdit.unilateral'))
			.setDesc(t('exerciseEdit.unilateralDesc'))
			.addToggle((toggle) =>
				toggle
					.setValue(fields.unilateral ?? false)
					.onChange((v) => (fields.unilateral = v)),
			);
		new Setting(contentEl)
			.setName(t('exerciseEdit.aliases'))
			.setDesc(t('exerciseEdit.aliasesDesc'))
			.addTextArea((area) => {
				area.inputEl.rows = 3;
				area.setValue(aliasText).onChange((v) => (aliasText = v));
			});
		if (source)
			new Setting(contentEl)
				.setName(t('exerciseEdit.archived'))
				.setDesc(t('exerciseEdit.archivedDesc'))
				.addToggle((toggle) =>
					toggle
						.setValue(fields.archived ?? false)
						.onChange((v) => (fields.archived = v)),
				);

		const error = contentEl.createDiv({ cls: 'fitness-log-prompt-error' });
		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		const onDelete = options.onDelete;
		if (source && onDelete) {
			const remove = textButton(buttons, t('exerciseEdit.delete'), () =>
				new ConfirmModal(this.app, {
					title: source.name,
					message:
						options.deleteMessage ??
						t('exerciseEdit.deleteConfirm', { name: source.name }),
					confirmText: t('confirm.delete'),
					danger: true,
					onConfirm: () => {
						this.close();
						onDelete();
					},
				}).open(),
			);
			remove.addClass('mod-warning', 'fitness-log-button-left');
		}
		const onOpenNote = options.onOpenNote;
		if (source && onOpenNote)
			textButton(
				buttons,
				t('exerciseEdit.openNote'),
				() => {
					this.close();
					onOpenNote();
				},
				{
					icon: 'file-text',
					cls:
						source && options.onDelete
							? ''
							: 'fitness-log-button-left',
				},
			);
		textButton(buttons, t('prompt.cancel'), () => this.close());
		const save = textButton(
			buttons,
			t('exerciseEdit.save'),
			() => {
				save.disabled = true;
				const result: ExerciseFields = {
					...fields,
					name: fields.name.trim(),
					aliases: parseAliasInput(aliasText, fields.name),
				};
				options
					.onSave(result)
					.then(() => this.close())
					.catch((e: unknown) => {
						save.disabled = false;
						if (!(e instanceof CatalogError))
							console.error('[fitness-log]', e);
						error.setText(
							e instanceof Error ? e.message : String(e),
						);
					});
			},
			{ cta: true },
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
