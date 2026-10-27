import { describe, expect, it } from 'vitest';
import type { ExerciseOccurrence } from '../../../src/lib/history/carry-over';
import { bestRecordSet, recentRecords } from '../../../src/lib/history/recent';
import type { SetLog } from '../../../src/lib/model/types';

const set = (
	weight: number | null,
	reps: number | null,
	note = '',
): SetLog => ({ weight, reps, start: null, end: null, note });

const occurrence = (
	date: string,
	sessionName: string | null,
	sets: SetLog[],
): ExerciseOccurrence => ({
	date,
	sessionName,
	exerciseName: 'マシンアダクター',
	sets,
});

describe('recentRecords', () => {
	// collectOccurrences の順（新しい順。同じ日はノートの後ろの欄が先）
	const occurrences = [
		occurrence('2026-10-28', 'LEGS A', [set(45, 10)]),
		occurrence('2026-10-21', 'LEGS A', [set(40, 10, '最後は補助あり')]),
		occurrence('2026-10-21', 'LEGS A', [set(40, 12), set(40, 12)]),
		occurrence('2026-10-16', null, [set(37.5, 12)]),
		occurrence('2026-10-14', 'LEGS A', [set(37.5, 12)]),
		occurrence('2026-10-07', 'LEGS A', [set(35, 12)]),
	];

	it('表示中の日より前の直近だけを新しい順に。同じ日・同じセッションの欄はやった順につなげる', () => {
		const records = recentRecords(occurrences, '2026-10-28', 3);
		expect(records.map((r) => [r.date, r.sessionName])).toEqual([
			['2026-10-21', 'LEGS A'],
			['2026-10-16', null],
			['2026-10-14', 'LEGS A'],
		]);
		expect(records[0]?.sets.map((s) => s.reps)).toEqual([12, 12, 10]);
		expect(records[0]?.sets[2]?.note).toBe('最後は補助あり');
	});

	it('記録が無ければ空', () => {
		expect(recentRecords(occurrences, '2026-10-01', 5)).toEqual([]);
	});
});

describe('bestRecordSet', () => {
	it('重量の重いセット（同じ重量なら回数の多い方）。表示中の日とそれより後は見ない', () => {
		const occurrences = [
			occurrence('2026-10-28', 'A', [set(60, 5)]),
			occurrence('2026-10-21', 'A', [set(42.5, 6)]),
			occurrence('2026-09-30', 'A', [set(42.5, 8), set(40, 12)]),
		];
		expect(bestRecordSet(occurrences, '2026-10-28', 'weight-reps')).toEqual(
			{ set: set(42.5, 8), date: '2026-09-30' },
		);
	});

	it('回数だけの種目は回数（同じなら加重の重い方）。値の無いセットは比べない', () => {
		const occurrences = [
			occurrence('2026-10-21', 'A', [set(null, 12), set(5, 12)]),
			occurrence('2026-10-14', 'A', [set(null, null)]),
		];
		expect(bestRecordSet(occurrences, '2026-10-28', 'reps')).toEqual({
			set: set(5, 12),
			date: '2026-10-21',
		});
		expect(
			bestRecordSet(
				[occurrence('2026-10-14', 'A', [set(null, null)])],
				'2026-10-28',
				'reps',
			),
		).toBeNull();
	});
});
