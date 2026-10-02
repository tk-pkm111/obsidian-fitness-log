import { describe, expect, it } from 'vitest';
import {
	formatWeight,
	fromDisplayWeight,
	parseNumberInput,
	stepValue,
	toDisplayWeight,
} from '../../src/lib/units';

describe('重量の単位', () => {
	it('kg はそのまま、lb は換算して 0.1 単位に丸める', () => {
		expect(toDisplayWeight(12.5, 'kg')).toBe(12.5);
		expect(toDisplayWeight(61.235, 'lb')).toBe(135);
		expect(fromDisplayWeight(135, 'lb')).toBe(61.235);
		expect(formatWeight(10, 'kg')).toBe('10 kg');
		expect(formatWeight(null, 'kg')).toBe('-');
	});

	it('lb で入力 → kg で保存 → lb で表示が元に戻る', () => {
		for (const lb of [45, 135, 225, 22.5, 2.5]) {
			expect(toDisplayWeight(fromDisplayWeight(lb, 'lb'), 'lb')).toBe(lb);
		}
	});
});

describe('parseNumberInput', () => {
	it('全角・小数カンマを受け付け、空は null、読めなければ undefined', () => {
		expect(parseNumberInput('１２．５')).toBe(12.5);
		expect(parseNumberInput('12,5')).toBe(12.5);
		expect(parseNumberInput(' 8 ')).toBe(8);
		expect(parseNumberInput('.5')).toBe(0.5);
		expect(parseNumberInput('')).toBeNull();
		expect(parseNumberInput('abc')).toBeUndefined();
		expect(parseNumberInput('1.2.3')).toBeUndefined();
	});
});

describe('stepValue', () => {
	it('刻みの倍数に揃えながら増減し、0 未満にはしない', () => {
		expect(stepValue(10, 2.5, 1)).toBe(12.5);
		expect(stepValue(11, 2.5, 1)).toBe(12.5);
		expect(stepValue(11, 2.5, -1)).toBe(10);
		expect(stepValue(10, 2.5, -1)).toBe(7.5);
		expect(stepValue(1, 2.5, -1)).toBe(0);
		expect(stepValue(8, 1, 1)).toBe(9);
		expect(stepValue(0.3, 0.1, 1)).toBe(0.4);
	});
});
