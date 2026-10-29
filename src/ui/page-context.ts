import type { App } from 'obsidian';
import type { Overnight } from '../lib/today/overnight';
import type { FitnessServices } from '../services';

export type PageId =
	'today' | 'packages' | 'exercises' | 'routines' | 'log' | 'body';

/** メニューの並び。体組成は「体組成を記録する」がオンのときだけ出す */
export const PAGE_IDS: readonly PageId[] = [
	'today',
	'packages',
	'exercises',
	'routines',
	'log',
	'body',
];

/** ビューの状態（ワークスペースに保存され、再起動後も同じページに戻る） */
export interface MainViewState {
	page: PageId;
	/** 表示中の日付。null は「今日」に追従する（0 時をまたいで筋トレが続いている間は前の日） */
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
	/** 0 時をまたいで続いている前の日の筋トレ（無ければ null）。その日も今日と同じくタイマーで記録する */
	overnight: Overnight | null;
	/**
	 * ヘッダーの差し込み口。center はページの見出し（今日ページは日付ナビ。空ならページ名を出す）、
	 * actions は右上の操作ボタン。
	 */
	header: { center: HTMLElement; actions: HTMLElement };
	navigate(patch: Partial<MainViewState>): void;
	/** 同じページを描き直す（スクロール位置はそのまま。開閉など、ページの一時的な状態を変えたとき） */
	refresh(): void;
	/** 1 秒ごとに呼ばれる（タイマー表示の更新。再描画のたびに登録し直す） */
	addTicker(tick: (now: Date) => void): void;
	/** 操作を実行し、失敗は Notice で知らせる */
	run(action: () => Promise<unknown>): void;
	/**
	 * ページごとの一時的な状態（検索語・絞り込みなど）。ビューが開いている間だけ保持し、保存しない。
	 */
	pageState<T extends object>(key: string, initial: () => T): T;
}

/** タイマーで記録する日か（今日と、0 時をまたいで筋トレが続いている前の日） */
export function isLiveDate(ctx: PageContext, date = ctx.date): boolean {
	return date === ctx.today || date === ctx.overnight?.date;
}
