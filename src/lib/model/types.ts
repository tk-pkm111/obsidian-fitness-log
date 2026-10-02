/**
 * Fitness Log のドメインモデル（Obsidian 非依存）。
 *
 * - 種目・パッケージ・ルーチン・進行中セット・設定はプラグインの data.json（PluginData）に保存する。
 * - 実績（セッション・セット）は vault の日ノート（Markdown）が唯一の正。DayLog はその読み書き用の形。
 */

export type ExerciseCategory =
	'push' | 'pull' | 'legs' | 'arms' | 'core' | 'cardio' | 'other';

export type Equipment =
	| 'machine'
	| 'cable'
	| 'smith'
	| 'barbell'
	| 'dumbbell'
	| 'bodyweight'
	| 'band'
	| 'other';

/** 記録タイプ: 重量×回数（既定）/ 回数のみ（自重）/ 時間のみ（有酸素・ストレッチ） */
export type RecordType = 'weight-reps' | 'reps' | 'duration';

export interface Exercise {
	/** 'ex_' + ランダム 8 文字 */
	id: string;
	name: string;
	category: ExerciseCategory;
	equipment?: Equipment;
	recordType: RecordType;
	/** 片側種目（v1 では表示のみ。左右別の記録は v2） */
	unilateral?: boolean;
	/** 表記ゆれ。名前を変えたら旧名を自動で追加する（過去ノートの名前と繋がる） */
	aliases: string[];
	archived?: boolean;
	/** ISO 8601 */
	createdAt: string;
	/**
	 * 種目ノートの vault 内パス（'Fitness/種目/ケーブルYレイズ.md'）。
	 * 種目の設定はこのノートの frontmatter が正で、本文はノウハウを書く場所。まだノートが無ければ undefined
	 */
	path?: string;
}

export interface PackageItem {
	exerciseId: string;
	targetSets: number;
	/** '6-9' | 'AMRAP' | '8'（parseRepRange で解釈） */
	targetReps: string;
	restSec?: number;
	note?: string;
}

/**
 * パッケージの中の区切り（TaskChute のセクションのように「背中」「腕」で種目を分ける）。
 * 設定で有効にしたときだけ表示する。at は「この区切りの前にある種目の数」（items の中の差し込み位置）
 */
export interface PackageSection {
	/** 'sc_' + ランダム 8 文字（パッケージの中で一意） */
	id: string;
	name: string;
	at: number;
}

export interface Package {
	/** 'pk_' + ランダム 8 文字 */
	id: string;
	name: string;
	items: PackageItem[];
	/** 区切り（at の順。同じ at なら配列の順） */
	sections?: PackageSection[];
	/** 名前変更時の旧名（過去ノートのセッション名と繋がる） */
	aliases: string[];
	note?: string;
	createdAt: string;
}

export type RoutineRule =
	/** weekdays: 0=日 … 6=土。intervalWeeks=2 で隔週（週の起点は月曜） */
	| { type: 'weekly'; weekdays: number[]; intervalWeeks: number }
	/** 開始日から N 日ごと */
	| { type: 'everyNDays'; intervalDays: number };

export interface Routine {
	/** 'rt_' + ランダム 8 文字 */
	id: string;
	packageId: string;
	rule: RoutineRule;
	/** 'YYYY-MM-DD' */
	startDate: string;
	endDate?: string;
	enabled: boolean;
	/** 「今日はスキップ」した日（'YYYY-MM-DD'） */
	skipDates: string[];
}

/** 開始ボタンを押してから終了するまでのセット（data.json に保存し、再起動後も経過時間を復元する） */
export interface ActiveSet {
	/** セッションの日（'YYYY-MM-DD'）。日付をまたいでもこの日の日ノートに入る */
	date: string;
	/** null = パッケージ外（その他） */
	packageId: string | null;
	exerciseId: string;
	/** 1 始まり */
	setIndex: number;
	/** kg。単位設定は表示だけを変える */
	weight?: number;
	/** ISO 8601 */
	startedAt: string;
}

export type WeightUnit = 'kg' | 'lb';

export interface FitnessLogSettings {
	/** 日ノートを保存する vault 内フォルダ */
	logFolder: string;
	/** 種目ノート（1 種目 1 ノート）を置く vault 内フォルダ */
	exerciseFolder: string;
	/** 日ノートのファイル名（moment 書式。'/' を含めるとサブフォルダ） */
	fileNameFormat: string;
	weightUnit: WeightUnit;
	/** 重量入力の ± ボタンの刻み（表示単位で） */
	weightStep: number;
	showRestTimer: boolean;
	openOnStartup: boolean;
	/** パッケージのセクション（種目の区切り）を使う */
	packageSections: boolean;
}

export interface PluginData {
	/** マイグレーション用 */
	version: 1;
	settings: FitnessLogSettings;
	exercises: Exercise[];
	packages: Package[];
	routines: Routine[];
	activeSet: ActiveSet | null;
	/** 初期データ投入済みの印（ISO 8601） */
	seededAt?: string;
	/** 済ませた一度きりの移行（'log-folder-v2' など） */
	migrations: string[];
	/**
	 * その日だけの種目の並び（今日の画面でドラッグした順。まだやっていない種目のカードのキー）。
	 * キーは 'YYYY-MM-DD 今日のセクションのキー'。古い日のものは書き込むときに消す
	 */
	dayOrders?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// 日ノート（実績）のモデル

/** 1 セットの記録。セット番号は並び順（1 始まり）で決まるので持たない。 */
export interface SetLog {
	/** kg。空欄は null */
	weight: number | null;
	reps: number | null;
	/** 'HH:mm:ss'（日ノートの日付のローカル時刻） */
	start: string | null;
	end: string | null;
	note: string;
}

export interface ExerciseLog {
	/** 種目名（ノートには id ではなく名前を書く） */
	name: string;
	sets: SetLog[];
}

export interface SessionLog {
	/** パッケージ名。null はパッケージ外（ノートでは「その他」） */
	name: string | null;
	note: string;
	/** 「筋トレを開始」した時刻（'HH:mm:ss'）。パッケージのセッションだけが持つ */
	start?: string;
	/** 「筋トレを終了」した時刻。開始していて終了が無ければ進行中 */
	end?: string;
	/** 時刻として読めない手書きの「- 時間:」（消さずに残す） */
	time?: string;
	exercises: ExerciseLog[];
}

export interface DayLog {
	/** 'YYYY-MM-DD' */
	date: string;
	sessions: SessionLog[];
}
