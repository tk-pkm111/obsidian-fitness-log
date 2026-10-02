import { Notice, Platform, setIcon, type App } from 'obsidian';
import { t } from '../../i18n';
import {
	planFromTemplate,
	addPackageItem,
	addPackageSection,
	createPackage,
	defaultTargets,
	deletePackage,
	duplicatePackage,
	movePackage,
	movePackageItemTo,
	movePackageRow,
	packageRows,
	parseRestInput,
	removePackageItem,
	removePackageSection,
	renamePackageSection,
	restorePackageItem,
	updatePackage,
	updatePackageItem,
	type PackageRow,
} from '../../lib/model/catalog';
import { formatTarget } from '../../lib/format';
import {
	joinRepRange,
	secondChoices,
	splitDuration,
	splitRepRange,
	stepRange,
} from '../../lib/picker';
import type {
	Exercise,
	Package,
	PackageItem,
	PackageSection,
} from '../../lib/model/types';
import { describeRule } from '../../lib/schedule/routine';
import {
	formatDuration,
	formatMonthDay,
	toDateString,
} from '../../lib/time/date';
import { iconButton, textButton } from '../helpers';
import { ChoiceModal } from '../modals/choice-modal';
import { ConfirmModal } from '../modals/confirm-modal';
import {
	WheelPickerModal,
	type WheelPickerOptions,
} from '../modals/wheel-picker-modal';
import { TemplateSuggestModal } from '../modals/template-suggest-modal';
import { TextPromptModal } from '../modals/text-prompt-modal';
import type { PageContext } from '../page-context';
import { chooseExercise } from '../choose-exercise';
import { dragHandle, makeSortable, type SortableEntry } from '../sortable';

const now = () => new Date().toISOString();

/** パッケージページ（実装計画 §5.3）: 一覧 → 選ぶと同じページで詳細を編集 */
export function renderPackagesPage(ctx: PageContext, el: HTMLElement): void {
	const pkg = ctx.state.selectedId
		? ctx.services.store.current.packages.find(
				(p) => p.id === ctx.state.selectedId,
			)
		: undefined;
	if (pkg) renderPackageDetail(ctx, el, pkg);
	else renderPackageList(ctx, el);
}

/** 今日の画面から編集に来たときの戻り先（今日の画面の日付） */
function packageReturn(ctx: PageContext): { date: string | null } {
	return ctx.pageState('packageReturn', () => ({
		date: null as string | null,
	}));
}

