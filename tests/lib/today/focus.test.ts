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
	type FocusState,
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
	options: { active?: ActiveSet; focus?: FocusState } = {},
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

const focus = (
	opened: string[] = [],
	collapsed: string[] = [],
): FocusState => ({
	opened: new Set(opened),
	collapsed: new Set(collapsed),
});
const activeOn = (exerciseId: string, setIndex = 1): ActiveSet => ({
	date: '2026-10-02',
	packageId: 'pk',
	exerciseId,
	setIndex,
	startedAt: NOW,
});
const open = (layout: { openKeys: ReadonlySet<string> }) => [
	...layout.openKeys,
];

describe('cardLayout（いまの種目・開く種目・おすすめの ▶）', () => {
	it('何もしていなければ、いまの種目は無く、最初の種目におすすめの ▶', () => {
		const { layout, roles } = layoutOf([]);
		expect([layout.currentKey, open(layout), layout.suggestedKey]).toEqual([
			null,
			[],
			'ex:a',
		]);
		expect(roles).toEqual(['A:upcoming', 'B:upcoming', 'C:upcoming']);
	});

	it('最後にセットを終えた種目がいま（開く）。目標に届くまではおすすめの ▶ を付けない', () => {
		const one = layoutOf([{ name: 'A', sets: [set('10:05:00')] }]);
		expect([
			one.layout.currentKey,
			open(one.layout),
			one.layout.suggestedKey,
		]).toEqual(['ex:a', ['ex:a'], null]);
		expect(one.roles).toEqual(['A:current', 'B:upcoming', 'C:upcoming']);
		const two = layoutOf([
			{ name: 'A', sets: [set('10:05:00'), set('10:08:00')] },
		]);
		expect(two.layout.suggestedKey).toBe('ex:b');
	});

	it('終わった種目を開いても、いまの種目は閉じない（両方開く）', () => {
		const done = [
			{ name: 'A', sets: [set('10:05:00'), set('10:08:00')] },
			{ name: 'B', sets: [set('10:12:00')] },
		];
		const { layout, roles } = layoutOf(done, { focus: focus(['ex:a']) });
		expect(layout.currentKey).toBe('ex:b');
		expect(roles).toEqual(['A:current', 'B:current', 'C:upcoming']);
		// まだの種目は「開いた」にしても開かない（▶ で始める）
		expect(layoutOf(done, { focus: focus(['ex:c']) }).roles).toEqual([
			'A:done',
			'B:current',
			'C:upcoming',
		]);
	});

	it('たたんだ種目は閉じる（いまの種目でも）。いまの種目は変わらず、おすすめの ▶ も付く', () => {
		const done = [
			{ name: 'A', sets: [set('10:05:00')] },
			{ name: 'B', sets: [set('10:12:00'), set('10:15:00')] },
		];
		const { layout, roles } = layoutOf(done, {
			focus: focus(['ex:a'], ['ex:b']),
		});
		expect([layout.currentKey, layout.suggestedKey]).toEqual([
			'ex:b',
			'ex:c',
		]);
		expect(roles).toEqual(['A:current', 'B:done', 'C:upcoming']);
	});

	it('セット中はその種目がいまでいつも開く（たたんでいても）。おすすめの ▶ は無し', () => {
		const done = [
			{ name: 'A', sets: [set('10:05:00'), set('10:08:00')] },
			{ name: 'B', sets: [set('10:12:00')] },
		];
		const { layout, roles } = layoutOf(done, {
			active: activeOn('c'),
			focus: focus([], ['ex:c']),
		});
		expect([layout.currentKey, layout.suggestedKey]).toEqual([
			'ex:c',
			null,
		]);
		// 前の種目（B）は利用者が開いていないので 1 行に戻る
		expect(roles).toEqual(['A:done', 'B:done', 'C:current']);
		expect(
			layoutOf(done, { active: activeOn('b', 2), focus: focus(['ex:a']) })
				.roles,
		).toEqual(['A:current', 'B:current', 'C:upcoming']);
	});
});
