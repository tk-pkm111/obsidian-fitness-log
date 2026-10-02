import { describe, expect, it } from 'vitest';
import {
	carryOver,
	collectOccurrences,
	lastPerformance,
} from '../../../src/lib/history/carry-over';
import type { DayLog, SetLog } from '../../../src/lib/model/types';

const s = (weight: number | null, reps: number | null): SetLog => ({
	weight,
	reps,
	start: null,
	end: null,
	note: '',
});

const days: DayLog[] = [
	{
		date: '2026-09-24',
		sessions: [
			{
				name: '上半身A',
				note: '',
				exercises: [
					{ name: 'ラットプルダウン', sets: [s(40, 10), s(40, 9)] },
				],
			},
		],
	},
	{
		date: '2026-09-28',
		sessions: [
			{
				name: '上半身B',
				note: '',
				exercises: [{ name: 'ラットプルダウン', sets: [s(50, 8)] }],
			},
			{
				name: '上半身A',
				note: '',
				exercises: [{ name: 'ベンチプレス', sets: [s(60, 5)] }],
			},
		],
	},
	{
		date: '2026-10-01',
		sessions: [
			{
				name: '上半身A',
				note: '',
				exercises: [{ name: 'ラットプルダウン', sets: [s(45, 10)] }],
			},
		],
	},
];

const occurrences = collectOccurrences(days, (n) => n === 'ラットプルダウン');
const isA = (name: string | null) => name === '上半身A';

describe('collectOccurrences', () => {
	it('種目の出現を新しい順に集める', () => {
		expect(occurrences.map((o) => `${o.date} ${o.sessionName}`)).toEqual([
			'2026-10-01 上半身A',
			'2026-09-28 上半身B',
			'2026-09-24 上半身A',
		]);
	});

	it('同じ日は後ろのセッションほど新しい', () => {
		const sameDay: DayLog[] = [
			{
				date: '2026-10-01',
				sessions: [
					{
						name: '朝',
						note: '',
						exercises: [{ name: 'X', sets: [s(1, 1)] }],
					},
					{
						name: '夜',
						note: '',
						exercises: [{ name: 'X', sets: [s(2, 2)] }],
					},
				],
			},
		];
		expect(
			collectOccurrences(sameDay, () => true).map((o) => o.sessionName),
		).toEqual(['夜', '朝']);
	});
});

describe('carryOver（4 段のフォールバック）', () => {
	it('1. 同じセッションのセット n−1 を引き継ぐ', () => {
		expect(
			carryOver({
				occurrences,
				date: '2026-10-02',
				isSamePackage: isA,
				setIndex: 2,
				currentSets: [s(47.5, 9)],
			}),
		).toEqual({ weight: 47.5, reps: 9, source: 'previous-set' });
	});

	it('2. 同じパッケージの直近（表示中の日付より前）のセット n', () => {
		// 10/1 を表示中: 10/1 の記録は「前回」に含めない → 9/24 の上半身A
		expect(
			carryOver({
				occurrences,
				date: '2026-10-01',
				isSamePackage: isA,
				setIndex: 2,
				currentSets: [],
			}),
		).toEqual({
			weight: 40,
			reps: 9,
			source: 'same-package',
			date: '2026-09-24',
		});
	});

	it('2. セット n が前回より多ければ前回の最後のセット', () => {
		expect(
			carryOver({
				occurrences,
				date: '2026-10-01',
				isSamePackage: isA,
				setIndex: 3,
				currentSets: [],
			}),
		).toMatchObject({ weight: 40, reps: 9, source: 'same-package' });
	});

	it('2. 上半身A と上半身B は別管理', () => {
		expect(
			carryOver({
				occurrences,
				date: '2026-10-02',
				isSamePackage: isA,
				setIndex: 1,
				currentSets: [],
			}),
		).toEqual({
			weight: 45,
			reps: 10,
			source: 'same-package',
			date: '2026-10-01',
		});
		expect(
			carryOver({
				occurrences,
				date: '2026-10-02',
				isSamePackage: (n) => n === '上半身B',
				setIndex: 1,
				currentSets: [],
			}),
		).toEqual({
			weight: 50,
			reps: 8,
			source: 'same-package',
			date: '2026-09-28',
		});
	});

	it('3. そのパッケージで未実施なら他のパッケージの直近', () => {
		expect(
			carryOver({
				occurrences,
				date: '2026-10-02',
				isSamePackage: (n) => n === '下半身',
				setIndex: 1,
				currentSets: [],
			}),
		).toEqual({
			weight: 45,
			reps: 10,
			source: 'other-package',
			date: '2026-10-01',
		});
	});

	it('4. 履歴が無ければ空', () => {
		expect(
			carryOver({
				occurrences: [],
				date: '2026-10-02',
				isSamePackage: isA,
				setIndex: 1,
				currentSets: [],
			}),
		).toEqual({ weight: null, reps: null, source: 'none' });
		expect(
			carryOver({
				occurrences,
				date: '2026-09-24',
				isSamePackage: isA,
				setIndex: 1,
				currentSets: [],
			}).source,
		).toBe('none');
	});
});

describe('lastPerformance', () => {
	it('カードのヒント用に、同じパッケージを優先した直近の記録を返す', () => {
		const last = lastPerformance(occurrences, '2026-10-01', isA);
		expect(last?.samePackage).toBe(true);
		expect(last?.occurrence.date).toBe('2026-09-24');
		expect(
			lastPerformance(occurrences, '2026-10-01', () => false)?.occurrence
				.date,
		).toBe('2026-09-28');
		expect(lastPerformance(occurrences, '2026-09-01', isA)).toBeNull();
	});
});