function renderPackageList(ctx: PageContext, el: HTMLElement): void {
	const { store } = ctx.services;
	packageReturn(ctx).date = null;
	const data = store.current;
	const toolbar = el.createDiv({ cls: 'fitness-log-toolbar' });
	textButton(
		toolbar,
		t('packages.new'),
		() =>
			new TextPromptModal(ctx.app, {
				title: t('packages.newTitle'),
				initial: '',
				placeholder: t('packages.namePlaceholder'),
				submitText: t('confirm.ok'),
				singleLine: true,
				onSubmit: (name) =>
					ctx.run(async () => {
						let id = '';
						await store.update((d) => {
							id = createPackage(d, name, now()).id;
						});
						ctx.navigate({ selectedId: id });
					}),
			}).open(),
		{ icon: 'plus', cta: true },
	);
	textButton(
		toolbar,
		t('packages.fromTemplate'),
		() =>
			new TemplateSuggestModal(ctx.app, (programId, sessionName) =>
				ctx.run(async () => {
					// テンプレートに種目マスターに無い種目があれば、そのノートを作ってからパッケージを足す
					const plan = planFromTemplate(
						store.current,
						programId,
						sessionName,
						now(),
					);
					await ctx.services.library.applyPlan(plan);
					new Notice(
						t('packages.templateAdded', {
							count: plan.packages.length,
						}),
					);
				}),
			).open(),
		{ icon: 'library' },
	);

	if (data.packages.length === 0) {
		el.createDiv({ cls: 'fitness-log-empty', text: t('packages.empty') });
		return;
	}
	const names = new Map(data.exercises.map((e) => [e.id, e.name]));
	const list = el.createDiv({ cls: 'fitness-log-list' });
	const entries: SortableEntry[] = [];
	for (const pkg of data.packages) {
		const wrap = list.createDiv({ cls: 'fitness-log-list-item' });
		const handle = dragHandle(wrap, t('drag.handle'), `drag-pkg-${pkg.id}`);
		entries.push({ el: wrap, handle });
		const row = wrap.createEl('button', {
			cls: 'fitness-log-list-row',
			attr: { type: 'button' },
		});
		const body = row.createDiv({ cls: 'fitness-log-list-body' });
		body.createDiv({ cls: 'fitness-log-list-title', text: pkg.name });
		const meta = [t('packages.itemCount', { n: pkg.items.length })];
		for (const routine of data.routines.filter(
			(r) => r.packageId === pkg.id && r.enabled,
		))
			meta.push(describeRule(routine.rule));
		body.createDiv({ cls: 'fitness-log-muted', text: meta.join(' ・ ') });
		const exercises = pkg.items
			.map((i) => names.get(i.exerciseId))
			.filter((n) => n !== undefined);
		if (exercises.length > 0)
			body.createDiv({
				cls: 'fitness-log-list-sub',
				text: exercises.join('、'),
			});
		setIcon(
			row.createSpan({ cls: 'fitness-log-list-chevron' }),
			'chevron-right',
		);
		row.addEventListener('click', () =>
			ctx.navigate({ selectedId: pkg.id }),
		);
	}
	makeSortable(entries, (from, to) =>
		ctx.run(() => store.update((d) => movePackage(d, from, to))),
	);
}

