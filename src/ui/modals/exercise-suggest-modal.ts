import {
	FuzzySuggestModal,
	setIcon,
	type App,
	type FuzzyMatch,
} from 'obsidian';
import { t, type MessageKey } from '../../i18n';
import { nameKey } from '../../lib/model/resolve';
import type { Exercise } from '../../lib/model/types';

type Choice =
	{ kind: 'exercise'; exercise: Exercise } | { kind: 'create'; name: string };

export interface ExerciseSuggestOptions {
	exercises: readonly Exercise[];
	/** 該当が無いときに新しい種目を作る（作ったら呼び出し側で onChoose 相当を行う） */
	onCreate: (name: string) => void;
	onChoose: (exercise: Exercise) => void;
	/** 候補から外す種目（既にパッケージにあるもの等） */
	exclude?: ReadonlySet<string>;
	/** false なら「新しい種目として作成」を出さない（ログの種目選択など）。既定は true */
	allowCreate?: boolean;
	/** 先頭に出す種目と、その補足（以前このパッケージから外した種目など） */
	pinned?: ReadonlyMap<string, string>;
}

/**
 * 種目を選ぶ（本名＋別名であいまい検索）。該当が無ければ先頭に
 * 「"〇〇" を新しい種目として作成」を出す。実装計画 §5.3。
 */
export class ExerciseSuggestModal extends FuzzySuggestModal<Choice> {
	constructor(
		app: App,
		private readonly options: ExerciseSuggestOptions,
	) {
		super(app);
		this.setPlaceholder(t('suggest.exercisePlaceholder'));
	}

	getItems(): Choice[] {
		const pinned = this.options.pinned;
		const pinOrder = [...(pinned?.keys() ?? [])];
		const rank = (e: Exercise) => {
			const i = pinOrder.indexOf(e.id);
			return i < 0 ? pinOrder.length : i;
		};
		return this.options.exercises
			.filter((e) => !e.archived && !this.options.exclude?.has(e.id))
			.map((exercise, order) => ({ exercise, order }))
			.sort(
				(a, b) =>
					rank(a.exercise) - rank(b.exercise) || a.order - b.order,
			)
			.map(({ exercise }) => ({ kind: 'exercise', exercise }));
	}

	getItemText(choice: Choice): string {
		return choice.kind === 'create'
			? choice.name
			: [choice.exercise.name, ...choice.exercise.aliases].join(' ');
	}

	getSuggestions(query: string): FuzzyMatch<Choice>[] {
		const results = super.getSuggestions(query);
		const name = query.trim();
		if (name.length === 0 || this.options.allowCreate === false)
			return results;
		const key = nameKey(name);
		const exists = this.options.exercises.some(
			(e) =>
				nameKey(e.name) === key ||
				e.aliases.some((a) => nameKey(a) === key),
		);
		if (!exists) {
			// 候補があるときは末尾（Enter での誤作成を避ける）、無いときは先頭に出す
			const create = {
				item: { kind: 'create', name } as Choice,
				match: { score: 0, matches: [] },
			};
			if (results.length > 0) results.push(create);
			else results.unshift(create);
		}
		return results;
	}

	renderSuggestion(match: FuzzyMatch<Choice>, el: HTMLElement): void {
		const choice = match.item;
		el.addClass('fitness-log-suggestion');
		if (choice.kind === 'create') {
			setIcon(
				el.createSpan({ cls: 'fitness-log-suggestion-icon' }),
				'plus',
			);
			el.createSpan({
				text: t('suggest.createExercise', { name: choice.name }),
			});
			return;
		}
		const { exercise } = choice;
		el.createDiv({
			cls: 'fitness-log-suggestion-title',
			text: exercise.name,
		});
		const pinned = this.options.pinned?.get(exercise.id);
		if (pinned) {
			const note = el.createDiv({
				cls: 'fitness-log-suggestion-note is-pinned',
			});
			setIcon(
				note.createSpan({ cls: 'fitness-log-suggestion-icon' }),
				'history',
			);
			note.createSpan({ text: pinned });
		}
		const meta = [t(`category.${exercise.category}` as MessageKey)];
		if (exercise.equipment)
			meta.push(t(`equipment.${exercise.equipment}` as MessageKey));
		if (exercise.aliases.length > 0) meta.push(exercise.aliases.join('、'));
		el.createDiv({
			cls: 'fitness-log-suggestion-note',
			text: meta.join(' ・ '),
		});
	}

	onChooseItem(choice: Choice): void {
		if (choice.kind === 'exercise') {
			this.options.onChoose(choice.exercise);
			return;
		}
		this.options.onCreate(choice.name);
	}
}
