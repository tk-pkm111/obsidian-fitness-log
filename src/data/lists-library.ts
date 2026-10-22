import {
	debounce,
	getFrontMatterInfo,
	normalizePath,
	parseYaml,
	stringifyYaml,
	TFile,
	type App,
	type Component,
} from 'obsidian';
import { t } from '../i18n';
import {
	addListName,
	addRecordType,
	applyListsToFrontmatter,
	defaultRecordType,
	isListsNote,
	listsFromFrontmatter,
	moveListItem,
	removeListItem,
	renameListItem,
	type ExerciseLists,
	type ListKind,
	type NameListKind,
} from '../lib/model/lists';
import type { Exercise, RecordType } from '../lib/model/types';
import type { DataStore } from './data-store';
import type { ExerciseLibrary } from './exercise-library';

/** 設定ノートの名前（新しく作るとき。移した・名前を変えたノートもタグで見つける） */
export const LISTS_NOTE_NAME = 'Fitness Log 設定';

/**
 * 種目の選択肢（カテゴリ・器具・記録のしかた）の設定ノートの読み書き。
 * 一覧の正はノートの frontmatter で、DataStore.lists はその写し（data.json には保存しない）。
 *
 * - ノートが無いあいだは既定の一覧。最初に一覧を変えたときに、種目フォルダの隣にノートを作る
 * - ほかの端末での変更（Obsidian Sync）・Properties 欄での編集は、メタデータの変更を見て読み直す
 * - カテゴリ・器具の名前を変えた・消したときは、使っている種目ノートも書き直す
 *   （記録のしかたを消したら、使っていた種目は一覧の先頭の記録のしかたにする）
 */
export class ListsLibrary {
	private path: string | null = null;
	private loading: Promise<void> | null = null;
	private readonly reloadLater = debounce(() => void this.load(), 300, true);

	constructor(
		private readonly app: App,
		private readonly store: DataStore,
		private readonly exercises: ExerciseLibrary,
	) {}

	/** 新しく作るときの場所: 種目フォルダの隣（'Fitness/exercise' → 'Fitness/Fitness Log 設定.md'） */
	get defaultPath(): string {
		const folder = normalizePath(this.store.settings.exerciseFolder);
		const slash = folder.lastIndexOf('/');
		const parent = slash < 0 ? '' : folder.slice(0, slash);
		return normalizePath(
			parent
				? `${parent}/${LISTS_NOTE_NAME}.md`
				: `${LISTS_NOTE_NAME}.md`,
		);
	}

	get lists(): ExerciseLists {
		return this.store.lists;
	}

	ensureLoaded(): Promise<void> {
		this.loading ??= this.load();
		return this.loading;
	}

	/** 種目の保存先が変わったとき（設定ノートを探し直す） */
	reload(): Promise<void> {
		this.loading = this.load();
		return this.loading;
	}

	registerVaultEvents(component: Component): void {
		const { vault, metadataCache } = this.app;
		component.registerEvent(
			metadataCache.on('changed', (file, _data, cache) => {
				if (
					file.path === this.path ||
					isListsNote(cache.frontmatter ?? null)
				)
					this.reloadLater();
			}),
		);
		component.registerEvent(
			vault.on('delete', (file) => {
				if (file.path === this.path) this.reloadLater();
			}),
		);
		component.registerEvent(
			vault.on('rename', (file, oldPath) => {
				if (oldPath === this.path) this.path = file.path;
			}),
		);
	}

	private async load(): Promise<void> {
		await new Promise<void>((resolve) =>
			this.app.workspace.onLayoutReady(resolve),
		);
		const file = this.findNote();
		this.path = file?.path ?? null;
		this.publish(
			listsFromFrontmatter(
				file ? await this.readFrontmatter(file) : null,
			),
		);
	}

	/** 既定の場所のノート → タグの付いたノート（パスの順で最初のもの） */
	private findNote(): TFile | null {
		const { vault, metadataCache } = this.app;
		const byPath = vault.getFileByPath(this.defaultPath);
		if (byPath) return byPath;
		return (
			vault
				.getMarkdownFiles()
				.filter((f) =>
					isListsNote(
						metadataCache.getFileCache(f)?.frontmatter ?? null,
					),
				)
				.sort((a, b) => a.path.localeCompare(b.path))[0] ?? null
		);
	}

