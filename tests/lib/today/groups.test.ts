import { describe, expect, it } from 'vitest';
import { createEmptyData } from '../../../src/lib/model/data';
import type { Exercise, Package, SetLog } from '../../../src/lib/model/types';
import {
	buildDayModel,
	type CardModel,
} from '../../../src/lib/today/day-model';
import {
	dayOrdersFor,
	groupCards,
	reorderWithinGroup,
	dayRemovedFor,
	moveDaySection,
	setDayOrder,
	setDayRemoved,
} from '../../../src/lib/today/groups';

const NOW = '2026-10-01T00:00:00.000Z';
const ex = (id: string): Exercise => ({
	id,
	name: id.toUpperCase(),
	category: 'pull',
	recordType: 'weight-reps',
	aliases: [],
	createdAt: NOW,
});
const exercises = ['a', 'b', 'c', 'd', 'x'].map(ex);
const pkg: Package = {
	id: 'pk',
	name: 'PULL',
	aliases: [],
	createdAt: NOW,
	items: ['a', 'b', 'c', 'd'].map((exerciseId) => ({
		exerciseId,
		targetSets: 2,
		targetReps: '8',
	})),
	sections: [
		{ id: 'sc_back', name: '背中', at: 0 },
		{ id: 'sc_arm', name: '腕', at: 2 },
	],
};
const set: SetLog = {
	weight: 10,
	reps: 8,
	start: '10:00:00',
	end: '10:01:00',
	note: '',
};

const cardsOf = (
	performed: Array<{ name: string; sets: SetLog[] }>,
	orders?: Record<string, string[]>,
): CardModel[] =>
	buildDayModel({
		date: '2026-10-01',
		day: {
			date: '2026-10-01',
			sessions: [
				{
					name: 'PULL',
					note: '',
					start: '09:59:00',
					exercises: performed,
				},
			],
		},
		packages: [pkg],
		exercises,
		routines: [],
		activeSet: null,
		...(orders ? { orders } : {}),
	})[0]?.cards ?? [];

const names = (cards: readonly CardModel[]) => cards.map((c) => c.name);

describe('groupCards', () => {
	it('区切りごとに分け、パッケージに無い種目は「追加した種目」へ。使わない設定なら 1 つ', () => {
		const cards = cardsOf([
			{ name: 'C', sets: [set] },
			{ name: 'X', sets: [set] },
		]);
		const groups = groupCards(cards, pkg, true);
		expect(
			groups.map((g) => [
				g.kind,
				g.section?.name ?? null,
				names(g.cards),
			]),
		).toEqual([
			['section', '背中', ['A', 'B']],
			['section', '腕', ['C', 'D']],
			['extra', null, ['X']],
		]);
		expect(groupCards(cards, pkg, false)).toHaveLength(1);
		expect(groupCards(cards, null, true)).toHaveLength(1);
	});
});

describe('その日だけの並び', () => {
	it('まだの種目をまとまりの中で動かし、他のまとまりはそのまま。やった種目は動かない', () => {
		const cards = cardsOf([{ name: 'A', sets: [set] }]);
		const [back, arm] = groupCards(cards, pkg, true);
		expect(names(back?.cards ?? [])).toEqual(['A', 'B']);
		expect(reorderWithinGroup(cards, arm?.cards ?? [], 1, 0)).toEqual([
			'ex:b',
			'ex:d',
			'ex:c',
		]);
		const reordered = cardsOf([{ name: 'A', sets: [set] }], {
			'pkg:pk': ['ex:b', 'ex:d', 'ex:c'],
		});
		expect(names(reordered)).toEqual(['A', 'B', 'D', 'C']);
	});

	it('保存は日付ごと。2 週間より前の日の並びは消す', () => {
		const data = createEmptyData();
		data.dayOrders = {
			'2026-09-01 pkg:pk': ['ex:a'],
			'2026-09-25 pkg:pk': ['ex:b'],
		};
		setDayOrder(
			data,
			'2026-10-01',
			'pkg:pk',
			['ex:c', 'ex:d'],
			'2026-10-01',
		);
		expect(data.dayOrders).toEqual({
			'2026-09-25 pkg:pk': ['ex:b'],
			'2026-10-01 pkg:pk': ['ex:c', 'ex:d'],
		});
		expect(dayOrdersFor(data, '2026-10-01')).toEqual({
			'pkg:pk': ['ex:c', 'ex:d'],
		});
	});
});

describe('パッケージを変える・外す（その日の並び・外した種目を移す）', () => {
	it('変えたら新しいセクションへ移し、外したら消す。ほかの日・ほかのセクションはそのまま', () => {
		const data = createEmptyData();
		data.dayOrders = {
			'2026-10-01 pkg:a': ['ex:b', 'ex:a'],
			'2026-10-01 other': ['ex:c'],
			'2026-09-30 pkg:a': ['ex:a'],
		};
		data.dayRemoved = { '2026-10-01 pkg:a': ['ex:d'] };
		moveDaySection(data, '2026-10-01', 'pkg:a', 'pkg:b', '2026-10-01');
		expect(data.dayOrders).toEqual({
			'2026-10-01 pkg:b': ['ex:b', 'ex:a'],
			'2026-10-01 other': ['ex:c'],
			'2026-09-30 pkg:a': ['ex:a'],
		});
		expect(data.dayRemoved).toEqual({ '2026-10-01 pkg:b': ['ex:d'] });
		moveDaySection(data, '2026-10-01', 'pkg:b', null, '2026-10-01');
		expect(data.dayOrders).toEqual({
			'2026-10-01 other': ['ex:c'],
			'2026-09-30 pkg:a': ['ex:a'],
		});
		expect(data.dayRemoved).toBeUndefined();
	});
});

describe('この日から外した種目', () => {
	it('外す・戻すを日付とセクションごとに覚え、空になれば消す。古い日のものは消す', () => {
		const data = createEmptyData();
		data.dayRemoved = { '2026-09-01 pkg:pk': ['ex:a'] };
		setDayRemoved(data, '2026-10-01', 'pkg:pk', 'ex:b', true, '2026-10-01');
		setDayRemoved(data, '2026-10-01', 'pkg:pk', 'ex:b', true, '2026-10-01');
		setDayRemoved(data, '2026-10-01', 'pkg:pk', 'ex:c', true, '2026-10-01');
		expect(data.dayRemoved).toEqual({
			'2026-10-01 pkg:pk': ['ex:b', 'ex:c'],
		});
		expect(dayRemovedFor(data, '2026-10-01')).toEqual({
			'pkg:pk': ['ex:b', 'ex:c'],
		});
		setDayRemoved(
			data,
			'2026-10-01',
			'pkg:pk',
			'ex:b',
			false,
			'2026-10-01',
		);
		setDayRemoved(
			data,
			'2026-10-01',
			'pkg:pk',
			'ex:c',
			false,
			'2026-10-01',
		);
		expect(data.dayRemoved).toBeUndefined();
		expect(dayRemovedFor(data, '2026-10-01')).toEqual({});
	});

	it('外した種目はまだの種目から消え、やった種目は残る', () => {
		const cards = buildDayModel({
			date: '2026-10-01',
			day: {
				date: '2026-10-01',
				sessions: [
					{
						name: 'PULL',
						note: '',
						start: '09:59:00',
						exercises: [{ name: 'A', sets: [set] }],
					},
				],
			},
			packages: [pkg],
			exercises,
			routines: [],
			activeSet: null,
			removed: { 'pkg:pk': ['ex:a', 'ex:c'] },
		})[0]?.cards;
		expect(names(cards ?? [])).toEqual(['A', 'B', 'D']);
	});
});
