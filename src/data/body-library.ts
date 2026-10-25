import {
	debounce,
	Events,
	normalizePath,
	stringifyYaml,
	TFile,
	type App,
	type Component,
	type EventRef,
} from 'obsidian';
import {
	applyMeasurement,
	bodyNoteDate,
	measurementFromNote,
	sortMeasurements,
	type BodyMeasurement,
} from '../lib/body/note';
import { isInside } from '../lib/folders';
import type { DataStore } from './data-store';
import { ensureFolder } from './folders';

/**
 * 体組成のノート（1 測定 1 ノート、`{bodyFolder}/YYYY-MM-DD.md`）の読み書き。
 * - 保存先の中（サブフォルダも）の、名前が日付のノートを metadataCache の frontmatter から読む（本文は読まない）
 * - ほかの端末の変更（Sync）・自動取得の書き込み・手での編集は、メタデータの変更を見て読み直す
 * - 「体組成を記録する」がオフのあいだは読まない（起動を軽く保つ）。体組成のページを開いたときに読む
 */
export class BodyLibrary extends Events {
	private measurements: BodyMeasurement[] = [];
	private loaded = false;
	/** 読み始めてから、メタデータの最初の「そろった」をまだ見ていない */
	private waitingResolved = false;
	private readonly reloadLater = debounce(() => this.load(), 300, true);

	constructor(
		private readonly app: App,
		private readonly store: DataStore,
	) {
		super();
	}

	get folderPath(): string {
		return normalizePath(this.store.settings.bodyFolder);
	}

	get isLoaded(): boolean {
		return this.loaded;
	}

	/** 測定（日付の昇順） */
	get all(): readonly BodyMeasurement[] {
		return this.measurements;
	}

	/**
	 * まだ読んでいなければ読む（体組成のページを開いたとき）。
	 * 起動直後（スマホは特に）は vault のファイルの一覧とノートのメタデータがそろっていないので、
	 * レイアウトの準備完了を待って読み、メタデータがそろったとき（resolved）にもう一度読む
	 * （起動前からあるノートは変わらないので、changed では読み直せない）
	 */
	ensureLoaded(): void {
		if (this.loaded) return;
		this.loaded = true;
		this.waitingResolved = true;
		this.app.workspace.onLayoutReady(() => this.load());
	}

	/** 保存先が変わったとき（読んでいれば読み直す） */
	reload(): void {
		if (this.loaded) this.load();
	}

	onChange(callback: () => void): EventRef {
		return this.on('change', callback);
	}

	private isBodyPath(path: string): boolean {
		if (!isInside(path, this.folderPath) || !path.endsWith('.md'))
			return false;
		const name = path.slice(path.lastIndexOf('/') + 1, -'.md'.length);
		return bodyNoteDate(name) !== null;
	}

	registerVaultEvents(component: Component): void {
		const { vault, metadataCache } = this.app;
		const touched = (...paths: string[]) => {
			if (this.loaded && paths.some((p) => this.isBodyPath(p)))
				this.reloadLater();
		};
		component.registerEvent(
			metadataCache.on('changed', (file) => touched(file.path)),
		);
		component.registerEvent(
			metadataCache.on('resolved', () => {
				if (!this.loaded || !this.waitingResolved) return;
				this.waitingResolved = false;
				this.reloadLater();
			}),
		);
		component.registerEvent(
			vault.on('delete', (file) => touched(file.path)),
		);
		component.registerEvent(
			vault.on('rename', (file, oldPath) => touched(file.path, oldPath)),
		);
	}

	private load(): void {
		this.loaded = true;
		const { vault, metadataCache } = this.app;
		const found: BodyMeasurement[] = [];
		for (const file of vault.getMarkdownFiles()) {
			if (!this.isBodyPath(file.path)) continue;
			const m = measurementFromNote(
				file.path,
				file.basename,
				metadataCache.getFileCache(file)?.frontmatter,
			);
			if (m) found.push(m);
		}
		this.publish(sortMeasurements(found));
	}

	private publish(next: BodyMeasurement[]): void {
		if (JSON.stringify(next) === JSON.stringify(this.measurements)) return;
		this.measurements = next;
		this.trigger('change');
	}

	/**
	 * 測定を書く。その日のノートが無ければ作り、あれば入れた項目（と時刻）だけを書き換える。
	 * メタデータの更新を待たずに画面へ出す（読み直しで同じ内容になる）
	 */
	async record(
		date: string,
		time: string | null,
		values: Readonly<Record<string, number>>,
	): Promise<void> {
		this.ensureLoaded();
		const existing = this.measurements.find((m) => m.date === date);
		const path = existing?.path ?? `${this.folderPath}/${date}.md`;
		const file = this.app.vault.getFileByPath(path);
		if (file instanceof TFile)
			await this.app.fileManager.processFrontMatter(
				file,
				(fm: Record<string, unknown>) =>
					applyMeasurement(fm, values, time),
			);
		else {
			await ensureFolder(this.app, this.folderPath);
			const fm: Record<string, unknown> = {};
			applyMeasurement(fm, values, time);
			await this.app.vault.create(path, `---\n${stringifyYaml(fm)}---\n`);
		}
		const merged: BodyMeasurement = {
			date,
			path,
			time: time ?? existing?.time ?? null,
			values: { ...existing?.values, ...values },
		};
		this.publish(
			sortMeasurements([
				...this.measurements.filter((m) => m.date !== date),
				merged,
			]),
		);
	}
}
