import {
	debounce,
	Events,
	TFile,
	TFolder,
	type App,
	type Component,
	type EventRef,
} from 'obsidian';
import {
	collectOccurrences,
	type ExerciseOccurrence,
} from '../lib/history/carry-over';
import { parseDayNote } from '../lib/log/markdown';
import type { DayLog } from '../lib/model/types';
import type { LogRepository } from './log-repository';

/** 日ノートの読み込みに失敗した記録（画面で「ノートを開く」導線を出す） */
export interface IndexError {
	path: string;
	reason: string;
}

/**
 * ログフォルダの日ノートをメモリに持つ履歴索引。実装計画 §4.5。
 * - 起動時には何もしない。画面を開いたとき（ensureBuilt）に初めて走査する
 * - vault 全体ではなくログフォルダの中だけを辿る
 * - ログフォルダ内の変更は 300 ms まとめて、変わったファイルだけを読み直す
 * - 変化があれば 'change' を発火する
 */
export class LogIndex extends Events {
	private days = new Map<string, DayLog>();
	/** path → date */
	private paths = new Map<string, string>();
	private errors = new Map<string, IndexError>();
	private building: Promise<void> | null = null;
	/** 走査の世代。作り直したら古い走査の読み込み結果は捨てる */
	private generation = 0;
	private pending = new Set<string>();
	private readonly flushLater = debounce(
		() => void this.flushPending(),
		300,
		true,
	);

	constructor(
		private readonly app: App,
		private readonly repository: LogRepository,
	) {
		super();
	}

	get isBuilt(): boolean {
		return this.building !== null;
	}

	ensureBuilt(): Promise<void> {
		this.building ??= this.build();
		return this.building;
	}

	/** 設定（フォルダ・書式）が変わったときに作り直す */
	async rebuild(): Promise<void> {
		this.building = null;
		await this.ensureBuilt();
	}

	onChange(callback: () => void): EventRef {
		return this.on('change', callback);
	}

	/** vault の変更を購読する（layout ready 後に呼ぶ。起動時の create を拾わないため） */
	registerVaultEvents(component: Component): void {
		const { vault } = this.app;
		component.registerEvent(
			vault.on('create', (file) => this.touch(file.path)),
		);
		component.registerEvent(
			vault.on('modify', (file) => this.touch(file.path)),
		);
		component.registerEvent(
			vault.on('delete', (file) => this.touch(file.path)),
		);
		component.registerEvent(
			vault.on('rename', (file, oldPath) => {
				this.touch(oldPath);
				this.touch(file.path);
			}),
		);
	}

	day(date: string): DayLog | undefined {
		return this.days.get(date);
	}

	errorFor(date: string): IndexError | undefined {
		return this.errors.get(date);
	}

	/** 日付の昇順 */
	allDays(): DayLog[] {
		return [...this.days.values()].sort((a, b) =>
			a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
		);
	}

	/** 種目の出現（新しい順） */
	occurrences(
		matchesExercise: (name: string) => boolean,
	): ExerciseOccurrence[] {
		return collectOccurrences(this.days.values(), matchesExercise);
	}

	/** 自分で書き込んだ直後に反映する（vault のイベントを待たずに画面を更新する） */
	setDay(day: DayLog): void {
		const path = this.repository.pathFor(day.date);
		this.store(path, day.date, day);
		this.trigger('change');
	}

	private async build(): Promise<void> {
		const generation = ++this.generation;
		this.days.clear();
		this.paths.clear();
		this.errors.clear();
		const folder = this.app.vault.getFolderByPath(
			this.repository.folderPath,
		);
		if (folder) {
			const files: TFile[] = [];
			collectMarkdownFiles(folder, files);
			await Promise.all(
				files.map((file) => this.readFile(file, generation)),
			);
		}
		if (generation === this.generation) this.trigger('change');
	}

	private touch(path: string): void {
		if (!this.isBuilt) return;
		if (!this.paths.has(path) && this.repository.dateFor(path) === null)
			return;
		this.pending.add(path);
		this.flushLater();
	}

	private async flushPending(): Promise<void> {
		const paths = [...this.pending];
		this.pending.clear();
		for (const path of paths) {
			this.forget(path);
			const file = this.app.vault.getFileByPath(path);
			if (file) await this.readFile(file);
		}
		if (paths.length > 0) this.trigger('change');
	}

	private async readFile(
		file: TFile,
		generation = this.generation,
	): Promise<void> {
		const date = this.repository.dateFor(file.path);
		if (date === null) return;
		const text = await this.app.vault.cachedRead(file);
		if (generation !== this.generation) return; // 読んでいる間に作り直された
		const parsed = parseDayNote(text, date);
		if (parsed.ok) this.store(file.path, date, parsed.day);
		else {
			this.forget(file.path);
			this.paths.set(file.path, date);
			this.errors.set(date, { path: file.path, reason: parsed.error });
		}
	}

	private store(path: string, date: string, day: DayLog): void {
		this.paths.set(path, date);
		this.days.set(date, day);
		this.errors.delete(date);
	}

	private forget(path: string): void {
		const date = this.paths.get(path);
		if (date === undefined) return;
		this.paths.delete(path);
		this.days.delete(date);
		this.errors.delete(date);
	}
}

function collectMarkdownFiles(folder: TFolder, out: TFile[]): void {
	for (const child of folder.children) {
		if (child instanceof TFolder) collectMarkdownFiles(child, out);
		else if (child instanceof TFile && child.extension === 'md')
			out.push(child);
	}
}
