import { Menu, setIcon } from 'obsidian';
import { t } from '../../i18n';
import type { DayLog, SessionLog } from '../../lib/model/types';
import { weekdayLabel } from '../../lib/schedule/routine';
import {
	buildDayModel,
	latestFinishedSet,
	type SectionModel,
} from '../../lib/today/day-model';
import { dayOrdersFor, dayRemovedFor } from '../../lib/today/groups';
import { summarizeWorkout } from '../../lib/log/summary';
import { dayStatus } from '../../lib/today/progress';
import { restState } from '../../lib/today/rest';
import {
	addDays,
	formatHm,
	formatMonthDay,
	isDateString,
	weekdayOf,
} from '../../lib/time/date';
import { OTHER_SESSION } from '../../session/session-controller';
import { chooseExercise } from '../choose-exercise';
import { choosePackage } from '../choose-package';
import { iconButton, openNoteInNewTab, textButton } from '../helpers';
import { isLiveDate, type PageContext } from '../page-context';
import { endDayWithNotice, formatMinutes } from './today-actions';
import { renderSection } from './today-section';

/** 今日ページ（実装計画 §5.2） */
export function renderTodayPage(ctx: PageContext, el: HTMLElement): void {
	const { services, date, today } = ctx;
	const data = services.store.current;
	renderDateBar(ctx);

	const active = data.activeSet;
	renderElsewhereBanner(ctx, el);

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
		removed: dayRemovedFor(data, date),
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

	// 今日と、0 時をまたいで筋トレが続いている前の日は、タイマーで記録する
	const live = isLiveDate(ctx);
	// 休憩は最後にセットを終えた種目のすぐ下に出す（筋トレ中・その他のときだけ）
	const lastSet = live ? latestFinishedSet(day) : null;
	const rest = restState(sections, lastSet, live);
	const packagesInDay = new Set(
		sections.flatMap((s) => (s.inNote && s.pkg ? [s.pkg.id] : [])),
	);
	for (const section of sections)
		renderSection(ctx, list, section, {
			live,
			isFuture,
			session: sessionOf(day, section),
			rest,
			lastSet,
			packagesInDay,
		});

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
			addPackageLabel(sections),
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
		renderDayEnd(ctx, el, day, sections);
	}
}

/**
 * ほかの日で続いている筋トレ・進行中のセットの知らせ（その日へ移れる）。
 * 0 時をまたいで前の日の筋トレが続いている間に今日を見ていれば、今日の筋トレを始めると前の日の筋トレは
 * 今の時刻で終わることも知らせる（controller の closeOvernight）
 */
function renderElsewhereBanner(ctx: PageContext, el: HTMLElement): void {
	const { date, today, overnight } = ctx;
	const data = ctx.services.store.current;
	const active = data.activeSet;
	const elsewhere = overnight?.running ? overnight.date : active?.date;
	if (!elsewhere || elsewhere === date) return;
	const banner = el.createDiv({ cls: 'fitness-log-banner' });
	setIcon(banner.createSpan({ cls: 'fitness-log-banner-icon' }), 'timer');
	const text = banner.createDiv({ cls: 'fitness-log-banner-text' });
	const exercise =
		active?.date === elsewhere
			? data.exercises.find((e) => e.id === active.exerciseId)
			: undefined;
	text.createDiv({
		text: exercise
			? t('today.activeElsewhere', {
					exercise: exercise.name,
					date: formatMonthDay(elsewhere),
				})
			: t('today.overnightRunning', { date: formatMonthDay(elsewhere) }),
	});
	if (overnight?.running && date === today)
		text.createDiv({
			cls: 'fitness-log-banner-sub',
			text: t(
				exercise ? 'today.overnightEndsWithSet' : 'today.overnightEnds',
				{ date: formatMonthDay(elsewhere) },
			),
		});
	textButton(banner, t('today.goToActive'), () =>
		ctx.navigate({ date: elsewhere }),
	);
}

/**
 * その日の筋トレ全体（パッケージと単発の種目をまとめて 1 日の筋トレ）の終わり方。いちばん下に 1 つだけ出す:
 * 筋トレ中は右に「■ 筋トレを終了」（まとめて終える）。終えたあとは「お疲れ様でした」とその日のまとめ、
 * 今日（と 0 時をまたいだ前の日）なら右に「↻ 筋トレを再開」（まとめて再開する）
 */
