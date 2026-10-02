import { Menu, setIcon } from 'obsidian';
import { t } from '../../i18n';
import type { DayLog, SessionLog } from '../../lib/model/types';
import { weekdayLabel } from '../../lib/schedule/routine';
import {
	buildDayModel,
	latestFinishedSet,
	type SectionModel,
} from '../../lib/today/day-model';
import { dayOrdersFor } from '../../lib/today/groups';
import { nowState } from '../../lib/today/now';
import {
	addDays,
	formatMonthDay,
	isDateString,
	weekdayOf,
} from '../../lib/time/date';
import { OTHER_SESSION } from '../../session/session-controller';
import { chooseExercise } from '../choose-exercise';
import { iconButton, openNoteInNewTab, textButton } from '../helpers';
import { PackageSuggestModal } from '../modals/package-suggest-modal';
import type { PageContext } from '../page-context';
import { renderNowBar } from './today-now';
import { renderSection } from './today-section';

/** 今日ページ（実装計画 §5.2） */
export function renderTodayPage(ctx: PageContext, el: HTMLElement): void {
	const { services, date, today } = ctx;
	const data = services.store.current;
	renderDateBar(ctx);

	const active = data.activeSet;
	if (active && active.date !== date) {
		const exercise = data.exercises.find((e) => e.id === active.exerciseId);
		const banner = el.createDiv({ cls: 'fitness-log-banner' });
		setIcon(banner.createSpan({ cls: 'fitness-log-banner-icon' }), 'timer');
		banner.createSpan({
			text: t('today.activeElsewhere', {
				exercise: exercise?.name ?? '',
				date: formatMonthDay(active.date),
			}),
		});
		textButton(banner, t('today.goToActive'), () =>
			ctx.navigate({ date: active.date === today ? null : active.date }),
		);
	}

	const error = services.index.errorFor(date);
	if (error) {
		const callout = el.createDiv({ cls: 'fitness-log-banner mod-warning' });
		callout.createSpan({
			text: t('today.noteError', { reason: error.reason }),
		});
		textButton(callout, t('today.openNote'), () =>
			openNoteInNewTab(ctx.app, error.path),
		);
	}

	const isFuture = date > today;
	if (isFuture)
		el.createDiv({ cls: 'fitness-log-hint', text: t('today.futureHint') });

	const day = services.index.day(date);
	const sections = buildDayModel({
		date,
		day,
		packages: data.packages,
		exercises: data.exercises,
		routines: data.routines,
		activeSet: active,
		orders: dayOrdersFor(data, date),
	});

	const list = el.createDiv({ cls: 'fitness-log-sections' });
	const isEmpty = sections.length === 0 && services.index.isBuilt;
	if (isEmpty) {
		const empty = list.createDiv({ cls: 'fitness-log-empty' });
		setIcon(empty.createDiv({ cls: 'fitness-log-empty-icon' }), 'dumbbell');
		empty.createDiv({
			cls: 'fitness-log-empty-title',
			text: t('today.empty'),
		});
		empty.createDiv({
			cls: 'fitness-log-muted',
			text: t('today.emptyHint'),
		});
	}

	const isToday = date === today;
	const running = sections.filter((s) => s.status === 'in-progress');
	for (const section of sections)
		renderSection(ctx, list, section, {
			isToday,
			isFuture,
			anotherRunning: running.some((s) => s !== section),
			session: sessionOf(day, section),
		});

	// 画面の下の「いま」（実行中のセット・休憩・次の一手）。今日だけ
	const now = nowState(
		sections,
		isToday ? latestFinishedSet(day) : null,
		isToday,
	);
	if (now) renderNowBar(ctx, now);

	// 「今日はスキップ」した予定（取り消せるように残す）
	const skipped = data.routines.filter((r) => r.skipDates.includes(date));
	if (skipped.length > 0) {
		const row = el.createDiv({ cls: 'fitness-log-skipped' });
		row.createSpan({
			cls: 'fitness-log-muted',
			text: t('routines.skippedToday'),
		});
		for (const routine of skipped) {
			const pkg = data.packages.find((p) => p.id === routine.packageId);
			if (!pkg) continue;
			const chip = row.createSpan({ cls: 'fitness-log-skipped-item' });
			chip.createSpan({ text: pkg.name });
			textButton(
				chip,
				t('routines.unskip'),
				() =>
					ctx.run(() =>
						services.controller.unskipRoutine(routine.id, date),
					),
				{ cls: 'mod-quiet' },
			);
		}
	}

	if (!isFuture) {
		renderAddMenu(ctx, sections);
		const footer = el.createDiv({ cls: 'fitness-log-footer' });
		if (isEmpty) footer.addClass('is-empty-actions');
		textButton(
			footer,
			t('today.addPackage'),
			() => chooseAndAddPackage(ctx, sections),
			{ icon: 'plus', cta: isEmpty },
		);
		textButton(
			footer,
			t('today.addOtherExercise'),
			() => chooseOtherExercise(ctx),
			{
				icon: 'plus',
			},
		);
	}
}