function renderPackageDetail(
	ctx: PageContext,
	el: HTMLElement,
	pkg: Package,
): void {
	const { store } = ctx.services;
	const update = (mutate: Parameters<typeof store.update>[0]) =>
		ctx.run(() => store.update(mutate));

	// 今日の画面のパッケージ名から来たときは、今日の画面に戻れるように
	const back = el.createDiv({ cls: 'fitness-log-back-row' });
	const ret = packageReturn(ctx);
	const returnDate = ret.date;
	if (returnDate !== null)
		textButton(
			back,
			t('packages.backToToday'),
			() => {
				ret.date = null;
				ctx.navigate({
					page: 'today',
					selectedId: null,
					date: returnDate === ctx.today ? null : returnDate,
				});
			},
			{ icon: 'chevron-left', cls: 'mod-quiet fitness-log-back' },
		);
	textButton(
		back,
		t('packages.back'),
		() => {
			ret.date = null;
			ctx.navigate({ selectedId: null });
		},
		{
			icon: returnDate === null ? 'chevron-left' : 'list',
			cls: 'mod-quiet fitness-log-back',
		},
	);

	const form = el.createDiv({ cls: 'fitness-log-form' });
	const nameRow = field(
		form,
		t('packages.name'),
		pkg.aliases.length > 0
			? t('packages.aliases', { names: pkg.aliases.join('、') })
			: t('packages.nameDesc'),
	);
	const nameInput = nameRow.createEl('input', {
		type: 'text',
		cls: 'fitness-log-input-wide',
		value: pkg.name,
		attr: { 'data-focus-key': `pkg-name-${pkg.id}` },
	});
	nameInput.addEventListener('change', () =>
		update((d) => updatePackage(d, pkg.id, { name: nameInput.value })),
	);
	const noteRow = field(form, t('packages.note'));
	const noteInput = noteRow.createEl('input', {
		type: 'text',
		cls: 'fitness-log-input-wide',
		value: pkg.note ?? '',
		attr: { 'data-focus-key': `pkg-note-${pkg.id}` },
	});
	noteInput.addEventListener('change', () =>
		update((d) => updatePackage(d, pkg.id, { note: noteInput.value })),
	);

	el.createDiv({ cls: 'fitness-log-subheading', text: t('packages.items') });
	// 区切り（セクション）は設定で有効にしたときだけ見せる。隠しているときも消さずに残す
	const sectionsOn = store.settings.packageSections;
	if (sectionsOn)
		el.createDiv({
			cls: 'fitness-log-muted fitness-log-items-hint',
			text: t('packages.sectionsHint'),
		});
	const items = el.createDiv({ cls: 'fitness-log-items' });
	if (pkg.items.length === 0 && !(sectionsOn && pkg.sections?.length))
		items.createDiv({
			cls: 'fitness-log-muted',
			text: t('packages.noItems'),
		});
	const rows: PackageRow[] = sectionsOn
		? packageRows(pkg)
		: pkg.items.map((item, index) => ({ kind: 'item', item, index }));
	const entries = rows.map((row) =>
		row.kind === 'section'
			? renderSectionRow(ctx, items, pkg, row.section)
			: renderItemRow(ctx, items, pkg, row.item, row.index),
	);
	makeSortable(entries, (from, to) =>
		update((d) =>
			sectionsOn
				? movePackageRow(d, pkg.id, from, to)
				: movePackageItemTo(d, pkg.id, from, to),
		),
	);

	const add = el.createDiv({ cls: 'fitness-log-section-footer' });
	textButton(add, t('packages.addItem'), () => addItem(ctx, pkg), {
		icon: 'plus',
	});
	if (sectionsOn)
		textButton(
			add,
			t('packages.addSection'),
			() =>
				new TextPromptModal(ctx.app, {
					title: t('packages.addSection'),
					initial: '',
					placeholder: t('packages.sectionPlaceholder'),
					submitText: t('confirm.ok'),
					singleLine: true,
					onSubmit: (name) =>
						update((d) => void addPackageSection(d, pkg.id, name)),
				}).open(),
			{ icon: 'separator-horizontal' },
		);

	const actions = el.createDiv({ cls: 'fitness-log-footer' });
	textButton(
		actions,
		t('packages.openRoutines'),
		() => ctx.navigate({ page: 'routines', selectedId: null }),
		{
			icon: 'repeat',
		},
	);
	textButton(
		actions,
		t('packages.duplicate'),
		() =>
			ctx.run(async () => {
				let id = '';
				await store.update((d) => {
					id = duplicatePackage(d, pkg.id, now()).id;
				});
				ctx.navigate({ selectedId: id });
			}),
		{ icon: 'copy' },
	);
	const remove = textButton(
		actions,
		t('packages.delete'),
		() =>
			new ConfirmModal(ctx.app, {
				title: pkg.name,
				message: t('packages.deleteConfirm', { name: pkg.name }),
				confirmText: t('confirm.delete'),
				danger: true,
				onConfirm: () =>
					ctx.run(async () => {
						await store.update((d) => deletePackage(d, pkg.id));
						ctx.navigate({ selectedId: null });
					}),
			}).open(),
		{ icon: 'trash-2' },
	);
	remove.addClass('mod-warning');
}

/** 目標の要約: '2 セット × 6-9 回 ・ 休憩 2:30 ・ ベンチ 60°' */
function describeItem(item: PackageItem): string {
	return [formatTarget(item), ...(item.note ? [item.note] : [])].join(' ・ ');
}

/**
 * 種目を足す。以前このパッケージから外した種目は候補の先頭に出し、選んだら
 * 「以前の設定で戻す（元の位置）」か「新しく設定する（初期値で末尾）」かを聞く。
 */
