import { Menu, setIcon } from 'obsidian';
import { t } from '../../i18n';
import { sessionSpan, summarizeSession } from '../../lib/log/summary';
import type { SessionLog } from '../../lib/model/types';
import { describeRule } from '../../lib/schedule/routine';
import type {
	CardModel,
	LastSet,
	SectionModel,
} from '../../lib/today/day-model';
import { cardLayout, cardRole, totalSets } from '../../lib/today/focus';
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
import { choosePackage } from '../choose-package';
import { iconButton, openNoteInNewTab, textButton } from '../helpers';
import { ConfirmModal } from '../modals/confirm-modal';
import { TextPromptModal } from '../modals/text-prompt-modal';
import type { PageContext } from '../page-context';
import { dragHandle, makeSortable, type SortableEntry } from '../sortable';
import {
	focusOf,
	formatMinutes,
	removeExerciseFromDay,
	sectionRef,
} from './today-actions';
import { renderExerciseCard, type CardEnv } from './today-card';

export interface SectionEnv {
	isToday: boolean;
	isFuture: boolean;
	/** その日の日ノートのセッション */
	session: SessionLog | undefined;
	/** 休憩を出す種目（最後にセットを終えた種目。無ければ null） */
	rest: RestState | null;
	/** その日に最後に終えたセット（今日だけ。いまの種目を決める） */
	lastSet: LastSet | null;
	/** その日のノートにもうあるパッケージ（「別のパッケージに変える」の候補から外す） */
	packagesInDay: ReadonlySet<string>;
}

/**
 * 今日ページの 1 セクション（パッケージ 1 つ分）。枠で囲まず、見出し（名前・状態・進み）・全体のコメント・種目のリストで見せる。
 * - 予定（planned）: 種目名のチップと「▶ 筋トレを開始」
 * - 筋トレ中（in-progress）: 進みのバー、種目のリスト（やった順 → まだの種目）
 * - 終了（finished）: やった種目は「記録を見る（2 種目 ・ 3 セット）」の中にたたむ（開いて修正できる）
 * - 単発の種目（manual）: パッケージ外の種目。開始は無く、いつも開いている
 * 「筋トレを終了」「お疲れ様でした」「筋トレを再開」はセクションごとではなく、その日の画面のいちばん下に 1 つ
 * （パッケージと単発の種目をまとめて 1 日の筋トレ。today-page.ts）。
 * 名前の行の右端の × で、まとまりをその日から外せる（筋トレ中・終了後も。記録があれば確かめてから消す）
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
	renderNotes(ctx, box, section, env);

	switch (status) {
		case 'planned':
			if (expanded.has(expandKey) && !env.isFuture) {
				renderCards(ctx, box, section, section.cards, 'manual', env);
				renderFooter(ctx, box, section);
			} else renderPlanned(ctx, box, section, env, expanded, expandKey);
			return;
		case 'in-progress':
			renderCards(
				ctx,
				box,
				section,
				section.cards,
				env.isToday ? 'timer' : 'manual',
				env,
			);
			renderFooter(ctx, box, section);
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
			renderCards(ctx, box, section, section.cards, mode, env);
			if (mode !== 'readonly') renderFooter(ctx, box, section);
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
	const title = titleWrap.createDiv({ cls: 'fitness-log-section-title' });
	const pkg = section.pkg;
	if (pkg) {
		// パッケージ名を押すと、そのパッケージの編集画面へ（筋トレ中にすぐ直せるように）
		const link = title.createEl('a', {
			cls: 'fitness-log-section-link',
			href: '#',
			attr: { 'aria-label': t('today.editPackage') },
		});
		link.createSpan({ text: section.title });
		setIcon(
			link.createSpan({ cls: 'fitness-log-section-link-icon' }),
			'chevron-right',
		);
		link.addEventListener('click', (event) => {
			event.preventDefault();
			openPackageEditor(ctx, pkg.id);
		});
	} else title.setText(section.isOther ? t('today.other') : section.title);
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
	// 💬 は全体のコメントを 1 件足す（書いたものは名前の行の下に並ぶ。押すとその 1 件を直せる）
	const memo = iconButton(actions, 'message-square', t('today.addNote'), () =>
		addNote(ctx, section),
	);
	memo.toggleClass('has-comment', section.notes.length > 0);
	iconButton(actions, 'more-horizontal', t('today.sectionMenu'), (event) =>
		openSectionMenu(ctx, section, env, expanded, expandKey, event),
	);
	// まとまり（パッケージ・単発の種目）を外す × は名前の行の右端。種目の行の × と並ばないように、
	// 種目がいくつでも、まとまりの名前の隣にだけ置く。筋トレ中・終了後も同じ場所に出す
	if (canRemoveSection(section))
		iconButton(
			actions,
			'x',
			removeSectionLabel(section),
			() => confirmRemoveSection(ctx, section),
			'fitness-log-section-remove',
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
	const menu = new Menu();
	menu.addItem((item) =>
		item
			.setTitle(t('today.addNote'))
			.setIcon('message-square')
			.onClick(() => addNote(ctx, section)),
	);
	const pkg = section.pkg;
	if (pkg)
		menu.addItem((item) =>
			item
				.setTitle(t('today.editPackage'))
				.setIcon('sliders-horizontal')
				.onClick(() => openPackageEditor(ctx, pkg.id)),
		);
	// 記録はそのままで、別のパッケージに入れ替える（間違えて始めた・混んでいて別のメニューにした）
	if (!section.isOther && !env.isFuture)
		menu.addItem((item) =>
			item
				.setTitle(t('today.changePackage'))
				.setIcon('arrow-right-left')
				.onClick(() => changePackage(ctx, section, env)),
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
	if (canRemoveSection(section))
		menu.addItem((item) =>
			item
				.setTitle(removeSectionLabel(section))
				.setIcon('x')
				.onClick(() => confirmRemoveSection(ctx, section)),
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

/**
 * 予定: やる順の種目の一覧（区切りごと）と「▶ 筋トレを開始」。
 * 外すのは名前の行の右端の ×（renderHeader。確認してから。ルーチンの予定ならその日だけスキップ）
 */
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
		// 別のパッケージが筋トレ中でも始められる（終えるときは、その日の筋トレをまとめて終える）
		textButton(
			actions,
			t('session.start'),
			() => ctx.run(() => services.controller.startSession(date, pkg.id)),
			{ icon: 'play', cta: true, cls: 'fitness-log-session-button' },
		);
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
}

