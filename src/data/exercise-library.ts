import {
	debounce,
	Events,
	getFrontMatterInfo,
	normalizePath,
	parseYaml,
	stringifyYaml,
	TFile,
	TFolder,
	type App,
	type Component,
	type EventRef,
} from 'obsidian';
import {
	checkCanDeleteExercise,
	CatalogError,
	prepareExerciseUpdate,
	prepareNewExercise,
	removeExerciseFromPackages,
	type ExerciseFields,
} from '../lib/model/catalog';
import { planSeed, type CatalogPlan } from '../lib/model/data';
import {
	applyExerciseToFrontmatter,
	duplicateIdPaths,
	EXERCISE_KEYS,
	EXERCISE_TAG,
	exerciseFromNote,
	exerciseNoteFrontmatter,
} from '../lib/model/exercise-note';
import { newId } from '../lib/model/ids';
import type { Exercise } from '../lib/model/types';
import type { DataStore } from './data-store';

export interface SeedResult {
	addedExercises: number;
	addedPackages: number;
}

/**
 * 種目ノート（1 種目 1 ノート、`{exerciseFolder}/{種目名}.md`）の一覧と読み書き。
 *
 * - 種目の設定は frontmatter が正。Properties 欄で直す・ファイル名を変える・削除する、のどれも反映する
 * - 一覧は DataStore の data.exercises（保存しないメモリ上の値）に流し込み、画面はそれを読む
 * - 本文（フォームやコツのメモ）はプラグインが触らない
 */
export class ExerciseLibrary extends Events {
	private byPath = new Map<string, Exercise>();
	private loading: Promise<void> | null = null;
	private ready = false;
	private generation = 0;
	private pending = new Set<string>();
	/** ファイル名を変えたノート（新しいパス → 旧名）。旧名を別名に足す */
	private renamedFrom = new Map<string, string>();
	private readonly flushLater = debounce(
		() => void this.flushPending(),
		300,
		true,
	);

	constructor(
		private readonly app: App,
		private readonly store: DataStore,
	) {
		super();
	}

	get folderPath(): string {
		return normalizePath(this.store.settings.exerciseFolder);
	}

	get isLoaded(): boolean {
		return this.loading !== null;
	}

	/** 種目ノートを読み終えたか（まだなら一覧は空のことがある） */
	get isReady(): boolean {
		return this.ready;
	}

	ensureLoaded(): Promise<void> {
		this.loading ??= this.loadAll();
		return this.loading;
	}

	/** 種目フォルダの設定が変わったときに読み直す（ノートは移動しない） */
	async reload(): Promise<void> {
		this.loading = null;
		await this.ensureLoaded();
	}

	onChange(callback: () => void): EventRef {
		return this.on('change', callback);
	}

