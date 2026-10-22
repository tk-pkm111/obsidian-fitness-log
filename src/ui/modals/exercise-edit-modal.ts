import { Modal, Setting, type App } from 'obsidian';
import type { DataStore } from '../../data/data-store';
import type { ListsLibrary } from '../../data/lists-library';
import { t, type MessageKey } from '../../i18n';
import { CatalogError } from '../../lib/model/catalog';
import {
	addListName,
	categoryOrder,
	defaultRecordType,
	recordTypeName,
	type ListKind,
	type NameListKind,
} from '../../lib/model/lists';
import { parseAliasInput } from '../../lib/model/resolve';
import type { Exercise } from '../../lib/model/types';
import { runAction, textButton } from '../helpers';
import { ConfirmModal } from './confirm-modal';
import { ListEditModal } from './list-edit-modal';
import { RecordTypeModal } from './record-type-modal';
import { TextPromptModal } from './text-prompt-modal';

/** 選択肢の終わりの「＋ 新しい…」「一覧を編集…」（ふつうの値と重ならない値） */
const ADD_OPTION = '\u0000add';
const EDIT_OPTION = '\u0000edit';

export type ExerciseFields = Omit<Exercise, 'id' | 'createdAt' | 'path'>;

export interface ExerciseEditOptions {
	/** 新規なら undefined */
	exercise?: Exercise;
	/** 新規作成時の初期値 */
	initialName?: string;
	initialCategory?: string;
	/** カテゴリ・器具・記録のしかたの一覧（設定ノート） */
	lists: ListsLibrary;
	store: DataStore;
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
			category: source?.category ?? options.initialCategory ?? '',
			equipment: source?.equipment,
			recordType:
				source?.recordType ?? defaultRecordType(options.lists.lists),
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
		this.listDropdown(
			new Setting(contentEl).setName(t('exerciseEdit.category')),
			'categories',
			() => fields.category,
			(v) => (fields.category = v),
		);
		this.listDropdown(
			new Setting(contentEl).setName(t('exerciseEdit.equipment')),
			'equipment',
			() => fields.equipment ?? '',
			(v) => (fields.equipment = v === '' ? undefined : v),
		);
		this.listDropdown(
			new Setting(contentEl).setName(t('exerciseEdit.recordType')),
			'recordTypes',
			() => fields.recordType,
			(v) => (fields.recordType = v),
		);
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
						t('exerciseEdit.deleteConfirm'),
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

	/**
	 * 一覧から選ぶ欄。終わりに「＋ 新しい…」（その場で足して選ぶ）と「一覧を編集…」（名前の変更・並べ替え・削除）。
	 * 一覧に無い今の値（ノートを手で書き換えた等）も選択肢に残す
	 */
	private listDropdown(
		setting: Setting,
		kind: ListKind,
		value: () => string,
		onChange: (value: string) => void,
	): void {
		const { lists, store } = this.options;
		setting.addDropdown((dropdown) => {
			const fill = () => {
				dropdown.selectEl.empty();
				const current = value();
				if (kind === 'recordTypes') {
					const types = lists.lists.recordTypes.map((r) => r.type);
					if (!types.includes(current)) types.push(current);
					for (const type of types)
						dropdown.addOption(
							type,
							recordTypeName(type, lists.lists),
						);
				} else {
					dropdown.addOption('', t('lists.unset'));
					const names =
						kind === 'categories'
							? categoryOrder(lists.lists, [current])
							: [...lists.lists.equipment];
					if (current !== '' && !names.includes(current))
						names.push(current);
					for (const name of names)
						if (name !== '') dropdown.addOption(name, name);
				}
				dropdown.addOption(
					ADD_OPTION,
					t(`lists.newOption.${kind}` as MessageKey),
				);
				dropdown.addOption(EDIT_OPTION, t('lists.editOption'));
				dropdown.setValue(current);
			};
			fill();
			dropdown.onChange((v) => {
				if (v === ADD_OPTION) {
					dropdown.setValue(value());
					this.addItem(kind, (added) => {
						onChange(added);
						fill();
					});
					return;
				}
				if (v === EDIT_OPTION) {
					dropdown.setValue(value());
					new ListEditModal(this.app, {
						kind,
						lists,
						store,
						onRenamed: (from, to) => {
							if (value() === from) onChange(to);
						},
						onRemoved: (removed, replacement) => {
							if (value() === removed)
								onChange(replacement ?? '');
						},
						onDone: fill,
					}).open();
					return;
				}
				onChange(v);
			});
		});
	}

	/** その場で一覧に足して、足したものを選ぶ */
	private addItem(kind: ListKind, onAdded: (value: string) => void): void {
		const { lists } = this.options;
		if (kind === 'recordTypes') {
			new RecordTypeModal(this.app, {
				lists: lists.lists,
				onSubmit: async (type, name) => {
					await lists.addRecordType(type, name);
					onAdded(type);
				},
			}).open();
			return;
		}
		const nameKind: NameListKind = kind;
		new TextPromptModal(this.app, {
			title: t(`lists.add.${nameKind}` as MessageKey),
			initial: '',
			singleLine: true,
			submitText: t('lists.addSubmit'),
			validate: (input) => {
				try {
					addListName(lists.lists, nameKind, input);
					return undefined;
				} catch (error) {
					return error instanceof Error
						? error.message
						: String(error);
				}
			},
			onSubmit: (input) =>
				runAction(this.app, async () =>
					onAdded(await lists.addName(nameKind, input)),
				),
		}).open();
	}
}