/**
 * まとまり（パッケージ・単発の種目）をその日から外せるか: ノートの見出し・ルーチンの予定（その日だけスキップ）・
 * 進行中のセットのどれかがあること。記録があっても外せる（確認で「記録した N セットも消えます」）
 */
function canRemoveSection(section: SectionModel): boolean {
	return (
		section.inNote ||
		section.plannedBy !== null ||
		section.cards.some((c) => c.active)
	);
}

function removeSectionLabel(section: SectionModel): string {
	return section.isOther ? t('today.removeOther') : t('today.removePackage');
}

/**
 * 「LEGS A ／ 今日の予定から外しますか？」（確認は短く）。記録があれば「記録した 3 セットも消えます。外しますか？」。
 * ルーチンの予定ならその日だけスキップ（今日の画面の「スキップ」から戻せる）
 */
function confirmRemoveSection(ctx: PageContext, section: SectionModel): void {
	const day =
		ctx.date === ctx.today ? t('today.dayToday') : t('today.dayThis');
	const sets = section.cards.reduce((n, c) => n + c.sets.length, 0);
	new ConfirmModal(ctx.app, {
		title: section.isOther ? t('today.other') : section.title,
		message:
			sets > 0
				? t('today.removeSectionConfirmSets', { n: sets })
				: t('today.removeSectionConfirm', { day }),
		confirmText: t('today.removeShort'),
		danger: sets > 0,
		onConfirm: () =>
			ctx.run(() =>
				ctx.services.controller.removeSessionFromDay(
					ctx.date,
					sectionRef(section),
				),
			),
	}).open();
}

