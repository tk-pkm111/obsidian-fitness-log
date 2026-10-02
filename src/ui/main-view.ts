import {
	ItemView,
	setIcon,
	type ViewStateResult,
	type WorkspaceLeaf,
} from 'obsidian';
import { t, type MessageKey } from '../i18n';
import { isDateString, todayString } from '../lib/time/date';
import type { FitnessServices } from '../services';
import { iconButton, runAction } from './helpers';
import {
	PAGE_IDS,
	type MainViewState,
	type PageContext,
	type PageId,
} from './page-context';
import { renderExercisesPage } from './pages/exercises-page';
import { renderLogPage } from './pages/log-page';
import { renderPackagesPage } from './pages/packages-page';
import { renderRoutinesPage } from './pages/routines-page';
import { renderTodayPage } from './pages/today-page';

export const VIEW_TYPE_MAIN = 'fitness-log-main';

const PAGE_ICONS: Record<PageId, string> = {
	today: 'calendar-check',
	packages: 'package',
	exercises: 'dumbbell',
	routines: 'repeat',
	log: 'line-chart',
};

type PageRenderer = (ctx: PageContext, el: HTMLElement) => void;

/** ページの描画関数（後のフェーズで足していく） */
const PAGES: Partial<Record<PageId, PageRenderer>> = {
	today: renderTodayPage,
	packages: renderPackagesPage,
	exercises: renderExercisesPage,
	routines: renderRoutinesPage,
	log: renderLogPage,
};

export function parseViewState(raw: unknown): MainViewState {
	const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
		string,
		unknown
	>;
	const page = PAGE_IDS.find((p) => p === obj.page) ?? 'today';
	return {
		page,
		date: isDateString(obj.date) ? obj.date : null,
		exerciseId: typeof obj.exerciseId === 'string' ? obj.exerciseId : null,
		selectedId: typeof obj.selectedId === 'string' ? obj.selectedId : null,
	};
}

/**
 * メイン画面（メインエリアのタブ）。上部のタブでページ（今日／パッケージ／種目／ルーチン／ログ）を切り替える。
 * TaskChute の左ナビに相当。ビューの参照はプラグインに持たない（getLeavesOfType で探す）。
 */
export class MainView extends ItemView {
	navigation = false;
	private viewState: MainViewState = parseViewState(null);
	private tickers: Array<(now: Date) => void> = [];
	private renderQueued = false;
	/** 左のメニュー（ドロワー）が開いているか。保存しない */
	private drawerOpen = false;
	private bodyEl: HTMLElement | null = null;
	private pageStates = new Map<string, object>();
	private renderedToday = todayString();

	constructor(
		leaf: WorkspaceLeaf,
		private readonly services: FitnessServices,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_MAIN;
	}

	getDisplayText(): string {
		return t('view.title');
	}

	getIcon(): string {
		return 'dumbbell';
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('fitness-log-view');
		this.registerEvent(
			this.services.store.onChange(() => this.requestRender()),
		);
		this.registerEvent(
			this.services.index.onChange(() => this.requestRender()),
		);
		this.registerInterval(window.setInterval(() => this.tick(), 1000));
		this.registerDomEvent(this.contentEl, 'keydown', (event) => {
			if (event.key === 'Escape' && this.drawerOpen) {
				event.preventDefault();
				this.setDrawer(false);
			}
		});
		this.render();
		// 日ノートの索引と種目ノートの一覧がそろってから描き直す
		await Promise.all([
			this.services.index.ensureBuilt(),
			this.services.library.ensureLoaded(),
		]);
		this.render();
	}

	/** ログのチャートは幅に合わせて描くので、幅が変わったら描き直す */
	onResize(): void {
		if (this.viewState.page === 'log') this.requestRender();
	}

	async onClose(): Promise<void> {
		this.tickers = [];
		this.contentEl.empty();
	}

