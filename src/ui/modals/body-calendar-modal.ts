import { Modal, type App } from 'obsidian';
import { t } from '../../i18n';
import { addMonths, monthWeeks } from '../../lib/schedule/calendar';
import { WEEKDAY_ORDER, weekdayLabel } from '../../lib/schedule/routine';
import { formatMonthDay, monthOf, weekdayOf } from '../../lib/time/date';
import { iconButton, textButton } from '../helpers';

export interface BodyCalendarOptions {
	/** 測った日（'YYYY-MM-DD'） */
	dates: readonly string[];
	/** 今見ている測定の日（最初に開く月もこの日の月） */
	selected: string;
	today: string;
	onPick: (date: string) => void;
}

function weekendClass(weekday: number): string[] {
	return weekday === 6 ? ['is-sat'] : weekday === 0 ? ['is-sun'] : [];
}

/**
 * 測った日のカレンダー（月曜始まり）。測った日に色を付け、押すとその日の測定を見る。
 * 測っていない日は押せない。右下の「最新」で最新の測定に戻る
 */
export class BodyCalendarModal extends Modal {
	private month: string;
	private readonly measured: Set<string>;

	constructor(
		app: App,
		private readonly options: BodyCalendarOptions,
	) {
		super(app);
		this.month = monthOf(options.selected);
		this.measured = new Set(options.dates);
	}

	onOpen(): void {
		this.setTitle(t('body.calendarTitle'));
		this.contentEl.addClass('fitness-log-body-calendar');
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl, options } = this;
		contentEl.empty();
		const head = contentEl.createDiv({ cls: 'fitness-log-cal-head' });
		iconButton(head, 'chevron-left', t('routines.prevMonth'), () => {
			this.month = addMonths(this.month, -1);
			this.render();
		});
		const [year, month] = this.month.split('-').map(Number);
		head.createDiv({
			cls: 'fitness-log-cal-title',
			text: t('routines.monthLabel', {
				year: year ?? '',
				month: month ?? '',
			}),
		});
		iconButton(head, 'chevron-right', t('routines.nextMonth'), () => {
			this.month = addMonths(this.month, 1);
			this.render();
		});

		const grid = contentEl.createDiv({
			cls: 'fitness-log-body-cal-grid fitness-log-pkg-color-0',
		});
		for (const weekday of WEEKDAY_ORDER)
			grid.createDiv({
				cls: ['fitness-log-cal-weekday', ...weekendClass(weekday)],
				text: weekdayLabel(weekday),
			});
		for (const week of monthWeeks(this.month))
			for (const date of week) {
				const measured = this.measured.has(date);
				const day = grid.createEl('button', {
					cls: [
						'fitness-log-body-cal-day',
						...weekendClass(weekdayOf(date)),
					],
					text: String(Number(date.slice(8))),
					attr: {
						type: 'button',
						'aria-label': `${formatMonthDay(date)} (${weekdayLabel(weekdayOf(date))})`,
						'aria-pressed': String(date === options.selected),
					},
				});
				day.toggleClass('is-other-month', monthOf(date) !== this.month);
				day.toggleClass('is-measured', measured);
				day.toggleClass('is-selected', date === options.selected);
				day.toggleClass('is-today', date === options.today);
				day.disabled = !measured;
				if (measured)
					day.addEventListener('click', () => {
						this.close();
						options.onPick(date);
					});
			}
		const footer = contentEl.createDiv({
			cls: 'fitness-log-body-cal-footer',
		});
		footer.createDiv({
			cls: 'fitness-log-muted fitness-log-body-cal-hint',
			text: t('body.calendarHint'),
		});
		const latest = [...this.measured].sort().pop();
		if (latest)
			textButton(footer, t('body.latest'), () => {
				this.close();
				options.onPick(latest);
			});
	}
}