/** 「別のパッケージに変える」: 選んだパッケージに入れ替える（記録・開始時刻・コメントはそのまま） */
function changePackage(
	ctx: PageContext,
	section: SectionModel,
	env: SectionEnv,
): void {
	const exclude = new Set(env.packagesInDay);
	if (section.pkg) exclude.add(section.pkg.id);
	choosePackage(ctx, {
		title: t('today.changePackage'),
		exclude,
		onChoose: (pkg) =>
			ctx.run(() =>
				ctx.services.controller.changeSessionPackage(
					ctx.date,
					sectionRef(section),
					pkg.id,
				),
			),
	});
}

/**
 * 終了: やった種目を「記録を見る（2 種目 ・ 3 セット）」の中にたたむ。開くとやった種目だけを修正できる
 * （やらなかった種目を並べても修正には要らない。足すときは「種目を追加」）。
 * 「お疲れ様でした」と「筋トレを再開」は、その日の画面のいちばん下に 1 つ（today-page.ts）
 */
function renderFinished(
	ctx: PageContext,
	box: HTMLElement,
	section: SectionModel,
	env: SectionEnv,
	expanded: Set<string>,
	expandKey: string,
): void {
	const progress = sectionProgress(section);
	const open = expanded.has(expandKey);
	const row = box.createDiv({ cls: 'fitness-log-finished-row' });
	textButton(
		row,
		open
			? t('session.hideRecords')
			: progress.sets > 0
				? t('session.showRecordsCount', {
						exercises: progress.doneExercises,
						sets: progress.sets,
					})
				: t('session.showRecords'),
		() => {
			if (open) expanded.delete(expandKey);
			else expanded.add(expandKey);
			ctx.navigate({});
		},
		{ icon: open ? 'chevron-up' : 'chevron-down', cls: 'mod-quiet' },
	);
	if (!open) return;
	renderCards(
		ctx,
		box,
		section,
		section.cards.filter((c) => c.sets.length > 0),
		env.isFuture ? 'readonly' : 'manual',
		env,
	);
	if (!env.isFuture) renderFooter(ctx, box, section);
}

