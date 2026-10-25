import { Modal, type App, type EventRef } from 'obsidian';
import { t } from '../../i18n';
import { isPartKey, knownItem } from '../../lib/body/items';
import { checkBodyItemName } from '../../lib/body/settings';
import { wholeItemsIn } from '../../lib/body/stats';
import type { FitnessServices } from '../../services';
import { iconButton, runAction, textButton } from '../helpers';
import { dragHandle, makeSortable, type SortableEntry } from '../sortable';
import { TextPromptModal } from './text-prompt-modal';

export interface BodyItemsOptions {
	services: FitnessServices;
	/** 閉じたとき（設定の説明を出し直す） */
	onDone?: () => void;
}

/**
 * 体組成の項目（丸に出す全身の項目と並び・単位）を編集する。
 * ⋮⋮ で並べ替え、単位を押して変える、🗑 で外す（ノートの値は消えないので確認しない）。
 * 「ノートにある項目」から足す・新しい項目を足す。名前はノートのプロパティ名なので変えない
 */
export class BodyItemsModal extends Modal {
	private refs: EventRef[] = [];

	constructor(
		app: App,
		private readonly options: BodyItemsOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { store, body } = this.options.services;
		this.setTitle(t('body.items.title'));
		this.contentEl.addClass('fitness-log-list-edit');
		body.ensureLoaded();
		this.refs = [
			store.onChange(() => this.render()),
			body.onChange(() => this.render()),
		];
		this.render();
	}

	onClose(): void {
		const { store, body } = this.options.services;
		for (const ref of this.refs) {
			store.offref(ref);
			body.offref(ref);
		}
		this.refs = [];
		this.contentEl.empty();
		this.options.onDone?.();
	}

	private render(): void {
		const { contentEl } = this;
		const { store, lists, body } = this.options.services;
		contentEl.empty();
		const { items } = store.bodySettings;
		contentEl.createDiv({
			cls: 'fitness-log-muted fitness-log-body-items-hint',
			text: t('body.items.hint'),
		});
		const list = contentEl.createDiv({ cls: 'fitness-log-cards' });
		const entries: SortableEntry[] = [];
		items.forEach((item, index) => {
			const row = list.createDiv({ cls: 'fitness-log-list-edit-row' });
			const handle = dragHandle(
				row,
				t('drag.handle'),
				`body-item-${index}`,
			);
			entries.push({ el: row, handle });
			row.createSpan({
				cls: 'fitness-log-list-edit-name',
				text: item.name,
			});
			const unit = row.createEl('button', {
				cls: 'fitness-log-body-items-unit',
				text: item.unit || t('body.items.noUnit'),
				attr: {
					type: 'button',
					'aria-label': t('body.items.changeUnit', {
						name: item.name,
					}),
				},
			});
			unit.addEventListener('click', () =>
				new TextPromptModal(this.app, {
					title: t('body.items.unitTitle', { name: item.name }),
					initial: item.unit,
					placeholder: t('body.items.unitPlaceholder'),
					singleLine: true,
					submitText: t('lists.renameSubmit'),
					onSubmit: (value) =>
						runAction(this.app, () =>
							lists.setBodyItemUnit(index, value),
						),
				}).open(),
			);
			iconButton(
				row,
				'trash-2',
				t('body.items.remove', { name: item.name }),
				() => runAction(this.app, () => lists.removeBodyItem(index)),
				'fitness-log-list-edit-remove',
			);
		});
		makeSortable(entries, (from, to) =>
			runAction(this.app, () => lists.moveBodyItem(from, to)),
		);

		// ノートにあって一覧に無い全身の項目
		const inNotes = wholeItemsIn(body.all, isPartKey).filter(
			(name) => !items.some((item) => item.name === name),
		);
		if (inNotes.length > 0) {
			contentEl.createDiv({
				cls: 'fitness-log-body-items-head',
				text: t('body.items.inNotes'),
			});
			const found = contentEl.createDiv({ cls: 'fitness-log-cards' });
			for (const name of inNotes) {
				const row = found.createDiv({
					cls: 'fitness-log-list-edit-row',
				});
				row.createSpan({
					cls: 'fitness-log-list-edit-name',
					text: name,
				});
				const unit = knownItem(name)?.unit ?? '';
				if (unit)
					row.createSpan({
						cls: 'fitness-log-muted fitness-log-body-items-known',
						text: unit,
					});
				iconButton(row, 'plus', t('body.items.add', { name }), () =>
					runAction(this.app, () => lists.addBodyItem(name, unit)),
				);
			}
		}

		const footer = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(footer, t('body.items.newButton'), () => this.addNew(), {
			icon: 'plus',
			cls: 'fitness-log-button-left mod-quiet',
		});
		textButton(footer, t('wheel.done'), () => this.close(), { cta: true });
	}

	/** 新しい項目: 名前 → 単位（知っている名前なら単位を最初から入れる） */
	private addNew(): void {
		const { store, lists } = this.options.services;
		new TextPromptModal(this.app, {
			title: t('body.items.new'),
			initial: '',
			placeholder: t('body.items.name'),
			singleLine: true,
			submitText: t('body.items.addSubmit'),
			validate: (value) => {
				try {
					checkBodyItemName(store.bodySettings.items, value);
					return undefined;
				} catch (error) {
					return error instanceof Error
						? error.message
						: String(error);
				}
			},
			onSubmit: (value) => {
				const name = value.trim();
				new TextPromptModal(this.app, {
					title: t('body.items.unitTitle', { name }),
					initial: knownItem(name)?.unit ?? '',
					placeholder: t('body.items.unitPlaceholder'),
					singleLine: true,
					submitText: t('body.items.addSubmit'),
					onSubmit: (unit) =>
						runAction(this.app, () =>
							lists.addBodyItem(name, unit),
						),
				}).open();
			},
		}).open();
	}
}