	getState(): Record<string, unknown> {
		return {
			...super.getState(),
			page: this.viewState.page,
			date: this.viewState.date,
			exerciseId: this.viewState.exerciseId,
			selectedId: this.viewState.selectedId,
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.viewState = parseViewState(state);
		await super.setState(state, result);
		this.render();
	}

	private navigate(patch: Partial<MainViewState>): void {
		this.viewState = { ...this.viewState, ...patch };
		void this.app.workspace.requestSaveLayout();
		this.drawerOpen = false;
		if (this.bodyEl) this.bodyEl.scrollTop = 0;
		this.render();
	}

	private tick(): void {
		const now = new Date();
		const today = todayString(now);
		// 日付が変わったら「今日」を表示し直す
		if (today !== this.renderedToday) {
			this.render();
			return;
		}
		for (const tick of this.tickers) tick(now);
	}

	private requestRender(): void {
		if (this.renderQueued) return;
		this.renderQueued = true;
		window.setTimeout(() => {
			this.renderQueued = false;
			this.render();
		}, 0);
	}

	private render(): void {
		const { contentEl } = this;
		const scrollTop = this.bodyEl?.scrollTop ?? 0;
		// 再描画で入力中の欄のフォーカスが外れないよう、data-focus-key で探して戻す
		const focused = contentEl.doc.activeElement;
		const focusKey =
			focused instanceof HTMLElement && contentEl.contains(focused)
				? focused.getAttribute('data-focus-key')
				: null;
		this.tickers = [];
		this.renderedToday = todayString();
		contentEl.empty();

		// ヘッダー: 左に ☰（メニュー）、中央はページ（今日なら日付ナビ）、右はページの操作
		const header = contentEl.createDiv({ cls: 'fitness-log-header' });
		const menuButton = iconButton(
			header,
			'menu',
			t('nav.menu'),
			() => this.setDrawer(!this.drawerOpen),
			'fitness-log-menu-button',
		);
		menuButton.setAttr('aria-expanded', String(this.drawerOpen));
		const center = header.createDiv({ cls: 'fitness-log-header-center' });
		const actions = header.createDiv({ cls: 'fitness-log-header-actions' });

		const body = contentEl.createDiv({ cls: 'fitness-log-body' });
		this.bodyEl = body;
		const page = body.createDiv({
			cls: `fitness-log-page fitness-log-page-${this.viewState.page}`,
		});
		const ctx: PageContext = {
			services: this.services,
			app: this.app,
			state: this.viewState,
			date: this.viewState.date ?? this.renderedToday,
			today: this.renderedToday,
			header: { center, actions },
			navigate: (patch) => this.navigate(patch),
			addTicker: (tick) => {
				this.tickers.push(tick);
				tick(new Date());
			},
			run: (action) => runAction(this.app, action),
			pageState: <T extends object>(key: string, initial: () => T): T => {
				let state = this.pageStates.get(key) as T | undefined;
				if (!state) {
					state = initial();
					this.pageStates.set(key, state);
				}
				return state;
			},
		};
		const renderer = PAGES[this.viewState.page];
		try {
			if (renderer) renderer(ctx, page);
			else
				page.createDiv({
					cls: 'fitness-log-empty',
					text: t('page.comingSoon'),
				});
		} catch (error) {
			// 描画の途中で止まった画面を黙って見せない
			console.error('[fitness-log] render failed', error);
			page.createDiv({
				cls: 'fitness-log-banner mod-warning',
				text: t('page.renderError', {
					message:
						error instanceof Error ? error.message : String(error),
				}),
			});
		}
		// 中央を使わないページはページ名を出す
		if (!center.hasChildNodes())
			center.createDiv({
				cls: 'fitness-log-header-title',
				text: t(`nav.${this.viewState.page}` as MessageKey),
			});

		this.renderDrawer(contentEl);
		body.scrollTop = scrollTop;
		if (focusKey) {
			const target = Array.from(
				contentEl.querySelectorAll<HTMLElement>('[data-focus-key]'),
			).find((el) => el.getAttribute('data-focus-key') === focusKey);
			target?.focus();
		}
	}

	/** 左のメニュー（ドロワー）。ビューの中に重ねて出し、背景のタップか Esc で閉じる */
	private renderDrawer(parent: HTMLElement): void {
		const backdrop = parent.createDiv({
			cls: 'fitness-log-drawer-backdrop',
		});
		backdrop.addEventListener('click', () => this.setDrawer(false));
		const drawer = parent.createDiv({
			cls: 'fitness-log-drawer',
			attr: { role: 'navigation', 'aria-label': t('nav.menu') },
		});
		const head = drawer.createDiv({ cls: 'fitness-log-drawer-head' });
		head.createDiv({
			cls: 'fitness-log-drawer-title',
			text: t('view.title'),
		});
		iconButton(head, 'x', t('nav.close'), () => this.setDrawer(false));

		const list = drawer.createDiv({ cls: 'fitness-log-drawer-list' });
		for (const id of PAGE_IDS) {
			const selected = id === this.viewState.page;
			const item = list.createEl('button', {
				cls: 'fitness-log-drawer-item',
				attr: {
					type: 'button',
					'aria-current': selected ? 'page' : 'false',
				},
			});
			item.toggleClass('is-active', selected);
			setIcon(
				item.createSpan({ cls: 'fitness-log-drawer-icon' }),
				PAGE_ICONS[id],
			);
			item.createSpan({ text: t(`nav.${id}` as MessageKey) });
			item.addEventListener('click', () =>
				// 「今日」を選んだら日付も今日に戻す
				this.navigate(
					id === 'today'
						? { page: id, date: null, selectedId: null }
						: { page: id, selectedId: null },
				),
			);
		}
		drawer.createDiv({ cls: 'fitness-log-drawer-separator' });
		const settings = drawer.createEl('button', {
			cls: 'fitness-log-drawer-item',
			attr: { type: 'button' },
		});
		setIcon(
			settings.createSpan({ cls: 'fitness-log-drawer-icon' }),
			'settings',
		);
		settings.createSpan({ text: t('nav.settings') });
		settings.addEventListener('click', () => {
			this.setDrawer(false);
			this.services.openSettings();
		});
		this.setDrawer(this.drawerOpen);
	}

	private setDrawer(open: boolean): void {
		this.drawerOpen = open;
		const { contentEl } = this;
		contentEl
			.querySelector('.fitness-log-drawer')
			?.toggleClass('is-open', open);
		contentEl
			.querySelector('.fitness-log-drawer-backdrop')
			?.toggleClass('is-open', open);
		contentEl
			.querySelector('.fitness-log-menu-button')
			?.setAttr('aria-expanded', String(open));
		// 表示の切り替えが済んでからフォーカスを移す（キーボードでそのまま選べるように）
		if (open)
			window.setTimeout(
				() =>
					contentEl
						.querySelector<HTMLElement>(
							'.fitness-log-drawer-item.is-active',
						)
						?.focus(),
				0,
			);
	}
}
