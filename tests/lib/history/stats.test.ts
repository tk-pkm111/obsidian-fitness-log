import { describe, expect, it } from 'vitest';
import type { ExerciseOccurrence } from '../../../src/lib/history/carry-over';
import {
	estimateOneRepMax,
	exerciseTimeline,
	personalBests,
	sessionStat,
} from '../../../src/lib/history/stats';
import type { SetLog } from '../../../src/lib/model/types';

const s = (
	weight: number | null,
	reps: number | null,
	start: string | null = null,
	end: string | null = null,
): SetLog => ({
	weight,
	reps,
	start,
	end,
	note: '',
});

const occ = (date: string, sets: SetLog[]): ExerciseOccurrence => ({
	date,
	sessionName: 'A',
	exerciseName: 'X',
	sets,
});

describe('estimateOneRepMax', () => {
	it('Epley 式。1 回なら重量そのもの', () => {
		expect(estimateOneRepMax(100, 1)).toBe(100);
		expect(estimateOneRepMax(60, 10)).toBeCloseTo(80);
	});
});

describe('sessionStat', () => {
	it('最大重量・ボリューム・推定 1RM・回数・時間', () => {
		expect(
			sessionStat(
				occ('2026-10-01', [
					s(60, 10, '10:00:00', '10:00:40'),
					s(65, 6, '10:03:00', '10:03:30'),
					s(null, 5),
				]),
			),
		).toMatchObject({
			maxWeight: 65,
			volume: 990,
			estimatedOneRepMax: 80, // max(60×(1+10/30)=80, 65×1.2=78)
			totalReps: 21,
			maxReps: 10,
			durationSec: 70,
		});
	});

	it('自重（重量なし）は重量系を null にする', () => {
		expect(sessionStat(occ('2026-10-01', [s(null, 8)]))).toMatchObject({
			maxWeight: null,
			volume: 0,
			estimatedOneRepMax: null,
			maxReps: 8,
		});
	});
});

describe('exerciseTimeline / personalBests', () => {
	const occurrences = [
		occ('2026-10-01', [s(70, 5)]),
		occ('2026-09-28', [s(70, 6), s(60, 10)]),
		occ('2026-09-24', [s(60, 8)]),
	];

	it('タイムラインは古い順', () => {
		expect(exerciseTimeline(occurrences).map((t) => t.date)).toEqual([
			'2026-09-24',
			'2026-09-28',
			'2026-10-01',
		]);
	});

	it('自己ベストは最初に達成した日を採用し、最大重量には回数を添える', () => {
		const bests = personalBests(exerciseTimeline(occurrences));
		expect(bests.maxWeight).toEqual({
			value: 70,
			date: '2026-09-28',
			detail: '6',
		});
		expect(bests.maxVolume).toEqual({
			value: 1020,
			date: '2026-09-28',
			detail: undefined,
		});
		expect(bests.estimatedOneRepMax?.date).toBe('2026-09-28');
		expect(bests.maxReps?.value).toBe(10);
		expect(bests.maxDurationSec).toBeUndefined();
	});
});
