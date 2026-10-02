import { Notice, TFolder, type App, type Component } from 'obsidian';
import { t } from '../i18n';
import { dominantFolder, followRename } from '../lib/folders';
import { LOG_TAG } from '../lib/log/summary';
import { EXERCISE_KEYS, EXERCISE_TAG } from '../lib/model/exercise-note';
import type { DataStore } from './data-store';

/**
 * 種目ノート・日ノートのフォルダの設定を、vault の中のフォルダの変更に合わせる。
 * - フォルダ（またはその親）の名前を変えた・移したら、設定も追いかける（registerFolderFollow）
 * - 起動時に設定のフォルダが無ければ、ノートのある場所を探して合わせる（relocateFolders）
 *   （追いかける前の版でフォルダの名前を変えた vault を直すため）
 */

type FolderKey = 'exerciseFolder' | 'logFolder';
const FOLDER_KEYS: readonly FolderKey[] = ['exerciseFolder', 'logFolder'];

function hasTag(value: unknown, tag: string): boolean {
	const list: unknown[] = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(/[,\s]+/)
			: [];
	return list.some(
		(v) => typeof v === 'string' && v.replace(/^#/, '') === tag,
	);
}

/** vault の中の種目ノート・日ノート（frontmatter のタグと id で見分ける） */
function notePaths(app: App, key: FolderKey): string[] {
	return app.vault
		.getMarkdownFiles()
		.filter((file) => {
			const fm = app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm) return false;
			return key === 'exerciseFolder'
				? typeof fm[EXERCISE_KEYS.id] === 'string' &&
						hasTag(fm[EXERCISE_KEYS.tags], EXERCISE_TAG)
				: hasTag(fm.tags, LOG_TAG);
		})
		.map((file) => file.path);
}

function notify(patch: Partial<Record<FolderKey, string>>): void {
	for (const key of FOLDER_KEYS) {
		const folder = patch[key];
		if (folder === undefined) continue;
		new Notice(
			t('notice.folderFollowed', {
				name: t(
					key === 'exerciseFolder'
						? 'folders.exercise'
						: 'folders.log',
				),
				folder,
			}),
			8000,
		);
	}
}

/**
 * 設定のフォルダが vault に無ければ、ノートのある場所に合わせる。
 * force なら、フォルダがあってもその中にノートが 1 つも無いときに合わせる（「種目ノートを探す」）。
 * 合わせたフォルダを返す。
 */
export async function relocateFolders(
	app: App,
	store: DataStore,
	force = false,
): Promise<Partial<Record<FolderKey, string>>> {
	const patch: Partial<Record<FolderKey, string>> = {};
	for (const key of FOLDER_KEYS) {
		const current = store.settings[key];
		const exists = app.vault.getFolderByPath(current) !== null;
		if (exists && !force) continue;
		const paths = notePaths(app, key);
		if (exists && paths.some((p) => p.startsWith(`${current}/`))) continue;
		const folder = dominantFolder(paths);
		if (folder !== null && folder !== current) patch[key] = folder;
	}
	if (Object.keys(patch).length > 0) {
		await store.update((d) => Object.assign(d.settings, patch));
		notify(patch);
	}
	return patch;
}

/** フォルダ（またはその親）の名前を変えた・移したら、設定のフォルダも追いかける */
export function registerFolderFollow(
	component: Component,
	app: App,
	store: DataStore,
): void {
	component.registerEvent(
		app.vault.on('rename', (file, oldPath) => {
			if (!(file instanceof TFolder)) return;
			const patch: Partial<Record<FolderKey, string>> = {};
			for (const key of FOLDER_KEYS) {
				const next = followRename(
					store.settings[key],
					oldPath,
					file.path,
				);
				if (next !== null) patch[key] = next;
			}
			if (Object.keys(patch).length === 0) return;
			store
				.update((d) => Object.assign(d.settings, patch))
				.then(() => notify(patch))
				.catch((error: unknown) =>
					console.error('[fitness-log] folder follow', error),
				);
		}),
	);
}
