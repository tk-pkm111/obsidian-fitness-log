/**
 * 折れ線チャートの座標計算（描画は UI 側で SVG にする）。
 * x は日付（暦日の差）に比例、y はきりのよい目盛り。
 */
import { diffDays } from '../time/date';

export interface ChartPoint {
	date: string;
	value: number;
}

export interface PlottedPoint extends ChartPoint {
	x: number;
	y: number;
}

export interface ChartGeometry {
	width: number;
	height: number;
	/** 描画領域 */
	plot: { left: number; top: number; right: number; bottom: number };
	points: PlottedPoint[];
	/** 'M x y L x y ...' */
	linePath: string;
	/** 線の下を塗る領域（基準線まで） */
	areaPath: string;
	yTicks: Array<{ y: number; value: number }>;
	xTicks: Array<{ x: number; date: string }>;
}

/** きりのよい刻み（1, 2, 2.5, 5 × 10^n） */
export function niceStep(range: number, targetTicks: number): number {
	if (range <= 0 || targetTicks <= 0) return 1;
	const raw = range / targetTicks;
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	for (const m of [1, 2, 2.5, 5, 10])
		if (m * magnitude >= raw) return m * magnitude;
	return 10 * magnitude;
}

/** 値の範囲をきりのよい目盛りで覆う（0 を下限にしない。推移の変化を見せるため） */
export function niceTicks(min: number, max: number, targetTicks = 4): number[] {
	if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
	let lo = min;
	let hi = max;
	if (lo === hi) {
		const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
		lo -= pad;
		hi += pad;
	}
	const step = niceStep(hi - lo, targetTicks);
	const start = Math.floor(lo / step) * step;
	const end = Math.ceil(hi / step) * step;
	const ticks: number[] = [];
	for (let v = start; v <= end + step / 1000; v += step)
		ticks.push(Math.round(v * 1000) / 1000);
	return ticks;
}

export interface GeometryOptions {
	width: number;
	height: number;
	/** 左（y 目盛りの文字）・下（日付）などの余白 */
	padding?: { left: number; right: number; top: number; bottom: number };
}

export function buildChartGeometry(
	points: readonly ChartPoint[],
	options: GeometryOptions,
): ChartGeometry {
	const padding = options.padding ?? {
		left: 44,
		right: 16,
		top: 16,
		bottom: 28,
	};
	const plot = {
		left: padding.left,
		top: padding.top,
		right: options.width - padding.right,
		bottom: options.height - padding.bottom,
	};
	const sorted = [...points].sort((a, b) =>
		a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
	);
	const values = sorted.map((p) => p.value);
	const ticks = niceTicks(Math.min(...values), Math.max(...values));
	const yMin = ticks[0] ?? 0;
	const yMax = ticks[ticks.length - 1] ?? 1;
	const first = sorted[0]?.date;
	const last = sorted[sorted.length - 1]?.date;
	const span = first && last ? Math.max(1, diffDays(first, last)) : 1;
	const xOf = (date: string) =>
		sorted.length <= 1 || !first
			? (plot.left + plot.right) / 2
			: plot.left +
				(diffDays(first, date) / span) * (plot.right - plot.left);
	const yOf = (value: number) =>
		plot.bottom -
		((value - yMin) / (yMax - yMin || 1)) * (plot.bottom - plot.top);
	const round = (n: number) => Math.round(n * 10) / 10;

	const plotted = sorted.map((p) => ({
		...p,
		x: round(xOf(p.date)),
		y: round(yOf(p.value)),
	}));
	const linePath = plotted
		.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`)
		.join(' ');
	const firstPoint = plotted[0];
	const lastPoint = plotted[plotted.length - 1];
	const areaPath =
		firstPoint && lastPoint && plotted.length > 1
			? `${linePath} L${lastPoint.x} ${plot.bottom} L${firstPoint.x} ${plot.bottom} Z`
			: '';

	// 日付の目盛り: 最初・最後と、その間に最大 2 つ
	const xTicks: Array<{ x: number; date: string }> = [];
	if (firstPoint) {
		const candidates =
			plotted.length <= 4
				? plotted
				: [0, 1 / 3, 2 / 3, 1].map(
						(f) => plotted[Math.round(f * (plotted.length - 1))],
					);
		for (const p of candidates)
			if (p && !xTicks.some((t) => t.date === p.date))
				xTicks.push({ x: p.x, date: p.date });
	}

	return {
		width: options.width,
		height: options.height,
		plot,
		points: plotted,
		linePath,
		areaPath,
		yTicks: ticks.map((value) => ({ value, y: round(yOf(value)) })),
		xTicks,
	};
}

/** ポインタの x に最も近い点（十字線のスナップ） */
export function nearestPoint(
	points: readonly PlottedPoint[],
	x: number,
): PlottedPoint | null {
	let best: PlottedPoint | null = null;
	for (const p of points)
		if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
	return best;
}
