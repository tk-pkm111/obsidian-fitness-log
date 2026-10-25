/**
 * 体組成の項目。ノートのプロパティ名がそのまま画面の項目名。
 * - 全身の項目: 「体重」「体脂肪率」など
 * - 部位の項目: 「左腕 筋肉量」のように 部位 + 半角スペース + 項目。部位は 5 つ（固定）
 * - 知っている名前は単位と小数の桁を持つ（項目を足すとき・表示）。知らない名前の桁はノートの値から決める
 * - 重さ（単位 kg）の項目はノートに kg で書き、表示と入力は設定「重量の単位」に合わせる（セットの重量と同じ）
 */
import { fromDisplayWeight, toDisplayWeight } from '../units';
import type { WeightUnit } from '../model/types';

export const BODY_PARTS = ['体幹部', '左腕', '右腕', '左脚', '右脚'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

/** 左右の組（左右の差・2 本の線）。体幹部は 1 つ */
export const BODY_SIDES = {
	腕: { left: '左腕', right: '右腕' },
	脚: { left: '左脚', right: '右脚' },
} as const satisfies Record<string, { left: BodyPart; right: BodyPart }>;
export type BodySideGroup = keyof typeof BODY_SIDES;

/** 部位別の画面で開くまとまり（腕・脚は左右を一緒に） */
export type BodyPartGroup = BodySideGroup | '体幹部';

export interface ItemInfo {
	unit: string;
	decimals: number;
}

/** 丸に出す項目（名前と単位） */
export interface BodyItem {
	name: string;
	unit: string;
}

const KG = 'kg';

const WHOLE_ITEMS: Record<string, ItemInfo> = {
	体重: { unit: KG, decimals: 1 },
	体脂肪率: { unit: '%', decimals: 1 },
	筋肉量: { unit: KG, decimals: 1 },
	内臓脂肪レベル: { unit: '', decimals: 0 },
	BMI: { unit: '', decimals: 1 },
	基礎代謝量: { unit: 'kcal', decimals: 0 },
	体内年齢: { unit: '才', decimals: 0 },
	推定骨量: { unit: KG, decimals: 1 },
	体水分率: { unit: '%', decimals: 1 },
	筋質点数: { unit: '点', decimals: 0 },
	脂肪量: { unit: KG, decimals: 1 },
	除脂肪量: { unit: KG, decimals: 1 },
	体水分量: { unit: KG, decimals: 1 },
	タンパク質量: { unit: KG, decimals: 1 },
	SMI: { unit: '', decimals: 2 },
	アスリート指数: { unit: '', decimals: 0 },
};

/** 部位の項目（「左腕 筋肉量」の「筋肉量」）。並びは部位別の画面のチップの順 */
const PART_MEASURES: Record<string, ItemInfo> = {
	筋肉量: { unit: KG, decimals: 1 },
	脂肪量: { unit: KG, decimals: 1 },
	脂肪率: { unit: '%', decimals: 1 },
	筋質点数: { unit: '点', decimals: 0 },
	フェーズアングル: { unit: '', decimals: 1 },
};

/** 手で入れる部位の項目（ノートに部位の項目がまだ無いとき） */
export const DEFAULT_PART_MEASURES: readonly string[] = ['筋肉量', '脂肪率'];

export const DEFAULT_BODY_ITEMS: readonly BodyItem[] = [
	{ name: '体重', unit: KG },
	{ name: '体脂肪率', unit: '%' },
	{ name: '筋肉量', unit: KG },
];

export interface PartKey {
	part: BodyPart;
	measure: string;
}

/** 「左腕 筋肉量」→ 部位と項目。部位の項目でなければ null */
export function splitPartKey(name: string): PartKey | null {
	const space = name.indexOf(' ');
	if (space < 0) return null;
	const part = name.slice(0, space);
	const measure = name.slice(space + 1).trim();
	if (measure === '') return null;
	const known = (BODY_PARTS as readonly string[]).includes(part);
	return known ? { part: part as BodyPart, measure } : null;
}

export function partKey(part: BodyPart, measure: string): string {
	return `${part} ${measure}`;
}

export function isPartKey(name: string): boolean {
	return splitPartKey(name) !== null;
}

/** 知っている項目の単位・小数（全身・部位とも） */
export function knownItem(name: string): ItemInfo | undefined {
	const part = splitPartKey(name);
	return part ? PART_MEASURES[part.measure] : WHOLE_ITEMS[name];
}

/** 知っている部位の項目の並び（チップの順）。知らないものは後ろに名前の順 */
export function partMeasureOrder(measures: Iterable<string>): string[] {
	const known = Object.keys(PART_MEASURES);
	return [...new Set(measures)].sort((a, b) => {
		const ia = known.indexOf(a);
		const ib = known.indexOf(b);
		if (ia >= 0 || ib >= 0)
			return (ia < 0 ? known.length : ia) - (ib < 0 ? known.length : ib);
		return a.localeCompare(b);
	});
}

function decimalsInValue(value: number): number {
	const text = String(value);
	if (text.includes('e')) return 2;
	const dot = text.indexOf('.');
	return dot < 0 ? 0 : text.length - dot - 1;
}

/** 表示の小数の桁: 知っている項目は決まった桁、知らない項目はノートの値の最大（2 桁まで） */
export function decimalsOf(name: string, values: Iterable<number>): number {
	const known = knownItem(name);
	if (known) return known.decimals;
	let max = 0;
	for (const value of values) max = Math.max(max, decimalsInValue(value));
	return Math.min(2, max);
}

/** 項目の単位: 一覧の単位 → 知っている単位 → なし */
export function unitOf(name: string, items: readonly BodyItem[]): string {
	return (
		items.find((item) => item.name === name)?.unit ??
		knownItem(name)?.unit ??
		''
	);
}

/** 表示の単位（kg の項目は重量の単位に合わせる） */
export function displayUnit(unit: string, weightUnit: WeightUnit): string {
	return unit === KG ? weightUnit : unit;
}

/** ノートの値 → 表示の値（kg の項目だけ換算。差にも使える） */
export function toDisplayBody(
	value: number,
	unit: string,
	weightUnit: WeightUnit,
): number {
	return unit === KG && weightUnit === 'lb'
		? toDisplayWeight(value, 'lb')
		: value;
}

/** 入力の値 → ノートの値（kg の項目は kg に） */
export function fromDisplayBody(
	value: number,
	unit: string,
	weightUnit: WeightUnit,
): number {
	return unit === KG && weightUnit === 'lb'
		? fromDisplayWeight(value, 'lb')
		: value;
}

/** 表示の値の桁（lb にした kg の項目は 1 桁） */
export function displayDecimals(
	decimals: number,
	unit: string,
	weightUnit: WeightUnit,
): number {
	return unit === KG && weightUnit === 'lb' ? 1 : decimals;
}