/**
 * ヘッダーの日付ナビ（TaskChute と同じ並び）: ‹ ［📅 今日 (10/1 木)］ ›。
 * 日付の部分を押すと日付を選べる（スマホは OS の日付ピッカー）。今日以外を見ているときは右上に「今日」。
 */
function renderDateBar(ctx: PageContext): void {
	const { date, today } = ctx;
	const bar = ctx.header.center.createDiv({ cls: 'fitness-log-date-bar' });
	const go = (target: string) =>
		ctx.navigate({ date: target === today ? null : target });
	iconButton(bar, 'chevron-left', t('date.prev'), () =>
		go(addDays(date, -1)),
	);
	const md = formatMonthDay(date);
	const wd = weekdayLabel(weekdayOf(date));
	const relative =
		date === today
			? t('date.today')
			: date === addDays(today, -1)
				? t('date.yesterday')
				: date === addDays(today, 1)
					? t('date.tomorrow')
					: null;
	const picker = bar.createDiv({ cls: 'fitness-log-date-picker' });
	setIcon(picker.createSpan({ cls: 'fitness-log-date-icon' }), 'calendar');
	picker.createSpan({
		cls: 'fitness-log-date-label',
		text: relative
			? t('date.relative', { label: relative, md, wd })
			: t('date.plain', { md, wd }),
	});
	// 透明な日付入力を重ねる（スマホはタップで OS のピッカー、デスクトップは showPicker で開く）
	const input = picker.createEl('input', {
		type: 'date',
		cls: 'fitness-log-date-input',
		value: date,
		attr: { 'aria-label': t('date.pick') },
	});
	input.addEventListener('click', () => {
		try {
			input.showPicker();
		} catch {
			// showPicker が使えない環境では、そのままの入力欄の動作に任せる
		}
	});
	input.addEventListener('change', () => {
		if (isDateString(input.value)) go(input.value);
	});
	iconButton(bar, 'chevron-right', t('date.next'), () =>
		go(addDays(date, 1)),
	);
	if (date !== today)
		textButton(ctx.header.actions, t('date.goToday'), () => go(today), {
			cls: 'fitness-log-date-today',
		});
}

/** 右上の ＋: パッケージ・パッケージ外の種目を追加 */
function renderAddMenu(
	ctx: PageContext,
	sections: readonly SectionModel[],
): void {
	iconButton(ctx.header.actions, 'plus', t('today.addMenu'), (event) => {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle(t('today.addPackage'))
				.setIcon('package')
				.onClick(() => chooseAndAddPackage(ctx, sections)),
		);
		menu.addItem((item) =>
			item
				.setTitle(t('today.addOtherExercise'))
				.setIcon('dumbbell')
				.onClick(() => chooseOtherExercise(ctx)),
		);
		menu.showAtMouseEvent(event);
	});
}

function chooseOtherExercise(ctx: PageContext): void {
	chooseExercise(ctx, (exercise) =>
		ctx.run(() =>
			ctx.services.controller.addExerciseToDay(
				ctx.date,
				OTHER_SESSION,
				exercise.id,
			),
		),
	);
}

function chooseAndAddPackage(
	ctx: PageContext,
	sections: readonly SectionModel[],
): void {
	const { services } = ctx;
	const shown = new Set(
		sections.map((s) => s.pkg?.id).filter((id) => id !== undefined),
	);
	new PackageSuggestModal(ctx.app, {
		packages: services.store.current.packages.filter(
			(p) => !shown.has(p.id),
		),
		exercises: services.store.current.exercises,
		onChoose: (pkg) =>
			ctx.run(() =>
				services.controller.addPackageToDay(ctx.date, pkg.id),
			),
	}).open();
}

/** セクションに対応する日ノートのセッション（ノートに無ければ undefined） */
function sessionOf(
	day: DayLog | undefined,
	section: SectionModel,
): SessionLog | undefined {
	if (!day) return undefined;
	const index = section.cards.find((c) => c.source)?.source?.sessionIndex;
	if (index !== undefined) return day.sessions[index];
	return section.isOther
		? day.sessions.find((s) => s.name === null)
		: day.sessions.find(
				(s) =>
					s.name === section.sessionName &&
					section.sessionName !== null,
			);
}
