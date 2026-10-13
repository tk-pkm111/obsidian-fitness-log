import {
	getFrontMatterInfo,
	normalizePath,
	parseYaml,
	TFile,
	TFolder,
	type App,
} from 'obsidian';
import { t } from '../i18n';
import { foldersOverlap, leafName, renamedLeaf } from '../lib/folders';
import { BASES_FILE_NAME, retargetBasesFolder } from '../lib/log/bases';
import { BLOCK_START } from '../lib/log/markdown';
import { DEFAULT_SETTINGS } from '../lib/model/data';
import { EXERCISE_KEYS } from '../lib/model/exercise-note';
import type { DataStore } from './data-store';
import { FOLDER_KEYS, folderName, moveNotes, type FolderKey } from './folders';
import { dateFromNotePath, dayNotePath } from './log-repository';

/** 日ノートを Fitness/ の下のフォルダに分けた（以前は Fitness/ の直下） */
export const LOG_FOLDER_MIGRATION = 'log-folder-v2';
const OLD_DEFAULT_LOG_FOLDER = 'Fitness';

/** 保存先のフォルダの名前を英語にした（以前の既定は Fitness/ログ・Fitness/種目） */
export const ENGLISH_FOLDER_MIGRATION = 'folder-names-en';

/** 以前の既定のフォルダの名前（日本語）。今の既定の名前は DEFAULT_SETTINGS（log・exercise） */
const LEGACY_FOLDER_NAMES: Partial<Record<FolderKey, string>> = {
	logFolder: 'ログ',
	exerciseFolder: '種目',
};

/**
 * 一度だけ: ログの保存先が以前の既定（Fitness）のままなら、日ノートを既定のフォルダ（Fitness/log/）へ移し、設定も変える。
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

/** 保存先の名前を英語にした結果（1 つの保存先ごと） */
export interface FolderRename {
	key: FolderKey;
	/** 前の保存先（…/ログ・…/種目） */
	from: string;
	/** 新しい保存先（…/log・…/exercise） */
	to: string;
	moved: number;
	/** 移し先に同じ名前のファイルがあったので、前のフォルダに残したもの */
	kept: number;
}

/**
 * 一度だけ: 保存先の名前が以前の既定（…/ログ・…/種目）なら、英語の名前（…/log・…/exercise）にする。
 * 前の名前の保存先と、利用者が付けた英語の名前のフォルダにノートが分かれて「保存先」を毎回聞かれていたため。
 * - 前のフォルダの中身を同じ相対パスで移す（FileManager.renameFile なのでリンクも直る）。
 *   移し先に同じ名前のファイルがあれば上書きせずに残す。空になった前のフォルダはゴミ箱へ
 * - 移し先にこのプラグインのノートではないノートがあれば、その保存先は変えない（自分のノートを記録・種目として読まないため）
 * - 別の端末で先に移していれば（前のフォルダが無い）、設定だけを変える
 * - 利用者が自分で付けた名前（最後の名前が ログ・種目 ではない）には触らない
 */
export async function migrateFolderNames(
	app: App,
	store: DataStore,
): Promise<FolderRename[]> {
	if (store.current.migrations.includes(ENGLISH_FOLDER_MIGRATION)) return [];
	const plan: Array<{ key: FolderKey; from: string; to: string }> = [];
	for (const key of FOLDER_KEYS) {
		const legacy = LEGACY_FOLDER_NAMES[key];
		if (legacy === undefined) continue;
		const from = normalizePath(store.settings[key]);
		const to = renamedLeaf(from, legacy, leafName(DEFAULT_SETTINGS[key]));
		if (to === null || (await hasForeignNotes(app, key, to))) continue;
		plan.push({ key, from, to });
	}
	const final = (key: FolderKey) =>
		plan.find((p) => p.key === key)?.to ??
		normalizePath(store.settings[key]);
	const results: FolderRename[] = [];
	if (!foldersOverlap(final('logFolder'), final('exerciseFolder')))
		for (const { key, from, to } of plan) {
			const { moved, kept } = await moveFolderContents(app, from, to);
			if (key === 'logFolder') await retargetBasesFile(app, from, to);
			results.push({ key, from, to, moved, kept });
		}
	await store.update((data) => {
		for (const result of results) data.settings[result.key] = result.to;
		data.migrations.push(ENGLISH_FOLDER_MIGRATION);
	});
	return results;
}

