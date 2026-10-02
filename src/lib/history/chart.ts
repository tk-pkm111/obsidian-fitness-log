/**
 * チャートの座標計算（描画は UI 側で SVG にする）。
 * 折れ線: x は日付（暦日の差）に比例、y はきりのよい目盛り。複数の系列（パッケージごとの線）は同じ軸に載せる。
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

export interface SeriesInput {
	key: string;
	points: readonly ChartPoint[];
}

export interface PlottedSeries {
	key: string;
	/** 日付の昇順 */
	points: PlottedPoint[];
	/** 'M x y L x y ...'（点が 1 つなら空） */
	linePath: string;
}

/** 日付の目盛り。kind が 'month' なら date はその月の 1 日 */
export interface XTick {
	x: number;
	date: string;
	kind: 'day' | 'month';
}

export interface ChartGeometry {
	width: number;
	height: number;
	/** 描画領域 */
	plot: { left: number; top: number; right: number; bottom: number };
	series: PlottedSeries[];
	yTicks: Array<{ y: number; value: number }>;
	xTicks: XTick[];
}

/** これより長い期間は、日付の代わりに月の初めに目盛りを付ける */
const MONTH_TICKS_FROM_DAYS = 56;
const MAX_X_TICKS = 6;

function byDate(a: ChartPoint, b: ChartPoint): number {
	return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

/** first より後〜 last までの各月の 1 日（多ければ間引く） */
export function monthStarts(first: string, last: string): string[] {
	const result: string[] = [];
	let year = Number(first.slice(0, 4));
	let month = Number(first.slice(5, 7));
	for (;;) {
		month++;
		if (month > 12) {
			month = 1;
			year++;
		}
		const date = `${year}-${String(month).padStart(2, '0')}-01`;
		if (date > last) break;
		result.push(date);
	}
	const step = Math.ceil(result.length / MAX_X_TICKS);
	return step <= 1 ? result : result.filter((_, i) => i % step === 0);
}

export function buildChartGeometry(
	series: readonly SeriesInput[],
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
	const all = series.flatMap((s) => s.points);
	const dates = [...new Set(all.map((p) => p.date))].sort();
	const values = all.map((p) => p.value);
	const ticks =
		values.length > 0
			? niceTicks(Math.min(...values), Math.max(...values))
			: [];
	const yMin = ticks[0] ?? 0;
	const yMax = ticks[ticks.length - 1] ?? 1;
	const first = dates[0];
	const last = dates[dates.length - 1];
	const span = first && last ? diffDays(first, last) : 0;
	const round = (n: number) => Math.round(n * 10) / 10;
	const xOf = (date: string) =>
		round(
			span === 0 || !first
				? (plot.left + plot.right) / 2
				: plot.left +
						(diffDays(first, date) / span) *
							(plot.right - plot.left),
		);
	const yOf = (value: number) =>
		round(
			plot.bottom -
				((value - yMin) / (yMax - yMin || 1)) *
					(plot.bottom - plot.top),
		);

	const plotted = series.map((s): PlottedSeries => {
		const points = [...s.points]
			.sort(byDate)
			.map((p) => ({ ...p, x: xOf(p.date), y: yOf(p.value) }));
		return {
			key: s.key,
			points,
			linePath:
				points.length > 1
					? points
							.map(
								(p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`,
							)
							.join(' ')
					: '',
		};
	});

	const xTicks: XTick[] = [];
	if (first && last && span >= MONTH_TICKS_FROM_DAYS)
		for (const date of monthStarts(first, last))
			xTicks.push({ x: xOf(date), date, kind: 'month' });
	else if (first) {
		// 最初・最後と、その間に最大 2 つ
		const candidates =
			dates.length <= 4
				? dates
				: [0, 1 / 3, 2 / 3, 1].map(
						(f) =>
							dates[Math.round(f * (dates.length - 1))] ?? first,
					);
		for (const date of new Set(candidates))
			xTicks.push({ x: xOf(date), date, kind: 'day' });
	}

	return {
		width: options.width,
		height: options.height,
		plot,
		series: plotted,
		yTicks: ticks.map((value) => ({ value, y: yOf(value) })),
		xTicks,
	};
}

/** 線の下を塗る領域（1 系列のときだけ使う。点が 1 つなら空） */
export function areaPath(series: PlottedSeries, bottom: number): string {
	const first = series.points[0];
	const last = series.points[series.points.length - 1];
	if (!first || !last || series.points.length < 2) return '';
	return `${series.linePath} L${last.x} ${bottom} L${first.x} ${bottom} Z`;
}

/**
 * ポインタに最も近い点（十字線のスナップ）。縦の距離は軽く見る（線が重なっていても横の位置で選べるように）。
 */
export function nearestPoint<T extends { points: readonly PlottedPoint[] }>(
	series: readonly T[],
	x: number,
	y: number,
): { series: T; point: PlottedPoint } | null {
	let best: { series: T; point: PlottedPoint } | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const s of series)
		for (const point of s.points) {
			const distance = Math.hypot(point.x - x, (point.y - y) * 0.35);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = { series: s, point };
			}
		}
	return best;
}

/**
 * ラベルの縦位置を、重ならないよう gap 以上あけて min〜max に収める（並び順は入力の順のまま返す）。
 * 近いものは下へずらし、はみ出したら全体を上へ戻す。
 */
export function spreadLabels(
	ys: readonly number[],
	gap: number,
	min: number,
	max: number,
): number[] {
	const order = ys
		.map((y, i) => ({ y: Math.min(max, Math.max(min, y)), i }))
		.sort((a, b) => a.y - b.y || a.i - b.i);
	for (let k = 1; k < order.length; k++) {
		const prev = order[k - 1];
		const cur = order[k];
		if (prev && cur && cur.y - prev.y < gap) cur.y = prev.y + gap;
	}
	for (let k = order.length - 1; k >= 0; k--) {
		const cur = order[k];
		const next = order[k + 1];
		if (!cur) continue;
		const limit = next ? next.y - gap : max;
		if (cur.y > limit) cur.y = limit;
	}
	const result: number[] = [];
	for (const { y, i } of order) result[i] = Math.round(y * 10) / 10;
	return result;
}

/** 小さな推移の線（一覧の行の右端）。値の無い回は飛ばす。2 点未満なら null */
export function sparkline(
	values: readonly (number | null)[],
	width: number,
	height: number,
	inset = 3,
): { points: string; last: { x: number; y: number } } | null {
	const present = values.filter((v): v is number => v !== null);
	if (present.length < 2) return null;
	const min = Math.min(...present);
	const max = Math.max(...present);
	const range = max - min;
	const round = (n: number) => Math.round(n * 10) / 10;
	const xy = present.map((v, i) => ({
		x: round(inset + (i * (width - 2 * inset)) / (present.length - 1)),
		// 変化が無ければ真ん中に平らな線
		y: round(
			range === 0
				? height / 2
				: height - inset - ((v - min) / range) * (height - 2 * inset),
		),
	}));
	const last = xy[xy.length - 1] ?? { x: 0, y: 0 };
	return { points: xy.map((p) => `${p.x},${p.y}`).join(' '), last };
}

/** 上の角だけ丸めた棒（下は基準線に付ける） */
export function barPath(
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
): string {
	const r = Math.max(0, Math.min(radius, width / 2, height));
	const bottom = y + height;
	const round = (n: number) => Math.round(n * 100) / 100;
	return [
		`M${round(x)} ${round(bottom)}`,
		`L${round(x)} ${round(y + r)}`,
		`Q${round(x)} ${round(y)} ${round(x + r)} ${round(y)}`,
		`L${round(x + width - r)} ${round(y)}`,
		`Q${round(x + width)} ${round(y)} ${round(x + width)} ${round(y + r)}`,
		`L${round(x + width)} ${round(bottom)}`,
		'Z',
	].join(' ');
}
