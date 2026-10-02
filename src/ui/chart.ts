import {
	areaPath,
	barPath,
	buildChartGeometry,
	nearestPoint,
	sparkline,
	spreadLabels,
	type ChartPoint,
	type PlottedPoint,
	type PlottedSeries,
	type XTick,
} from '../lib/history/chart';
import { formatMonthDay } from '../lib/time/date';

/**
 * ログのチャート（ライブラリを足さずに createSvg で描く）。
 * - 線 2px・点は面色の縁取り・目盛り線は 1px で控えめに。文字は系列の色ではなく文字の色
 * - 系列の色は .fitness-log-pkg-color-N（パッケージの色。styles.css で色覚の違いでも見分けられる 8 色）
 * - なぞる・タップで最も近い点にスナップしてツールチップを出す。同じ点をもう一度押すと onSelect
 */

export interface ChartSeries {
	key: string;
	label: string;
	/** 色のクラス（.fitness-log-pkg-color-N） */
	colorCls: string;
	/** 比べるための線（ほかのパッケージ）は点線 */
	dashed?: boolean;
	points: readonly ChartPoint[];
}

export interface SeriesChartOptions {
	series: readonly ChartSeries[];
	/** 読み上げ用の説明（「シーテッドカーフレイズ の推定 1RM の推移」） */
	label: string;
	/** ツールチップ・値のラベル（単位つき） */
	formatValue: (value: number) => string;
	/** y 軸の目盛り（単位なし。単位は軸の上に unit で出す） */
	formatAxis: (value: number) => string;
	unit: string;
	/** ツールチップの 3 行目（セットの内容など） */
	describe?: (series: ChartSeries, point: ChartPoint) => string;
	/** 線の終わりに系列の名前を書く（2〜4 系列のとき）。狭い画面では書かず、keyLegend があれば上に凡例 */
	endLabels?: boolean;
	/** 狭い画面で、線の見本と名前の凡例をチャートの上に出す（別に凡例を出していないとき） */
	keyLegend?: boolean;
	/** 値を直接書く点（1 系列のとき。最新と最高。付けすぎない） */
	labelDates?: readonly string[];
	/** 同じ点をもう一度押したとき（その日の記録を開く） */
	onSelect?: (series: ChartSeries, point: ChartPoint) => void;
	formatDate: (date: string) => string;
}

const HEIGHT = 200;
/** これより狭いチャートは、系列の名前を右の余白に書かない */
const END_LABELS_MIN_WIDTH = 520;
/** これより点が多い系列は、最後の点（とラベルを付ける点）だけ描く */
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

/** 文字の幅のおおよそ（全角は 11px、半角は 7px） */
function textWidth(text: string): number {
	let width = 0;
	for (const ch of text) width += (ch.codePointAt(0) ?? 0) > 0x2e80 ? 11 : 7;
	return width;
}

function measureWidth(wrap: HTMLElement, parent: HTMLElement): number {
	return Math.max(
		260,
		Math.round(wrap.clientWidth || parent.clientWidth || 600),
	);
}

function xTickLabel(tick: XTick, ticks: readonly XTick[]): string {
	if (tick.kind === 'day') return formatMonthDay(tick.date);
	const month = Number(tick.date.slice(5, 7));
	const multiYear =
		ticks[0]?.date.slice(0, 4) !==
		ticks[ticks.length - 1]?.date.slice(0, 4);
	// 年をまたぐときは 1 月の目盛りを年にする
	return multiYear && month === 1
		? `${tick.date.slice(0, 4)}年`
		: `${month}月`;
}

/** ツールチップ（チャートの上に重ねる。押せない） */
function createTooltip(wrap: HTMLElement): {
	show: (lines: string[], xRatio: number) => void;
	hide: () => void;
} {
	const tooltip = wrap.createDiv({
		cls: 'fitness-log-chart-tooltip fitness-log-hidden',
	});
	return {
		show(lines, xRatio) {
			tooltip.empty();
			lines.forEach((line, i) => {
				if (line)
					tooltip.createDiv({
						cls:
							i === 0
								? 'fitness-log-chart-tooltip-title'
								: 'fitness-log-muted',
						text: line,
					});
			});
			tooltip.removeClass('fitness-log-hidden');
			tooltip.toggleClass('is-left', xRatio > 0.6);
			tooltip.setCssProps({
				'--fitness-log-tooltip-x': `${(xRatio * 100).toFixed(2)}%`,
			});
		},
		hide() {
			tooltip.addClass('fitness-log-hidden');
		},
	};
}

