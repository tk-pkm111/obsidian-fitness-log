/**
 * スクロールで数字を選ぶホイール（iOS の時刻の選択のようなもの）。
 * - CSS の scroll-snap で 1 行ずつ止まる。指でなでる・マウスのホイール・矢印キーで動かせる
 * - 真ん中の帯にある行が選ばれた値。行を押すとその行まで回る
 * - スマホで数字キーボードを出さずに、重量・回数・時刻・目標を選ぶ
 */

/** 1 行の高さ（px）。styles.css は --fitness-log-wheel-item で受け取る */
const ITEM_HEIGHT = 40;
/** 見えている行の数（奇数。真ん中が選ばれた値） */
const VISIBLE_ITEMS = 5;

export interface WheelOptions {
	items: readonly string[];
	index: number;
	/** 読み上げ用の名前（「回数」） */
	label: string;
	/** 列の幅（em）。既定は 4 */
	width?: number;
	onChange?: (index: number) => void;
}

export interface Wheel {
	readonly el: HTMLElement;
	/** 選ばれている行 */
	index(): number;
	setIndex(index: number, smooth?: boolean): void;
}

export function renderWheel(parent: HTMLElement, options: WheelOptions): Wheel {
	const { items } = options;
	const clamp = (i: number) => Math.min(items.length - 1, Math.max(0, i));
	const wheel = parent.createDiv({
		cls: 'fitness-log-wheel',
		attr: {
			role: 'spinbutton',
			tabindex: '0',
			'aria-label': options.label,
			'aria-valuemin': '0',
			'aria-valuemax': String(items.length - 1),
		},
	});
	wheel.setCssProps({
		'--fitness-log-wheel-item': `${ITEM_HEIGHT}px`,
		'--fitness-log-wheel-rows': String(VISIBLE_ITEMS),
		'--fitness-log-wheel-width': `${options.width ?? 4}em`,
	});
	wheel.createDiv({ cls: 'fitness-log-wheel-band' });
	const scroller = wheel.createDiv({ cls: 'fitness-log-wheel-scroll' });
	const pad = () => scroller.createDiv({ cls: 'fitness-log-wheel-pad' });
	pad();
	const rows = items.map((text, i) => {
		const row = scroller.createDiv({ cls: 'fitness-log-wheel-item', text });
		row.addEventListener('click', () => setIndex(i, true));
		return row;
	});
	pad();

	let current = -1;
	const mark = (i: number) => {
		if (i === current) return;
		rows[current]?.removeClass('is-selected');
		current = i;
		rows[i]?.addClass('is-selected');
		wheel.setAttr('aria-valuenow', String(i));
		wheel.setAttr('aria-valuetext', items[i] ?? '');
		options.onChange?.(i);
	};
	const setIndex = (index: number, smooth = false) => {
		const i = clamp(index);
		scroller.scrollTo({
			top: i * ITEM_HEIGHT,
			behavior: smooth ? 'smooth' : 'auto',
		});
		mark(i);
	};
	scroller.addEventListener(
		'scroll',
		() => mark(clamp(Math.round(scroller.scrollTop / ITEM_HEIGHT))),
		{ passive: true },
	);
	wheel.addEventListener('keydown', (event) => {
		const moves: Record<string, number> = {
			ArrowUp: -1,
			ArrowDown: 1,
			PageUp: -VISIBLE_ITEMS,
			PageDown: VISIBLE_ITEMS,
		};
		const move = moves[event.key];
		if (move !== undefined) setIndex(current + move, true);
		else if (event.key === 'Home') setIndex(0, true);
		else if (event.key === 'End') setIndex(items.length - 1, true);
		else return;
		event.preventDefault();
	});

	// 最初の位置。描かれる前だとスクロールできないので、次の描画でもう一度合わせる
	const start = clamp(options.index);
	mark(start);
	scroller.scrollTop = start * ITEM_HEIGHT;
	wheel.win.requestAnimationFrame(() => {
		scroller.scrollTop = start * ITEM_HEIGHT;
	});

	return { el: wheel, index: () => current, setIndex };
}
