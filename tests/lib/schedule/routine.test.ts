import { describe, expect, it } from 'vitest';
import type { Routine, RoutineRule } from '../../../src/lib/model/types';
import {
	describeRule,
	isScheduledOn,
	routinesForDate,
	ruleMatches,
} from '../../../src/lib/schedule/routine';

const routine = (patch: Partial<Routine> = {}): Routine => ({
	id: 'rt_1',
	packageId: 'pk_push',
	rule: { type: 'weekly', weekdays: [1, 4], intervalWeeks: 1 },
	startDate: '2026-09-01',
	enabled: true,
	skipDates: [],
	...patch,
});

// 2026-10-01 は木曜、2026-10-05 は月曜
describe('ruleMatches', () => {
	it('毎週: 指定した曜日だけ', () => {
		const rule: RoutineRule = {
			type: 'weekly',
			weekdays: [1, 4],
			intervalWeeks: 1,
		};
		expect(ruleMatches(rule, '2026-09-01', '2026-10-01')).toBe(true); // 木
		expect(ruleMatches(rule, '2026-09-01', '2026-10-02')).toBe(false); // 金
		expect(ruleMatches(rule, '2026-09-01', '2026-10-05')).toBe(true); // 月
	});

	it('隔週: 開始日の週（月曜起点）から 2 週ごと', () => {
		const rule: RoutineRule = {
			type: 'weekly',
			weekdays: [4],
			intervalWeeks: 2,
		};
		// 開始日 2026-09-30（水）の週 = 9/28〜10/4 が 0 週目
		expect(ruleMatches(rule, '2026-09-30', '2026-10-01')).toBe(true);
		expect(ruleMatches(rule, '2026-09-30', '2026-10-08')).toBe(false);
		expect(ruleMatches(rule, '2026-09-30', '2026-10-15')).toBe(true);
		// 開始日の週でも開始日より前の日は当たらない
		expect(
			ruleMatches({ ...rule, weekdays: [1] }, '2026-09-30', '2026-09-28'),
		).toBe(false);
	});

	it('日曜は前の月曜の週として数える', () => {
		const rule: RoutineRule = {
			type: 'weekly',
			weekdays: [0],
			intervalWeeks: 2,
		};
		expect(ruleMatches(rule, '2026-09-28', '2026-10-04')).toBe(true); // 0 週目の日曜
		expect(ruleMatches(rule, '2026-09-28', '2026-10-11')).toBe(false);
	});

	it('N 日ごと: 開始日から数える', () => {
		const rule: RoutineRule = { type: 'everyNDays', intervalDays: 3 };
		expect(ruleMatches(rule, '2026-09-28', '2026-09-28')).toBe(true);
		expect(ruleMatches(rule, '2026-09-28', '2026-10-01')).toBe(true);
		expect(ruleMatches(rule, '2026-09-28', '2026-10-02')).toBe(false);
		expect(ruleMatches(rule, '2026-09-28', '2026-09-25')).toBe(false); // 開始前
	});

	it('月をまたいでも N 日ごとがずれない', () => {
		const rule: RoutineRule = { type: 'everyNDays', intervalDays: 2 };
		expect(ruleMatches(rule, '2026-02-27', '2026-03-01')).toBe(true);
	});
});

describe('isScheduledOn', () => {
	it('無効・期間外・スキップは予定に入らない', () => {
		expect(isScheduledOn(routine(), '2026-10-01')).toBe(true);
		expect(isScheduledOn(routine({ enabled: false }), '2026-10-01')).toBe(
			false,
		);
		expect(
			isScheduledOn(routine({ startDate: '2026-10-02' }), '2026-10-01'),
		).toBe(false);
		expect(
			isScheduledOn(routine({ endDate: '2026-09-30' }), '2026-10-01'),
		).toBe(false);
		expect(
			isScheduledOn(routine({ endDate: '2026-10-01' }), '2026-10-01'),
		).toBe(true);
		expect(
			isScheduledOn(routine({ skipDates: ['2026-10-01'] }), '2026-10-01'),
		).toBe(false);
	});
});

describe('routinesForDate', () => {
	it('同じパッケージが複数のルーチンで当たっても 1 回だけ', () => {
		const routines = [
			routine({ id: 'rt_a' }),
			routine({
				id: 'rt_b',
				rule: { type: 'everyNDays', intervalDays: 1 },
			}),
			routine({
				id: 'rt_c',
				packageId: 'pk_legs',
				rule: { type: 'everyNDays', intervalDays: 1 },
			}),
		];
		expect(
			routinesForDate(routines, '2026-10-01').map((r) => r.id),
		).toEqual(['rt_a', 'rt_c']);
		expect(
			routinesForDate(routines, '2026-10-02').map((r) => r.id),
		).toEqual(['rt_b', 'rt_c']);
	});
});

describe('describeRule', () => {
	it('ルールを短い日本語にする', () => {
		expect(
			describeRule({
				type: 'weekly',
				weekdays: [4, 1],
				intervalWeeks: 1,
			}),
		).toBe('毎週 月・木');
		expect(
			describeRule({
				type: 'weekly',
				weekdays: [0, 6],
				intervalWeeks: 2,
			}),
		).toBe('2 週ごと 土・日');
		expect(
			describeRule({ type: 'weekly', weekdays: [], intervalWeeks: 1 }),
		).toBe('毎週 曜日未指定');
		expect(describeRule({ type: 'everyNDays', intervalDays: 1 })).toBe(
			'毎日',
		);
		expect(describeRule({ type: 'everyNDays', intervalDays: 3 })).toBe(
			'3 日ごと',
		);
	});
});
