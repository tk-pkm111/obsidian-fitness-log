import { Menu, setIcon } from 'obsidian';
import { t } from '../../i18n';
import { sessionSpan, summarizeSession } from '../../lib/log/summary';
import type { SessionLog } from '../../lib/model/types';
import { describeRule } from '../../lib/schedule/routine';
import type { CardModel, SectionModel } from '../../lib/today/day-model';
import {
	groupCards,
	isReorderable,
	reorderWithinGroup,
	type CardGroup,
} from '../../lib/today/groups';
import { sectionProgress } from '../../lib/today/progress';
import type { RestState } from '../../lib/today/rest';
import { formatDuration, formatHm, parseTime } from '../../lib/time/date';
import { chooseExercise } from '../choose-exercise';
import { iconButton, openNoteInNewTab, textButton } from '../helpers';
import { TextPromptModal } from '../modals/text-prompt-modal';
import type { PageContext } from '../page-context';
import { dragHandle, makeSortable, type SortableEntry } from '../sortable';
import {
	endSessionWithNotice,
	formatMinutes,
	sectionRef,
} from './today-actions';
import { renderExerciseCard, type CardEnv } from './today-card';

export interface SectionEnv {
	isToday: boolean;
	isFuture: boolean;
	/** 別のパッケージが筋トレ中（開始ボタンを押せない） */
	anotherRunning: boolean;
	/** その日の日ノートのセッション */
	session: SessionLog | undefined;
	/** 休憩を出す種目（最後にセットを終えた種目。無ければ null） */
	rest: RestState | null;
}

/**
 * 今日ページの 1 セクション（パッケージ 1 つ分）。枠で囲まず、見出し（名前・状態・進み）と種目のリストで見せる。
 * - 予定（planned）: 種目名のチップと「▶ 筋トレを開始」
 * - 筋トレ中（in-progress）: 進みのバー、種目のリスト（やった順 → まだの種目）、「■ 筋トレを終了」
 * - 終了（finished）: 「お疲れ様でした」とまとめ（種目数・セット数）。「記録を見る」でやった種目だけを開いて修正
 * - その他（manual）: パッケージ外の種目。いつも開いていて、開始・終了は無い
 * 実行中のセットはその種目の行に、休憩は最後にセットを終えた種目のすぐ下に出す（today-card.ts）。
 */
export function renderSection(
	ctx: PageContext,
	parent: HTMLElement,
	section: SectionModel,
	env: SectionEnv,
): void {
	const expanded = ctx.pageState('todayExpanded', () => new Set<string>());
	const expandKey = `${ctx.date}:${section.key}`;
	const status = section.status;
	const box = parent.createDiv({
		cls: ['fitness-log-section', `is-${status}`],
	});

	renderHeader(ctx, box, section, env, expanded, expandKey);
	if (section.note)
		box.createDiv({ cls: 'fitness-log-section-note', text: section.note });

	switch (status) {
		case 'planned':
			if (expanded.has(expandKey) && !env.isFuture) {
				renderCards(
					ctx,
					box,
					section,
					section.cards,
					'manual',
					env.rest,
				);
				renderFooter(ctx, box, section, false);
			} else renderPlanned(ctx, box, section, env, expanded, expandKey);
			return;
		case 'in-progress':
			renderCards(
				ctx,
				box,
				section,
				section.cards,
				env.isToday ? 'timer' : 'manual',
				env.rest,
			);
			renderFooter(ctx, box, section, true);
			return;
		case 'finished':
			renderFinished(ctx, box, section, env, expanded, expandKey);
			return;
		case 'manual': {
			const mode = env.isFuture
				? 'readonly'
				: env.isToday
					? 'timer'
					: 'manual';
			renderCards(ctx, box, section, section.cards, mode, env.rest);
			if (mode !== 'readonly') renderFooter(ctx, box, section, false);
			return;
		}
	}
}

/** 状態の札（予定・筋トレ中・完了） */
function pill(
	parent: HTMLElement,
	cls: string,
	text: string,
	icon?: string,
): void {
	const el = parent.createSpan({ cls: ['fitness-log-pill', cls] });
	if (icon) setIcon(el.createSpan({ cls: 'fitness-log-pill-icon' }), icon);
	else el.createSpan({ cls: 'fitness-log-pill-dot' });
	el.createSpan({ text });
}

