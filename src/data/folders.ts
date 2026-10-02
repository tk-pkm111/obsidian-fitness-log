import { Notice, TFolder, type App, type Component } from 'obsidian';
import { t } from '../i18n';
import { followRename, movedPath } from '../lib/folders';
import { LOG_TAG } from '../lib/log/summary';
import { EXERCISE_KEYS, EXERCISE_TAG } from '../lib/model/exercise-note';
import type { DataStore } from './data-store';

/**
 * 種目ノート・日ノートのフォルダの設定と、ノートの実際の場所をそろえる。
 * - フォルダ（またはその親）の名前を変えた・移したら、設定も追いかける（registerFolderFollow）
 * - 設定のフォルダを変えたのにノートが前の場所にあるときは、移すか設定を戻すかを聞く
 *   （聞くのは src/ui/folder-check.ts。ここはノートを探す・移す）
 */

export type FolderKey = 'exerciseFolder' | 'logFolder';
export const FOLDER_KEYS: readonly FolderKey[] = [
	'exerciseFolder',
	'logFolder',
];

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
export function findNotePaths(app: App, key: FolderKey): string[] {
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
 * フォルダの中の、種目ノートではない Markdown ノートの数（種目ノートの保存先にすると、
 * 種目として読まれて fitness_id が足されてしまうので、最初の設定で知らせる）
 */
export function countForeignNotes(app: App, folder: string): number {
	return app.vault
		.getMarkdownFiles()
		.filter((file) => file.path.startsWith(`${folder}/`))
		.filter((file) => {
			const fm = app.metadataCache.getFileCache(file)?.frontmatter;
			return !fm || typeof fm[EXERCISE_KEYS.id] !== 'string';
		}).length;
}

/** 移したノートの数と、移した先に同じ名前のノートがあって移さなかったノート */
export interface MoveResult {
	moved: number;
	skipped: string[];
}

/** フォルダを（親から順に）作る。あれば何もしない */
export async function ensureFolder(app: App, path: string): Promise<void> {
	let current = '';
	for (const part of path.split('/')) {
		if (!part) continue;
		current = current ? `${current}/${part}` : part;
		if (app.vault.getFolderByPath(current)) continue;
		try {
			await app.vault.createFolder(current);
		} catch (error) {
			if (!app.vault.getFolderByPath(current)) throw error;
		}
	}
}

/**
 * ノートを source から target へ、同じ相対パスで移す（FileManager.renameFile なのでリンクも直る）。
 * 移した先に同じ名前のノートがあれば上書きせずに残す。
 */
export async function moveNotes(
	app: App,
	paths: readonly string[],
	source: string,
	target: string,
): Promise<MoveResult> {
	const result: MoveResult = { moved: 0, skipped: [] };
	for (const path of paths) {
		const file = app.vault.getFileByPath(path);
		if (!file) continue;
		const dest = movedPath(path, source, target);
		if (app.vault.getAbstractFileByPath(dest)) {
			result.skipped.push(path);
			continue;
		}
		const slash = dest.lastIndexOf('/');
		if (slash > 0) await ensureFolder(app, dest.slice(0, slash));
		await app.fileManager.renameFile(file, dest);
		result.moved++;
	}
	return result;
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