function addItem(ctx: PageContext, pkg: Package): void {
	const { store } = ctx.services;
	const removed = new Map(
		(pkg.removedItems ?? []).map((r) => [r.exerciseId, r]),
	);
	const pinned = new Map(
		[...removed.values()].map((r) => [
			r.exerciseId,
			t('packages.previouslyIn', { target: describeItem(r) }),
		]),
	);
	const update = (mutate: Parameters<typeof store.update>[0]) =>
		ctx.run(() => store.update(mutate));
	const addFresh = (exercise: Exercise) =>
		update((d) => void addPackageItem(d, pkg.id, exercise.id));
	chooseExercise(
		ctx,
		(exercise) => {
			const previous = removed.get(exercise.id);
			if (!previous) {
				addFresh(exercise);
				return;
			}
			const fresh = {
				exerciseId: exercise.id,
				...defaultTargets(exercise.recordType),
			};
			new ChoiceModal(ctx.app, {
				title: exercise.name,
				message: t('packages.restoreMessage', {
					date: formatMonthDay(
						toDateString(new Date(previous.removedAt)),
					),
					package: pkg.name,
				}),
				choices: [
					{
						text: t('packages.restorePrevious'),
						desc: t('packages.restorePreviousDesc', {
							target: describeItem(previous),
						}),
						cta: true,
						onChoose: () =>
							update(
								(d) =>
									void restorePackageItem(
										d,
										pkg.id,
										exercise.id,
									),
							),
					},
					{
						text: t('packages.restoreFresh'),
						desc: t('packages.restoreFreshDesc', {
							target: formatTarget(fresh),
						}),
						onChoose: () => addFresh(exercise),
					},
				],
			}).open();
		},
		new Set(pkg.items.map((i) => i.exerciseId)),
		pinned,
	);
}

/** 区切りの行: つかむ所・名前（その場で直す）・削除 */
function renderSectionRow(
	ctx: PageContext,
	parent: HTMLElement,
	pkg: Package,
	section: PackageSection,
): SortableEntry {
	const { store } = ctx.services;
	const row = parent.createDiv({
		cls: 'fitness-log-item fitness-log-package-section',
	});
	const head = row.createDiv({ cls: 'fitness-log-item-head' });
	const handle = dragHandle(head, t('drag.handle'), `drag-sec-${section.id}`);
	const name = head.createEl('input', {
		type: 'text',
		cls: 'fitness-log-section-name-input',
		value: section.name,
		attr: {
			'aria-label': t('packages.sectionName'),
			'data-focus-key': `sec-name-${section.id}`,
		},
	});
	name.addEventListener('change', () => {
		if (name.value.trim() === '') {
			name.value = section.name;
			return;
		}
		ctx.run(() =>
			store.update((d) =>
				renamePackageSection(d, pkg.id, section.id, name.value),
			),
		);
	});
	const buttons = head.createDiv({ cls: 'fitness-log-item-buttons' });
	iconButton(buttons, 'x', t('packages.removeSection'), () =>
		ctx.run(() =>
			store.update((d) => removePackageSection(d, pkg.id, section.id)),
		),
	);
	return { el: row, handle };
}

