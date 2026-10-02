import { describe, expect, it } from 'vitest';
import {
	exercisesWithHistory,
	monthlyOverview,
} from '../../../src/lib/history/overview';
import type { DayLog, Exercise, SetLog } from '../../../src/lib/model/types';

const s = (weight: number, reps: number): SetLog => ({
	weight,
	reps,
	start: null,
	end: null,
	note: '',
});
const day = (
	date: string,
	name: string | null,
	exercise: string,
	sets: SetLog[],
): DayLog => ({
	date,
	sessions: [{ name, note: '', exercises: [{ name: exercise, sets }] }],
});
const ex = (id: string, name: string, aliases: string[] = []): Exercise => ({
	id,
	name,
	category: 'push',
	recordType: 'weight-reps',
	aliases,
	createdAt: '',
});

const days = [
	day('2026-09-28', 'A', 'ベンチ', [s(60, 5), s(60, 5)]),
	day('2026-10-01', 'B', 'BP', [s(62.5, 5)]),
	day('2026-10-02', 'A', 'スクワット', [s(80, 5)]),
	day('2026-10-03', 'A', 'ベンチ', []), // 予定だけ（セットなし）
];

describe('monthlyOverview', () => {
	it('新しい月・日から並べ、セットの無い日は数えない', () => {
		const months = monthlyOverview(days);
		expect(
			months.map((m) => [m.month, m.activeDays, m.sets, m.volumeKg]),
		).toEqual([
			['2026-10', 2, 2, 712.5],
			['2026-09', 1, 2, 600],
		]);
		expect(months[0]?.days.map((d) => d.date)).toEqual([
			'2026-10-02',
			'2026-10-01',
		]);
	});
});

describe('exercisesWithHistory', () => {
	it('別名でもまとめ、最後に行った日が新しい順', () => {
		const result = exercisesWithHistory(days, [
			ex('ex_b', 'ベンチ', ['BP']),
			ex('ex_s', 'スクワット'),
			ex('ex_x', '未実施'),
		]);
		expect(
			result.map((a) => [a.exercise.id, a.lastDate, a.sessions]),
		).toEqual([
			['ex_s', '2026-10-02', 1],
			['ex_b', '2026-10-01', 2],
		]);
	});
});
