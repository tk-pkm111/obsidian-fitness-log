import { describe, expect, it } from 'vitest';
import {
	formatSetResult,
	formatSetsCompact,
	formatPreviousRecord,
	formatSetsRepsTarget,
	formatTarget,
	promptDetailsTitle,
} from '../../src/lib/format';
import type { PackageItem, SetLog } from '../../src/lib/model/types';

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

	it('自分で作った記録のしかたは、項目を「×」でつなぐ（距離・時間）', () => {
		const run: SetLog = {
			...s(null, null, '19:20:00', '19:45:00'),
			distance: 5.25,
		};
		expect(formatSetResult(run, 'kg', 'distance-duration')).toBe(
			'5.25 km × 25:00',
		);
		expect(
			formatSetResult(
				s(20, null, '19:20:00', '19:21:30'),
				'kg',
				'weight-duration',
			),
		).toBe('20 kg × 1:30');
		expect(formatSetResult(s(null, null), 'kg', 'distance')).toBe('- km');
		expect(
			formatSetsCompact(
				[run, { ...run, distance: 3 }],
				'kg',
				'distance-duration',
			),
		).toBe('5.25 km × 25:00, 3 km × 25:00');
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

	describe('重さを聞く画面の目標と前回の記録', () => {
		const item = (extra: Partial<PackageItem> = {}): PackageItem => ({
			exerciseId: 'x',
			targetSets: 3,
			targetReps: '8-10',
			...extra,
		});

		it('目標はセット数と回数だけ（休憩は出さない）', () => {
			expect(formatSetsRepsTarget(item({ restSec: 150 }))).toBe(
				'3 セット × 8-10 回',
			);
		});

		it('回数の目標が空なら目標を出さない（セット数だけにしない）', () => {
			expect(formatSetsRepsTarget(item({ targetReps: '' }))).toBeNull();
			expect(formatSetsRepsTarget(item({ targetReps: '  ' }))).toBeNull();
		});

		it('パッケージの目標が無い種目（単発など）は目標を出さない', () => {
			expect(formatSetsRepsTarget(null)).toBeNull();
		});

		it('前回の記録。別のパッケージならパッケージ名を添える', () => {
			expect(formatPreviousRecord('40 kg × 9, 8', '10/29')).toBe(
				'40 kg × 9, 8（10/29）',
			);
			expect(
				formatPreviousRecord('40 kg × 9, 8', '10/29', 'ダミー B'),
			).toBe('40 kg × 9, 8（ダミー B ・ 10/29）');
		});

		it('トグルの名前は中身の言葉だけ。どちらも無ければ出さない', () => {
			expect(promptDetailsTitle(true, true)).toBe('目標と前回の記録');
			expect(promptDetailsTitle(true, false)).toBe('目標');
			expect(promptDetailsTitle(false, true)).toBe('前回の記録');
			expect(promptDetailsTitle(false, false)).toBeNull();
		});
	});
});