function renderItemRow(
	ctx: PageContext,
	parent: HTMLElement,
	pkg: Package,
	item: PackageItem,
	index: number,
): SortableEntry {
	const { store } = ctx.services;
	const exercise = store.current.exercises.find(
		(e) => e.id === item.exerciseId,
	);
	const update = (patch: Parameters<typeof updatePackageItem>[3]) =>
		ctx.run(() =>
			store.update((d) => updatePackageItem(d, pkg.id, index, patch)),
		);
	const key = `${pkg.id}-${index}`;

	const row = parent.createDiv({ cls: 'fitness-log-item' });
	const head = row.createDiv({ cls: 'fitness-log-item-head' });
	const handle = dragHandle(
		head,
		t('drag.handle'),
		`drag-item-${pkg.id}-${item.exerciseId}`,
	);
	head.createDiv({
		cls: 'fitness-log-item-title',
		text: exercise?.name ?? '?',
	});
	const buttons = head.createDiv({ cls: 'fitness-log-item-buttons' });
	// 目標（セット数・回数・休憩・メモ）は詳細設定にしまう（今日の画面には出さない）
	const openDetails = ctx.pageState(
		'packageItemDetails',
		() => new Set<string>(),
	);
	const detailsKey = `${pkg.id}:${item.exerciseId}`;
	const isOpen = openDetails.has(detailsKey);
	const toggle = iconButton(
		buttons,
		'sliders-horizontal',
		t('packages.details'),
		() => {
			if (isOpen) openDetails.delete(detailsKey);
			else openDetails.add(detailsKey);
			ctx.navigate({});
		},
	);
	toggle.toggleClass('is-active', isOpen);
	// 間違えて押しやすいので確かめる。設定は覚えておき、もう一度追加するときに戻せる
	iconButton(buttons, 'x', t('packages.removeItem'), () =>
		new ConfirmModal(ctx.app, {
			title: exercise?.name ?? '?',
			message: t('packages.removeItemConfirm', {
				exercise: exercise?.name ?? '?',
				package: pkg.name,
				target: describeItem(item),
			}),
			confirmText: t('packages.removeItemOk'),
			danger: true,
			onConfirm: () =>
				ctx.run(() =>
					store.update((d) =>
						removePackageItem(d, pkg.id, index, now()),
					),
				),
		}).open(),
	);

	const entry = { el: row, handle };
	if (!isOpen) return entry;
	const details = row.createDiv({ cls: 'fitness-log-item-details' });
	details.createDiv({
		cls: 'fitness-log-muted',
		text: t('packages.detailsDesc'),
	});
	// 目標: 名前を上に、値を下に（スマホは押すとスクロールで選ぶ）
	const targets = details.createDiv({ cls: 'fitness-log-item-targets' });
	const target = (label: string) => {
		const box = targets.createDiv({ cls: 'fitness-log-target' });
		box.createDiv({ cls: 'fitness-log-target-label', text: label });
		return box;
	};
	const restText =
		item.restSec === undefined ? '' : formatDuration(item.restSec);
	const commitSets = (text: string) => {
		const n = Number(text.normalize('NFKC').trim());
		update({ targetSets: n });
		return true;
	};
	const commitReps = (text: string) => {
		update({ targetReps: text.normalize('NFKC') });
		return true;
	};
	const commitRest = (text: string) => {
		const value = parseRestInput(text);
		if (value === undefined) {
			new Notice(t('packages.invalidRest'));
			return false;
		}
		update({ restSec: value });
		return true;
	};
	const title = exercise?.name ?? '?';
	targetControl(ctx.app, target(t('packages.targetSets')), {
		value: String(item.targetSets),
		label: t('packages.targetSets'),
		focusKey: `sets-${key}`,
		inputMode: 'numeric',
		onCommit: commitSets,
		wheel: () => {
			const values = stepRange(1, Math.max(20, item.targetSets), 1);
			return {
				title: t('packages.targetSets'),
				hint: title,
				columns: [
					{
						items: values.map(String),
						index: Math.max(0, values.indexOf(item.targetSets)),
						label: t('packages.targetSets'),
					},
				],
				unit: t('packages.sets'),
				submitText: t('wheel.done'),
				onSubmit: ([i = 0]) =>
					update({ targetSets: values[i] ?? item.targetSets }),
			};
		},
	});
	targetControl(ctx.app, target(t('packages.targetReps')), {
		value: item.targetReps,
		placeholder: '6-9',
		label: t('packages.targetReps'),
		focusKey: `reps-${key}`,
		inputMode: 'text',
		onCommit: commitReps,
		wheel: () => {
			const [min, max] = splitRepRange(item.targetReps) ?? [6, 9];
			const values = stepRange(1, Math.max(50, min, max ?? 0), 1);
			return {
				title: t('packages.targetReps'),
				hint: title,
				columns: [
					{
						items: values.map(String),
						index: Math.max(0, values.indexOf(min)),
						label: t('wheel.repsMin'),
					},
					{
						items: ['—', ...values.map(String)],
						index: max === null ? 0 : values.indexOf(max) + 1,
						label: t('wheel.repsMax'),
					},
				],
				separators: ['–'],
				unit: t('packages.reps'),
				submitText: t('wheel.done'),
				onSubmit: ([lo = 0, hi = 0]) =>
					update({
						targetReps: joinRepRange(
							values[lo] ?? min,
							hi === 0 ? null : (values[hi - 1] ?? null),
						),
					}),
			};
		},
	});
	targetControl(ctx.app, target(t('packages.targetRest')), {
		value: restText,
		placeholder: t('packages.restPlaceholder'),
		label: t('packages.targetRest'),
		focusKey: `rest-${key}`,
		inputMode: 'decimal',
		onCommit: commitRest,
		wheel: () => {
			const [m, sec] = splitDuration(item.restSec ?? 150);
			const minutes = stepRange(0, Math.max(10, m), 1);
			const seconds = secondChoices(5, sec);
			return {
				title: t('packages.targetRest'),
				hint: title,
				columns: [
					{
						items: minutes.map(String),
						index: m,
						label: t('wheel.minutes'),
					},
					{
						items: seconds.map((v) => String(v).padStart(2, '0')),
						index: Math.max(0, seconds.indexOf(sec)),
						label: t('wheel.seconds'),
					},
				],
				separators: [':'],
				submitText: t('wheel.done'),
				onSubmit: ([mi = 0, si = 0]) =>
					update({
						restSec: (minutes[mi] ?? 0) * 60 + (seconds[si] ?? 0),
					}),
				clear: {
					text: t('packages.noRest'),
					onClear: () => update({ restSec: null }),
				},
			};
		},
	});

	const noteBox = details.createDiv({ cls: 'fitness-log-target' });
	noteBox.createDiv({
		cls: 'fitness-log-target-label',
		text: t('packages.itemNoteLabel'),
	});
	const note = noteBox.createEl('input', {
		type: 'text',
		cls: 'fitness-log-input-wide fitness-log-item-note',
		value: item.note ?? '',
		attr: {
			placeholder: t('packages.itemNote'),
			'data-focus-key': `note-${key}`,
		},
	});
	note.addEventListener('change', () => update({ note: note.value }));
	return entry;
}

