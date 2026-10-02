import { describe, expect, it } from 'vitest';
import type { ExerciseOccurrence } from '../../../src/lib/history/carry-over';
import { estimateOneRepMax, sessionStat } from '../../../src/lib/history/stats';
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