	private async readFrontmatter(
		file: TFile,
	): Promise<Record<string, unknown> | null> {
		const info = getFrontMatterInfo(await this.app.vault.cachedRead(file));
		if (!info.exists) return null;
		try {
			const parsed: unknown = parseYaml(info.frontmatter);
			return typeof parsed === 'object' &&
				parsed !== null &&
				!Array.isArray(parsed)
				? (parsed as Record<string, unknown>)
				: null;
		} catch (error) {
			console.warn(
				`[fitness-log] ${file.path} の frontmatter を読めません`,
				error,
			);
			return null;
		}
	}

	private publish(lists: ExerciseLists): void {
		if (JSON.stringify(lists) === JSON.stringify(this.store.lists)) return;
		this.store.setLists(lists);
	}

	private async save(next: ExerciseLists): Promise<void> {
		await this.ensureLoaded();
		const existing = this.path
			? this.app.vault.getFileByPath(this.path)
			: null;
		if (existing)
			await this.app.fileManager.processFrontMatter(
				existing,
				(fm: Record<string, unknown>) =>
					applyListsToFrontmatter(fm, next),
			);
		else {
			const path = this.defaultPath;
			const slash = path.lastIndexOf('/');
			if (slash > 0) await this.ensureFolder(path.slice(0, slash));
			const fm: Record<string, unknown> = {};
			applyListsToFrontmatter(fm, next);
			const file = await this.app.vault.create(
				path,
				`---\n${stringifyYaml(fm)}---\n${t('lists.noteBody')}\n`,
			);
			this.path = file.path;
		}
		this.publish(next);
	}

	private async ensureFolder(path: string): Promise<void> {
		let current = '';
		for (const part of path.split('/')) {
			if (!part) continue;
			current = current ? `${current}/${part}` : part;
			if (this.app.vault.getFolderByPath(current)) continue;
			try {
				await this.app.vault.createFolder(current);
			} catch (error) {
				if (!this.app.vault.getFolderByPath(current)) throw error;
			}
		}
	}

	// -------------------------------------------------------------------------
	// 一覧の変更

	/** カテゴリ・器具を足す（足した名前を返す） */
	async addName(kind: NameListKind, name: string): Promise<string> {
		const next = addListName(this.lists, kind, name);
		await this.save(next);
		return next[kind][next[kind].length - 1] ?? name;
	}

	async addRecordType(type: RecordType, name: string): Promise<void> {
		await this.save(addRecordType(this.lists, type, name));
	}

	/** 名前を変える。カテゴリ・器具は、その名前の種目も新しい名前に */
	async rename(kind: ListKind, index: number, name: string): Promise<void> {
		const before = this.lists;
		const next = renameListItem(before, kind, index, name);
		if (next === before) return;
		await this.save(next);
		if (kind === 'recordTypes') return;
		const from = before[kind][index];
		const to = next[kind][index];
		if (from === undefined || to === undefined) return;
		await this.updateExercises(
			(e) => (kind === 'categories' ? e.category : e.equipment) === from,
			kind === 'categories' ? { category: to } : { equipment: to },
		);
	}

	/**
	 * 消す。カテゴリ・器具を使っていた種目はその欄を空に、
	 * 記録のしかたを使っていた種目は一覧の先頭の記録のしかたに
	 */
	async remove(kind: ListKind, index: number): Promise<void> {
		const before = this.lists;
		const next = removeListItem(before, kind, index);
		await this.save(next);
		if (kind === 'recordTypes') {
			const type = before.recordTypes[index]?.type;
			await this.updateExercises((e) => e.recordType === type, {
				recordType: defaultRecordType(next),
			});
			return;
		}
		const name = before[kind][index];
		await this.updateExercises(
			(e) => (kind === 'categories' ? e.category : e.equipment) === name,
			kind === 'categories' ? { category: '' } : { equipment: undefined },
		);
	}

	async move(kind: ListKind, from: number, to: number): Promise<void> {
		const next = moveListItem(this.lists, kind, from, to);
		if (next !== this.lists) await this.save(next);
	}

	/** その名前（記録のしかた）を使っている種目の数（アーカイブも含む） */
	usage(kind: ListKind, index: number): number {
		const lists = this.lists;
		const { exercises } = this.store.current;
		if (kind === 'recordTypes') {
			const type = lists.recordTypes[index]?.type;
			return exercises.filter((e) => e.recordType === type).length;
		}
		const name = lists[kind][index];
		return exercises.filter(
			(e) => (kind === 'categories' ? e.category : e.equipment) === name,
		).length;
	}

	private async updateExercises(
		match: (exercise: Exercise) => boolean,
		fields: Partial<
			Pick<Exercise, 'category' | 'equipment' | 'recordType'>
		>,
	): Promise<void> {
		const targets = this.store.current.exercises.filter(match);
		for (const exercise of targets)
			await this.exercises.update(exercise.id, fields);
	}
}
