import { describe, expect, it } from 'vitest';
import type {
	ActiveSet,
	DayLog,
	Exercise,
	Package,
	SetLog,
} from '../../../src/lib/model/types';
import {
	buildDayModel,
	latestFinishedSet,
} from '../../../src/lib/today/day-model';
import { nowState } from '../../../src/lib/today/now';
import { sectionProgress } from '../../../src/lib/today/progress';

const NOW = '2026-10-02T00:00:00.000Z';
const ex = (id: string): Exercise => ({
	id,
	name: id.toUpperCase(),
	category: 'push',
	recordType: 'weight-reps',
	aliases: [],
	createdAt: NOW,
});
const exercises = ['a', 'b', 'c'].map(ex);
const pkg: Package = {
	id: 'pk',
	name: 'PUSH',
	aliases: [],
	createdAt: NOW,
	items: [
		{ exerciseId: 'a', targetSets: 2, targetReps: '8', restSec: 150 },
		{ exerciseId: 'b', targetSets: 1, targetReps: '8' },
		{ exerciseId: 'c', targetSets: 1, targetReps: '8' },
	],
};
const set = (end: string): SetLog => ({
	weight: 10,
	reps: 8,
	start: end,
	end,
	note: '',
});
const day = (
	exercisesDone: Array<{ name: string; sets: SetLog[] }>,
	end?: string,
	other?: Array<{ name: string; sets: SetLog[] }>,
): DayLog => ({
	date: '2026-10-02',
	sessions: [
		{
			name: 'PUSH',
			note: '',
			start: '10:00:00',
			...(end ? { end } : {}),
			exercises: exercisesDone,
		},
		...(other ? [{ name: null, note: '', exercises: other }] : []),
	],
});
const now = (
	d: DayLog | undefined,
	active: ActiveSet | null = null,
	isToday = true,
) => {
	const sections = buildDayModel({
		date: '2026-10-02',
		day: d,
		packages: [pkg],
		exercises,
		routines: [],
		activeSet: active,
	});
	return nowState(sections, latestFinishedSet(d), isToday);
};
const summary = (state: ReturnType<typeof now>) =>
	state && {
		kind: state.kind,
		card: 'card' in state ? state.card.name : null,
		next:
			'next' in state && state.next
				? [
						state.next.card.name,
						state.next.setNumber,
						state.next.sameExercise,
					]
				: null,
		restSec: state.kind === 'resting' ? state.restSec : undefined,
	};

describe('nowState', () => {
	it('筋トレを開始しただけなら最初の種目、実行中ならそのカード', () => {
		expect(summary(now(day([])))).toEqual({
			kind: 'ready',
			card: null,
			next: ['A', 1, false],
			restSec: undefined,
		});
		const running = now(day([]), {
			date: '2026-10-02',
			packageId: 'pk',
			exerciseId: 'b',
			setIndex: 1,
			startedAt: NOW,
		});
		expect(summary(running)).toMatchObject({ kind: 'running', card: 'B' });
	});

	it('休憩中: 目標セット数に届くまでは同じ種目、届いたら次の種目、全部終わったら null', () => {
		expect(
			summary(now(day([{ name: 'A', sets: [set('10:05:00')] }]))),
		).toEqual({
			kind: 'resting',
			card: 'A',
			next: ['A', 2, true],
			restSec: 150,
		});
		expect(
			summary(
				now(
					day([
						{ name: 'A', sets: [set('10:05:00'), set('10:08:00')] },
					]),
				),
			),
		).toMatchObject({
			kind: 'resting',
			next: ['B', 1, false],
			restSec: 150,
		});
		expect(
			summary(
				now(
					day([
						{ name: 'A', sets: [set('10:05:00'), set('10:08:00')] },
						{ name: 'B', sets: [set('10:12:00')] },
						{ name: 'C', sets: [set('10:15:00')] },
					]),
				),
			),
		).toMatchObject({
			kind: 'resting',
			card: 'C',
			next: null,
			restSec: null,
		});
	});

	it('終えた筋トレ・過去の日は何も出さない（休憩が動き続けない）。その他は休憩を出す', () => {
		expect(
			now(day([{ name: 'A', sets: [set('10:05:00')] }], '10:30:00')),
		).toBeNull();
		expect(
			now(day([{ name: 'A', sets: [set('10:05:00')] }]), null, false),
		).toBeNull();
		expect(
			summary(
				now(
					day([{ name: 'A', sets: [set('10:05:00')] }], '10:30:00', [
						{ name: 'C', sets: [set('11:00:00')] },
					]),
				),
			),
		).toMatchObject({ kind: 'resting', card: 'C', next: ['C', 2, true] });
	});
});

describe('sectionProgress', () => {
	it('やった種目の数（同じ種目の 2 枚目は 1 種目）・全種目・セット数', () => {
		const [section] = buildDayModel({
			date: '2026-10-02',
			day: day([
				{ name: 'A', sets: [set('10:05:00')] },
				{ name: 'B', sets: [set('10:08:00')] },
				{ name: 'A', sets: [set('10:12:00')] },
			]),
			packages: [pkg],
			exercises,
			routines: [],
			activeSet: null,
		});
		expect(sectionProgress(section!)).toEqual({
			doneExercises: 2,
			totalExercises: 3,
			sets: 3,
		});
	});
});
