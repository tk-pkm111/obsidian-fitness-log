import { Modal, Setting, type App } from 'obsidian';
import { t, type MessageKey } from '../../i18n';
import {
	addRecordType,
	autoRecordTypeName,
	fieldLabel,
	type ExerciseLists,
} from '../../lib/model/lists';
import {
	RECORD_FIELDS,
	recordTypeOf,
	type RecordField,
} from '../../lib/model/record-type';
import type { RecordType } from '../../lib/model/types';
import { textButton } from '../helpers';

export interface RecordTypeOptions {
	lists: ExerciseLists;
	/** 足す（失敗したら投げる。モーダルを閉じずに文言を出す） */
	onSubmit: (type: RecordType, name: string) => Promise<void>;
}

/**
 * 新しい記録のしかた: 記録する項目（重量・回数・距離・時間）を選ぶ。名前は項目から付ける（変えてもよい）。
 * 重量はセットを始めるとき、回数・距離は終えるときに聞く。時間はセットの開始〜終了
 */
export class RecordTypeModal extends Modal {
	constructor(
		app: App,
		private readonly options: RecordTypeOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle(t('lists.add.recordTypes'));
		contentEl.addClass('fitness-log-record-type');
		contentEl.createDiv({
			cls: 'fitness-log-prompt-hint fitness-log-modal-lead',
			text: t('recordTypeEdit.lead'),
		});
		const chosen = new Set<RecordField>(['weight']);
		let name = '';
		let nameInput: HTMLInputElement | null = null;
		const autoName = () => {
			const type = recordTypeOf(chosen);
			return type ? autoRecordTypeName(type) : '';
		};
		for (const field of RECORD_FIELDS)
			new Setting(contentEl)
				.setName(fieldLabel(field))
				.setDesc(t(`recordTypeEdit.desc.${field}` as MessageKey))
				.addToggle((toggle) =>
					toggle.setValue(chosen.has(field)).onChange((on) => {
						if (on) chosen.add(field);
						else chosen.delete(field);
						if (nameInput) nameInput.placeholder = autoName();
					}),
				);
		new Setting(contentEl)
			.setName(t('recordTypeEdit.name'))
			.addText((text) => {
				nameInput = text.inputEl;
				text.setPlaceholder(autoName()).onChange((v) => (name = v));
			});
		const error = contentEl.createDiv({ cls: 'fitness-log-prompt-error' });
		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(buttons, t('prompt.cancel'), () => this.close());
		const submit = textButton(
			buttons,
			t('lists.addSubmit'),
			() => {
				const type = recordTypeOf(chosen);
				if (!type) {
					error.setText(t('recordTypeEdit.noField'));
					return;
				}
				try {
					addRecordType(options.lists, type, name);
				} catch (e) {
					error.setText(e instanceof Error ? e.message : String(e));
					return;
				}
				submit.disabled = true;
				options
					.onSubmit(type, name)
					.then(() => this.close())
					.catch((e: unknown) => {
						submit.disabled = false;
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
