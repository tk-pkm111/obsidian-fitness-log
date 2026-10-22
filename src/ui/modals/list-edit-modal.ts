import { Modal, type App, type EventRef } from 'obsidian';
import { t, type MessageKey } from '../../i18n';
import type { ListsLibrary } from '../../data/lists-library';
import type { DataStore } from '../../data/data-store';
import {
	addListName,
	autoRecordTypeName,
	fieldLabel,
	recordTypeName,
	renameListItem,
	type ListKind,
} from '../../lib/model/lists';
import { recordFields } from '../../lib/model/record-type';
import { iconButton, runAction, textButton } from '../helpers';
import { dragHandle, makeSortable, type SortableEntry } from '../sortable';
import { ConfirmModal } from './confirm-modal';
import { RecordTypeModal } from './record-type-modal';
import { TextPromptModal } from './text-prompt-modal';

export interface ListEditOptions {
	kind: ListKind;
	lists: ListsLibrary;
	store: DataStore;
	/** 名前を変えた・消した（開いている種目の編集画面の値を合わせる） */
	onRenamed?: (from: string, to: string) => void;
	onRemoved?: (name: string, replacement: string | undefined) => void;
	/** 閉じたとき（選ぶ欄を作り直す） */
	onDone?: () => void;
}

/** 検証用: 失敗の文言（CatalogError）を返す */
function errorOf(run: () => unknown): string | undefined {
	try {
		run();
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

/**
 * 種目の選択肢（カテゴリ・器具・記録のしかた）の一覧を編集する。
 * 行を押すと名前を変える、⋮⋮ で並べ替え、🗑 で消す（使っている種目があればその数を添えて確かめる）、下の「＋」で足す。
 * 一覧は設定ノートに書く（ほかの端末とそろう）
 */
export class ListEditModal extends Modal {
	private ref: EventRef | null = null;

	constructor(
		app: App,
		private readonly options: ListEditOptions,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(t(`lists.title.${this.options.kind}` as MessageKey));
		this.contentEl.addClass('fitness-log-list-edit');
		this.ref = this.options.store.onChange(() => this.render());
		this.render();
	}

	onClose(): void {
		if (this.ref) this.options.store.offref(this.ref);
		this.contentEl.empty();
		this.options.onDone?.();
	}

	private render(): void {
		const { contentEl, options } = this;
		const { kind, lists } = options;
		contentEl.empty();
		const current = lists.lists;
		const names =
			kind === 'recordTypes'
				? current.recordTypes.map((r) => r.name)
				: current[kind];
		const list = contentEl.createDiv({ cls: 'fitness-log-cards' });
		const entries: SortableEntry[] = [];
		names.forEach((name, index) => {
			const row = list.createDiv({ cls: 'fitness-log-list-edit-row' });
			const handle = dragHandle(
				row,
				t('drag.handle'),
				`list-${kind}-${index}`,
			);
			entries.push({ el: row, handle });
			const body = row.createEl('button', {
				cls: 'fitness-log-list-edit-name',
				attr: {
					type: 'button',
					'aria-label': t('lists.rename', { name }),
				},
			});
			body.createSpan({ text: name });
			if (kind === 'recordTypes') {
				// 名前を変えた記録のしかたは、記録する項目も添える
				const type = current.recordTypes[index]?.type;
				if (type && name !== autoRecordTypeName(type))
					body.createSpan({
						cls: 'fitness-log-muted',
						text: recordFields(type).map(fieldLabel).join('・'),
					});
			}
			const used = lists.usage(kind, index);
			if (used > 0)
				row.createSpan({
					cls: 'fitness-log-muted fitness-log-list-edit-count',
					text: t('exercises.count', { n: used }),
				});
			body.addEventListener('click', () => this.rename(index, name));
			iconButton(
				row,
				'trash-2',
				t('lists.remove', { name }),
				() => this.confirmRemove(index, name, used),
				'fitness-log-list-edit-remove',
			);
		});
		makeSortable(entries, (from, to) =>
			runAction(this.app, () => lists.move(kind, from, to)),
		);
		const footer = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(
			footer,
			t(`lists.add.${kind}` as MessageKey),
			() => this.add(),
			{ icon: 'plus', cls: 'fitness-log-button-left mod-quiet' },
		);
		textButton(footer, t('wheel.done'), () => this.close(), { cta: true });
	}

	private add(): void {
		const { kind, lists } = this.options;
		if (kind === 'recordTypes') {
			new RecordTypeModal(this.app, {
				lists: lists.lists,
				onSubmit: (type, name) => lists.addRecordType(type, name),
			}).open();
			return;
		}
		new TextPromptModal(this.app, {
			title: t(`lists.add.${kind}` as MessageKey),
			initial: '',
			singleLine: true,
			submitText: t('lists.addSubmit'),
			validate: (value) =>
				errorOf(() => addListName(lists.lists, kind, value)),
			onSubmit: (value) =>
				runAction(this.app, () => lists.addName(kind, value)),
		}).open();
	}

	private rename(index: number, name: string): void {
		const { kind, lists, onRenamed } = this.options;
		new TextPromptModal(this.app, {
			title: t('lists.renameTitle'),
			initial: name,
			singleLine: true,
			submitText: t('lists.renameSubmit'),
			validate: (value) =>
				errorOf(() => renameListItem(lists.lists, kind, index, value)),
			onSubmit: (value) =>
				runAction(this.app, async () => {
					await lists.rename(kind, index, value);
					if (kind !== 'recordTypes') onRenamed?.(name, value.trim());
				}),
		}).open();
	}

	private confirmRemove(index: number, name: string, used: number): void {
		const { kind, lists, onRemoved } = this.options;
		const fallback =
			kind === 'recordTypes'
				? lists.lists.recordTypes.find((_, i) => i !== index)
				: undefined;
		const message =
			used === 0
				? t(`lists.removeConfirm.${kind}` as MessageKey)
				: kind === 'recordTypes'
					? t('lists.removeConfirmUsed.recordTypes', {
							n: used,
							name: fallback?.name ?? '',
						})
					: t(`lists.removeConfirmUsed.${kind}` as MessageKey, {
							n: used,
						});
		new ConfirmModal(this.app, {
			title: name,
			message,
			confirmText: t('confirm.delete'),
			danger: true,
			onConfirm: () =>
				runAction(this.app, async () => {
					const type =
						kind === 'recordTypes'
							? lists.lists.recordTypes[index]?.type
							: undefined;
					await lists.remove(kind, index);
					if (kind === 'recordTypes') {
						if (type)
							onRemoved?.(type, lists.lists.recordTypes[0]?.type);
					} else onRemoved?.(name, undefined);
				}),
		}).open();
	}
}

/** 一覧での名前（記録のしかたは項目からの名前も） */
export function listLabel(
	lists: ListsLibrary,
	kind: ListKind,
	value: string,
): string {
	if (kind === 'recordTypes') return recordTypeName(value, lists.lists);
	return value === '' ? t('lists.unset') : value;
}