function renderHeader(
	ctx: PageContext,
	box: HTMLElement,
	section: SectionModel,
	env: SectionEnv,
	expanded: Set<string>,
	expandKey: string,
): void {
	const header = box.createDiv({ cls: 'fitness-log-section-header' });
	const titleWrap = header.createDiv({
		cls: 'fitness-log-section-title-wrap',
	});
	titleWrap.createDiv({
		cls: 'fitness-log-section-title',
		text: section.isOther ? t('today.other') : section.title,
	});
	const meta = titleWrap.createDiv({ cls: 'fitness-log-section-meta' });
	const item = (text: string, cls?: string) =>
		meta.createSpan({
			cls: ['fitness-log-meta-item', ...(cls ? [cls] : [])],
			text,
		});
	const progress = sectionProgress(section);

	switch (section.status) {
		case 'planned':
			pill(meta, 'is-planned', t('today.planned'), 'calendar');
			if (section.plannedBy) item(describeRule(section.plannedBy.rule));
			item(t('session.exerciseCount', { n: progress.totalExercises }));
			break;
		case 'in-progress': {
			pill(meta, 'is-live', t('session.inProgress'));
			const start =
				section.start ??
				(env.session ? sessionSpan(env.session)?.start : undefined);
			if (start) {
				item(t('session.started', { time: formatHm(start) }));
				const startSec = parseTime(start);
				if (env.isToday && startSec !== null) {
					const elapsed = item('', 'fitness-log-elapsed');
					ctx.addTicker((now) => {
						const nowSec =
							now.getHours() * 3600 +
							now.getMinutes() * 60 +
							now.getSeconds();
						elapsed.setText(
							t('session.elapsed', {
								time: formatDuration(
									(nowSec - startSec + 86_400) % 86_400,
								),
							}),
						);
					});
				}
			}
			item(
				t('session.progress', {
					done: progress.doneExercises,
					total: progress.totalExercises,
				}),
			);
			break;
		}
		case 'finished': {
			pill(meta, 'is-done', t('session.done'), 'check');
			const span = env.session ? sessionSpan(env.session) : null;
			const start = section.start ?? span?.start;
			const end = section.end ?? span?.end;
			if (start && end)
				item(
					t('today.timeRange', {
						start: formatHm(start),
						end: formatHm(end),
					}),
				);
			if (env.session)
				item(formatMinutes(summarizeSession(env.session).durationMin));
			break;
		}
		case 'manual':
			if (progress.sets > 0)
				item(
					t('session.summary', {
						exercises: progress.doneExercises,
						sets: progress.sets,
					}),
				);
			break;
	}

	const actions = header.createDiv({ cls: 'fitness-log-section-actions' });
	const memo = iconButton(
		actions,
		'message-square',
		t('today.editMemo'),
		() => editMemo(ctx, section),
	);
	memo.toggleClass('has-comment', section.note.length > 0);
	iconButton(actions, 'more-horizontal', t('today.sectionMenu'), (event) =>
		openSectionMenu(ctx, section, env, expanded, expandKey, event),
	);

	// 筋トレ中は進みを細いバーで（何種目のうち何種目やったか）
	if (section.status === 'in-progress' && progress.totalExercises > 0) {
		const bar = box.createDiv({ cls: 'fitness-log-section-progress' });
		bar.createDiv({ cls: 'fitness-log-section-progress-fill' }).setCssProps(
			{
				'--fitness-log-progress': String(
					progress.doneExercises / progress.totalExercises,
				),
			},
		);
	}
}

function openSectionMenu(
	ctx: PageContext,
	section: SectionModel,
	env: SectionEnv,
	expanded: Set<string>,
	expandKey: string,
	event: MouseEvent,
): void {
	const { services, date } = ctx;
	const ref = sectionRef(section);
	const plannedBy = section.plannedBy;
	const menu = new Menu();
	menu.addItem((item) =>
		item
			.setTitle(t('today.editMemo'))
			.setIcon('message-square')
			.onClick(() => editMemo(ctx, section)),
	);
	const hasSets = section.cards.some((c) => c.sets.length > 0);
	const hasActive = section.cards.some((c) => c.active);
	// 再開は今日だけ（過去の日はタイマーで続きのセットを計れない）
	if (
		section.status === 'finished' &&
		!section.isOther &&
		section.pkg &&
		date === ctx.today
	)
		menu.addItem((item) =>
			item
				.setTitle(t('session.resume'))
				.setIcon('rotate-ccw')
				.onClick(() =>
					ctx.run(() => services.controller.resumeSession(date, ref)),
				),
		);
	if (
		section.status === 'planned' &&
		!env.isFuture &&
		!expanded.has(expandKey)
	)
		menu.addItem((item) =>
			item
				.setTitle(t('session.addRecords'))
				.setIcon('plus')
				.onClick(() => {
					expanded.add(expandKey);
					ctx.navigate({});
				}),
		);
	if (section.inNote && !hasSets && !hasActive)
		menu.addItem((item) =>
			item
				.setTitle(t('today.removeFromDay'))
				.setIcon('x')
				.onClick(() =>
					ctx.run(() =>
						services.controller.removeSessionFromDay(date, ref),
					),
				),
		);
	if (plannedBy && section.status === 'planned')
		menu.addItem((item) =>
			item
				.setTitle(
					date === ctx.today ? t('today.skip') : t('today.skipDay'),
				)
				.setIcon('skip-forward')
				.onClick(() =>
					ctx.run(() =>
						services.controller.skipRoutine(plannedBy.id, date),
					),
				),
		);
	const file = services.repository.fileFor(date);
	if (file)
		menu.addItem((item) =>
			item
				.setTitle(t('today.openNote'))
				.setIcon('file-text')
				.onClick(() => openNoteInNewTab(ctx.app, file.path)),
		);
	menu.showAtMouseEvent(event);
}

