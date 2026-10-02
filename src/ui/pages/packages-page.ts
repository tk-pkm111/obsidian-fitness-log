import { Notice, setIcon } from 'obsidian';
import { t } from '../../i18n';
import {
	planFromTemplate,
	addPackageItem,
	addPackageSection,
	createPackage,
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
	updatePackage,
	updatePackageItem,
	type PackageRow,
} from '../../lib/model/catalog';
import type {
	Package,
	PackageItem,
	PackageSection,
} from '../../lib/model/types';
import { describeRule } from '../../lib/schedule/routine';
import { formatDuration } from '../../lib/time/date';
import { iconButton, textButton } from '../helpers';
import { ConfirmModal } from '../modals/confirm-modal';
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

function renderPackageList(ctx: PageContext, el: HTMLElement): void {
	const { store } = ctx.services;
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

	textButton(
		el,
		t('packages.back'),
		() => ctx.navigate({ selectedId: null }),
		{
			icon: 'chevron-left',
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
	textButton(
		add,
		t('packages.addItem'),
		() =>
			chooseExercise(
				ctx,
				(exercise) =>
					update((d) => void addPackageItem(d, pkg.id, exercise.id)),
				new Set(pkg.items.map((i) => i.exerciseId)),
			),
		{ icon: 'plus' },
	);
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
	iconButton(buttons, 'x', t('packages.removeItem'), () =>
		ctx.run(() => store.update((d) => removePackageItem(d, pkg.id, index))),
	);

	const entry = { el: row, handle };
	if (!isOpen) return entry;
	const details = row.createDiv({ cls: 'fitness-log-item-details' });
	details.createDiv({
		cls: 'fitness-log-muted',
		text: t('packages.detailsDesc'),
	});
	const targets = details.createDiv({ cls: 'fitness-log-item-targets' });
	const sets = targets.createEl('input', {
		type: 'text',
		cls: 'fitness-log-small-input',
		value: String(item.targetSets),
		attr: {
			inputmode: 'numeric',
			'aria-label': t('packages.sets'),
			'data-focus-key': `sets-${key}`,
		},
	});
	targets.createSpan({ text: t('packages.sets') });
	targets.createSpan({ cls: 'fitness-log-muted', text: '×' });
	const reps = targets.createEl('input', {
		type: 'text',
		cls: 'fitness-log-small-input',
		value: item.targetReps,
		attr: {
			'aria-label': t('packages.reps'),
			placeholder: '6-9',
			'data-focus-key': `reps-${key}`,
		},
	});
	targets.createSpan({ text: t('packages.reps') });
	targets.createSpan({ cls: 'fitness-log-muted', text: '・' });
	targets.createSpan({ text: t('packages.rest') });
	const rest = targets.createEl('input', {
		type: 'text',
		cls: 'fitness-log-small-input',
		value: item.restSec === undefined ? '' : formatDuration(item.restSec),
		attr: {
			'aria-label': t('packages.rest'),
			placeholder: t('packages.restPlaceholder'),
			'data-focus-key': `rest-${key}`,
		},
	});
	sets.addEventListener('change', () =>
		update({ targetSets: Number(sets.value.normalize('NFKC').trim()) }),
	);
	reps.addEventListener('change', () =>
		update({ targetReps: reps.value.normalize('NFKC') }),
	);
	rest.addEventListener('change', () => {
		const value = parseRestInput(rest.value);
		if (value === undefined) {
			new Notice(t('packages.invalidRest'));
			rest.value =
				item.restSec === undefined ? '' : formatDuration(item.restSec);
			return;
		}
		update({ restSec: value });
	});

	const note = details.createEl('input', {
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

/** ラベル付きの入力欄の行 */
function field(parent: HTMLElement, label: string, desc?: string): HTMLElement {
	const row = parent.createDiv({ cls: 'fitness-log-field' });
	const head = row.createDiv({ cls: 'fitness-log-field-label' });
	head.createDiv({ text: label });
	if (desc) head.createDiv({ cls: 'fitness-log-muted', text: desc });
	return row.createDiv({ cls: 'fitness-log-field-control' });
}
