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
import {
	cardLayout,
	cardRole,
	type FocusChoice,
} from '../../../src/lib/today/focus';

const NOW = '2026-10-02T00:00:00.000Z';
const ex = (id: string): Exercise => ({
	id,
	name: id.toUpperCase(),
	category: 'legs',
	recordType: 'weight-reps',
	aliases: [],
	createdAt: NOW,
});
const pkg: Package = {
	id: 'pk',
	name: 'LEGS',
	aliases: [],
	createdAt: NOW,
	items: [
		{ exerciseId: 'a', targetSets: 2, targetReps: '8' },
		{ exerciseId: 'b', targetSets: 2, targetReps: '8' },
		{ exerciseId: 'c', targetSets: 2, targetReps: '8' },
	],
};
const set = (end: string): SetLog => ({
	weight: 10,
	reps: 8,
	start: end,
	end,
	note: '',
});
const layoutOf = (
	done: Array<{ name: string; sets: SetLog[] }>,
	options: { active?: ActiveSet; focus?: FocusChoice } = {},
) => {
	const day: DayLog = {
		date: '2026-10-02',
		sessions: [
			{ name: 'LEGS', note: '', start: '10:00:00', exercises: done },
		],
	};
	const [section] = buildDayModel({
		date: '2026-10-02',
		day,
		packages: [pkg],
		exercises: ['a', 'b', 'c'].map(ex),
		routines: [],
		activeSet: options.active ?? null,
	});
	const layout = cardLayout(
		section!,
		latestFinishedSet(day),
		options.focus ?? null,
	);
	return {
		layout,
		roles: section!.cards.map((c) => `${c.name}:${cardRole(c, layout)}`),
	};
};

describe('cardLayout（いまの種目・おすすめの ▶）', () => {
	it('何もしていなければ、いまの種目は無く、最初の種目におすすめの ▶', () => {
		expect(layoutOf([])).toEqual({
			layout: { currentKey: null, suggestedKey: 'ex:a' },
			roles: ['A:upcoming', 'B:upcoming', 'C:upcoming'],
		});
	});

	it('最後にセットを終えた種目がいま。目標に届くまではおすすめの ▶ を付けない', () => {
		expect(layoutOf([{ name: 'A', sets: [set('10:05:00')] }])).toEqual({
			layout: { currentKey: 'ex:a', suggestedKey: null },
			roles: ['A:current', 'B:upcoming', 'C:upcoming'],
		});
		expect(
			layoutOf([{ name: 'A', sets: [set('10:05:00'), set('10:08:00')] }])
				.layout,
		).toEqual({ currentKey: 'ex:a', suggestedKey: 'ex:b' });
	});

	it('セット中はその種目がいま（おすすめの ▶ は無し）。開いた種目は終わった種目のときだけ効く', () => {
		const done = [
			{ name: 'A', sets: [set('10:05:00'), set('10:08:00')] },
			{ name: 'B', sets: [set('10:12:00')] },
		];
		expect(
			layoutOf(done, {
				active: {
					date: '2026-10-02',
					packageId: 'pk',
					exerciseId: 'c',
					setIndex: 1,
					startedAt: NOW,
				},
			}),
		).toEqual({
			layout: { currentKey: 'ex:c', suggestedKey: null },
			roles: ['A:done', 'B:done', 'C:current'],
		});
		expect(
			layoutOf(done, { focus: { kind: 'open', key: 'ex:a' } }).roles,
		).toEqual(['A:current', 'B:done', 'C:upcoming']);
		expect(
			layoutOf(done, { focus: { kind: 'open', key: 'ex:c' } }).layout
				.currentKey,
		).toBe('ex:b');
	});

	it('たたむと、セット中でなければどの種目も開かない（おすすめの ▶ も付けない）', () => {
		const done = [
			{ name: 'A', sets: [set('10:05:00'), set('10:08:00')] },
			{ name: 'B', sets: [set('10:12:00')] },
		];
		expect(layoutOf(done, { focus: { kind: 'collapsed' } })).toEqual({
			layout: { currentKey: null, suggestedKey: null },
			roles: ['A:done', 'B:done', 'C:upcoming'],
		});
		// セット中はその種目が開く
		expect(
			layoutOf(done, {
				focus: { kind: 'collapsed' },
				active: {
					date: '2026-10-02',
					packageId: 'pk',
					exerciseId: 'b',
					setIndex: 2,
					startedAt: NOW,
				},
			}).roles,
		).toEqual(['A:done', 'B:current', 'C:upcoming']);
	});
});
