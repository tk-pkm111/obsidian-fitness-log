/**
 * 重量の単位。日ノートと data.json は常に kg で持ち、表示と入力だけを設定の単位にする。
 */
import type { WeightUnit } from './model/types';

export const KG_PER_LB = 0.45359237;

/** kg → 表示単位（lb は 0.1 単位、kg は 0.01 単位に丸める） */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
	if (unit === 'lb') return Math.round((kg / KG_PER_LB) * 10) / 10;
	return Math.round(kg * 100) / 100;
}

/** 表示単位 → kg（保存用。0.001 kg 単位に丸める） */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
	const kg = unit === 'lb' ? value * KG_PER_LB : value;
	return Math.round(kg * 1000) / 1000;
}

/** '10 kg' / '22 lb'。null は '-' */
export function formatWeight(kg: number | null, unit: WeightUnit): string {
	if (kg === null) return '-';
	return `${toDisplayWeight(kg, unit)} ${unit}`;
}

/**
 * 数値入力の解釈（全角数字・小数点のカンマを受け付ける）。空なら null、読めなければ undefined。
 */
export function parseNumberInput(input: string): number | null | undefined {
	const text = input.normalize('NFKC').trim().replace(/,/g, '.');
	if (text === '') return null;
	if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(text)) return undefined;
	const value = Number(text);
	return Number.isFinite(value) ? value : undefined;
}

/** 刻みに合わせて増減する（2.5 刻みで 11 + 2.5 → 13.5 ではなく 12.5） */
export function stepValue(
	value: number,
	step: number,
	direction: 1 | -1,
): number {
	if (step <= 0) return value;
	const snapped =
		direction > 0
			? Math.floor(value / step + 1e-9) * step + step
			: Math.ceil(value / step - 1e-9) * step - step;
	return Math.max(0, Math.round(snapped * 1000) / 1000);
}
