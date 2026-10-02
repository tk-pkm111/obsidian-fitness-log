import { setIcon } from 'obsidian';
import { t } from '../../i18n';
import { createResolver } from '../../lib/model/resolve';
import {
	createRoutine,
	deleteRoutine,
	setRoutineEnabled,
	updateRoutine,
} from '../../lib/model/catalog';
import type { PluginData, Routine } from '../../lib/model/types';
import {
	addMonths,
	calendarEntries,
	monthWeeks,
	packageColorIndex,
	type CalendarEntry,
} from '../../lib/schedule/calendar';
import {
	describeRule,
	WEEKDAY_ORDER,
	weekdayLabel,
} from '../../lib/schedule/routine';
import {
	addDays,
	formatMonthDay,
	monthOf,
	weekdayOf,
} from '../../lib/time/date';
import { iconButton, textButton } from '../helpers';
import { RoutineEditModal } from '../modals/routine-edit-modal';
import type { PageContext } from '../page-context';

/** パッケージの色の数（styles.css の .fitness-log-pkg-color-0〜7） */
const PACKAGE_COLORS = 8;

/**
 * ルーチンページ（実装計画 §5.4）: 月のカレンダー（やった・予定・スキップしたパッケージ）→ 選んだ日の中身
 * （パッケージと種目の一覧）→ 登録したルーチンの一覧
 */
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

	renderCalendar(ctx, el);

	el.createDiv({
		cls: 'fitness-log-subheading',
		text: t('routines.listTitle'),
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
}

interface CalendarState {
	/** 表示中の月 'YYYY-MM' */
	month: string;
	/** 選んだ日 */
	selected: string;
}

/** 月のカレンダー（月曜始まり）。日を押すと下にその日の中身 */
function renderCalendar(ctx: PageContext, el: HTMLElement): void {
	const { store, index } = ctx.services;
	const data = store.current;
	const state = ctx.pageState<CalendarState>('routineCalendar', () => ({
		month: monthOf(ctx.today),
		selected: ctx.today,
	}));
	const go = (month: string, selected?: string) => {
		state.month = month;
		if (selected) state.selected = selected;
		ctx.refresh();
	};

	const cal = el.createDiv({ cls: 'fitness-log-calendar' });
	const head = cal.createDiv({ cls: 'fitness-log-cal-head' });
	iconButton(head, 'chevron-left', t('routines.prevMonth'), () =>
		go(addMonths(state.month, -1)),
	);
	const [year, month] = state.month.split('-').map(Number);
	head.createDiv({
		cls: 'fitness-log-cal-title',
		text: t('routines.monthLabel', {
			year: year ?? '',
			month: month ?? '',
		}),
	});
	iconButton(head, 'chevron-right', t('routines.nextMonth'), () =>
		go(addMonths(state.month, 1)),
	);
	if (state.month !== monthOf(ctx.today))
		textButton(
			head,
			t('routines.thisMonth'),
			() => go(monthOf(ctx.today), ctx.today),
			{ cls: 'mod-quiet fitness-log-cal-today' },
		);

	const grid = cal.createDiv({ cls: 'fitness-log-cal-grid' });
	for (const weekday of WEEKDAY_ORDER)
		grid.createDiv({
			cls: ['fitness-log-cal-weekday', ...weekendClass(weekday)],
			text: weekdayLabel(weekday),
		});
	for (const week of monthWeeks(state.month))
		for (const date of week) {
			const entries = calendarEntries(
				date,
				data.routines,
				data.packages,
				index.day(date),
			);
			const cell = grid.createEl('button', {
				cls: ['fitness-log-cal-day', ...weekendClass(weekdayOf(date))],
				attr: {
					type: 'button',
					'aria-pressed': String(date === state.selected),
					'aria-label': `${formatMonthDay(date)} (${weekdayLabel(weekdayOf(date))}) ${entries
						.map((e) => e.name ?? t('today.other'))
						.join('、')}`,
				},
			});
			cell.toggleClass('is-other-month', monthOf(date) !== state.month);
			cell.toggleClass('is-today', date === ctx.today);
			cell.toggleClass('is-selected', date === state.selected);
			cell.toggleClass('is-past', date < ctx.today);
			cell.createSpan({
				cls: 'fitness-log-cal-date',
				text: String(Number(date.slice(8))),
			});
			const chips = cell.createDiv({ cls: 'fitness-log-cal-chips' });
			const shown = entries.slice(0, 3);
			for (const entry of shown) packageChip(chips, data, entry);
			if (entries.length > shown.length)
				chips.createSpan({
					cls: 'fitness-log-cal-more',
					text: `+${entries.length - shown.length}`,
				});
			cell.addEventListener('click', () =>
				go(
					monthOf(date) === state.month ? state.month : monthOf(date),
					date,
				),
			);
		}

	// 凡例: この月に出てくるパッケージの色と、塗り（やった）・枠（予定）
	const shownPackages = new Map<string, string>();
	for (const week of monthWeeks(state.month))
		for (const date of week)
			for (const entry of calendarEntries(
				date,
				data.routines,
				data.packages,
				index.day(date),
			))
				if (entry.packageId && entry.name)
					shownPackages.set(entry.packageId, entry.name);
	if (shownPackages.size > 0) {
		const legend = cal.createDiv({ cls: 'fitness-log-cal-legend' });
		for (const [packageId, name] of shownPackages) {
			const item = legend.createSpan({
				cls: 'fitness-log-cal-legend-item',
			});
			item.createSpan({
				cls: ['fitness-log-cal-dot', colorClass(data, packageId)],
			});
			item.createSpan({ text: name });
		}
		legend.createSpan({
			cls: 'fitness-log-cal-legend-note',
			text: t('routines.legendNote'),
		});
	}

	renderDayDetail(ctx, cal, state.selected);
}

function weekendClass(weekday: number): string[] {
	if (weekday === 6) return ['is-sat'];
	if (weekday === 0) return ['is-sun'];
	return [];
}

function colorClass(
	data: Readonly<PluginData>,
	packageId: string | null,
): string {
	const index =
		packageId === null
			? null
			: packageColorIndex(data.packages, packageId, PACKAGE_COLORS);
	return index === null
		? 'fitness-log-pkg-color-none'
		: `fitness-log-pkg-color-${index}`;
}

/** カレンダーの中のパッケージ名（やった＝塗り、予定＝枠、スキップ＝取り消し線） */
function packageChip(
	parent: HTMLElement,
	data: Readonly<PluginData>,
	entry: CalendarEntry,
): void {
	parent.createSpan({
		cls: [
			'fitness-log-cal-chip',
			`is-${entry.kind}`,
			colorClass(data, entry.packageId),
		],
		text: entry.name ?? t('today.other'),
	});
}

/** 選んだ日の中身: パッケージごとに状態・ルーチン・種目の一覧。予定はスキップ、スキップは戻せる */
function renderDayDetail(
	ctx: PageContext,
	parent: HTMLElement,
	date: string,
): void {
	const { store, index, controller } = ctx.services;
	const data = store.current;
	const day = index.day(date);
	const entries = calendarEntries(date, data.routines, data.packages, day);
	const box = parent.createDiv({ cls: 'fitness-log-cal-detail' });
	const head = box.createDiv({ cls: 'fitness-log-cal-detail-head' });
	const md = formatMonthDay(date);
	const wd = weekdayLabel(weekdayOf(date));
	const relative =
		date === ctx.today
			? t('date.today')
			: date === addDays(ctx.today, 1)
				? t('date.tomorrow')
				: date === addDays(ctx.today, -1)
					? t('date.yesterday')
					: null;
	head.createDiv({
		cls: 'fitness-log-cal-detail-title',
		text: relative
			? t('date.relative', { label: relative, md, wd })
			: t('date.plain', { md, wd }),
	});
	textButton(
		head,
		t('routines.openDay'),
		() =>
			ctx.navigate({
				page: 'today',
				date: date === ctx.today ? null : date,
				selectedId: null,
			}),
		{ icon: 'arrow-right', cls: 'mod-quiet' },
	);

	if (entries.length === 0) {
		box.createDiv({ cls: 'fitness-log-muted', text: t('routines.noPlan') });
		return;
	}
	const exercises = new Map(data.exercises.map((e) => [e.id, e.name]));
	const resolver = createResolver(data.packages);
	for (const entry of entries) {
		const item = box.createDiv({
			cls: ['fitness-log-cal-entry', `is-${entry.kind}`],
		});
		const title = item.createDiv({ cls: 'fitness-log-cal-entry-head' });
		title.createSpan({
			cls: ['fitness-log-cal-dot', colorClass(data, entry.packageId)],
		});
		title.createSpan({
			cls: 'fitness-log-cal-entry-name',
			text: entry.name ?? t('today.other'),
		});
		title.createSpan({
			cls: 'fitness-log-cal-entry-kind',
			text:
				entry.kind === 'done'
					? t('routines.kindDone')
					: entry.kind === 'skipped'
						? t('routines.kindSkipped')
						: t('routines.kindPlanned'),
		});
		if (entry.routine)
			item.createDiv({
				cls: 'fitness-log-muted',
				text: describeRule(entry.routine.rule),
			});

		// 種目: やった日は記録（種目とセット数）、予定はパッケージの種目
		const list = item.createEl('ol', { cls: 'fitness-log-planned-list' });
		if (entry.kind === 'done') {
			const session = day?.sessions.find((s) =>
				entry.packageId === null
					? s.name === null
					: s.name !== null &&
						resolver.resolve(s.name)?.id === entry.packageId,
			);
			for (const log of session?.exercises ?? [])
				if (log.sets.length > 0)
					list.createEl('li', {
						text: `${log.name} ・ ${t('routines.setsCount', { n: log.sets.length })}`,
					});
		} else {
			const pkg = data.packages.find((p) => p.id === entry.packageId);
			for (const it of pkg?.items ?? [])
				list.createEl('li', {
					text: exercises.get(it.exerciseId) ?? '?',
				});
		}

		const routine = entry.routine;
		if (routine && date >= ctx.today) {
			const actions = item.createDiv({
				cls: 'fitness-log-cal-entry-actions',
			});
			if (entry.kind === 'planned')
				textButton(
					actions,
					date === ctx.today ? t('today.skip') : t('today.skipDay'),
					() =>
						ctx.run(() => controller.skipRoutine(routine.id, date)),
					{ icon: 'skip-forward', cls: 'mod-quiet' },
				);
			else if (entry.kind === 'skipped')
				textButton(
					actions,
					t('routines.unskip'),
					() =>
						ctx.run(() =>
							controller.unskipRoutine(routine.id, date),
						),
					{ icon: 'rotate-ccw', cls: 'mod-quiet' },
				);
		}
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
