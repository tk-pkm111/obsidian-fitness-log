import {
	buildChartGeometry,
	nearestPoint,
	type ChartPoint,
	type PlottedPoint,
} from '../lib/history/chart';

export interface LineChartOptions {
	points: readonly ChartPoint[];
	/** 読み上げ用の説明（「ケーブルYレイズ の最大重量の推移」） */
	label: string;
	/** 目盛り・ラベルの値の表示 */
	formatValue: (value: number) => string;
	/** 日付の目盛りの表示 */
	formatDate: (date: string) => string;
	/** ツールチップの 2 行目（パッケージ名・セットの内容など） */
	describe?: (point: ChartPoint) => string;
	/** 直接ラベルを付ける点（最新と自己ベストなど。付けすぎない） */
	labelDates?: readonly string[];
	/** 点をタップ・クリックしたとき（その日の記録を開く） */
	onSelect?: (point: ChartPoint) => void;
}

const SVG_HEIGHT = 200;
/** これより点が多ければ、全部の点は描かない */
const DENSE_POINTS = 24;

function svgText(
	parent: SVGElement,
	cls: string,
	text: string,
	attr: Record<string, string | number>,
): SVGTextElement {
	const el = parent.createSvg('text', { cls, attr });
	el.textContent = text;
	return el;
}

/**
 * 単系列の折れ線（実装計画 §5.5。ライブラリを足さずに createSvg で描く）。
 * 線 2px・点は半径 4px に面色の縁取り・目盛り線は 1px の実線で控えめに。
 * 色は CSS（styles.css の .fitness-log-chart-*）で Obsidian の変数から当てる。
 * 十字線は最も近い点にスナップし、ツールチップに日付と値を出す。
 */
export function renderLineChart(
	parent: HTMLElement,
	options: LineChartOptions,
): void {
	const wrap = parent.createDiv({ cls: 'fitness-log-chart' });
	const width = Math.max(
		260,
		Math.round(wrap.clientWidth || parent.clientWidth || 600),
	);
	const geometry = buildChartGeometry(options.points, {
		width,
		height: SVG_HEIGHT,
		padding: { left: 52, right: 28, top: 22, bottom: 28 },
	});
	const { plot } = geometry;
	const svg = wrap.createSvg('svg', {
		cls: 'fitness-log-chart-svg',
		attr: {
			viewBox: `0 0 ${width} ${SVG_HEIGHT}`,
			width: '100%',
			height: String(SVG_HEIGHT),
			role: 'img',
			'aria-label': options.label,
		},
	});

	for (const tick of geometry.yTicks) {
		svg.createSvg('line', {
			cls: 'fitness-log-chart-grid',
			attr: { x1: plot.left, x2: plot.right, y1: tick.y, y2: tick.y },
		});
		svgText(
			svg,
			'fitness-log-chart-axis',
			options.formatValue(tick.value),
			{ x: plot.left - 8, y: tick.y + 4, 'text-anchor': 'end' },
		);
	}
	geometry.xTicks.forEach((tick, index) => {
		const anchor =
			geometry.xTicks.length === 1
				? 'middle'
				: index === 0
					? 'start'
					: index === geometry.xTicks.length - 1
						? 'end'
						: 'middle';
		svgText(svg, 'fitness-log-chart-axis', options.formatDate(tick.date), {
			x: tick.x,
			y: SVG_HEIGHT - 8,
			'text-anchor': anchor,
		});
	});

	if (geometry.areaPath)
		svg.createSvg('path', {
			cls: 'fitness-log-chart-area',
			attr: { d: geometry.areaPath },
		});
	if (geometry.points.length > 1)
		svg.createSvg('path', {
			cls: 'fitness-log-chart-line',
			attr: { d: geometry.linePath },
		});

	const crosshair = svg.createSvg('line', {
		cls: 'fitness-log-chart-crosshair',
		attr: {
			x1: 0,
			x2: 0,
			y1: plot.top,
			y2: plot.bottom,
			visibility: 'hidden',
		},
	});
	// 点が多いと密集して線が読みにくいので、多いときはラベルを付ける点とホバー中の点だけ描く
	const dense = geometry.points.length > DENSE_POINTS;
	const labelled = new Set(options.labelDates ?? []);
	for (const point of geometry.points) {
		if (dense && !labelled.has(point.date)) continue;
		svg.createSvg('circle', {
			cls: 'fitness-log-chart-point',
			attr: { cx: point.x, cy: point.y, r: 4 },
		});
	}
	const hoverDot = svg.createSvg('circle', {
		cls: ['fitness-log-chart-point', 'is-hovered'],
		attr: { cx: 0, cy: 0, r: 5, visibility: 'hidden' },
	});
	for (const date of options.labelDates ?? []) {
		const point = geometry.points.find((p) => p.date === date);
		if (!point) continue;
		const nearRight = point.x > plot.right - 40;
		svgText(
			svg,
			'fitness-log-chart-value',
			options.formatValue(point.value),
			{
				x: nearRight ? point.x - 6 : point.x + 6,
				y: point.y - 8,
				'text-anchor': nearRight ? 'end' : 'start',
			},
		);
	}

	// ホバー層: 描画領域全体を当たり判定にして、最も近い点を示す（タップでも同じ）
	const tooltip = wrap.createDiv({
		cls: 'fitness-log-chart-tooltip fitness-log-hidden',
	});
	const overlay = svg.createSvg('rect', {
		cls: 'fitness-log-chart-overlay',
		attr: {
			x: plot.left - 12,
			y: 0,
			width: plot.right - plot.left + 24,
			height: SVG_HEIGHT,
		},
	});
	let current: PlottedPoint | null = null;
	const show = (event: PointerEvent) => {
		const box = svg.getBoundingClientRect();
		const x = ((event.clientX - box.left) / box.width) * width;
		const point = nearestPoint(geometry.points, x);
		if (!point) return;
		current = point;
		hoverDot.setAttr('cx', point.x);
		hoverDot.setAttr('cy', point.y);
		hoverDot.setAttr('visibility', 'visible');
		crosshair.setAttr('x1', point.x);
		crosshair.setAttr('x2', point.x);
		crosshair.setAttr('visibility', 'visible');
		tooltip.empty();
		tooltip.createDiv({
			cls: 'fitness-log-chart-tooltip-title',
			text: `${options.formatDate(point.date)} ・ ${options.formatValue(point.value)}`,
		});
		const detail = options.describe?.(point);
		if (detail)
			tooltip.createDiv({ cls: 'fitness-log-muted', text: detail });
		tooltip.removeClass('fitness-log-hidden');
		const ratio = point.x / width;
		tooltip.toggleClass('is-left', ratio > 0.6);
		tooltip.setCssProps({
			'--fitness-log-tooltip-x': `${(ratio * 100).toFixed(2)}%`,
		});
	};
	const hide = () => {
		current = null;
		hoverDot.setAttr('visibility', 'hidden');
		crosshair.setAttr('visibility', 'hidden');
		tooltip.addClass('fitness-log-hidden');
	};
	overlay.addEventListener('pointermove', show);
	overlay.addEventListener('pointerdown', show);
	overlay.addEventListener('pointerleave', hide);
	overlay.addEventListener('click', () => {
		if (current && options.onSelect) options.onSelect(current);
	});
}
