import { t } from '../../i18n';
import { packagesUsingExercise } from '../../lib/model/catalog';
import {
	categoryOrder,
	defaultRecordType,
	recordTypeName,
} from '../../lib/model/lists';
import { nameKey } from '../../lib/model/resolve';
import type { Exercise } from '../../lib/model/types';
import { iconButton, openNoteInNewTab, textButton } from '../helpers';
import { ConfirmModal } from '../modals/confirm-modal';
import { ExerciseEditModal } from '../modals/exercise-edit-modal';
import { ListEditModal } from '../modals/list-edit-modal';
import type { PageContext } from '../page-context';

interface ExerciseFilter {
	query: string;
	/** カテゴリの名前（'' は未設定）か、すべて */
	category: string | null;
	showArchived: boolean;
}

/** 種目ページ（実装計画 §5.3）: カテゴリ別の一覧・検索 → 編集モーダル */
export function renderExercisesPage(ctx: PageContext, el: HTMLElement): void {
	const filter = ctx.pageState<ExerciseFilter>('exercises', () => ({
		query: '',
		category: null,
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
	// カテゴリの並び: 一覧の順 → 一覧に無いが種目で使っている名前 → 未設定
	const { lists, store } = ctx.services;
	const categories = categoryOrder(
		lists.lists,
		store.current.exercises.map((e) => e.category),
	);
	const label = (category: string) =>
		category === '' ? t('lists.unset') : category;
	if (filter.category !== null && !categories.includes(filter.category))
		filter.category = null;
	chip(null, t('exercises.all'));
	for (const category of categories) chip(category, label(category));
	iconButton(chips, 'pencil', t('lists.editCategories'), () =>
		new ListEditModal(ctx.app, {
			kind: 'categories',
			lists,
			store,
		}).open(),
	);
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
				(filter.category === null || e.category === filter.category) &&
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
		for (const category of categories) {
			const group = matches.filter((e) => e.category === category);
			if (group.length === 0) continue;
			list.createDiv({
				cls: 'fitness-log-subheading',
				text: label(category),
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
	// 行を押すと編集。右のアイコンで種目ノート（フォームやコツのメモ）を開く・種目を削除する（確かめてから）
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
	const lists = ctx.services.lists.lists;
	if (exercise.equipment) meta.push(exercise.equipment);
	// 記録のしかたは既定（一覧の先頭）と違うときだけ
	if (exercise.recordType !== defaultRecordType(lists))
		meta.push(recordTypeName(exercise.recordType, lists));
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
	iconButton(
		row,
		'trash-2',
		t('exerciseEdit.delete'),
		() => confirmDelete(ctx, exercise),
		'fitness-log-row-delete',
	);
}

/** 削除の確認の文言（パッケージで使っていれば、そこからも外れることを添える） */
function deleteMessage(ctx: PageContext, exercise: Exercise): string {
	const used = packagesUsingExercise(ctx.services.store.current, exercise.id);
	return used.length > 0
		? t('exerciseEdit.deleteConfirmUsed', {
				packages: used.map((p) => p.name).join('、'),
			})
		: t('exerciseEdit.deleteConfirm');
}

/** 「ディップス ／ この種目を削除しますか？」。種目ノートはゴミ箱へ、過去の記録（日ノート）は残る */
function confirmDelete(ctx: PageContext, exercise: Exercise): void {
	new ConfirmModal(ctx.app, {
		title: exercise.name,
		message: deleteMessage(ctx, exercise),
		confirmText: t('confirm.delete'),
		danger: true,
		onConfirm: () =>
			ctx.run(() => ctx.services.library.remove(exercise.id)),
	}).open();
}

function openEditor(
	ctx: PageContext,
	exercise: Exercise | undefined,
	initialName = '',
): void {
	const { library, lists, store } = ctx.services;
	new ExerciseEditModal(ctx.app, {
		exercise,
		initialName,
		lists,
		store,
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
		deleteMessage: exercise ? deleteMessage(ctx, exercise) : undefined,
	}).open();
}
