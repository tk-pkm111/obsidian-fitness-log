import { normalizePath, TFile, TFolder, type App } from 'obsidian';
import { DEFAULT_SETTINGS } from '../lib/model/data';
import type { DataStore } from './data-store';
import { dateFromNotePath, dayNotePath } from './log-repository';

/** 日ノートを Fitness/ログ/ に分けた（以前は Fitness/ の直下） */
export const LOG_FOLDER_MIGRATION = 'log-folder-v2';
const OLD_DEFAULT_LOG_FOLDER = 'Fitness';

/**
 * 一度だけ: ログの保存先が以前の既定（Fitness）のままなら、日ノートを Fitness/ログ/ へ移し、設定も変える。
 * 移動は FileManager.renameFile（リンクは Obsidian の設定に従って更新される）。
 * 日ノートとして読めるファイル（ファイル名が日付）だけを動かし、種目ノートやユーザーのノートは動かさない。
 * 移したノートの数を返す。
 */
export async function migrateLogFolder(
	app: App,
	store: DataStore,
): Promise<number> {
	if (store.current.migrations.includes(LOG_FOLDER_MIGRATION)) return 0;
	const { logFolder, fileNameFormat } = store.settings;
	let moved = 0;
	// 保存先が以前の既定のまま（または未設定で新しい既定になった）なら移す。ユーザーが変えた保存先には触らない
	const current = normalizePath(logFolder);
	if (
		current === OLD_DEFAULT_LOG_FOLDER ||
		current === DEFAULT_SETTINGS.logFolder
	) {
		const target = DEFAULT_SETTINGS.logFolder;
		const from = { logFolder: OLD_DEFAULT_LOG_FOLDER, fileNameFormat };
		const to = { logFolder: target, fileNameFormat };
		const folder = app.vault.getFolderByPath(OLD_DEFAULT_LOG_FOLDER);
		const files: TFile[] = [];
		if (folder) collect(folder, files, normalizePath(target));
		for (const file of files) {
			const date = dateFromNotePath(from, file.path);
			if (date === null) continue;
			const path = dayNotePath(to, date);
			if (app.vault.getAbstractFileByPath(path)) continue; // 移動先に既にある日は動かさない
			await ensureFolder(app, path.split('/').slice(0, -1).join('/'));
			await app.fileManager.renameFile(file, path);
			moved++;
		}
		await store.update((data) => {
			data.settings.logFolder = target;
			data.migrations.push(LOG_FOLDER_MIGRATION);
		});
	} else {
		await store.update((data) => {
			data.migrations.push(LOG_FOLDER_MIGRATION);
		});
	}
	return moved;
}

function collect(folder: TFolder, out: TFile[], skip: string): void {
	for (const child of folder.children) {
		if (child instanceof TFolder) {
			if (child.path !== skip) collect(child, out, skip);
		} else if (child instanceof TFile && child.extension === 'md')
			out.push(child);
	}
}

async function ensureFolder(app: App, path: string): Promise<void> {
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
