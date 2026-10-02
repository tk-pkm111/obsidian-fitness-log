/**
 * テスト用の仮想 vault（ファイルの中身を文字列で持つ）と FileManager。
 * Obsidian 本体の仕様のうち、このプラグインが頼るものを再現する:
 * - create は親フォルダが無いと失敗する／既にあると失敗する
 * - createFolder は既にあると失敗する
 * - process はコールバックの戻り値を書き込み、'modify' を発火する
 * - processFrontMatter は YAML の frontmatter を読み書きする
 */
import YAML from 'yaml';
import type { App } from 'obsidian';
import {
	Events,
	TFile,
	TFolder,
	type TAbstractFile,
} from '../__mocks__/obsidian';

function splitPath(path: string): { parent: string; name: string } {
	const index = path.lastIndexOf('/');
	return index < 0
		? { parent: '/', name: path }
		: { parent: path.slice(0, index), name: path.slice(index + 1) };
}

export class FakeVault extends Events {
	readonly root = Object.assign(new TFolder(), { path: '/', name: '' });
	private folders = new Map<string, TFolder>([['/', this.root]]);
	private files = new Map<string, TFile>();
	private contents = new Map<string, string>();
	/** 書き込み回数（壊れたノートに書き込んでいないことの検証用） */
	writes = 0;

	getFileByPath(path: string): TFile | null {
		return this.files.get(path) ?? null;
	}

	getFolderByPath(path: string): TFolder | null {
		return this.folders.get(path) ?? null;
	}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this.getFileByPath(path) ?? this.getFolderByPath(path);
	}

	createFolder(path: string): Promise<TFolder> {
		if (this.folders.has(path) || this.files.has(path))
			return Promise.reject(new Error('Folder already exists.'));
		const { parent, name } = splitPath(path);
		const parentFolder = this.folders.get(parent);
		if (!parentFolder)
			return Promise.reject(new Error(`ENOENT: ${parent}`));
		const folder = Object.assign(new TFolder(), {
			path,
			name,
			parent: parentFolder,
		});
		parentFolder.children.push(folder);
		this.folders.set(path, folder);
		this.trigger('create', folder);
		return Promise.resolve(folder);
	}

	create(path: string, data: string): Promise<TFile> {
		if (this.files.has(path) || this.folders.has(path))
			return Promise.reject(new Error('File already exists.'));
		const { parent, name } = splitPath(path);
		const parentFolder = this.folders.get(parent);
		if (!parentFolder)
			return Promise.reject(new Error(`ENOENT: ${parent}`));
		const dot = name.lastIndexOf('.');
		const file = Object.assign(new TFile(), {
			path,
			name,
			parent: parentFolder,
			basename: dot < 0 ? name : name.slice(0, dot),
			extension: dot < 0 ? '' : name.slice(dot + 1),
		});
		parentFolder.children.push(file);
		this.files.set(path, file);
		this.contents.set(path, data);
		this.writes++;
		this.trigger('create', file);
		return Promise.resolve(file);
	}

	read(file: TFile): Promise<string> {
		const content = this.contents.get(file.path);
		if (content === undefined) return Promise.reject(new Error('ENOENT'));
		return Promise.resolve(content);
	}

	cachedRead(file: TFile): Promise<string> {
		return this.read(file);
	}

	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		const next = fn(await this.read(file));
		this.write(file, next);
		return next;
	}

	/** テスト用: 中身を直接読む */
	text(path: string): string | undefined {
		return this.contents.get(path);
	}

	/** テスト用: 外部（ユーザーの手編集・Sync）による変更 */
	externalWrite(path: string, data: string): void {
		const file = this.files.get(path);
		if (!file) throw new Error(`no file ${path}`);
		this.write(file, data);
	}

	/** ファイル名の変更・移動（Obsidian の 'rename' を発火する） */
	rename(file: TFile, newPath: string): Promise<void> {
		if (this.files.has(newPath))
			return Promise.reject(new Error('File already exists.'));
		const { parent, name } = splitPath(newPath);
		const parentFolder = this.folders.get(parent);
		if (!parentFolder)
			return Promise.reject(new Error(`ENOENT: ${parent}`));
		const oldPath = file.path;
		const content = this.contents.get(oldPath) ?? '';
		this.files.delete(oldPath);
		this.contents.delete(oldPath);
		if (file.parent)
			file.parent.children = file.parent.children.filter(
				(c) => c !== file,
			);
		const dot = name.lastIndexOf('.');
		Object.assign(file, {
			path: newPath,
			name,
			parent: parentFolder,
			basename: dot < 0 ? name : name.slice(0, dot),
			extension: dot < 0 ? '' : name.slice(dot + 1),
		});
		parentFolder.children.push(file);
		this.files.set(newPath, file);
		this.contents.set(newPath, content);
		this.trigger('rename', file, oldPath);
		return Promise.resolve();
	}

	/** テスト用: 削除 */
	externalDelete(path: string): void {
		const file = this.files.get(path);
		if (!file) throw new Error(`no file ${path}`);
		this.files.delete(path);
		this.contents.delete(path);
		if (file.parent)
			file.parent.children = file.parent.children.filter(
				(c) => c !== file,
			);
		this.trigger('delete', file);
	}

	write(file: TFile, data: string): void {
		this.contents.set(file.path, data);
		this.writes++;
		this.trigger('modify', file);
	}
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export class FakeFileManager {
	/** ゴミ箱に入れたパス（検証用） */
	trashed: string[] = [];

	constructor(private readonly vault: FakeVault) {}

	renameFile(file: TFile, newPath: string): Promise<void> {
		return this.vault.rename(file, newPath);
	}

	trashFile(file: TFile): Promise<void> {
		this.trashed.push(file.path);
		this.vault.externalDelete(file.path);
		return Promise.resolve();
	}

	async processFrontMatter(
		file: TFile,
		fn: (frontmatter: Record<string, unknown>) => void,
	): Promise<void> {
		const text = await this.vault.read(file);
		const match = FRONTMATTER.exec(text);
		const data = (match ? YAML.parse(match[1] ?? '') : {}) as Record<
			string,
			unknown
		> | null;
		const frontmatter = data ?? {};
		fn(frontmatter);
		const body = match ? text.slice(match[0].length) : text;
		const yaml = YAML.stringify(frontmatter).trimEnd();
		this.vault.write(file, `---\n${yaml}\n---\n${body}`);
	}

	/** テスト用: frontmatter を読む */
	static read(text: string | undefined): Record<string, unknown> {
		const match = FRONTMATTER.exec(text ?? '');
		return match
			? (YAML.parse(match[1] ?? '') as Record<string, unknown>)
			: {};
	}
}

export interface FakeApp {
	vault: FakeVault;
	fileManager: FakeFileManager;
	/** src に渡すための App 型 */
	app: App;
}

export function createFakeApp(): FakeApp {
	const vault = new FakeVault();
	const fileManager = new FakeFileManager(vault);
	const workspace = {
		onLayoutReady(callback: () => void): void {
			callback();
		},
	};
	const app = { vault, fileManager, workspace } as unknown as App;
	return { vault, fileManager, app };
}
