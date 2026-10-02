import { describe, expect, it } from 'vitest';
import type { DayLog, Package, Routine } from '../../../src/lib/model/types';
import {
	addMonths,
	calendarEntries,
	monthWeeks,
	packageColorIndex,
} from '../../../src/lib/schedule/calendar';

const pkg = (id: string, name: string, createdAt: string): Package => ({
	id,
	name,
	items: [],
	aliases: [],
	createdAt,
});
const packages = [
	pkg('pk_b', 'PULL A', '2026-10-02T00:00:00Z'),
	pkg('pk_a', 'PUSH A', '2026-10-01T00:00:00Z'),
	pkg('pk_l', 'LEGS A', '2026-10-01T00:00:00Z'),
];
const routine = (
	id: string,
	packageId: string,
	weekdays: number[],
	skipDates: string[] = [],
): Routine => ({
	id,
	packageId,
	rule: { type: 'weekly', weekdays, intervalWeeks: 1 },
	startDate: '2026-09-01',
	enabled: true,
	skipDates,
});

describe('月のカレンダー', () => {
	it('月をずらす（年をまたぐ）', () => {
		expect(addMonths('2026-10', 1)).toBe('2026-11');
		expect(addMonths('2026-12', 1)).toBe('2027-01');
		expect(addMonths('2026-01', -1)).toBe('2025-12');
	});

	it('月曜始まりの週。前後の月の日を含め、月の最後の日を含む週まで', () => {
		const weeks = monthWeeks('2026-10');
		expect(weeks).toHaveLength(5);
		expect(weeks[0]?.[0]).toBe('2026-09-28');
		expect(weeks[4]?.[6]).toBe('2026-11-01');
		// 2026-02 は日曜で終わる（2/28 は土曜 → 3/1 の日曜まで）
		expect(monthWeeks('2026-02').at(-1)?.at(-1)).toBe('2026-03-01');
	});
});

describe('calendarEntries', () => {
	const routines = [
		routine('rt_1', 'pk_a', [1, 4]),
		routine('rt_2', 'pk_l', [1], ['2026-10-05']),
	];

	it('予定（ルーチン）とスキップ', () => {
		expect(
			calendarEntries('2026-10-05', routines, packages, undefined).map(
				(e) => [e.name, e.kind],
			),
		).toEqual([
			['PUSH A', 'planned'],
			['LEGS A', 'skipped'],
		]);
		expect(
			calendarEntries('2026-10-06', routines, packages, undefined),
		).toEqual([]);
	});

	it('記録があれば「やった」を先に。予定のパッケージをやったら予定は出さない。その他は名前なし', () => {
		const day: DayLog = {
			date: '2026-10-05',
			sessions: [
				{ name: 'PUSH A', note: '', start: '10:00:00', exercises: [] },
				{
					name: null,
					note: '',
					exercises: [
						{
							name: 'ランニング',
							sets: [
								{
									weight: null,
									reps: null,
									start: '11:00:00',
									end: '11:20:00',
									note: '',
								},
							],
						},
					],
				},
				{ name: 'PULL A', note: '', exercises: [] },
			],
		};
		expect(
			calendarEntries('2026-10-05', routines, packages, day).map((e) => [
				e.name,
				e.kind,
			]),
		).toEqual([
			['PUSH A', 'done'],
			[null, 'done'],
			['PULL A', 'planned'],
			['LEGS A', 'skipped'],
		]);
	});
});

describe('packageColorIndex', () => {
	it('作った順（同じ時刻なら id 順）で決まり、並べ替えても変わらない', () => {
		expect(packageColorIndex(packages, 'pk_a', 8)).toBe(0);
		expect(packageColorIndex(packages, 'pk_l', 8)).toBe(1);
		expect(packageColorIndex(packages, 'pk_b', 8)).toBe(2);
		expect(packageColorIndex([...packages].reverse(), 'pk_b', 8)).toBe(2);
		expect(packageColorIndex(packages, 'pk_b', 2)).toBe(0);
		expect(packageColorIndex(packages, 'none', 8)).toBeNull();
	});
});
