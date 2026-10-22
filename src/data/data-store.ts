import { Events, normalizePath, type EventRef } from 'obsidian';
import { DEFAULT_SETTINGS, normalizePluginData } from '../lib/model/data';
import { defaultLists, type ExerciseLists } from '../lib/model/lists';
import { PACKAGES_IN_VAULT } from '../lib/model/package-note';
import type {
	Exercise,
	FitnessLogSettings,
	Package,
	PluginData,
	Routine,
} from '../lib/model/types';
import { validateFileNameFormat } from './log-repository';

/** Plugin の loadData / saveData（テストでは差し替える） */
export interface DataPersistence {
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
}

/**
 * パッケージ・ルーチンをノートに書く（PackageLibrary）。
 * - run: ノートの読み直し（ほかの端末の変更）と順番に行う。update() の「変える → ノートに書く」をこの中で行い、
 *   途中でノートの読み直しが入って、書く前の変更がノートの内容で上書きされないようにする
 * - write: 変更を data.json より先にノートへ書く。失敗したら投げる（メモリはノートの内容に戻してから投げる）
 */
export interface CatalogWriter {
	run<T>(task: () => Promise<T>): Promise<T>;
	write(data: Readonly<PluginData>): Promise<void>;
}

/**
 * data.json（進行中セット・設定など、端末ごとのもの）の読み書きと、画面が読むデータ全体（PluginData）。
 * 変更は update() を通し、保存後に 'change' を発火する（画面はこれを購読して再描画する）。
 *
 * - 種目は種目ノートが正（ExerciseLibrary）。data.exercises はノートから読んだ一覧をメモリに置くだけで、
 *   data.json には保存しない（以前の版で保存されていた一覧は、ノートへ移すまで残す）
 * - パッケージ・ルーチンはパッケージノートが正（PackageLibrary）。ノートへ移した後（migrations に
 *   packages-in-vault）は data.json に保存せず、update() のたびに変わったパッケージのノートを書く
 */
export class DataStore extends Events {
	private data: PluginData = normalizePluginData(null);
	/** 以前の版の data.json にあった種目（まだノートへ移していないもの） */
	private legacyExercises: Exercise[] = [];
	private catalogWriter: CatalogWriter | null = null;
	/** 種目の選択肢（設定ノートから読んだもの。data.json には保存しない） */
	private exerciseLists: ExerciseLists = defaultLists();

	constructor(private readonly persistence: DataPersistence) {
		super();
	}

	/** 現在のデータ。変更は update() で行う */
	get current(): Readonly<PluginData> {
		return this.data;
	}

	get settings(): Readonly<FitnessLogSettings> {
		return this.data.settings;
	}

	/** 最初の設定（保存先を聞く）がまだか。入れ直した直後（data.json が無い）も含む。以前の版の利用者は seededAt がある */
	get needsSetup(): boolean {
		return !this.data.setupAt && !this.data.seededAt;
	}

	/** パッケージ・ルーチンをパッケージノートへ移し終えたか（以後は data.json に保存しない） */
	get packagesInVault(): boolean {
		return this.data.migrations.includes(PACKAGES_IN_VAULT);
	}

	async load(): Promise<void> {
		const { exercises, packages, routines } = this.data;
		this.data = normalizeStoredData(await this.persistence.loadData());
		if (this.data.exercises.length > 0)
			this.legacyExercises = this.data.exercises;
		// 種目はノートから読んだ一覧を使い続ける（再読み込みで消さない）
		this.data.exercises = exercises;
		// パッケージ・ルーチンもノートから読んだものを使い続ける（ノートへ移した後の data.json には無い）。
		// 移す前（移行に失敗して読み直したときも）は data.json のもの
		if (this.packagesInVault) {
			this.data.packages = packages;
			this.data.routines = routines;
		}
	}

	setCatalogWriter(writer: CatalogWriter | null): void {
		this.catalogWriter = writer;
	}

	/** パッケージノートから読んだパッケージ・ルーチンを入れる（保存しない） */
	setCatalog(packages: Package[], routines: Routine[]): void {
		this.data.packages = packages;
		this.data.routines = routines;
		this.trigger('change');
	}

	/** ノートへ移す前の種目を受け取る（受け取ったら data.json からは消える） */
	takeLegacyExercises(): Exercise[] {
		const legacy = this.legacyExercises;
		this.legacyExercises = [];
		return legacy;
	}

	/** 種目の選択肢（カテゴリ・器具・記録のしかた）。設定ノートが正（ListsLibrary） */
	get lists(): ExerciseLists {
		return this.exerciseLists;
	}

	/** 設定ノートから読んだ選択肢を入れる（保存しない） */
	setLists(lists: ExerciseLists): void {
		this.exerciseLists = lists;
		this.trigger('change');
	}

	/** 種目ノートから読んだ一覧を入れる（保存しない） */
	setExercises(exercises: Exercise[]): void {
		this.data.exercises = exercises;
		this.trigger('change');
	}

	/** Sync などで data.json が外から変わったとき */
	async reload(): Promise<void> {
		await this.load();
		this.trigger('change');
	}

	async update(mutate: (data: PluginData) => void): Promise<void> {
		const writer = this.catalogWriter;
		if (writer)
			await writer.run(async () => {
				mutate(this.data);
				if (this.packagesInVault) await writer.write(this.data);
			});
		else mutate(this.data);
		await this.persistence.saveData(this.stored());
		this.trigger('change');
	}

	/** data.json に書く内容（種目はノート。ノートへ移した後はパッケージ・ルーチンもノート） */
	private stored(): Record<string, unknown> {
		const {
			exercises: _exercises,
			packages,
			routines,
			...rest
		} = this.data;
		const stored: Record<string, unknown> = { ...rest };
		if (!this.packagesInVault) {
			stored.packages = packages;
			stored.routines = routines;
		}
		if (this.legacyExercises.length > 0)
			stored.exercises = this.legacyExercises;
		return stored;
	}

	onChange(callback: () => void): EventRef {
		return this.on('change', callback);
	}
}

/**
 * 読み込み時の正規化（lib の型チェック＋Obsidian 流のパス表記＋ノート名の形式の検証）。
 * data.json は Sync や手編集でも変わるので、設定タブを通らない値もここで確かめる
 * （例: 年の無い書式だと別の年の記録が同じノートに混ざる）。
 */
export function normalizeStoredData(raw: unknown): PluginData {
	const data = normalizePluginData(raw);
	data.settings.logFolder = normalizePath(data.settings.logFolder);
	data.settings.packageFolder = normalizePath(data.settings.packageFolder);
	if (validateFileNameFormat(data.settings.fileNameFormat) !== undefined)
		data.settings.fileNameFormat = DEFAULT_SETTINGS.fileNameFormat;
	return data;
}