/** 種目のリスト（パッケージの区切りごと）。今日の筋トレ中は、まだの種目を ⋮⋮ で並べ替えられる */
function renderCards(
	ctx: PageContext,
	box: HTMLElement,
	section: SectionModel,
	cards: readonly CardModel[],
	mode: CardEnv['mode'],
	env: SectionEnv,
): void {
	const baseEnv: CardEnv = {
		isToday: ctx.date === ctx.today,
		mode,
		rest: env.rest,
	};
	// 筋トレ中（今日）は、いまの種目だけを開いてセットをサブタスクに。終わった種目は 1 行、まだの種目は ▶ だけ
	const focus = focusOf(ctx, section);
	const layout =
		mode === 'timer' ? cardLayout(section, env.lastSet, focus) : null;
	const envFor = (card: CardModel): CardEnv => {
		const cardEnv: CardEnv = { ...baseEnv };
		// まだやっていない種目は × でこの日から外せる（見るだけの未来の日を除く）
		if (
			mode !== 'readonly' &&
			card.exercise &&
			card.sets.length === 0 &&
			!card.active
		)
			cardEnv.onRemove = () => removeExerciseFromDay(ctx, section, card);
		if (!layout) return cardEnv;
		return {
			...cardEnv,
			role: cardRole(card, layout),
			live: layout.currentKey === card.key,
			suggested: layout.suggestedKey === card.key,
			total: card.exercise
				? totalSets(section, card.exercise.id)
				: card.sets.length,
			// 開く・たたむはその種目だけ（ほかの開いている種目は閉じない）
			onFocus: () => {
				focus.opened.add(card.key);
				focus.collapsed.delete(card.key);
				ctx.refresh();
			},
			onCollapse: () => {
				focus.collapsed.add(card.key);
				focus.opened.delete(card.key);
				ctx.refresh();
			},
		};
	};
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
				envFor(card),
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

/** リストの下の「＋ 種目を追加」（その日のこのまとまりに足す） */
function renderFooter(
	ctx: PageContext,
	box: HTMLElement,
	section: SectionModel,
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
}

/** パッケージの編集画面へ（編集画面から「今日の画面に戻る」で戻れる） */
function openPackageEditor(ctx: PageContext, packageId: string): void {
	ctx.pageState('packageReturn', () => ({
		date: null as string | null,
	})).date = ctx.date;
	ctx.navigate({ page: 'packages', selectedId: packageId });
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

/** 全体のコメントの見出し（「コメント: LEGS A」） */
function noteTitle(section: SectionModel): string {
	return `${t('memo.title')}: ${section.isOther ? t('today.other') : section.title}`;
}

/** 全体のコメントを 1 件足す（いちばん後ろ） */
function addNote(ctx: PageContext, section: SectionModel): void {
	new TextPromptModal(ctx.app, {
		title: noteTitle(section),
		initial: '',
		placeholder: t('memo.placeholder'),
		submitText: t('memo.add'),
		onSubmit: (note) => {
			if (note.trim().length === 0) return;
			ctx.run(() =>
				ctx.services.controller.addSessionNote(
					ctx.date,
					sectionRef(section),
					note,
				),
			);
		},
	}).open();
}

/** 全体のコメントの 1 件を直す・消す */
function editNote(
	ctx: PageContext,
	section: SectionModel,
	index: number,
	note: string,
): void {
	const save = (text: string) =>
		ctx.run(() =>
			ctx.services.controller.editSessionNote(
				ctx.date,
				sectionRef(section),
				index,
				note,
				text,
			),
		);
	new TextPromptModal(ctx.app, {
		title: noteTitle(section),
		initial: note,
		placeholder: t('memo.placeholder'),
		submitText: t('memo.save'),
		onSubmit: (text) => {
			if (text.trim() !== note) save(text);
		},
		onDelete: () => save(''),
	}).open();
}

/** 全体のコメントを見せる数。それより前は「前の N 件」にたたむ（増えても種目のリストを押し下げないように） */
const VISIBLE_NOTES = 2;

/**
 * 全体のコメント（名前の行の下）: 書いた順に 1 件 1 行（長い文は … で切る）。新しい VISIBLE_NOTES 件だけを見せ、
 * それより前は「前の N 件」にたたむ。開くと全部を最後まで出す。1 件を押すと、その 1 件を直せる
 */
function renderNotes(
	ctx: PageContext,
	box: HTMLElement,
	section: SectionModel,
	env: SectionEnv,
): void {
	const notes = section.notes;
	if (notes.length === 0) return;
	const opened = ctx.pageState('todayNotesOpen', () => new Set<string>());
	const key = `${ctx.date}:${section.key}`;
	const open = opened.has(key);
	const list = box.createDiv({ cls: 'fitness-log-section-notes' });
	list.toggleClass('is-open', open);
	const toggle = (text: string, icon: string) => {
		const button = list.createEl('button', {
			cls: 'fitness-log-notes-toggle',
			attr: { type: 'button' },
		});
		setIcon(
			button.createSpan({ cls: 'fitness-log-notes-toggle-icon' }),
			icon,
		);
		button.createSpan({ text });
		button.addEventListener('click', () => {
			if (open) opened.delete(key);
			else opened.add(key);
			ctx.refresh();
		});
	};
	const hidden = open ? 0 : Math.max(0, notes.length - VISIBLE_NOTES);
	if (hidden > 0)
		toggle(t('today.olderNotes', { n: hidden }), 'chevron-down');
	notes.forEach((note, index) => {
		if (index < hidden) return;
		if (env.isFuture) {
			list.createDiv({ cls: 'fitness-log-section-note', text: note });
			return;
		}
		const item = list.createEl('button', {
			cls: 'fitness-log-section-note',
			text: note,
			attr: { type: 'button', 'aria-label': t('today.editNote') },
		});
		item.addEventListener('click', () =>
			editNote(ctx, section, index, note),
		);
	});
	if (open && notes.length > VISIBLE_NOTES)
		toggle(t('today.foldNotes'), 'chevron-up');
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
