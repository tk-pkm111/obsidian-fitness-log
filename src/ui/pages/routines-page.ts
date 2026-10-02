import { setIcon } from 'obsidian';
import { t } from '../../i18n';
import {
	createRoutine,
	deleteRoutine,
	setRoutineEnabled,
	updateRoutine,
} from '../../lib/model/catalog';
import type { Routine } from '../../lib/model/types';
import {
	describeRule,
	routinesForDate,
	weekdayLabel,
} from '../../lib/schedule/routine';
import { addDays, formatMonthDay, weekdayOf } from '../../lib/time/date';
import { textButton } from '../helpers';
import { RoutineEditModal } from '../modals/routine-edit-modal';
import type { PageContext } from '../page-context';

/** ルーチンページ（実装計画 §5.4） */
export function renderRoutinesPage(ctx: PageContext, el: HTMLElement): void {
	const { store } = ctx.services;
	const data = store.current;
	const packages = new Map(data.packages.map((p) => [p.id, p]));

	const toolbar = el.createDiv({ cls: 'fitness-log-toolbar' });
	const add = textButton(toolbar, t('routines.new'), () => openEditor(ctx), {
		icon: 'plus',
		cta: true,
	});
	add.disabled = data.packages.length === 0;
	if (data.packages.length === 0)
		toolbar.createSpan({
			cls: 'fitness-log-muted',
			text: t('routines.noPackages'),
		});

	if (data.routines.length === 0) {
		el.createDiv({ cls: 'fitness-log-empty', text: t('routines.empty') });
	} else {
		const list = el.createDiv({ cls: 'fitness-log-list' });
		for (const routine of data.routines) {
			const pkg = packages.get(routine.packageId);
			const row = list.createDiv({
				cls: 'fitness-log-list-row fitness-log-routine-row',
			});
			row.toggleClass('is-archived', !routine.enabled);
			const body = row.createDiv({ cls: 'fitness-log-list-body' });
			body.createDiv({
				cls: 'fitness-log-list-title',
				text: pkg?.name ?? '?',
			});
			const period = routine.endDate
				? t('routines.periodEnd', {
						start: formatMonthDay(routine.startDate),
						end: formatMonthDay(routine.endDate),
					})
				: t('routines.period', {
						start: formatMonthDay(routine.startDate),
					});
			body.createDiv({
				cls: 'fitness-log-muted',
				text: `${describeRule(routine.rule)} ・ ${period}`,
			});
			body.addEventListener('click', () => openEditor(ctx, routine));

			const toggle = row.createEl('label', { cls: 'fitness-log-switch' });
			const input = toggle.createEl('input', {
				type: 'checkbox',
				attr: {
					'aria-label': routine.enabled
						? t('routines.enabled')
						: t('routines.disabled'),
				},
			});
			input.checked = routine.enabled;
			toggle.createSpan({
				cls: 'fitness-log-muted',
				text: routine.enabled
					? t('routines.enabled')
					: t('routines.disabled'),
			});
			input.addEventListener('change', () =>
				ctx.run(() =>
					store.update((d) =>
						setRoutineEnabled(d, routine.id, input.checked),
					),
				),
			);
			setIcon(
				row.createSpan({ cls: 'fitness-log-list-chevron' }),
				'chevron-right',
			);
		}
	}

	// この先 1 週間の予定（ルールの確認用）
	el.createDiv({
		cls: 'fitness-log-subheading',
		text: t('routines.upcoming'),
	});
	const upcoming = el.createDiv({ cls: 'fitness-log-upcoming' });
	for (let i = 0; i < 7; i++) {
		const date = addDays(ctx.today, i);
		const names = routinesForDate(data.routines, date)
			.map((r) => packages.get(r.packageId)?.name)
			.filter((n) => n !== undefined);
		const row = upcoming.createEl('button', {
			cls: 'fitness-log-upcoming-row',
			attr: { type: 'button' },
		});
		row.createSpan({
			cls: 'fitness-log-upcoming-date',
			text: `${formatMonthDay(date)} (${weekdayLabel(weekdayOf(date))})`,
		});
		row.createSpan({
			cls: names.length > 0 ? '' : 'fitness-log-muted',
			text: names.length > 0 ? names.join('、') : t('routines.nothing'),
		});
		row.addEventListener('click', () =>
			ctx.navigate({
				page: 'today',
				date: date === ctx.today ? null : date,
				selectedId: null,
			}),
		);
	}
}

function openEditor(ctx: PageContext, routine?: Routine): void {
	const { store } = ctx.services;
	new RoutineEditModal(ctx.app, {
		routine,
		packages: store.current.packages,
		today: ctx.today,
		onSave: (fields) =>
			store.update((d) => {
				if (routine) updateRoutine(d, routine.id, fields);
				else createRoutine(d, fields);
			}),
		onDelete: routine
			? () =>
					ctx.run(() =>
						store.update((d) => deleteRoutine(d, routine.id)),
					)
			: undefined,
	}).open();
}