/** 名前を英語にしたことの知らせ（前のフォルダに残したノートがあればその場所も） */
export function folderRenameMessage(results: readonly FolderRename[]): string {
	const name = folderName;
	const lines = [
		t('notice.folderNamesEnglish', {
			list: results
				.map((r) =>
					t('notice.folderNamesItem', {
						name: name(r.key),
						folder: r.to,
					}),
				)
				.join('、'),
		}),
	];
	for (const r of results)
		if (r.kept > 0)
			lines.push(
				t('notice.folderNamesKept', {
					name: name(r.key),
					n: r.kept,
					target: r.to,
					source: r.from,
				}),
			);
	return lines.join('\n');
}

/** フォルダの中のファイル（サブフォルダの中も。.md 以外も） */
function collectFiles(folder: TFolder, out: TFile[]): void {
	for (const child of folder.children) {
		if (child instanceof TFolder) collectFiles(child, out);
		else if (child instanceof TFile) out.push(child);
	}
}

/**
 * 移し先のフォルダに、このプラグインのノートではない Markdown ノートがあるか
 * （記録: 管理ブロックの無いノート、種目: fitness_id の無いノート）
 */
async function hasForeignNotes(
	app: App,
	key: FolderKey,
	folderPath: string,
): Promise<boolean> {
	const folder = app.vault.getFolderByPath(folderPath);
	if (!folder) return false;
	const files: TFile[] = [];
	collectFiles(folder, files);
	for (const file of files) {
		if (file.extension !== 'md') continue;
		const text = await app.vault.cachedRead(file);
		if (!isPluginNote(key, text)) return true;
	}
	return false;
}

function isPluginNote(key: FolderKey, text: string): boolean {
	if (key === 'logFolder') return text.includes(BLOCK_START);
	const info = getFrontMatterInfo(text);
	if (!info.exists) return false;
	try {
		const fm: unknown = parseYaml(info.frontmatter);
		return (
			typeof fm === 'object' &&
			fm !== null &&
			typeof (fm as Record<string, unknown>)[EXERCISE_KEYS.id] ===
				'string'
		);
	} catch {
		return false;
	}
}

/** from の中身を to へ（同じ相対パス）。移し先に同じ名前があれば残す。空になった from はゴミ箱へ */
async function moveFolderContents(
	app: App,
	from: string,
	to: string,
): Promise<{ moved: number; kept: number }> {
	await ensureFolder(app, to);
	const folder = app.vault.getFolderByPath(from);
	if (!folder) return { moved: 0, kept: 0 };
	const files: TFile[] = [];
	collectFiles(folder, files);
	const result = await moveNotes(
		app,
		files.map((f) => f.path),
		from,
		to,
	);
	const left = app.vault.getFolderByPath(from);
	if (left) {
		const rest: TFile[] = [];
		collectFiles(left, rest);
		if (rest.length === 0) await app.fileManager.trashFile(left);
	}
	return { moved: result.moved, kept: result.skipped.length };
}

/** ログの Bases ファイルを移したら、絞り込みのフォルダも新しい保存先に */
async function retargetBasesFile(
	app: App,
	from: string,
	to: string,
): Promise<void> {
	const file = app.vault.getFileByPath(
		normalizePath(`${to}/${BASES_FILE_NAME}`),
	);
	if (!file) return;
	await app.vault.process(file, (text) =>
		retargetBasesFolder(text, from, to),
	);
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
