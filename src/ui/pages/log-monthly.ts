import { t } from '../../i18n';
import { monthlyOverview } from '../../lib/history/overview';
import { weekdayLabel } from '../../lib/schedule/routine';
import { formatMonthDay, weekdayOf } from '../../lib/time/date';
import { toDisplayWeight } from '../../lib/units';
import { iconButton, openNoteInNewTab, textButton } from '../helpers';
import type { PageContext } from '../page-context';

const numberFormat = new Intl.NumberFormat('ja-JP', {
	maximumFractionDigits: 1,
});

/** ログページの「月ごとの一覧」: 日付・パッケージ・セット数・ボリューム。日付を押すとその日の画面へ */
export function renderMonthly(ctx: PageContext, el: HTMLElement): void {
	const { index, repository, store } = ctx.services;
	const unit = store.settings.weightUnit;
	const months = monthlyOverview(index.allDays());
	if (months.length === 0) {
		el.createDiv({ cls: 'fitness-log-empty', text: t('log.noHistory') });
		return;
	}
	for (const month of months) {
		const [year, mm] = month.month.split('-');
		const header = el.createDiv({ cls: 'fitness-log-month-header' });
		header.createSpan({
			cls: 'fitness-log-month-title',
			text: t('log.month', { year: year ?? '', month: Number(mm) }),
		});
		header.createSpan({
			cls: 'fitness-log-muted',
			text: t('log.monthSummary', {
				days: month.activeDays,
				sets: month.sets,
				volume: `${numberFormat.format(Math.round(toDisplayWeight(month.volumeKg, unit)))} ${unit}`,
			}),
		});
		const table = el.createDiv({ cls: 'fitness-log-table' });
		for (const day of month.days) {
			const row = table.createDiv({ cls: 'fitness-log-table-row' });
			const go = row.createEl('button', {
				cls: 'fitness-log-table-main',
				attr: { type: 'button' },
			});
			go.createSpan({
				cls: 'fitness-log-table-date',
				text: `${formatMonthDay(day.date)} (${weekdayLabel(weekdayOf(day.date))})`,
			});
			const body = go.createSpan({ cls: 'fitness-log-table-body' });
			body.createSpan({
				text:
					day.packages.length > 0
						? day.packages.join('、')
						: t('today.other'),
			});
			body.createSpan({
				cls: 'fitness-log-muted',
				text: t('log.daySummary', {
					sets: day.sets,
					volume: `${numberFormat.format(Math.round(toDisplayWeight(day.volumeKg, unit)))} ${unit}`,
					minutes: day.durationMin,
				}),
			});
			go.addEventListener('click', () =>
				ctx.navigate({
					page: 'today',
					date: day.date === ctx.today ? null : day.date,
				}),
			);
			const file = repository.fileFor(day.date);
			if (file)
				iconButton(row, 'file-text', t('today.openNote'), () =>
					openNoteInNewTab(ctx.app, file.path),
				);
		}
	}
	const footer = el.createDiv({ cls: 'fitness-log-footer' });
	textButton(
		footer,
		t('command.createBases'),
		() => ctx.services.createBasesFile(),
		{
			icon: 'table',
		},
	);
}
