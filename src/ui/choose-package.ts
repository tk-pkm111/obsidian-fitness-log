import { Platform } from 'obsidian';
import { t } from '../i18n';
import type { Package } from '../lib/model/types';
import { ChoiceModal } from './modals/choice-modal';
import { PackageSuggestModal } from './modals/package-suggest-modal';
import type { PageContext } from './page-context';

/**
 * パッケージを選ぶ（今日の画面の「パッケージを追加」「別のパッケージに変える」）。
 * exclude のパッケージは候補から外す（もうその日にあるもの）
 */
export function choosePackage(
	ctx: PageContext,
	options: {
		title: string;
		exclude: ReadonlySet<string>;
		onChoose: (pkg: Package) => void;
	},
): void {
	const { exercises, packages: all } = ctx.services.store.current;
	const packages = all.filter((p) => !options.exclude.has(p.id));
	if (Platform.isMobile) {
		// スマホは検索せず一覧から押す（検索の欄にキーボードが出て一覧が半分隠れる。パッケージは数が少ない）
		const names = new Map(exercises.map((e) => [e.id, e.name]));
		new ChoiceModal(ctx.app, {
			title: options.title,
			message: packages.length === 0 ? t('suggest.noPackages') : '',
			choices: packages.map((pkg) => ({
				text: pkg.name,
				desc: pkg.items
					.map((i) => names.get(i.exerciseId))
					.filter((n) => n !== undefined)
					.join('、'),
				onChoose: () => options.onChoose(pkg),
			})),
		}).open();
		return;
	}
	new PackageSuggestModal(ctx.app, {
		packages,
		exercises,
		onChoose: options.onChoose,
	}).open();
}
