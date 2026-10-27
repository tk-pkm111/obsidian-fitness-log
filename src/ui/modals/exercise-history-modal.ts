import { Modal, type App } from 'obsidian';
import { t } from '../../i18n';
import { formatSetResult, formatSetsCompact } from '../../lib/format';
import type { RecentRecord } from '../../lib/history/recent';
import type { RecordType, SetLog, WeightUnit } from '../../lib/model/types';
import { weekdayLabel } from '../../lib/schedule/routine';
import { formatMonthDay, weekdayOf } from '../../lib/time/date';
import { textButton } from '../helpers';

export interface ExerciseHistoryOptions {
	/** 種目名 */
	title: string;
	/** 直近の記録（新しい順） */
	records: readonly RecentRecord[];
	/** いちばんのセット（無ければ null） */
	best: { set: SetLog; date: string } | null;
	recordType: RecordType;
	unit: WeightUnit;
	/** 「ログで詳しく見る」: その種目のログへ */
	onOpenLog: () => void;
}

/**
 * 種目の 📈（今日の画面）: 前回までの記録。直近の重量・回数・そのときのセットのコメントと、いちばんのセット。
 * 今日の画面の上に出すので、セット中・休憩中でも閉じればすぐ戻れる。記録だけを並べる（次の重量などは出さない）
 */
export class ExerciseHistoryModal extends Modal {
	constructor(
		app: App,
		private readonly options: ExerciseHistoryOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle(options.title);
		contentEl.addClass('fitness-log-history');
		if (options.records.length === 0) {
			contentEl.createDiv({
				cls: 'fitness-log-muted',
				text: t('history.empty'),
			});
			return;
		}
		contentEl.createDiv({
			cls: 'fitness-log-history-sub',
			text: t('history.recent', { n: options.records.length }),
		});
		const list = contentEl.createDiv({ cls: 'fitness-log-history-list' });
		for (const record of options.records) {
			const row = list.createDiv({ cls: 'fitness-log-history-row' });
			row.createSpan({
				cls: 'fitness-log-history-date',
				text: `${formatMonthDay(record.date)} (${weekdayLabel(weekdayOf(record.date))})`,
			});
			const main = row.createDiv({ cls: 'fitness-log-history-main' });
			const line = main.createDiv({ cls: 'fitness-log-history-line' });
			line.createSpan({
				cls: 'fitness-log-history-sets',
				text: formatSetsCompact(
					record.sets,
					options.unit,
					options.recordType,
				),
			});
			line.createSpan({
				cls: 'fitness-log-history-package',
				text: record.sessionName ?? t('today.other'),
			});
			record.sets.forEach((set, index) => {
				if (set.note)
					main.createDiv({
						cls: 'fitness-log-history-note',
						text: t('history.setNote', {
							n: index + 1,
							note: set.note,
						}),
					});
			});
		}
		const best = options.best;
		if (best)
			contentEl.createDiv({
				cls: 'fitness-log-history-best',
				text: t('history.best', {
					result: formatSetResult(
						best.set,
						options.unit,
						options.recordType,
					),
					date: formatMonthDay(best.date),
				}),
			});
		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(
			buttons,
			t('history.openLog'),
			() => {
				this.close();
				options.onOpenLog();
			},
			{ icon: 'line-chart', cls: 'mod-quiet fitness-log-button-left' },
		);
		textButton(buttons, t('nav.close'), () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
