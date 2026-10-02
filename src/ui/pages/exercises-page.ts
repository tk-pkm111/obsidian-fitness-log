import { t, type MessageKey } from '../../i18n';
import { packagesUsingExercise } from '../../lib/model/catalog';
import { nameKey } from '../../lib/model/resolve';
import type { Exercise, ExerciseCategory } from '../../lib/model/types';
import { iconButton, openNoteInNewTab, textButton } from '../helpers';
import { CATEGORIES, ExerciseEditModal } from '../modals/exercise-edit-modal';
import type { PageContext } from '../page-context';

interface ExerciseFilter {
	query: string;
	category: ExerciseCategory | 'all';
	showArchived: boolean;
}

/** 種目ページ（実装計画 §5.3）: カテゴリ別の一覧・検索 → 編集モーダル */
export function renderExercisesPage(ctx: PageContext, el: HTMLElement): void {
	const filter = ctx.pageState<ExerciseFilter>('exercises', () => ({
		query: '',
		category: 'all',
		showArchived: false,
	}));

	const toolbar = el.createDiv({ cls: 'fitness-log-toolbar' });
	const search = toolbar.createEl('input', {
		type: 'search',
		cls: 'fitness-log-search',
		value: filter.query,
		attr: {
			placeholder: t('exercises.searchPlaceholder'),
			'data-focus-key': 'exercise-search',
		},
	});
	textButton(
		toolbar,
		t('exercises.new'),
		() => openEditor(ctx, undefined, filter.query),
		{
			icon: 'plus',
			cta: true,
		},
	);

	const chips = el.createDiv({ cls: 'fitness-log-chips' });
	const chip = (value: ExerciseFilter['category'], label: string) => {
		const button = chips.createEl('button', {
			cls: 'fitness-log-chip',
			text: label,
			attr: { type: 'button' },
		});
		button.toggleClass('is-active', filter.category === value);
		button.addEventListener('click', () => {
			filter.category = value;
			renderList();
			chips
				.querySelectorAll('.fitness-log-chip')
				.forEach((c) => c.toggleClass('is-active', c === button));
		});
	};
	chip('all', t('exercises.all'));
	for (const category of CATEGORIES)
		chip(category, t(`category.${category}` as MessageKey));
	const archivedLabel = chips.createEl('label', {
		cls: 'fitness-log-checkbox',
	});
	const archived = archivedLabel.createEl('input', { type: 'checkbox' });
	archived.checked = filter.showArchived;
	archivedLabel.appendText(t('exercises.showArchived'));
	archived.addEventListener('change', () => {
		filter.showArchived = archived.checked;
		renderList();
	});

	const list = el.createDiv({ cls: 'fitness-log-list' });
	const renderList = () => {
		list.empty();
		const query = nameKey(filter.query);
		const matches = ctx.services.store.current.exercises.filter(
			(e) =>
				(filter.showArchived || !e.archived) &&
				(filter.category === 'all' || e.category === filter.category) &&
				(query.length === 0 ||
					[e.name, ...e.aliases].some((label) =>
						nameKey(label).includes(query),
					)),
		);
		list.createDiv({
			cls: 'fitness-log-muted fitness-log-count',
			text: t('exercises.count', { n: matches.length }),
		});
		if (matches.length === 0) {
			list.createDiv({
				cls: 'fitness-log-empty',
				text: t('exercises.empty'),
			});
			return;
		}
		for (const category of CATEGORIES) {
			const group = matches.filter((e) => e.category === category);
			if (group.length === 0) continue;
			list.createDiv({
				cls: 'fitness-log-subheading',
				text: t(`category.${category}` as MessageKey),
			});
			for (const exercise of group)
				renderExerciseRow(ctx, list, exercise);
		}
	};
	search.addEventListener('input', () => {
		filter.query = search.value;
		renderList();
	});
	renderList();
}

function renderExerciseRow(
	ctx: PageContext,
	list: HTMLElement,
	exercise: Exercise,
): void {
	// 行を押すと編集、右のアイコンで種目ノート（フォームやコツのメモ）を開く
	const row = list.createDiv({
		cls: 'fitness-log-list-row fitness-log-split-row',
	});
	row.toggleClass('is-archived', exercise.archived === true);
	const body = row.createDiv({
		cls: 'fitness-log-list-body',
		attr: { role: 'button', tabindex: '0' },
	});
	const title = body.createDiv({
		cls: 'fitness-log-list-title',
		text: exercise.name,
	});
	if (exercise.archived)
		title.createSpan({
			cls: 'fitness-log-badge',
			text: t('exercises.archived'),
		});
	const meta: string[] = [];
	if (exercise.equipment)
		meta.push(t(`equipment.${exercise.equipment}` as MessageKey));
	if (exercise.recordType !== 'weight-reps')
		meta.push(t(`recordType.${exercise.recordType}` as MessageKey));
	if (exercise.unilateral) meta.push(t('today.unilateral'));
	if (meta.length > 0)
		body.createDiv({ cls: 'fitness-log-muted', text: meta.join(' ・ ') });
	if (exercise.aliases.length > 0)
		body.createDiv({
			cls: 'fitness-log-list-sub',
			text: exercise.aliases.join('、'),
		});
	body.addEventListener('click', () => openEditor(ctx, exercise));
	body.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') openEditor(ctx, exercise);
	});
	const path = exercise.path;
	if (path)
		iconButton(row, 'file-text', t('exerciseEdit.openNote'), () =>
			openNoteInNewTab(ctx.app, path),
		);
}

function openEditor(
	ctx: PageContext,
	exercise: Exercise | undefined,
	initialName = '',
): void {
	const { store, library } = ctx.services;
	const used = exercise
		? packagesUsingExercise(store.current, exercise.id)
		: [];
	new ExerciseEditModal(ctx.app, {
		exercise,
		initialName,
		// 入力した内容は種目ノートの frontmatter に書く（名前を変えるとノートの名前も変わる）
		onSave: async (fields) => {
			if (exercise) await library.update(exercise.id, fields);
			else await library.create(fields);
		},
		onDelete: exercise
			? () => ctx.run(() => library.remove(exercise.id))
			: undefined,
		onOpenNote: exercise?.path
			? () => openNoteInNewTab(ctx.app, exercise.path ?? '')
			: undefined,
		deleteMessage:
			exercise && used.length > 0
				? t('exerciseEdit.deleteConfirmUsed', {
						name: exercise.name,
						packages: used.map((p) => p.name).join('、'),
					})
				: undefined,
	}).open();
}
