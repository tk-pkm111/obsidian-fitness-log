import { describe, expect, it } from 'vitest';
import {
	decimalsOf,
	displayDecimals,
	displayUnit,
	fromDisplayBody,
	knownItem,
	partMeasureOrder,
	splitPartKey,
	toDisplayBody,
	unitOf,
} from '../../../src/lib/body/items';

describe('体組成の項目', () => {
	it('部位の項目は 部位 + 半角スペース + 項目。部位でない名前は全身の項目', () => {
		expect(splitPartKey('左腕 筋肉量')).toEqual({
			part: '左腕',
			measure: '筋肉量',
		});
		expect(splitPartKey('体幹部 脂肪率')).toEqual({
			part: '体幹部',
			measure: '脂肪率',
		});
		expect(splitPartKey('左右差 腕')).toBeNull();
		expect(splitPartKey('体重')).toBeNull();
		expect(splitPartKey('左腕 ')).toBeNull();
	});

	it('知っている項目は単位と小数の桁を持つ（部位の項目は項目名から）', () => {
		expect(knownItem('体重')).toEqual({ unit: 'kg', decimals: 1 });
		expect(knownItem('右脚 筋質点数')).toEqual({ unit: '点', decimals: 0 });
		expect(knownItem('骨格筋率')).toBeUndefined();
		expect(unitOf('骨格筋率', [{ name: '骨格筋率', unit: '%' }])).toBe('%');
		expect(unitOf('基礎代謝量', [])).toBe('kcal');
		expect(unitOf('ひみつ', [])).toBe('');
	});

	it('知らない項目の小数の桁はノートの値から（2 桁まで）', () => {
		expect(decimalsOf('SMI', [8])).toBe(2);
		expect(decimalsOf('骨格筋率', [31, 31.25])).toBe(2);
		expect(decimalsOf('骨格筋率', [31.123])).toBe(2);
		expect(decimalsOf('歩数', [8000])).toBe(0);
	});

	it('kg の項目だけ重量の単位（lb）にする', () => {
		expect(displayUnit('kg', 'lb')).toBe('lb');
		expect(displayUnit('%', 'lb')).toBe('%');
		expect(toDisplayBody(66.7, 'kg', 'lb')).toBe(147.0);
		expect(toDisplayBody(18.5, '%', 'lb')).toBe(18.5);
		expect(fromDisplayBody(147, 'kg', 'lb')).toBeCloseTo(66.678, 3);
		expect(fromDisplayBody(66.7, 'kg', 'kg')).toBe(66.7);
		expect(displayDecimals(2, 'kg', 'lb')).toBe(1);
	});

	it('部位の項目のチップは知っている順、知らない項目は後ろ', () => {
		expect(
			partMeasureOrder([
				'脂肪率',
				'水分',
				'筋肉量',
				'筋質点数',
				'筋肉量',
			]),
		).toEqual(['筋肉量', '脂肪率', '筋質点数', '水分']);
	});
});
