import {
	debounce,
	getFrontMatterInfo,
	normalizePath,
	parseYaml,
	stringifyYaml,
	TFile,
	TFolder,
	type App,
	type Component,
} from 'obsidian';
import { CatalogError } from '../lib/model/catalog';
import { newId } from '../lib/model/ids';
import {
	applyPackageToFrontmatter,
	PACKAGE_KEYS,
	PACKAGES_IN_VAULT,
	packageFileName,
	packageFromNote,
	packageNoteFrontmatter,
	planPackageMigration,
	remapPackageIds,
	serializePackageNote,
	type PackageNote,
	type ResolveExercise,
} from '../lib/model/package-note';
import { createResolver } from '../lib/model/resolve';
import type { PluginData } from '../lib/model/types';
import type { DataStore } from './data-store';
import type { ExerciseLibrary } from './exercise-library';

/** ノートの今の内容（最後に読んだ・書いたもの） */
interface NoteState {
	path: string;
	/** packageNoteFrontmatter を JSON にしたもの。違えば書く */
	serialized: string;
	note: PackageNote;
}

/**
 * パッケージノート（1 パッケージ 1 ノート、`{packageFolder}/{パッケージ名}.md`）の読み書き。
 * パッケージとルーチンの正はノートで、DataStore の data.packages / data.routines はその写し（data.json には保存しない）。
 *
 * - 画面の操作は今までどおり DataStore.update で data を変える。update の中で persist() が呼ばれ、
 *   ノートの内容と違うパッケージだけを書く（名前を変えたらノートの名前も変える・消したらノートをゴミ箱へ）
 * - ほかの端末での変更（Obsidian Sync）・Properties 欄での編集・ファイル名の変更は、vault の変更を見て読み直す
 * - 種目は id で指し、名前も書いておく。id が見つからないときは名前で繋ぎ直す
 * - 最初の 1 回は、この端末の data.json のパッケージ・ルーチンをノートへ移す（planPackageMigration）
 * - 本文（利用者のメモ）には触らない
 */
export class PackageLibrary {
	private notes = new Map<string, NoteState>();
	private loading: Promise<number> | null = null;
	private ready = false;
	/** 書き込み・読み直しを 1 つずつ行う（途中の状態を読まない・同じノートを同時に書かない） */
	private queue: Promise<unknown> = Promise.resolve();
	private pending = new Set<string>();
	private readonly flushLater = debounce(
		() => void this.enqueue(() => this.flushPending()),
		300,
		true,
	);
	private readonly exercisesChangedLater = debounce(
		() => void this.onExercisesChanged(),
		500,
		true,
	);

	constructor(
		private readonly app: App,
		private readonly store: DataStore,
		private readonly exercises: ExerciseLibrary,
	) {
		store.setCatalogWriter({
			run: (task) => this.enqueue(task),
			write: (data) => this.write(data),
		});
	}

	get folderPath(): string {
		return normalizePath(this.store.settings.packageFolder);
	}

	/** パッケージノートを読み終えたか */
	get isReady(): boolean {
		return this.ready;
	}

	/**
	 * パッケージノートを読む。まだ data.json から移していなければ移す（ノートに書いたパッケージの数を返す）。
	 * 種目ノートを読み終えてから（種目の id・名前で繋ぐため）
	 */
	ensureLoaded(): Promise<number> {
		this.loading ??= this.loadAll();
		return this.loading;
	}

	/** パッケージの保存先が変わったとき（ノートは移さない。移すかは folder-check が聞く） */
	async reload(): Promise<number> {
		this.loading = null;
		this.ready = false;
		return this.ensureLoaded();
	}

