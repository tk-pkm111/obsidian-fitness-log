import { Events, normalizePath, type EventRef } from 'obsidian';
import { DEFAULT_SETTINGS, normalizePluginData } from '../lib/model/data';
import type {
	Exercise,
	FitnessLogSettings,
	PluginData,
} from '../lib/model/types';
import { validateFileNameFormat } from './log-repository';

/** Plugin の loadData / saveData（テストでは差し替える） */
export interface DataPersistence {
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
}

/**
 * data.json（パッケージ・ルーチン・進行中セット・設定）の読み書き。
 * 変更は update() を通し、保存後に 'change' を発火する（画面はこれを購読して再描画する）。
 *
 * 種目は種目ノートが正（ExerciseLibrary）。data.exercises はノートから読んだ一覧をメモリに置くだけで、
 * data.json には保存しない（以前の版で保存されていた一覧は、ノートへ移すまで残す）。
 */
export class DataStore extends Events {
	private data: PluginData = normalizePluginData(null);
	/** 以前の版の data.json にあった種目（まだノートへ移していないもの） */
	private legacyExercises: Exercise[] = [];

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

	async load(): Promise<void> {
		const exercises = this.data.exercises;
		this.data = normalizeStoredData(await this.persistence.loadData());
		if (this.data.exercises.length > 0)
			this.legacyExercises = this.data.exercises;
		// 種目はノートから読んだ一覧を使い続ける（再読み込みで消さない）
		this.data.exercises = exercises;
	}

	/** ノートへ移す前の種目を受け取る（受け取ったら data.json からは消える） */
	takeLegacyExercises(): Exercise[] {
		const legacy = this.legacyExercises;
		this.legacyExercises = [];
		return legacy;
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
		mutate(this.data);
		const { exercises: _inMemory, ...rest } = this.data;
		await this.persistence.saveData(
			this.legacyExercises.length > 0
				? { ...rest, exercises: this.legacyExercises }
				: rest,
		);
		this.trigger('change');
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
	if (validateFileNameFormat(data.settings.fileNameFormat) !== undefined)
		data.settings.fileNameFormat = DEFAULT_SETTINGS.fileNameFormat;
	return data;
}
