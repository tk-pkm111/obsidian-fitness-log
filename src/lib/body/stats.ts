/**
 * 体組成の数字（前回・初回・期間・目標までの進み具合・左右の差）。
 * 値はノートの単位のまま（表示の単位にするのは画面）。差は 今 − 前 の向き。
 */
import type { ChartPoint } from '../history/chart';
import { addDays } from '../time/date';
import { BODY_SIDES, partKey, type BodySideGroup } from './items';
import type { BodyMeasurement } from './note';
import type { BodyGoal } from './settings';

export type BodyPeriod = '1m' | '3m' | '6m' | '1y' | 'all';

export const BODY_PERIODS: readonly BodyPeriod[] = [
	'1m',
	'3m',
	'6m',
	'1y',
	'all',
];

const PERIOD_DAYS: Record<Exclude<BodyPeriod, 'all'>, number> = {
	'1m': 31,
	'3m': 92,
	'6m': 183,
	'1y': 365,
};

type Measurements = readonly BodyMeasurement[];

/** index より前で、その項目のある最後の測定（無ければ -1） */
export function previousIndex(
	ms: Measurements,
	index: number,
	name: string,
): number {
	for (let i = index - 1; i >= 0; i--)
		if (ms[i]?.values[name] !== undefined) return i;
	return -1;
}

/** その項目のある最初の測定（無ければ -1） */
export function firstIndex(ms: Measurements, name: string): number {
	return ms.findIndex((m) => m.values[name] !== undefined);
}

/** index 以前で、その項目のある最後の測定（無ければ -1） */
export function atOrBeforeIndex(
	ms: Measurements,
	index: number,
	name: string,
): number {
	for (let i = Math.min(index, ms.length - 1); i >= 0; i--)
		if (ms[i]?.values[name] !== undefined) return i;
	return -1;
}

/** その項目のある最後の測定（無ければ -1） */
export function lastIndex(ms: Measurements, name: string): number {
	return atOrBeforeIndex(ms, ms.length - 1, name);
}

/** 今の測定の値と、前の測定からの差（前が無ければ null） */
export function changeFrom(
	ms: Measurements,
	index: number,
	name: string,
	from: number,
): number | null {
	const current = ms[index]?.values[name];
	const base = from >= 0 ? ms[from]?.values[name] : undefined;
	return current === undefined || base === undefined || from === index
		? null
		: current - base;
}

/** 期間の初め（最後の測定の日から数える）。'all' は null */
export function periodStart(
	lastDate: string,
	period: BodyPeriod,
): string | null {
	return period === 'all' ? null : addDays(lastDate, -PERIOD_DAYS[period]);
}

/** グラフの点（期間の中、日付の昇順） */
export function seriesPoints(
	ms: Measurements,
	name: string,
	period: BodyPeriod,
): ChartPoint[] {
	const last = ms[ms.length - 1];
	if (!last) return [];
	const start = periodStart(last.date, period);
	const points: ChartPoint[] = [];
	for (const m of ms) {
		const value = m.values[name];
		if (value === undefined || (start !== null && m.date < start)) continue;
		points.push({ date: m.date, value });
	}
	return points;
}

/** 部位の項目に出てくる項目（「左腕 筋肉量」の「筋肉量」）。出てきた順 */
export function partMeasuresIn(
	ms: Measurements,
	split: (name: string) => { measure: string } | null,
): string[] {
	const found = new Set<string>();
	for (const m of ms)
		for (const name of Object.keys(m.values)) {
			const part = split(name);
			if (part) found.add(part.measure);
		}
	return [...found];
}

/** 全身の項目（部位の項目でないもの）。出てきた順 */
export function wholeItemsIn(
	ms: Measurements,
	isPart: (name: string) => boolean,
): string[] {
	const found = new Set<string>();
	for (const m of ms)
		for (const name of Object.keys(m.values))
			if (!isPart(name)) found.add(name);
	return [...found];
}

export interface GoalProgress {
	target: number;
	since: string;
	/** 起点の値（決めた日以前で最後の測定。無ければ最初の測定） */
	start: number;
	/** 今の値（今見ている測定以前で、その項目のある最後の測定） */
	current: number;
	currentDate: string;
	/** 目標 − 今 */
	left: number;
	/** 増やす目標は 1、減らす目標は -1 */
	direction: 1 | -1;
	reached: boolean;
	/** 0〜1。目標から離れたら 0 */
	progress: number;
}

/** 目標までの進み具合（その項目の記録が無ければ null） */
export function goalProgress(
	ms: Measurements,
	index: number,
	goal: BodyGoal,
): GoalProgress | null {
	const ci = atOrBeforeIndex(ms, index, goal.name);
	const currentMeasurement = ci >= 0 ? ms[ci] : undefined;
	const current = currentMeasurement?.values[goal.name];
	if (!currentMeasurement || current === undefined) return null;
	let si = -1;
	for (let i = ms.length - 1; i >= 0; i--) {
		const m = ms[i];
		if (m && m.date <= goal.since && m.values[goal.name] !== undefined) {
			si = i;
			break;
		}
	}
	if (si < 0) si = firstIndex(ms, goal.name);
	const start = ms[si]?.values[goal.name] ?? current;
	const left = goal.target - current;
	const sign = Math.sign(goal.target - start) || Math.sign(left);
	const direction: 1 | -1 = sign < 0 ? -1 : 1;
	const span = goal.target - start;
	const reached =
		Math.abs(left) < 1e-9 ||
		(span !== 0 && (current - goal.target) * direction >= 0);
	const progress = reached
		? 1
		: span === 0
			? 0
			: Math.min(1, Math.max(0, (current - start) / span));
	return {
		target: goal.target,
		since: goal.since,
		start,
		current,
		currentDate: currentMeasurement.date,
		left,
		direction,
		reached,
		progress,
	};
}

export interface SideBalance {
	group: BodySideGroup;
	left: number;
	right: number;
	/** 右 − 左 */
	diff: number;
}

/** 左右の差（腕・脚。その測定に左右とも無ければ除く） */
export function sideBalance(
	m: BodyMeasurement | undefined,
	measure: string,
): SideBalance[] {
	if (!m) return [];
	const result: SideBalance[] = [];
	for (const group of Object.keys(BODY_SIDES) as BodySideGroup[]) {
		const sides = BODY_SIDES[group];
		const left = m.values[partKey(sides.left, measure)];
		const right = m.values[partKey(sides.right, measure)];
		if (left === undefined || right === undefined) continue;
		result.push({ group, left, right, diff: right - left });
	}
	return result;
}

/** 丸の列の数（幅から。3〜6 列） */
export function discColumns(width: number): number {
	return Math.min(6, Math.max(3, Math.floor(width / 116)));
}

/** 開いた丸のパネルを入れる位置（その段の最後の丸の後） */
export function panelAfter(
	openIndex: number,
	count: number,
	columns: number,
): number {
	if (openIndex < 0 || count === 0) return -1;
	return Math.min(
		count - 1,
		Math.floor(openIndex / columns) * columns + columns - 1,
	);
}
