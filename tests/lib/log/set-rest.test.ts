import { describe, expect, it } from 'vitest';
import { restsBeforeSets, withRest } from '../../../src/lib/log/set-rest';
import type { SetLog } from '../../../src/lib/model/types';

const set = (start: string | null, end: string | null): SetLog => ({
	weight: 10,
	reps: 8,
	start,
	end,
	note: '',
});

describe('restsBeforeSets', () => {
	it('前のセットの終了からこのセットの開始まで。種目の欄をまたいでつなぐ', () => {
		const rests = restsBeforeSets([
			{
				name: 'A',
				sets: [
					set('10:00:00', '10:00:30'),
					set('10:02:30', '10:03:00'),
				],
			},
			{ name: 'B', sets: [set('10:05:00', '10:05:40')] },
		]);
		expect(rests).toEqual([
			[null, { sec: 120, prevEnd: '10:00:30' }],
			[{ sec: 120, prevEnd: '10:03:00' }],
		]);
	});

	it('時刻が無い・順番が前後している（3 時間以上）なら null。日付をまたいでも数える', () => {
		const rests = restsBeforeSets([
			{
				name: 'A',
				sets: [
					set('23:58:00', '23:59:00'),
					set('00:01:00', '00:01:30'),
					set(null, null),
					set('00:05:00', '00:05:30'),
					set('00:04:00', '00:04:20'),
				],
			},
		]);
		expect(rests[0]).toEqual([
			null,
			{ sec: 120, prevEnd: '23:59:00' },
			null,
			null,
			null,
		]);
	});
});

describe('withRest', () => {
	it('開始を「前の終了 + 休憩」にし、終了も同じだけずらす', () => {
		expect(withRest(set('10:02:30', '10:03:00'), '10:00:30', 150)).toEqual(
			set('10:03:00', '10:03:30'),
		);
		expect(withRest(set('10:02:30', null), '10:00:30', 60)).toEqual(
			set('10:01:30', null),
		);
		expect(withRest(set('00:01:00', '00:01:30'), '23:59:00', 30)).toEqual(
			set('23:59:30', '00:00:00'),
		);
		expect(withRest(set('10:00:00', '10:01:00'), 'xx', 60)).toBeNull();
	});
});