interface TargetControlOptions {
	value: string;
	placeholder?: string;
	label: string;
	focusKey: string;
	inputMode: 'decimal' | 'numeric' | 'text';
	/** 打ち込んだ値で確定（false なら入力し直し） */
	onCommit: (text: string) => boolean;
	/** スマホで開くホイール（キーボードでの入力は自動で足す） */
	wheel: () => Omit<WheelPickerOptions, 'keyboard'>;
}

/**
 * 目標の値の欄。デスクトップは入力欄（変えたら確定）、スマホは押すとスクロールで選ぶボタン
 * （数字キーボードは打ちづらいので。「キーボードで入力」もできる）。
 */
function targetControl(
	app: App,
	parent: HTMLElement,
	options: TargetControlOptions,
): void {
	if (Platform.isMobile) {
		const button = parent.createEl('button', {
			cls: 'fitness-log-target-value',
			text: options.value || options.placeholder || '',
			attr: {
				type: 'button',
				'aria-label': options.label,
				'data-focus-key': options.focusKey,
			},
		});
		button.toggleClass('is-empty', options.value === '');
		button.addEventListener('click', () =>
			new WheelPickerModal(app, {
				...options.wheel(),
				keyboard: {
					value: options.value,
					inputMode: options.inputMode,
					placeholder: options.placeholder,
					onSubmit: options.onCommit,
				},
			}).open(),
		);
		return;
	}
	const input = parent.createEl('input', {
		type: 'text',
		cls: 'fitness-log-target-value',
		value: options.value,
		attr: {
			inputmode: options.inputMode,
			'aria-label': options.label,
			placeholder: options.placeholder ?? '',
			'data-focus-key': options.focusKey,
		},
	});
	input.addEventListener('change', () => {
		if (!options.onCommit(input.value)) input.value = options.value;
	});
}

/** ラベル付きの入力欄の行 */
function field(parent: HTMLElement, label: string, desc?: string): HTMLElement {
	const row = parent.createDiv({ cls: 'fitness-log-field' });
	const head = row.createDiv({ cls: 'fitness-log-field-label' });
	head.createDiv({ text: label });
	if (desc) head.createDiv({ cls: 'fitness-log-muted', text: desc });
	return row.createDiv({ cls: 'fitness-log-field-control' });
}
