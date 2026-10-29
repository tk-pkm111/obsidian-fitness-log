import { describe, expect, it } from 'vitest';
import type {
	ActiveSet,
	DayLog,
	SessionLog,
} from '../../../src/lib/model/types';
import { overnightWorkout } from '../../../src/lib/today/overnight';

const set = (start: string, end: string) => ({
	weight: 10,
	reps: 8,
	start,
	end,
	note: '',
});

function session(
	name: string | null,
	times: { start?: string; end?: string },
	sets: Array<[string, string]>,
): SessionLog {
	return {
		name,
		notes: [],
		...times,
		exercises: [
			{ name: 'ベンチプレス', sets: sets.map(([a, b]) => set(a, b)) },
		],
	};
}

function days(map: Record<string, SessionLog[]>) {
	return (date: string): DayLog | undefined =>
		map[date] ? { date, sessions: map[date] } : undefined;
}

const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m, 0);

describe('overnightWorkout', () => {
	it('前の日の筋トレが 0 時を過ぎても続いていれば、その日', () => {
		const day = days({
			'2026-10-28': [
				session('PUSH', { start: '23:45:00' }, [
					['23:50:00', '23:51:00'],
					['00:05:00', '00:06:00'],
				]),
			],
		});
		expect(
			overnightWorkout({ now: at(29, 0, 20), activeSet: null, day }),
		).toEqual({ date: '2026-10-28', running: true });
	});

	it('進行中のセットだけでも続いている（23:55 に始めたトレッドミル）', () => {
		const activeSet: ActiveSet = {
			date: '2026-10-28',
			packageId: null,
			exerciseId: 'ex',
			setIndex: 1,
			startedAt: at(28, 23, 55).toISOString(),
		};
		expect(
			overnightWorkout({ now: at(29, 0, 40), activeSet, day: days({}) }),
		).toEqual({ date: '2026-10-28', running: true });
	});

	it('最後の記録から 3 時間を過ぎたら続いていない（終え忘れ）', () => {
		const day = days({
			'2026-10-28': [
				session('PUSH', { start: '20:00:00' }, [
					['20:10:00', '20:11:00'],
				]),
			],
		});
		expect(
			overnightWorkout({ now: at(29, 0, 10), activeSet: null, day }),
		).toBeNull();
	});

	it('0 時を過ぎてから終えたものは続いている（再開できる）。0 時前に終えたものは続いていない', () => {
		const after = days({
			'2026-10-28': [
				session('PUSH', { start: '23:30:00', end: '00:20:00' }, [
					['23:40:00', '00:19:00'],
				]),
			],
		});
		expect(
			overnightWorkout({
				now: at(29, 1, 0),
				activeSet: null,
				day: after,
			}),
		).toEqual({ date: '2026-10-28', running: false });
		const before = days({
			'2026-10-28': [
				session('PUSH', { start: '22:30:00', end: '23:30:00' }, [
					['22:40:00', '23:29:00'],
				]),
			],
		});
		expect(
			overnightWorkout({
				now: at(29, 0, 10),
				activeSet: null,
				day: before,
			}),
		).toBeNull();
	});

	it('今日の筋トレを始めたら、前の日の筋トレは続いていない', () => {
		const day = days({
			'2026-10-28': [session('PUSH', { start: '23:45:00' }, [])],
			'2026-10-29': [session('PULL', { start: '00:30:00' }, [])],
		});
		expect(
			overnightWorkout({ now: at(29, 0, 40), activeSet: null, day }),
		).toBeNull();
	});

	it('同じ日の朝の筋トレがあっても、夜の筋トレの最後の記録で決める', () => {
		const day = days({
			'2026-10-28': [
				session('LEGS', { start: '08:00:00', end: '09:00:00' }, [
					['08:10:00', '08:59:00'],
				]),
				session('PUSH', { start: '23:45:00' }, [
					['00:10:00', '00:20:00'],
				]),
			],
		});
		expect(
			overnightWorkout({ now: at(29, 0, 30), activeSet: null, day }),
		).toEqual({ date: '2026-10-28', running: true });
	});

	it('朝の筋トレを終え忘れても、翌朝の同じ時刻には続いていない', () => {
		const day = days({
			'2026-10-28': [
				session('LEGS', { start: '05:00:00' }, [
					['05:10:00', '06:20:00'],
				]),
			],
		});
		expect(
			overnightWorkout({ now: at(29, 5, 30), activeSet: null, day }),
		).toBeNull();
	});
});