	/** vault の変更を購読する（layout ready 後に呼ぶ） */
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
				const old = this.byPath.get(oldPath);
				if (old && file.path !== oldPath)
					this.renamedFrom.set(file.path, old.name);
				this.touch(oldPath);
				this.touch(file.path);
			}),
		);
	}

	// -------------------------------------------------------------------------
	// 読み込み

	private inFolder(path: string): boolean {
		const folder = this.folderPath;
		return (
			path.endsWith('.md') &&
			(folder === '/' || path.startsWith(`${folder}/`))
		);
	}

	private async loadAll(): Promise<void> {
		const generation = ++this.generation;
		// vault のファイル一覧がそろってから読む
		await new Promise<void>((resolve) =>
			this.app.workspace.onLayoutReady(resolve),
		);
		if (generation !== this.generation) return;
		const files: TFile[] = [];
		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (folder) collectMarkdownFiles(folder, files);
		const loaded = new Map<string, Exercise>();
		const withoutId: TFile[] = [];
		await Promise.all(
			files.map(async (file) => {
				const exercise = await this.readNote(file);
				if (exercise === undefined) return; // YAML が読めない
				if (exercise) loaded.set(file.path, exercise);
				else withoutId.push(file);
			}),
		);
		if (generation !== this.generation) return;
		this.byPath = loaded;
		// id の無いノート（手で作った）・重複した id（ノートを複製した）に id を振る
		const duplicates = duplicateIdPaths(this.sorted());
		for (const path of duplicates) {
			const file = this.app.vault.getFileByPath(path);
			if (file) withoutId.push(file);
			this.byPath.delete(path);
		}
		for (const file of withoutId) await this.assignId(file);
		this.ready = true;
		this.publish();
	}

	/** ノートを読む。id が無ければ null、YAML が読めなければ undefined */
	private async readNote(file: TFile): Promise<Exercise | null | undefined> {
		const text = await this.app.vault.cachedRead(file);
		const info = getFrontMatterInfo(text);
		let frontmatter: Record<string, unknown> | null = null;
		if (info.exists) {
			try {
				const parsed: unknown = parseYaml(info.frontmatter);
				if (
					typeof parsed === 'object' &&
					parsed !== null &&
					!Array.isArray(parsed)
				)
					frontmatter = parsed as Record<string, unknown>;
			} catch (error) {
				console.warn(
					`[fitness-log] ${file.path} の frontmatter を読めません`,
					error,
				);
				return undefined;
			}
		}
		return exerciseFromNote({
			path: file.path,
			basename: file.basename,
			frontmatter,
			createdAt: new Date(file.stat.ctime || Date.now()).toISOString(),
		});
	}

	private async assignId(file: TFile): Promise<void> {
		const id = newId(
			'ex',
			new Set([...this.byPath.values()].map((e) => e.id)),
		);
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm[EXERCISE_KEYS.id] = id;
				const tags = Array.isArray(fm[EXERCISE_KEYS.tags])
					? (fm[EXERCISE_KEYS.tags] as unknown[])
					: [];
				if (!tags.includes(EXERCISE_TAG))
					fm[EXERCISE_KEYS.tags] = [...tags, EXERCISE_TAG];
			},
		);
		const exercise = await this.readNote(file);
		if (exercise) this.byPath.set(file.path, exercise);
	}

	private touch(path: string): void {
		if (!this.isLoaded) return;
		if (!this.byPath.has(path) && !this.inFolder(path)) return;
		this.pending.add(path);
		this.flushLater();
	}

	private async flushPending(): Promise<void> {
		const paths = [...this.pending];
		this.pending.clear();
		let changed = false;
		for (const path of paths) {
			if (this.byPath.delete(path)) changed = true;
			const file = this.app.vault.getFileByPath(path);
			if (!file || !this.inFolder(path)) continue;
			let exercise = await this.readNote(file);
			if (exercise === null) {
				await this.assignId(file);
				exercise = this.byPath.get(path) ?? null;
			}
			if (!exercise) continue;
			this.byPath.set(path, exercise);
			changed = true;
			// ファイル名を変えたら旧名を別名に残す（過去の日ノートの名前で引けるように）
			const oldName = this.renamedFrom.get(path);
			this.renamedFrom.delete(path);
			if (
				oldName &&
				oldName !== exercise.name &&
				!exercise.aliases.includes(oldName)
			) {
				const next = {
					...exercise,
					aliases: [...exercise.aliases, oldName],
				};
				await this.app.fileManager.processFrontMatter(
					file,
					(fm: Record<string, unknown>) =>
						applyExerciseToFrontmatter(fm, next),
				);
				this.byPath.set(path, next);
			}
		}
		if (changed) this.publish();
	}

	private sorted(): Exercise[] {
		return [...this.byPath.values()].sort((a, b) =>
			a.name.localeCompare(b.name, 'ja'),
		);
	}

	private publish(): void {
		this.store.setExercises(this.sorted());
		this.trigger('change');
	}

	// -------------------------------------------------------------------------
	// 書き込み

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

	/** 種目ノートを作る（frontmatter だけ。本文は空） */
	private async writeNote(exercise: Exercise): Promise<Exercise> {
		const folder = this.folderPath;
		await this.ensureFolder(folder);
		const path = normalizePath(`${folder}/${exercise.name}.md`);
		if (this.app.vault.getAbstractFileByPath(path))
			throw new CatalogError(`「${path}」が既にあります`);
		const file = await this.app.vault.create(
			path,
			`---\n${stringifyYaml(exerciseNoteFrontmatter(exercise))}---\n`,
		);
		const saved = { ...exercise, path: file.path };
		this.byPath.set(file.path, saved);
		return saved;
	}

	async create(fields: ExerciseFields): Promise<Exercise> {
		await this.ensureLoaded();
		const exercise = prepareNewExercise(
			this.store.current.exercises,
			fields,
			new Date().toISOString(),
		);
		const saved = await this.writeNote(exercise);
		this.publish();
		return saved;
	}

	async update(
		id: string,
		fields: Partial<ExerciseFields>,
	): Promise<Exercise> {
		await this.ensureLoaded();
		const current = this.store.current.exercises.find((e) => e.id === id);
		const file = current?.path
			? this.app.vault.getFileByPath(current.path)
			: null;
		if (!current || !file)
			throw new CatalogError('種目のノートが見つかりません');
		const next = prepareExerciseUpdate(
			this.store.current.exercises,
			current,
			fields,
		);
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) =>
				applyExerciseToFrontmatter(fm, next),
		);
		let path = file.path;
		if (next.name !== current.name) {
			// 同じフォルダの中で名前だけ変える。リンクは Obsidian の設定に従って更新される
			const parent = file.parent?.path ?? this.folderPath;
			path = normalizePath(
				`${parent === '/' ? '' : `${parent}/`}${next.name}.md`,
			);
			if (this.app.vault.getAbstractFileByPath(path))
				throw new CatalogError(`「${path}」が既にあります`);
			await this.app.fileManager.renameFile(file, path);
		}
		this.byPath.delete(current.path ?? '');
		const saved = { ...next, path };
		this.byPath.set(path, saved);
		this.publish();
		return saved;
	}

	/** 種目を消す（ノートは Obsidian の設定に従ってゴミ箱へ）。パッケージからも外す */
	async remove(id: string): Promise<void> {
		await this.ensureLoaded();
		checkCanDeleteExercise(this.store.current, id);
		const current = this.store.current.exercises.find((e) => e.id === id);
		const file = current?.path
			? this.app.vault.getFileByPath(current.path)
			: null;
		if (file) await this.app.fileManager.trashFile(file);
		if (current?.path) this.byPath.delete(current.path);
		await this.store.update((data) => removeExerciseFromPackages(data, id));
		this.publish();
	}

	/** 計画（新しい種目＋パッケージ）を実行する: 種目ノートを作ってからパッケージを足す */
	async applyPlan(plan: CatalogPlan): Promise<void> {
		await this.ensureLoaded();
		for (const exercise of plan.exercises) await this.writeNote(exercise);
		this.publish();
		if (plan.packages.length > 0)
			await this.store.update((data) => {
				data.packages.push(...plan.packages);
			});
	}

	/** 初期データ（種目ノート・PPL のパッケージ）を足す。上書きはしない */
	async seed(now = new Date()): Promise<SeedResult> {
		await this.ensureLoaded();
		const plan = planSeed(this.store.current, now.toISOString());
		await this.applyPlan(plan);
		await this.store.update((data) => {
			data.seededAt = now.toISOString();
		});
		return {
			addedExercises: plan.exercises.length,
			addedPackages: plan.packages.length,
		};
	}

	/**
	 * 以前の版（種目を data.json に保存していた）からの移行。
	 * まだノートの無い種目だけ、同じ id でノートを作る（パッケージの参照はそのまま繋がる）。
	 */
	async migrateLegacy(): Promise<number> {
		await this.ensureLoaded();
		const legacy = this.store.takeLegacyExercises();
		if (legacy.length === 0) return 0;
		const ids = new Set(this.store.current.exercises.map((e) => e.id));
		let created = 0;
		for (const exercise of legacy) {
			if (ids.has(exercise.id)) continue;
			try {
				const prepared = prepareNewExercise(
					[...this.byPath.values()],
					exercise,
					exercise.createdAt,
					exercise.id,
				);
				await this.writeNote(prepared);
				created++;
			} catch (error) {
				console.warn(
					'[fitness-log] 種目ノートへの移行をスキップしました',
					exercise.name,
					error,
				);
			}
		}
		this.publish();
		await this.store.update(() => undefined); // data.json から古い種目一覧を消す
		return created;
	}
}

function collectMarkdownFiles(folder: TFolder, out: TFile[]): void {
	for (const child of folder.children) {
		if (child instanceof TFolder) collectMarkdownFiles(child, out);
		else if (child instanceof TFile && child.extension === 'md')
			out.push(child);
	}
}
