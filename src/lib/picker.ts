/**
 * スクロールで選ぶ数字（ホイール）の選択肢。スマホで数字キーボードを出さずに、重量・回数・時刻・目標を選ぶ。
 * 値は表示の単位（重量は kg / lb のまま）。
 */
import { parseRepRange } from './rep-range';

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

/** min〜max を step 刻みで（端を含む） */
export function stepRange(min: number, max: number, step: number): number[] {
	const result: number[] = [];
	if (step <= 0) return result;
	for (let v = min; v <= max + step / 1000; v += step) result.push(round(v));
	return result;
}

/** 刻みに乗らない値（22.75 kg・2:33 など）も選べるよう、昇順の位置に差し込む */
export function withValue(values: readonly number[], value: number): number[] {
	if (values.some((v) => Math.abs(v - value) < 1e-9)) return [...values];
	return [...values, value].sort((a, b) => a - b);
}

/** 値に最も近い選択肢の位置（null は null の選択肢、無ければ先頭） */
export function nearestIndex(
	values: readonly (number | null)[],
	value: number | null,
): number {
	if (value === null) return Math.max(0, values.indexOf(null));
	let best = 0;
	let bestDistance = Number.POSITIVE_INFINITY;
	values.forEach((v, i) => {
		if (v === null) return;
		const distance = Math.abs(v - value);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = i;
		}
	});
	return best;
}

/**
 * 重量: 刻み（2.5 kg など）ごとに max まで（刻みから始める）。今の値が刻みに乗らなければ差し込む。
 * allowEmpty なら先頭に「なし」（null。自重・重量を書かない）。
 */
export function weightChoices(
	current: number | null,
	step: number,
	max: number,
	allowEmpty: boolean,
): (number | null)[] {
	const top = Math.max(max, current === null ? 0 : current * 1.5);
	// 0 kg は選ばせない（重量なしは「なし」）。今の値が 0 なら差し込まれる
	let values = stepRange(step, Math.ceil(top / step) * step, step);
	if (current !== null) values = withValue(values, current);
	return allowEmpty ? [null, ...values] : values;
}

/** 回数: 0〜max（今の値がもっと多ければそこまで） */
export function repsChoices(current: number | null, max = 50): number[] {
	return stepRange(0, Math.max(max, current ?? 0), 1);
}

/** 秒を [時, 分, 秒] に */
export function splitClock(seconds: number): [number, number, number] {
	const s = Math.max(0, Math.round(seconds)) % 86_400;
	return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
}

/** 秒を [分, 秒] に（分は 60 を超えてよい） */
export function splitDuration(seconds: number): [number, number] {
	const s = Math.max(0, Math.round(seconds));
	return [Math.floor(s / 60), s % 60];
}

/** 秒の列（刻みに乗らない今の値も差し込む） */
export function secondChoices(step: number, current?: number): number[] {
	const values = stepRange(0, 59, step);
	return current === undefined ? values : withValue(values, current);
}

/** 回数の目標 '6-9' を [下限, 上限]（1 つだけなら上限は null）に。読めなければ null */
export function splitRepRange(text: string): [number, number | null] | null {
	const range = parseRepRange(text);
	if (!range || range.kind !== 'range') return null;
	return [range.min, range.max === range.min ? null : range.max];
}

/** [下限, 上限] を '6-9' / '8' に（上限が下限より小さければ入れ替える） */
export function joinRepRange(min: number, max: number | null): string {
	if (max === null || max === min) return String(min);
	return max > min ? `${min}-${max}` : `${max}-${min}`;
}