	/** 今のパッケージ・ルーチンとノートの違いを書く（種目名の更新など、DataStore.update を通さないとき） */
	persist(data: Readonly<PluginData>): Promise<void> {
		return this.enqueue(() => this.write(data));
	}

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
		// 種目の名前が変わったらノートの種目名も直す。後から届いた種目ノートには名前で繋ぎ直す
		component.registerEvent(
			this.exercises.onChange(() => {
				if (this.ready) this.exercisesChangedLater();
			}),
		);
	}

	// -------------------------------------------------------------------------
	// 読み込み

	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		const next = this.queue.then(task);
		this.queue = next.catch(() => undefined);
		return next;
	}

	private async loadAll(): Promise<number> {
		await this.exercises.ensureLoaded();
		await this.enqueue(() => this.readAll());
		if (this.store.packagesInVault) {
			this.ready = true;
			this.publish();
			this.exercisesChangedLater();
			this.flushIfPending();
			return 0;
		}
		const written = await this.migrate();
		this.flushIfPending();
		return written;
	}

	/**
	 * 一度きり: この端末の data.json のパッケージ・ルーチンをノートへ移す。
	 * ほかの端末が先に移していれば、そのノートと合わせる（種目が繋がる方を正にする）
	 */
	private async migrate(): Promise<number> {
		const { current } = this.store;
		const plan = planPackageMigration(
			[...this.notes.values()].map((s) => s.note),
			{ packages: current.packages, routines: current.routines },
			new Set(current.exercises.map((e) => e.id)),
		);
		this.ready = true;
		try {
			await this.store.update((data) => {
				data.packages = plan.packages;
				data.routines = plan.routines;
				remapPackageIds(data, plan.remap);
				if (!data.migrations.includes(PACKAGES_IN_VAULT))
					data.migrations.push(PACKAGES_IN_VAULT);
			});
		} catch (error) {
			// 書けなかった（同じ名前の別のノートがあるなど）: data.json は前のまま。次の起動でもう一度移す
			console.error(
				'[fitness-log] パッケージのノートへの移行に失敗しました',
				error,
			);
			this.ready = false;
			this.loading = null;
			await this.store.reload();
			throw error;
		}
		return plan.written;
	}

	private resolver(): ResolveExercise {
		const exercises = this.store.current.exercises;
		const ids = new Set(exercises.map((e) => e.id));
		const byName = createResolver(exercises);
		return (id, name) =>
			(id && ids.has(id) ? id : undefined) ??
			(name ? byName.resolve(name)?.id : undefined) ??
			id;
	}

	private inFolder(path: string): boolean {
		const folder = this.folderPath;
		return (
			path.endsWith('.md') &&
			(folder === '/' || path.startsWith(`${folder}/`))
		);
	}

	/**
	 * パッケージノートを読む。note は種目の id を今の種目に解決したもの、serialized はファイルに今書いてある内容
	 * （解決する前の id・ノートに書いてある種目名）。この 2 つが違えば、次の書き込みでノートを直す
	 * （名前で繋ぎ直した id・変わった種目名を書き戻す）
	 */
	private async readNote(
		file: TFile,
		resolve: ResolveExercise,
	): Promise<{ note: PackageNote; serialized: string } | null> {
		const text = await this.app.vault.cachedRead(file);
		const info = getFrontMatterInfo(text);
		if (!info.exists) return null;
		let frontmatter: unknown;
		try {
			frontmatter = parseYaml(info.frontmatter);
		} catch (error) {
			console.warn(
				`[fitness-log] ${file.path} の frontmatter を読めません`,
				error,
			);
			return null;
		}
		if (
			typeof frontmatter !== 'object' ||
			frontmatter === null ||
			Array.isArray(frontmatter)
		)
			return null;
		const source = {
			basename: file.basename,
			frontmatter: frontmatter as Record<string, unknown>,
		};
		const note = packageFromNote(source, resolve);
		const raw = packageFromNote(source, (id) => id);
		if (!note || !raw) return null;
		return { note, serialized: fileSerialized(raw) };
	}

	/** フォルダのパッケージノートをすべて読む。同じ id のノート（複製した）には新しい id を振る */
	private async readAll(): Promise<void> {
		this.notes.clear();
		const folder = this.app.vault.getFolderByPath(this.folderPath);
		const files: TFile[] = [];
		if (folder) collectMarkdownFiles(folder, files);
		files.sort((a, b) => a.path.localeCompare(b.path));
		const resolve = this.resolver();
		for (const file of files) {
			const read = await this.readNote(file, resolve);
			if (!read) continue;
			let { note, serialized } = read;
			if (this.notes.has(note.pkg.id)) {
				note = await this.assignNewId(file, note);
				serialized = '';
			}
			this.notes.set(note.pkg.id, { path: file.path, serialized, note });
		}
	}

	private async assignNewId(
		file: TFile,
		note: PackageNote,
	): Promise<PackageNote> {
		const id = newId('pk', new Set(this.notes.keys()));
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm[PACKAGE_KEYS.id] = id;
			},
		);
		return {
			...note,
			pkg: { ...note.pkg, id },
			routines: note.routines.map((r) => ({ ...r, packageId: id })),
		};
	}

	private nameOf(
		note: PackageNote | undefined,
	): (id: string) => string | undefined {
		const names = new Map(
			this.store.current.exercises.map((e) => [e.id, e.name]),
		);
		return (id) => names.get(id) ?? note?.names.get(id);
	}

	/** ノートの内容を DataStore に入れる（並び順 → 名前の順） */
	private publish(): void {
		const states = [...this.notes.values()].sort(
			(a, b) =>
				a.note.order - b.note.order ||
				a.note.pkg.name.localeCompare(b.note.pkg.name, 'ja'),
		);
		this.store.setCatalog(
			states.map((s) => structuredClone(s.note.pkg)),
			states.flatMap((s) => structuredClone(s.note.routines)),
		);
	}

	/**
	 * 読み込みの途中に届いた変更（起動直後の Sync など）も取りこぼさないよう、いつでも貯めておき、
	 * 読み終えてから読み直す
	 */
	private touch(path: string): void {
		const known = [...this.notes.values()].some((s) => s.path === path);
		if (!known && !this.inFolder(path)) return;
		this.pending.add(path);
		if (this.ready) this.flushLater();
	}

	private flushIfPending(): void {
		if (this.pending.size > 0) this.flushLater();
	}

	/** vault で変わったパッケージノートを読み直す（ほかの端末・Properties 欄・ファイル名の変更） */
	private async flushPending(): Promise<void> {
		if (!this.ready) return;
		const paths = [...this.pending];
		this.pending.clear();
		const resolve = this.resolver();
		const pathOf = (path: string) =>
			[...this.notes].find(([, s]) => s.path === path)?.[0];
		let changed = false;
		let rename = false;
		// 先に今あるノートを読む（名前を変えたとき、新しいパスで前の名前が分かるように）。消えたパスは後で
		const existing = paths.filter(
			(p) => this.inFolder(p) && this.app.vault.getFileByPath(p),
		);
		const missing = paths.filter((p) => !existing.includes(p));
		for (const path of existing) {
			const file = this.app.vault.getFileByPath(path);
			if (!file) continue;
			const knownId = pathOf(path);
			const read = await this.readNote(file, resolve);
			if (!read) {
				if (knownId !== undefined) {
					// プロパティを消した等でパッケージノートではなくなった
					this.notes.delete(knownId);
					changed = true;
				}
				continue;
			}
			let { note, serialized } = read;
			const known = this.notes.get(note.pkg.id);
			if (
				known &&
				known.path !== path &&
				this.app.vault.getFileByPath(known.path)
			) {
				// ノートを複製した: 複製の方に新しい id を振る
				note = await this.assignNewId(file, note);
				serialized = '';
			}
			if (knownId !== undefined && knownId !== note.pkg.id)
				this.notes.delete(knownId);
			const before = this.notes.get(note.pkg.id);
			if (
				before &&
				before.path === path &&
				before.serialized === serialized
			)
				continue;
			// ファイル名を変えた（＝パッケージ名を変えた）: 旧名を別名に残す（過去の日ノートのセッション名と繋がる）
			const oldName = before?.note.pkg.name;
			if (
				oldName &&
				oldName !== note.pkg.name &&
				!note.pkg.aliases.includes(oldName)
			) {
				note = {
					...note,
					pkg: {
						...note.pkg,
						aliases: [...note.pkg.aliases, oldName],
					},
				};
				rename = true;
			}
			this.notes.set(note.pkg.id, { path, serialized, note });
			changed = true;
		}
		for (const path of missing) {
			// 消した・フォルダの外へ移した（名前を変えただけなら、上で新しいパスに付け替え済み）
			const knownId = pathOf(path);
			if (knownId === undefined) continue;
			this.notes.delete(knownId);
			changed = true;
		}
		if (!changed) return;
		this.publish();
		// 名前で繋ぎ直した id・旧名の別名などを書き戻す（ノートの内容と違うものだけ書く）
		if (rename || this.hasPendingRewrite())
			await this.write(this.store.current);
	}

	/** ノートの内容と、解決した内容が違う（名前で繋ぎ直した等）パッケージがあるか */
	private hasPendingRewrite(): boolean {
		return [...this.notes.values()].some(
			(s) => s.serialized !== this.desiredSerialized(s.note),
		);
	}

	private desiredSerialized(note: PackageNote): string {
		return serializePackageNote(
			packageNoteFrontmatter(
				note.pkg,
				note.routines,
				note.order,
				this.nameOf(note),
			),
		);
	}

	/** 種目が変わった: ノートの種目名を直す。見つからなかった種目が名前で見つかれば繋ぎ直す */
	private async onExercisesChanged(): Promise<void> {
		if (!this.ready) return;
		const resolve = this.resolver();
		const relink = new Map<string, Map<string, string>>();
		for (const pkg of this.store.current.packages) {
			const names = this.notes.get(pkg.id)?.note.names;
			for (const item of [...pkg.items, ...(pkg.removedItems ?? [])]) {
				const next = resolve(
					item.exerciseId,
					names?.get(item.exerciseId),
				);
				if (next && next !== item.exerciseId) {
					const map = relink.get(pkg.id) ?? new Map<string, string>();
					map.set(item.exerciseId, next);
					relink.set(pkg.id, map);
				}
			}
		}
		if (relink.size === 0) {
			await this.persist(this.store.current);
			return;
		}
		await this.store.update((data) => {
			for (const pkg of data.packages) {
				const map = relink.get(pkg.id);
				if (!map) continue;
				for (const item of [...pkg.items, ...(pkg.removedItems ?? [])])
					item.exerciseId =
						map.get(item.exerciseId) ?? item.exerciseId;
			}
		});
	}

	// -------------------------------------------------------------------------
	// 書き込み

	/**
	 * 今のパッケージ・ルーチン（data）とノートの違いを書く。
	 * 失敗したら、メモリ上のパッケージをノートの内容に戻してから投げる
	 */
	private async write(data: Readonly<PluginData>): Promise<void> {
		if (!this.ready) return;
		const folder = this.folderPath;
		const wanted = new Set<string>();
		try {
			for (const [order, pkg] of data.packages.entries()) {
				wanted.add(pkg.id);
				const known = this.notes.get(pkg.id);
				const note: PackageNote = {
					pkg: structuredClone(pkg),
					routines: structuredClone(
						data.routines.filter((r) => r.packageId === pkg.id),
					),
					order,
					names: new Map(known?.note.names ?? []),
				};
				const fm = packageNoteFrontmatter(
					note.pkg,
					note.routines,
					order,
					this.nameOf(known?.note),
				);
				const serialized = serializePackageNote(fm);
				// 今あるノートはそのフォルダのまま（保存先の設定を変えても、移すかは folder-check で聞く）。
				// 新しいパッケージだけ今の保存先に作る
				const dir = known ? parentOf(known.path) : folder;
				const fileName = `${packageFileName(pkg.name)}.md`;
				const path = normalizePath(
					dir === '' || dir === '/' ? fileName : `${dir}/${fileName}`,
				);
				if (
					known &&
					known.path === path &&
					known.serialized === serialized
				)
					continue;
				for (const key of [
					PACKAGE_KEYS.exercises,
					PACKAGE_KEYS.removed,
				])
					for (const item of (fm[key] ?? []) as Array<{
						id: string;
						name?: string;
					}>)
						if (item.name) note.names.set(item.id, item.name);
				const file = await this.writeNote(known, path, fm);
				this.notes.set(pkg.id, { path: file.path, serialized, note });
			}
			for (const [id, state] of [...this.notes]) {
				if (wanted.has(id)) continue;
				const file = this.app.vault.getFileByPath(state.path);
				if (file) await this.app.fileManager.trashFile(file);
				this.notes.delete(id);
			}
		} catch (error) {
			await this.readAll();
			this.publish();
			throw error;
		}
	}

	private async writeNote(
		known: NoteState | undefined,
		path: string,
		fm: Record<string, unknown>,
	): Promise<TFile> {
		const { vault, fileManager } = this.app;
		let file = known ? vault.getFileByPath(known.path) : null;
		if (file && file.path !== path) {
			if (vault.getAbstractFileByPath(path))
				throw new CatalogError(`「${path}」が既にあります`);
			await this.ensureFolder(path);
			await fileManager.renameFile(file, path);
			file = vault.getFileByPath(path);
		}
		if (!file) {
			if (vault.getAbstractFileByPath(path))
				throw new CatalogError(`「${path}」が既にあります`);
			await this.ensureFolder(path);
			return vault.create(path, `---\n${stringifyYaml(fm)}---\n`);
		}
		await fileManager.processFrontMatter(
			file,
			(current: Record<string, unknown>) =>
				applyPackageToFrontmatter(current, fm),
		);
		return file;
	}

	/** ノートのパスの親フォルダを（親から順に）作る */
	private async ensureFolder(notePath: string): Promise<void> {
		const parts = notePath.split('/').slice(0, -1);
		let current = '';
		for (const part of parts) {
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
}

function collectMarkdownFiles(folder: TFolder, out: TFile[]): void {
	for (const child of folder.children) {
		if (child instanceof TFolder) collectMarkdownFiles(child, out);
		else if (child instanceof TFile && child.extension === 'md')
			out.push(child);
	}
}

/** ファイルに書いてある内容（id は解決前、種目名はノートに書いてあるもの）を比べられる形に */
function fileSerialized(raw: PackageNote): string {
	return serializePackageNote(
		packageNoteFrontmatter(raw.pkg, raw.routines, raw.order, (id) =>
			raw.names.get(id),
		),
	);
}

function parentOf(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash < 0 ? '' : path.slice(0, slash);
}
