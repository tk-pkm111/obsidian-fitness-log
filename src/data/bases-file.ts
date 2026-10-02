import { normalizePath, stringifyYaml, type App, type TFile } from 'obsidian';
import { BASES_FILE_NAME, basesFileContent } from '../lib/log/bases';

/** ログフォルダに .base を作る（既にあればそれを返す。上書きしない） */
export async function ensureBasesFile(
	app: App,
	logFolder: string,
): Promise<TFile> {
	const folder = normalizePath(logFolder);
	const path = normalizePath(`${folder}/${BASES_FILE_NAME}`);
	const existing = app.vault.getFileByPath(path);
	if (existing) return existing;
	let current = '';
	for (const part of folder.split('/')) {
		current = current ? `${current}/${part}` : part;
		if (!app.vault.getFolderByPath(current))
			await app.vault.createFolder(current);
	}
	return app.vault.create(path, stringifyYaml(basesFileContent(folder)));
}
