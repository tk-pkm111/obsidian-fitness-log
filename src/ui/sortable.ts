import { setIcon } from 'obsidian';
import { dropIndex } from '../lib/list';

/**
 * つかむ所（⋮⋮）でドラッグして並べ替える。スマホ（タッチ）でも動くよう Pointer Events で組む
 * （HTML のドラッグ＆ドロップは iOS の WebView で当てにならない）。
 * - つかむ所は touch-action: none（ドラッグ中に画面がスクロールしない）。端に寄せると自動でスクロール
 * - ドラッグ中は他の要素をずらして落とす位置を見せ、離したら onMove(from, to) を呼ぶ（to は新しい並びでの位置）
 * - キーボードでは、つかむ所にフォーカスして ↑↓
 */
export interface SortableEntry {
	el: HTMLElement;
	handle: HTMLElement;
}

export function dragHandle(
	parent: HTMLElement,
	label: string,
	focusKey: string,
): HTMLButtonElement {
	const handle = parent.createEl('button', {
		cls: 'clickable-icon fitness-log-drag-handle',
		attr: {
			type: 'button',
			'aria-label': label,
			'data-focus-key': focusKey,
		},
	});
	setIcon(handle, 'grip-vertical');
	return handle;
}

export function makeSortable(
	entries: readonly SortableEntry[],
	onMove: (from: number, to: number) => void,
): void {
	entries.forEach(({ el, handle }, from) => {
		el.addClass('fitness-log-sortable-item');
		handle.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowUp' && from > 0) {
				event.preventDefault();
				onMove(from, from - 1);
			} else if (event.key === 'ArrowDown' && from < entries.length - 1) {
				event.preventDefault();
				onMove(from, from + 1);
			}
		});
		handle.addEventListener('pointerdown', (event) => {
			if (event.button !== 0 || entries.length < 2) return;
			event.preventDefault();
			startDrag(entries, from, handle, event, onMove);
		});
	});
}

function startDrag(
	entries: readonly SortableEntry[],
	from: number,
	handle: HTMLElement,
	event: PointerEvent,
	onMove: (from: number, to: number) => void,
): void {
	const win = handle.win;
	const els = entries.map((e) => e.el);
	const scroller = handle.closest<HTMLElement>('.fitness-log-body');
	const scrollTop = () => scroller?.scrollTop ?? 0;
	const startScroll = scrollTop();
	// スクロールしても変わらない位置（中身の座標）で持つ
	const rects = els.map((el) => {
		const r = el.getBoundingClientRect();
		return { top: r.top + startScroll, height: r.height };
	});
	const dragged = rects[from];
	if (!dragged) return;
	const first = rects[0];
	const second = rects[1];
	const gap =
		first && second
			? Math.max(0, second.top - (first.top + first.height))
			: 0;
	const shift = dragged.height + gap;
	const midpoints = rects
		.filter((_, i) => i !== from)
		.map((r) => r.top + r.height / 2);

	const startY = event.clientY;
	let pointerY = startY;
	let to = from;
	els[from]?.addClass('is-dragging');
	handle.doc.body.addClass('fitness-log-is-sorting');
	try {
		handle.setPointerCapture(event.pointerId);
	} catch {
		// 取れなくても pointermove は届く（指が要素の外に出ると止まるだけ）
	}

	const update = () => {
		const dy = pointerY - startY + (scrollTop() - startScroll);
		to = dropIndex(midpoints, dragged.top + dragged.height / 2 + dy);
		els.forEach((el, i) => {
			let offset = 0;
			if (i === from) offset = dy;
			else if (from < to && i > from && i <= to) offset = -shift;
			else if (to < from && i >= to && i < from) offset = shift;
			el.setCssProps({ '--fitness-log-drag-y': `${offset}px` });
		});
	};

	// 端に寄せている間はスクロールし続ける
	let frame = 0;
	const tick = () => {
		if (scroller) {
			const box = scroller.getBoundingClientRect();
			const edge = 48;
			let speed = 0;
			if (pointerY < box.top + edge)
				speed = -Math.ceil((box.top + edge - pointerY) / 4);
			else if (pointerY > box.bottom - edge)
				speed = Math.ceil((pointerY - (box.bottom - edge)) / 4);
			if (speed !== 0) {
				scroller.scrollTop += speed;
				update();
			}
		}
		frame = win.requestAnimationFrame(tick);
	};
	frame = win.requestAnimationFrame(tick);

	const move = (e: PointerEvent) => {
		pointerY = e.clientY;
		update();
	};
	const finish = (commit: boolean) => {
		win.cancelAnimationFrame(frame);
		handle.removeEventListener('pointermove', move);
		handle.removeEventListener('pointerup', up);
		handle.removeEventListener('pointercancel', cancel);
		handle.doc.body.removeClass('fitness-log-is-sorting');
		for (const el of els) {
			el.removeClass('is-dragging');
			el.setCssProps({ '--fitness-log-drag-y': '0px' });
		}
		if (commit && to !== from) onMove(from, to);
	};
	const up = () => finish(true);
	const cancel = () => finish(false);
	handle.addEventListener('pointermove', move);
	handle.addEventListener('pointerup', up);
	handle.addEventListener('pointercancel', cancel);
	update();
}