/** 折れ線（パッケージごとの線を同じ軸に） */
export function renderSeriesChart(
	parent: HTMLElement,
	options: SeriesChartOptions,
): void {
	const wrap = parent.createDiv({ cls: 'fitness-log-chart' });
	const width = measureWidth(wrap, parent);
	const multiple = options.endLabels === true && options.series.length > 1;
	// スマホの幅では右の余白に名前を書くと線の領域が狭くなるので、凡例にする
	const endLabels = multiple && width >= END_LABELS_MIN_WIDTH;
	if (multiple && !endLabels && options.keyLegend) {
		const legend = wrap.createDiv({ cls: 'fitness-log-chart-keys' });
		for (const series of options.series) {
			const item = legend.createSpan({
				cls: ['fitness-log-chart-key', series.colorCls],
			});
			item.toggleClass('is-dashed', series.dashed === true);
			item.createSpan({ cls: 'fitness-log-chart-key-line' });
			item.createSpan({ text: series.label });
		}
	}
	const labelWidth = endLabels
		? Math.min(
				120,
				28 + Math.max(...options.series.map((s) => textWidth(s.label))),
			)
		: 0;
	const geometry = buildChartGeometry(options.series, {
		width,
		height: HEIGHT,
		padding: {
			left: 40,
			right: endLabels ? labelWidth : 20,
			top: 24,
			bottom: 28,
		},
	});
	const { plot } = geometry;
	const svg = wrap.createSvg('svg', {
		cls: 'fitness-log-chart-svg',
		attr: {
			viewBox: `0 0 ${width} ${HEIGHT}`,
			width: '100%',
			height: String(HEIGHT),
			role: 'img',
			'aria-label': options.label,
		},
	});

	for (const tick of geometry.yTicks) {
		svg.createSvg('line', {
			cls: 'fitness-log-chart-grid',
			attr: { x1: plot.left, x2: plot.right, y1: tick.y, y2: tick.y },
		});
		svgText(svg, 'fitness-log-chart-axis', options.formatAxis(tick.value), {
			x: plot.left - 8,
			y: tick.y + 4,
			'text-anchor': 'end',
		});
	}
	svgText(svg, 'fitness-log-chart-unit', options.unit, {
		x: plot.left - 8,
		y: plot.top - 10,
		'text-anchor': 'end',
	});
	geometry.xTicks.forEach((tick, index) => {
		const ticks = geometry.xTicks;
		const anchor =
			tick.kind === 'month' || ticks.length === 1
				? 'middle'
				: index === 0
					? 'start'
					: index === ticks.length - 1
						? 'end'
						: 'middle';
		svgText(svg, 'fitness-log-chart-axis', xTickLabel(tick, ticks), {
			x: tick.x,
			y: HEIGHT - 8,
			'text-anchor': anchor,
		});
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

	const bySeries = new Map<string, ChartSeries>(
		options.series.map((s) => [s.key, s]),
	);
	const single = options.series.length === 1;
	const labelled = new Set(options.labelDates ?? []);
	const ends: Array<{ series: ChartSeries; y: number }> = [];
	// 比べる線（点線）を先に描き、主の線を上に重ねる
	const order = [...geometry.series].sort(
		(a, b) =>
			Number(bySeries.get(b.key)?.dashed ?? false) -
			Number(bySeries.get(a.key)?.dashed ?? false),
	);
	for (const plotted of order) {
		const series = bySeries.get(plotted.key);
		if (!series) continue;
		const g = svg.createSvg('g', {
			cls: ['fitness-log-series', series.colorCls],
		});
		g.toggleClass('is-dashed', series.dashed === true);
		if (single && !series.dashed) {
			const area = areaPath(plotted, plot.bottom);
			if (area)
				g.createSvg('path', {
					cls: 'fitness-log-series-area',
					attr: { d: area },
				});
		}
		if (plotted.linePath)
			g.createSvg('path', {
				cls: 'fitness-log-series-line',
				attr: { d: plotted.linePath },
			});
		const dense = plotted.points.length > DENSE_POINTS;
		plotted.points.forEach((point, i) => {
			const isLast = i === plotted.points.length - 1;
			if (dense && !isLast && !labelled.has(point.date)) return;
			g.createSvg('circle', {
				cls: 'fitness-log-series-point',
				attr: { cx: point.x, cy: point.y, r: isLast ? 4.5 : 3.5 },
			});
		});
		const last = plotted.points[plotted.points.length - 1];
		if (endLabels && last) ends.push({ series, y: last.y });
	}
	// 系列の名前は右の余白に、最後の点の高さで（重ならないようにずらす）。線の見本を添える
	const labelYs = spreadLabels(
		ends.map((e) => e.y),
		14,
		plot.top,
		plot.bottom,
	);
	ends.forEach(({ series }, i) => {
		const y = labelYs[i] ?? plot.top;
		const key = svg.createSvg('g', {
			cls: ['fitness-log-series', series.colorCls],
		});
		key.toggleClass('is-dashed', series.dashed === true);
		key.createSvg('path', {
			cls: 'fitness-log-series-line',
			attr: { d: `M${plot.right + 8} ${y} L${plot.right + 20} ${y}` },
		});
		svgText(svg, 'fitness-log-chart-series-label', series.label, {
			x: plot.right + 24,
			y: y + 4,
		});
	});
	if (single) {
		const plotted = geometry.series[0];
		for (const date of options.labelDates ?? []) {
			const point = plotted?.points.find((p) => p.date === date);
			if (!point) continue;
			const nearRight = point.x > plot.right - 40;
			svgText(
				svg,
				'fitness-log-chart-value',
				options.formatValue(point.value),
				{
					x: nearRight ? point.x - 6 : point.x + 6,
					y: point.y - 9,
					'text-anchor': nearRight ? 'end' : 'start',
				},
			);
		}
	}

	const ring = svg.createSvg('circle', {
		cls: 'fitness-log-chart-ring',
		attr: { cx: 0, cy: 0, r: 6.5, visibility: 'hidden' },
	});
	const tooltip = createTooltip(wrap);
	const overlay = svg.createSvg('rect', {
		cls: 'fitness-log-chart-overlay',
		attr: {
			x: plot.left - 12,
			y: 0,
			width: plot.right - plot.left + 24,
			height: HEIGHT,
		},
	});

	let current: { series: PlottedSeries; point: PlottedPoint } | null = null;
	let wasSelected = false;
	const select = (event: PointerEvent) => {
		const box = svg.getBoundingClientRect();
		const x = ((event.clientX - box.left) / box.width) * width;
		const y = ((event.clientY - box.top) / box.height) * HEIGHT;
		const hit = nearestPoint(geometry.series, x, y);
		if (!hit) return;
		const series = bySeries.get(hit.series.key);
		if (!series) return;
		current = hit;
		const { point } = hit;
		crosshair.setAttr('x1', point.x);
		crosshair.setAttr('x2', point.x);
		crosshair.setAttr('visibility', 'visible');
		ring.setAttr('cx', point.x);
		ring.setAttr('cy', point.y);
		ring.setAttr('class', `fitness-log-chart-ring ${series.colorCls}`);
		ring.setAttr('visibility', 'visible');
		tooltip.show(
			[
				options.formatValue(point.value),
				options.series.length > 1
					? `${options.formatDate(point.date)} ・ ${series.label}`
					: options.formatDate(point.date),
				options.describe?.(series, point) ?? '',
			],
			point.x / width,
		);
	};
	const hide = () => {
		current = null;
		crosshair.setAttr('visibility', 'hidden');
		ring.setAttr('visibility', 'hidden');
		tooltip.hide();
	};
	overlay.addEventListener('pointermove', (event) => {
		// タッチは押している間だけなぞれる（押す前の移動は無い）。マウスはホバーで選ぶ
		if (event.pointerType === 'mouse' || event.buttons > 0) select(event);
	});
	overlay.addEventListener('pointerdown', (event) => {
		// タップした点がすでに選ばれていたか（2 回目のタップで開く。マウスはホバーで選ばれている）
		const before = current;
		select(event);
		wasSelected =
			before !== null &&
			current !== null &&
			before.series.key === current.series.key &&
			before.point.date === current.point.date;
	});
	overlay.addEventListener('pointerleave', (event) => {
		if (event.pointerType === 'mouse') hide();
	});
	overlay.addEventListener('click', () => {
		if (!wasSelected || !current || !options.onSelect) return;
		const series = bySeries.get(current.series.key);
		if (series) options.onSelect(series, current.point);
	});
}

/** 小さな推移の線（一覧の行の右端）。2 点未満なら空の枠 */
export function renderSparkline(
	parent: HTMLElement,
	values: readonly (number | null)[],
	colorCls: string,
): void {
	const width = 76;
	const height = 26;
	const svg = parent.createSvg('svg', {
		cls: ['fitness-log-spark', colorCls],
		attr: {
			viewBox: `0 0 ${width} ${height}`,
			width,
			height,
			'aria-hidden': 'true',
		},
	});
	const line = sparkline(values, width, height);
	if (!line) return;
	svg.createSvg('polyline', {
		cls: 'fitness-log-spark-line',
		attr: { points: line.points },
	});
	svg.createSvg('circle', {
		cls: 'fitness-log-spark-point',
		attr: { cx: line.last.x, cy: line.last.y, r: 2.75 },
	});
}

export interface BarDatum {
	key: string;
	value: number;
	/** ツールチップの 1 行目（値） */
	title: string;
	/** ツールチップの 2 行目以降 */
	detail: string[];
}

export interface BarChartOptions {
	bars: readonly BarDatum[];
	colorCls: string;
	label: string;
	onSelect?: (bar: BarDatum) => void;
}

const BAR_HEIGHT = 64;
const BAR_GAP = 2;
const BAR_MAX_WIDTH = 32;

/** 1 回ごとの棒（最後の回を濃く）。棒の幅いっぱいの縦の帯を当たり判定にする */
export function renderBarChart(
	parent: HTMLElement,
	options: BarChartOptions,
): void {
	const wrap = parent.createDiv({ cls: 'fitness-log-chart is-bars' });
	const width = measureWidth(wrap, parent);
	const n = options.bars.length;
	if (n === 0) return;
	const barWidth = Math.min(BAR_MAX_WIDTH, (width - BAR_GAP * (n - 1)) / n);
	const max = Math.max(...options.bars.map((b) => b.value), 1);
	const svg = wrap.createSvg('svg', {
		cls: ['fitness-log-chart-svg', options.colorCls],
		attr: {
			viewBox: `0 0 ${width} ${BAR_HEIGHT}`,
			width: '100%',
			height: String(BAR_HEIGHT),
			role: 'img',
			'aria-label': options.label,
		},
	});
	svg.createSvg('line', {
		cls: 'fitness-log-chart-grid',
		attr: { x1: 0, x2: width, y1: BAR_HEIGHT - 0.5, y2: BAR_HEIGHT - 0.5 },
	});
	const tooltip = createTooltip(wrap);
	let selected: number | null = null;
	let wasSelected = false;
	const marks: SVGPathElement[] = [];
	options.bars.forEach((bar, i) => {
		const h = Math.max(2, (bar.value / max) * (BAR_HEIGHT - 6));
		const x = i * (barWidth + BAR_GAP);
		const mark = svg.createSvg('path', {
			cls: 'fitness-log-bar',
			attr: { d: barPath(x, BAR_HEIGHT - h, barWidth, h, 4) },
		});
		mark.toggleClass('is-latest', i === n - 1);
		marks.push(mark);
		const hit = svg.createSvg('rect', {
			cls: 'fitness-log-bar-hit',
			attr: {
				x: x - BAR_GAP / 2,
				y: 0,
				width: barWidth + BAR_GAP,
				height: BAR_HEIGHT,
			},
		});
		const show = () => {
			selected = i;
			marks.forEach((m, j) => m.toggleClass('is-hovered', j === i));
			tooltip.show(
				[bar.title, ...bar.detail],
				(x + barWidth / 2) / width,
			);
		};
		// タッチでは pointerenter が pointerdown の前に来るので、マウスのときだけ
		hit.addEventListener('pointerenter', (event) => {
			if (event.pointerType === 'mouse') show();
		});
		hit.addEventListener('pointerdown', () => {
			wasSelected = selected === i;
			show();
		});
		hit.addEventListener('pointerleave', (event) => {
			if (event.pointerType !== 'mouse') return;
			selected = null;
			mark.removeClass('is-hovered');
			tooltip.hide();
		});
		hit.addEventListener('click', () => {
			if (wasSelected && options.onSelect) options.onSelect(bar);
		});
	});
}
