import { describe, expect, it } from 'vitest';
import {
	formatSetResult,
	formatSetsCompact,
	formatTarget,
} from '../../src/lib/format';
import type { SetLog } from '../../src/lib/model/types';

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

describe('表示用の整形', () => {
	it('1 セットの結果（記録タイプ別・単位換算）', () => {
		expect(formatSetResult(s(10, 9), 'kg', 'weight-reps')).toBe(
			'10 kg × 9 回',
		);
		expect(formatSetResult(s(null, 8), 'kg', 'reps')).toBe('8 回');
		expect(formatSetResult(s(10, 8), 'kg', 'reps')).toBe('+10 kg × 8 回');
		expect(
			formatSetResult(
				s(null, null, '19:20:00', '19:40:00'),
				'kg',
				'duration',
			),
		).toBe('20:00');
		expect(formatSetResult(s(61.235, 5), 'lb', 'weight-reps')).toBe(
			'135 lb × 5 回',
		);
	});

	it('複数セットは同じ重量をまとめる', () => {
		expect(
			formatSetsCompact(
				[s(10, 9), s(10, 8), s(12.5, 6)],
				'kg',
				'weight-reps',
			),
		).toBe('10 kg × 9, 8 / 12.5 kg × 6');
		expect(formatSetsCompact([s(null, 8), s(null, 7)], 'kg', 'reps')).toBe(
			'8, 7 回',
		);
		expect(formatSetsCompact([s(10, null)], 'kg', 'weight-reps')).toBe(
			'10 kg × -',
		);
	});

	it('目標（回数の目標が無ければセット数だけ）', () => {
		expect(
			formatTarget({
				exerciseId: 'x',
				targetSets: 2,
				targetReps: '6-9',
				restSec: 150,
			}),
		).toBe('2 セット × 6-9 回 ・ 休憩 2:30');
		expect(
			formatTarget({ exerciseId: 'x', targetSets: 1, targetReps: '' }),
		).toBe('1 セット');
	});
});
