import { describe, expect, it } from 'vitest';
import {
	hasField,
	keepsWeight,
	normalizeRecordType,
	recordFields,
	recordTypeOf,
} from '../../../src/lib/model/record-type';

describe('記録のしかた（記録する項目の組み合わせ）', () => {
	it('以前からの 3 つはそのまま読み、項目は決まった順に並べ直す', () => {
		expect(normalizeRecordType('weight-reps')).toBe('weight-reps');
		expect(normalizeRecordType('reps')).toBe('reps');
		expect(normalizeRecordType('duration')).toBe('duration');
		expect(normalizeRecordType('Duration-Distance')).toBe(
			'distance-duration',
		);
		expect(normalizeRecordType('weight, duration')).toBe('weight-duration');
	});

	it('知らない項目・空は読まない（呼び出し側で重量 × 回数にする）', () => {
		expect(normalizeRecordType('pace')).toBeUndefined();
		expect(normalizeRecordType('')).toBeUndefined();
		expect(normalizeRecordType(3)).toBeUndefined();
		expect(recordFields('pace')).toEqual(['weight', 'reps']);
	});

	it('項目から文字列を作る（項目が無ければ null）', () => {
		expect(recordTypeOf(['duration', 'distance'])).toBe(
			'distance-duration',
		);
		expect(recordTypeOf([])).toBeNull();
	});

	it('回数を記録する種目は、重りを足した日のために重量も持てる', () => {
		expect(keepsWeight('reps')).toBe(true);
		expect(keepsWeight('weight-duration')).toBe(true);
		expect(keepsWeight('distance-duration')).toBe(false);
		expect(hasField('distance-duration', 'distance')).toBe(true);
	});
});
