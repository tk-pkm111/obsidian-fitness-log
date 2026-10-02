import type { App, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MAIN } from './main-view';
import type { MainViewState } from './page-context';

/**
 * メイン画面を開く。既にあればそのタブを使い、無ければ新しいタブに作る。
 * state を渡すとそのページ・日付に切り替える。
 */
export async function activateMainView(
	app: App,
	state?: Partial<MainViewState>,
): Promise<void> {
	const { workspace } = app;
	const existing: WorkspaceLeaf | undefined =
		workspace.getLeavesOfType(VIEW_TYPE_MAIN)[0];
	const leaf = existing ?? workspace.getLeaf('tab');
	const current = existing ? (existing.getViewState().state ?? {}) : {};
	if (!existing || state)
		await leaf.setViewState({
			type: VIEW_TYPE_MAIN,
			active: true,
			state: { ...current, ...state },
		});
	await workspace.revealLeaf(leaf);
}
