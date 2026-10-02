import type { App } from 'obsidian';
import type { FitnessServices } from '../services';

export type PageId = 'today' | 'packages' | 'exercises' | 'routines' | 'log';

export const PAGE_IDS: readonly PageId[] = [
	'today',
	'packages',
	'exercises',
	'routines',
	'log',
];

/** ビューの状態（ワークスペースに保存され、再起動後も同じページに戻る） */
export interface MainViewState {
	page: PageId;
	/** 表示中の日付。null は「今日」に追従する */
	date: string | null;
	/** ログページで選んでいる種目 */
	exerciseId: string | null;
	/** パッケージ・ルーチンページで開いている項目（一覧なら null） */
	selectedId: string | null;
}

/** 各ページの描画関数に渡すもの */
export interface PageContext {
	services: FitnessServices;
	app: App;
	state: Readonly<MainViewState>;
	/** 表示中の日付（'YYYY-MM-DD'） */
	date: string;
	/** 端末の今日 */
	today: string;
	/**
	 * ヘッダーの差し込み口。center はページの見出し（今日ページは日付ナビ。空ならページ名を出す）、
	 * actions は右上の操作ボタン。
	 */
	header: { center: HTMLElement; actions: HTMLElement };
	navigate(patch: Partial<MainViewState>): void;
	/** 1 秒ごとに呼ばれる（タイマー表示の更新。再描画のたびに登録し直す） */
	addTicker(tick: (now: Date) => void): void;
	/** 操作を実行し、失敗は Notice で知らせる */
	run(action: () => Promise<unknown>): void;
	/**
	 * ページごとの一時的な状態（検索語・絞り込みなど）。ビューが開いている間だけ保持し、保存しない。
	 */
	pageState<T extends object>(key: string, initial: () => T): T;
}
