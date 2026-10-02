import { FuzzySuggestModal, type App, type FuzzyMatch } from 'obsidian';
import { t } from '../../i18n';
import type { Exercise, Package } from '../../lib/model/types';

export interface PackageSuggestOptions {
	packages: readonly Package[];
	exercises: readonly Exercise[];
	onChoose: (pkg: Package) => void;
}

/** パッケージを選ぶ（今日ページの「＋ パッケージを追加」） */
export class PackageSuggestModal extends FuzzySuggestModal<Package> {
	constructor(
		app: App,
		private readonly options: PackageSuggestOptions,
	) {
		super(app);
		this.setPlaceholder(t('suggest.packagePlaceholder'));
		this.emptyStateText = t('suggest.noPackages');
	}

	getItems(): Package[] {
		return [...this.options.packages];
	}

	getItemText(pkg: Package): string {
		return [pkg.name, ...pkg.aliases].join(' ');
	}

	renderSuggestion(match: FuzzyMatch<Package>, el: HTMLElement): void {
		const pkg = match.item;
		const names = new Map(
			this.options.exercises.map((e) => [e.id, e.name]),
		);
		el.addClass('fitness-log-suggestion');
		el.createDiv({ cls: 'fitness-log-suggestion-title', text: pkg.name });
		const items = pkg.items
			.map((i) => names.get(i.exerciseId))
			.filter((n) => n !== undefined);
		if (items.length > 0)
			el.createDiv({
				cls: 'fitness-log-suggestion-note',
				text: items.join('、'),
			});
	}

	onChooseItem(pkg: Package): void {
		this.options.onChoose(pkg);
	}
}