/** 予定: やる順の種目の一覧（区切りごと）と「▶ 筋トレを開始」 */
function renderPlanned(
	ctx: PageContext,
	box: HTMLElement,
	section: SectionModel,
	env: SectionEnv,
	expanded: Set<string>,
	expandKey: string,
): void {
	const { services, date } = ctx;
	if (section.cards.length > 0) {
		// やる順に番号付きで（区切りがあれば見出しを挟み、番号は続きから）
		const list = box.createDiv({ cls: 'fitness-log-planned' });
		let number = 1;
		for (const group of cardGroups(ctx, section, section.cards)) {
			const label = groupLabel(group);
			if (label)
				list.createDiv({
					cls: 'fitness-log-planned-group',
					text: label,
				});
			const ol = list.createEl('ol', {
				cls: 'fitness-log-planned-list',
				attr: { start: String(number) },
			});
			for (const card of group.cards)
				ol.createEl('li', { text: card.name });
			number += group.cards.length;
		}
	}
	if (env.isFuture) return;
	const actions = box.createDiv({ cls: 'fitness-log-session-actions' });
	const pkg = section.pkg;
	if (env.isToday && pkg) {
		const start = textButton(
			actions,
			t('session.start'),
			() => ctx.run(() => services.controller.startSession(date, pkg.id)),
			{
				icon: 'play',
				cta: !env.anotherRunning,
				cls: 'fitness-log-session-button',
			},
		);
		start.disabled = env.anotherRunning;
		if (env.anotherRunning)
			actions.createSpan({
				cls: 'fitness-log-muted',
				text: t('session.anotherRunning'),
			});
	} else {
		// 過去の日: タイマーを使わずに記録を足す
		textButton(
			actions,
			t('session.addRecords'),
			() => {
				expanded.add(expandKey);
				ctx.navigate({});
			},
			{ icon: 'plus', cls: 'fitness-log-session-button' },
		);
	}
	const plannedBy = section.plannedBy;
	if (plannedBy)
		textButton(
			actions,
			date === ctx.today ? t('today.skip') : t('today.skipDay'),
			() =>
				ctx.run(() =>
					services.controller.skipRoutine(plannedBy.id, date),
				),
			{ cls: 'mod-quiet' },
		);
}

