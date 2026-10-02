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
import { sectionProgress } from '../../../src/lib/today/progress';
import { restState } from '../../../src/lib/today/rest';

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
	done: Array<{ name: string; sets: SetLog[] }>,
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
			exercises: done,
		},
		...(other ? [{ name: null, note: '', exercises: other }] : []),
	],
});
const sectionsOf = (d: DayLog, active: ActiveSet | null = null) =>
	buildDayModel({
		date: '2026-10-02',
		day: d,
		packages: [pkg],
		exercises,
		routines: [],
		activeSet: active,
	});
const rest = (d: DayLog, active: ActiveSet | null = null, isToday = true) => {
	const state = restState(
		sectionsOf(d, active),
		latestFinishedSet(d),
		isToday,
	);
	return (
		state && {
			card: state.card.name,
			lastEnd: state.lastEnd,
			restSec: state.restSec,
		}
	);
};

describe('restState（休憩を出す種目）', () => {
	it('筋トレ中は最後にセットを終えた種目（やり直しの 2 枚目なら 2 枚目）', () => {
		expect(
			rest(
				day([
					{ name: 'A', sets: [set('10:05:00')] },
					{ name: 'B', sets: [set('10:09:00')] },
				]),
			),
		).toEqual({ card: 'B', lastEnd: '10:09:00', restSec: null });
		expect(
			rest(
				day([
					{ name: 'A', sets: [set('10:05:00')] },
					{ name: 'B', sets: [set('10:09:00')] },
					{ name: 'A', sets: [set('10:14:00')] },
				]),
			),
		).toEqual({ card: 'A', lastEnd: '10:14:00', restSec: 150 });
	});

	it('終えた筋トレ・過去の日・セットの実行中は出さない。その他（パッケージ外）は出す', () => {
		const d = day([{ name: 'A', sets: [set('10:05:00')] }]);
		expect(
			rest(day([{ name: 'A', sets: [set('10:05:00')] }], '10:30:00')),
		).toBeNull();
		expect(rest(d, null, false)).toBeNull();
		expect(
			rest(d, {
				date: '2026-10-02',
				packageId: 'pk',
				exerciseId: 'b',
				setIndex: 1,
				startedAt: NOW,
			}),
		).toBeNull();
		expect(
			rest(
				day([{ name: 'A', sets: [set('10:05:00')] }], '10:30:00', [
					{ name: 'C', sets: [set('11:00:00')] },
				]),
			),
		).toEqual({ card: 'C', lastEnd: '11:00:00', restSec: null });
	});
});

describe('sectionProgress', () => {
	it('やった種目の数（同じ種目の 2 枚目は 1 種目）・全種目・セット数', () => {
		const [section] = sectionsOf(
			day([
				{ name: 'A', sets: [set('10:05:00')] },
				{ name: 'B', sets: [set('10:08:00')] },
				{ name: 'A', sets: [set('10:12:00')] },
			]),
		);
		expect(sectionProgress(section!)).toEqual({
			doneExercises: 2,
			totalExercises: 3,
			sets: 3,
		});
	});
});