function renderDayEnd(
	ctx: PageContext,
	el: HTMLElement,
	day: DayLog | undefined,
	sections: readonly SectionModel[],
): void {
	const live = isLiveDate(ctx);
	const status = dayStatus(sections, live);
	if (status === 'running') {
		const bar = el.createDiv({ cls: 'fitness-log-day-end' });
		textButton(bar, t('session.end'), () => endDayWithNotice(ctx), {
			icon: 'square',
			cls: 'fitness-log-end-button',
		});
		return;
	}
	if (status !== 'finished' || !day) return;
	const summary = summarizeWorkout(day);
	const done = el.createDiv({ cls: 'fitness-log-finished' });
	setIcon(done.createSpan({ cls: 'fitness-log-finished-icon' }), 'trophy');
	const text = done.createDiv({ cls: 'fitness-log-finished-text' });
	text.createDiv({
		cls: 'fitness-log-finished-title',
		text: t('session.finished'),
	});
	const stats = [
		...(summary.start && summary.end
			? [
					t('today.timeRange', {
						start: formatHm(summary.start),
						end: formatHm(summary.end),
					}),
					formatMinutes(summary.durationMin),
				]
			: []),
		t('session.summary', {
			exercises: summary.exercises,
			sets: summary.sets,
		}),
	];
	// 「3 セット」などの途中で折り返さないよう、項目ごとに折り返さない
	const statsEl = text.createDiv({ cls: 'fitness-log-finished-stats' });
	stats.forEach((stat, i) => {
		if (i > 0) statsEl.appendText(' ・ ');
		statsEl.createSpan({ cls: 'fitness-log-finished-stat', text: stat });
	});
	const buttons = done.createDiv({ cls: 'fitness-log-finished-buttons' });
	const file = ctx.services.repository.fileFor(ctx.date);
	if (file)
		textButton(
			buttons,
			t('today.openNote'),
			() => openNoteInNewTab(ctx.app, file.path),
			{ icon: 'file-text', cls: 'mod-quiet' },
		);
	// 再開は今日（と 0 時をまたいだ前の日）だけ（過去の日はタイマーで続きのセットを計れない）
	if (live)
		textButton(
			buttons,
			t('session.resume'),
			() => ctx.run(() => ctx.services.controller.resumeDay(ctx.date)),
			{
				icon: 'rotate-ccw',
				cls: 'fitness-log-end-button fitness-log-resume-button',
			},
		);
}

/**
 * ヘッダーの日付ナビ（TaskChute と同じ並び）: ‹ ［📅 今日 (10/1 木)］ ›。
 * 日付の部分を押すと日付を選べる（スマホは OS の日付ピッカー）。今日以外を見ているときは右上に「今日」。
 */
function renderDateBar(ctx: PageContext): void {
	const { date, today } = ctx;
	const bar = ctx.header.center.createDiv({ cls: 'fitness-log-date-bar' });
	// 今日を選んだら今日を追う（0 時をまたいで筋トレが続いている間は、今日の日付のまま。navigate が決める）
	const go = (target: string) => ctx.navigate({ date: target });
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

/** その日にもうパッケージがあれば「別のパッケージを追加」（同じ日に 2 つ目をこなす） */
function addPackageLabel(sections: readonly SectionModel[]): string {
	return sections.some((s) => !s.isOther)
		? t('today.addAnotherPackage')
		: t('today.addPackage');
}

/** 右上の ＋: パッケージ・単発の種目を追加 */
function renderAddMenu(
	ctx: PageContext,
	sections: readonly SectionModel[],
): void {
	iconButton(ctx.header.actions, 'plus', t('today.addMenu'), (event) => {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle(addPackageLabel(sections))
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
	choosePackage(ctx, {
		title: addPackageLabel(sections),
		exclude: new Set(
			sections.map((s) => s.pkg?.id).filter((id) => id !== undefined),
		),
		onChoose: (pkg) =>
			ctx.run(() =>
				ctx.services.controller.addPackageToDay(ctx.date, pkg.id),
			),
	});
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