/** 終了: 「お疲れ様でした」とまとめ。「記録を見る」でやった種目だけを開いて修正できる */
function renderFinished(
	ctx: PageContext,
	box: HTMLElement,
	section: SectionModel,
	env: SectionEnv,
	expanded: Set<string>,
	expandKey: string,
): void {
	const summary = env.session ? summarizeSession(env.session) : null;
	const done = box.createDiv({ cls: 'fitness-log-finished' });
	setIcon(done.createSpan({ cls: 'fitness-log-finished-icon' }), 'trophy');
	const text = done.createDiv({ cls: 'fitness-log-finished-text' });
	text.createDiv({
		cls: 'fitness-log-finished-title',
		text: t('session.finished'),
	});
	if (summary)
		text.createDiv({
			cls: 'fitness-log-finished-stats',
			text: t('session.summary', {
				exercises: summary.exercises,
				sets: summary.sets,
			}),
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
	const open = expanded.has(expandKey);
	textButton(
		buttons,
		open ? t('session.hideRecords') : t('session.showRecords'),
		() => {
			if (open) expanded.delete(expandKey);
			else expanded.add(expandKey);
			ctx.navigate({});
		},
		{ icon: open ? 'chevron-up' : 'chevron-down', cls: 'mod-quiet' },
	);
	if (!open) return;
	// やった種目だけ（やらなかった種目を並べても修正には要らない）。足すときは「種目を追加」
	renderCards(
		ctx,
		box,
		section,
		section.cards.filter((c) => c.sets.length > 0),
		env.isFuture ? 'readonly' : 'manual',
		env.rest,
	);
	if (!env.isFuture) renderFooter(ctx, box, section, false);
}

/** 種目のリスト（パッケージの区切りごと）。今日の筋トレ中は、まだの種目を ⋮⋮ で並べ替えられる */
function renderCards(
	ctx: PageContext,
	box: HTMLElement,
	section: SectionModel,
	cards: readonly CardModel[],
	mode: CardEnv['mode'],
	rest: RestState | null,
): void {
	const cardEnv: CardEnv = { isToday: ctx.date === ctx.today, mode, rest };
	const groups = cardGroups(ctx, section, cards);
	for (const group of groups) {
		if (group.cards.length === 0) continue;
		const label = groups.length > 1 ? groupLabel(group) : null;
		if (label)
			box.createDiv({ cls: 'fitness-log-card-group-title', text: label });
		const list = box.createDiv({ cls: 'fitness-log-cards' });
		// ⋮⋮ は開始ボタンの左（行の左端）。並べ替えられない行（やった・実行中）は同じ幅を空けて揃える
		const sortable =
			mode === 'timer' && group.cards.some((c) => isReorderable(c));
		list.toggleClass('has-handles', sortable);
		const entries: SortableEntry[] = [];
		for (const card of group.cards) {
			const { box: cardEl, header } = renderExerciseCard(
				ctx,
				list,
				section,
				card,
				cardEnv,
			);
			if (!sortable) continue;
			if (isReorderable(card)) {
				const handle = dragHandle(
					header,
					t('drag.handle'),
					`drag-card-${section.key}-${card.key}`,
				);
				header.prepend(handle);
				entries.push({ el: cardEl, handle });
			} else
				header.prepend(createSpan({ cls: 'fitness-log-drag-spacer' }));
		}
		makeSortable(entries, (from, to) =>
			ctx.run(() =>
				ctx.services.controller.reorderDay(
					ctx.date,
					section.key,
					reorderWithinGroup(section.cards, group.cards, from, to),
				),
			),
		);
	}
}

/** リストの下: 「＋ 種目を追加」と（筋トレ中は）「■ 筋トレを終了」 */
function renderFooter(
	ctx: PageContext,
	box: HTMLElement,
	section: SectionModel,
	withEnd: boolean,
): void {
	const footer = box.createDiv({ cls: 'fitness-log-section-footer' });
	textButton(
		footer,
		t('today.addExercise'),
		() =>
			chooseExerciseForSection(ctx, section, (exerciseId) =>
				ctx.run(() =>
					ctx.services.controller.addExerciseToDay(
						ctx.date,
						sectionRef(section),
						exerciseId,
					),
				),
			),
		{ icon: 'plus', cls: 'mod-quiet' },
	);
	if (withEnd)
		textButton(
			footer,
			t('session.end'),
			() => endSessionWithNotice(ctx, section),
			{ icon: 'square', cls: 'fitness-log-end-button' },
		);
}

/** パッケージのセクション（区切り）ごとのカード。設定で使わないときは 1 つ */
function cardGroups(
	ctx: PageContext,
	section: SectionModel,
	cards: readonly CardModel[],
): CardGroup[] {
	return groupCards(
		cards,
		section.pkg,
		ctx.services.store.settings.packageSections,
	);
}

function groupLabel(group: CardGroup): string | null {
	if (group.kind === 'section') return group.section?.name ?? null;
	if (group.kind === 'extra') return t('today.extraGroup');
	return null;
}

function editMemo(ctx: PageContext, section: SectionModel): void {
	new TextPromptModal(ctx.app, {
		title: `${t('memo.title')}: ${section.isOther ? t('today.other') : section.title}`,
		initial: section.note,
		placeholder: t('memo.placeholder'),
		submitText: t('memo.save'),
		onSubmit: (note) =>
			ctx.run(() =>
				ctx.services.controller.setSessionNote(
					ctx.date,
					sectionRef(section),
					note,
				),
			),
	}).open();
}

/** セクションに種目を足す（既に並んでいる種目は候補から外す） */
function chooseExerciseForSection(
	ctx: PageContext,
	section: SectionModel,
	onChoose: (exerciseId: string) => void,
): void {
	const exclude = new Set(
		section.cards
			.map((c) => c.exercise?.id)
			.filter((id): id is string => id !== undefined),
	);
	chooseExercise(ctx, (exercise) => onChoose(exercise.id), exclude);
}
