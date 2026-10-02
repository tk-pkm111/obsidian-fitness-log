import { Modal, Setting, type App } from 'obsidian';
import { t } from '../../i18n';
import { CatalogError, type RoutineFields } from '../../lib/model/catalog';
import type { Package, Routine } from '../../lib/model/types';
import { WEEKDAY_ORDER, weekdayLabel } from '../../lib/schedule/routine';
import { textButton } from '../helpers';
import { ConfirmModal } from './confirm-modal';

export interface RoutineEditOptions {
	/** 新規なら undefined */
	routine?: Routine;
	packages: readonly Package[];
	/** 新規作成時の初期値 */
	defaultPackageId?: string;
	today: string;
	/** 保存。CatalogError を投げればモーダルを閉じずに表示する */
	onSave: (fields: RoutineFields) => Promise<void>;
	onDelete?: () => void;
}

/** ルーチンの設定（TaskChute のルーチン設定に相当。開始予定時刻は持たない） */
export class RoutineEditModal extends Modal {
	constructor(
		app: App,
		private readonly options: RoutineEditOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		const source = options.routine;
		this.setTitle(
			source ? t('routineEdit.title') : t('routineEdit.newTitle'),
		);
		contentEl.addClass('fitness-log-routine-edit');

		const state = {
			packageId:
				source?.packageId ??
				options.defaultPackageId ??
				options.packages[0]?.id ??
				'',
			type: source?.rule.type ?? 'weekly',
			weekdays: new Set(
				source?.rule.type === 'weekly' ? source.rule.weekdays : [],
			),
			intervalWeeks:
				source?.rule.type === 'weekly' ? source.rule.intervalWeeks : 1,
			intervalDays:
				source?.rule.type === 'everyNDays'
					? source.rule.intervalDays
					: 2,
			startDate: source?.startDate ?? options.today,
			endDate: source?.endDate ?? '',
			enabled: source?.enabled ?? true,
		};

		new Setting(contentEl)
			.setName(t('routineEdit.package'))
			.addDropdown((dropdown) => {
				for (const pkg of options.packages)
					dropdown.addOption(pkg.id, pkg.name);
				dropdown
					.setValue(state.packageId)
					.onChange((v) => (state.packageId = v));
			});
		new Setting(contentEl)
			.setName(t('routineEdit.type'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('weekly', t('routineEdit.typeWeekly'))
					.addOption('everyNDays', t('routineEdit.typeEveryNDays'))
					.setValue(state.type)
					.onChange((v) => {
						state.type =
							v === 'everyNDays' ? 'everyNDays' : 'weekly';
						refresh();
					}),
			);

		const weeklyEl = contentEl.createDiv();
		new Setting(weeklyEl)
			.setName(t('routineEdit.intervalWeeks'))
			.setDesc(t('routineEdit.intervalWeeksDesc'))
			.addText((text) => {
				text.inputEl.inputMode = 'numeric';
				text.setValue(String(state.intervalWeeks)).onChange(
					(v) => (state.intervalWeeks = Number(v.normalize('NFKC'))),
				);
			});
		const weekdaySetting = new Setting(weeklyEl).setName(
			t('routineEdit.weekdays'),
		);
		const dayButtons = weekdaySetting.controlEl.createDiv({
			cls: 'fitness-log-weekdays',
		});
		for (const day of WEEKDAY_ORDER) {
			const button = dayButtons.createEl('button', {
				cls: 'fitness-log-weekday',
				text: weekdayLabel(day),
				attr: {
					type: 'button',
					'aria-pressed': String(state.weekdays.has(day)),
				},
			});
			button.toggleClass('is-active', state.weekdays.has(day));
			button.addEventListener('click', () => {
				if (state.weekdays.has(day)) state.weekdays.delete(day);
				else state.weekdays.add(day);
				button.toggleClass('is-active', state.weekdays.has(day));
				button.setAttr('aria-pressed', String(state.weekdays.has(day)));
			});
		}

		const everyEl = contentEl.createDiv();
		new Setting(everyEl)
			.setName(t('routineEdit.intervalDays'))
			.setDesc(t('routineEdit.intervalDaysDesc'))
			.addText((text) => {
				text.inputEl.inputMode = 'numeric';
				text.setValue(String(state.intervalDays)).onChange(
					(v) => (state.intervalDays = Number(v.normalize('NFKC'))),
				);
			});

		new Setting(contentEl)
			.setName(t('routineEdit.startDate'))
			.addText((text) => {
				text.inputEl.type = 'date';
				text.setValue(state.startDate).onChange(
					(v) => (state.startDate = v),
				);
			});
		new Setting(contentEl)
			.setName(t('routineEdit.endDate'))
			.setDesc(t('routineEdit.endDateDesc'))
			.addText((text) => {
				text.inputEl.type = 'date';
				text.setValue(state.endDate).onChange(
					(v) => (state.endDate = v),
				);
			});
		new Setting(contentEl)
			.setName(t('routineEdit.enabled'))
			.addToggle((toggle) =>
				toggle
					.setValue(state.enabled)
					.onChange((v) => (state.enabled = v)),
			);

		const refresh = () => {
			weeklyEl.toggleClass('fitness-log-hidden', state.type !== 'weekly');
			everyEl.toggleClass(
				'fitness-log-hidden',
				state.type !== 'everyNDays',
			);
		};
		refresh();

		const error = contentEl.createDiv({ cls: 'fitness-log-prompt-error' });
		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		const onDelete = options.onDelete;
		if (source && onDelete) {
			const remove = textButton(buttons, t('routineEdit.delete'), () =>
				new ConfirmModal(this.app, {
					title: t('routineEdit.title'),
					message: t('routineEdit.deleteConfirm'),
					confirmText: t('routineEdit.delete'),
					danger: true,
					onConfirm: () => {
						this.close();
						onDelete();
					},
				}).open(),
			);
			remove.addClass('mod-warning', 'fitness-log-button-left');
		}
		textButton(buttons, t('prompt.cancel'), () => this.close());
		const save = textButton(
			buttons,
			t('routineEdit.save'),
			() => {
				const fields: RoutineFields = {
					packageId: state.packageId,
					rule:
						state.type === 'weekly'
							? {
									type: 'weekly',
									weekdays: [...state.weekdays],
									intervalWeeks: state.intervalWeeks,
								}
							: {
									type: 'everyNDays',
									intervalDays: state.intervalDays,
								},
					startDate: state.startDate,
					enabled: state.enabled,
				};
				if (state.endDate) fields.endDate = state.endDate;
				save.disabled = true;
				options
					.onSave(fields)
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
