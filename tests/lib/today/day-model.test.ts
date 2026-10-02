import { describe, expect, it } from 'vitest';
import type {
	ActiveSet,
	DayLog,
	Exercise,
	Package,
	Routine,
	SetLog,
} from '../../../src/lib/model/types';
import {
	buildDayModel,
	latestFinishedSet,
} from '../../../src/lib/today/day-model';

const NOW = '2026-10-01T00:00:00.000Z';
const ex = (id: string, name: string, aliases: string[] = []): Exercise => ({
	id,
	name,
	category: 'push',
	recordType: 'weight-reps',
	aliases,
	createdAt: NOW,
});
const exercises = [
	ex('ex_y', 'ケーブルYレイズ'),
	ex('ex_d', 'ディップス'),
	ex('ex_c', 'ダンベルカール', ['DBカール']),
];
const pushA: Package = {
	id: 'pk_a',
	name: 'PUSH A',
	aliases: ['旧PUSH'],
	createdAt: NOW,
	items: [
		{ exerciseId: 'ex_y', targetSets: 2, targetReps: '6-9', restSec: 150 },
		{ exerciseId: 'ex_d', targetSets: 2, targetReps: '4-8' },
		{ exerciseId: 'ex_gone', targetSets: 1, targetReps: '8' },
	],
};
const legs: Package = {
	id: 'pk_l',
	name: 'LEGS A',
	aliases: [],
	createdAt: NOW,
	items: [{ exerciseId: 'ex_c', targetSets: 1, targetReps: '8' }],
};
const set = (reps: number, end = '10:00:00'): SetLog => ({
	weight: 10,
	reps,
	start: '09:59:00',
	end,
	note: '',
});
const routine = (packageId: string): Routine => ({
	id: `rt_${packageId}`,
	packageId,
	rule: { type: 'everyNDays', intervalDays: 1 },
	startDate: '2026-09-01',
	enabled: true,
	skipDates: [],
});

const build = (
	day: DayLog | undefined,
	extra: { routines?: Routine[]; activeSet?: ActiveSet | null } = {},
) =>
	buildDayModel({
		date: '2026-10-01',
		day,
		packages: [pushA, legs],
		exercises,
		routines: extra.routines ?? [],
		activeSet: extra.activeSet ?? null,
	});

describe('buildDayModel', () => {
	it('何も無い日は空', () => {
		expect(build(undefined)).toEqual([]);
	});

	it('ノートのセッションをパッケージに結び付け、やった種目（やった順）→ まだの種目の順に並べる（別名でも）', () => {
		const sections = build({
			date: '2026-10-01',
			sessions: [
				{
					name: '旧PUSH',
					note: 'メモ',
					exercises: [
						{ name: 'ディップス', sets: [set(8)] },
						{ name: 'DBカール', sets: [set(10)] },
						{ name: 'マスターに無い種目', sets: [set(5)] },
					],
				},
			],
		});
		expect(sections).toHaveLength(1);
		const [push] = sections;
		expect(push).toMatchObject({
			key: 'pkg:pk_a',
			title: 'PUSH A',
			sessionName: '旧PUSH',
			inNote: true,
			note: 'メモ',
		});
		expect(
			push?.cards.map((c) => [
				c.name,
				c.noteName,
				c.sets.length,
				c.item?.targetSets ?? null,
			]),
		).toEqual([
			['ディップス', 'ディップス', 1, 2],
			['ダンベルカール', 'DBカール', 1, null],
			['マスターに無い種目', 'マスターに無い種目', 1, null],
			['ケーブルYレイズ', null, 0, 2],
		]);
		expect(push?.cards[2]?.exercise).toBeNull();
	});

	it('ルーチンの予定（ノートに無いもの）を後ろに、その他を最後に並べる', () => {
		const sections = build(
			{
				date: '2026-10-01',
				sessions: [
					{
						name: null,
						note: '',
						exercises: [{ name: 'ランニング', sets: [set(1)] }],
					},
					{ name: 'PUSH A', note: '', exercises: [] },
				],
			},
			{ routines: [routine('pk_a'), routine('pk_l')] },
		);
		expect(
			sections.map((s) => [s.key, s.inNote, s.plannedBy?.id ?? null]),
		).toEqual([
			['pkg:pk_a', true, null],
			['pkg:pk_l', false, 'rt_pk_l'],
			['other', true, null],
		]);
	});

	it('進行中セットの種目に印を付け、まだノートに無いセクション・種目も出す', () => {
		const sections = build(undefined, {
			activeSet: {
				date: '2026-10-01',
				packageId: null,
				exerciseId: 'ex_c',
				setIndex: 1,
				startedAt: NOW,
			},
		});
		expect(sections).toHaveLength(1);
		expect(sections[0]).toMatchObject({ key: 'other', inNote: false });
		expect(sections[0]?.cards.map((c) => [c.name, c.active])).toEqual([
			['ダンベルカール', true],
		]);

		const inPackage = build(undefined, {
			activeSet: {
				date: '2026-10-01',
				packageId: 'pk_a',
				exerciseId: 'ex_d',
				setIndex: 1,
				startedAt: NOW,
			},
		});
		expect(inPackage[0]?.cards.find((c) => c.active)?.name).toBe(
			'ディップス',
		);
	});

	it('別の日の進行中セットは印を付けない', () => {
		const sections = build(undefined, {
			activeSet: {
				date: '2026-09-30',
				packageId: 'pk_a',
				exerciseId: 'ex_d',
				setIndex: 1,
				startedAt: NOW,
			},
		});
		expect(sections).toEqual([]);
	});

	it('解決できないセッション名はそのまま 1 セクションにする', () => {
		const sections = build({
			date: '2026-10-01',
			sessions: [{ name: '昔のメニュー', note: '', exercises: [] }],
		});
		expect(sections[0]).toMatchObject({
			key: 'name:昔のメニュー',
			pkg: null,
			title: '昔のメニュー',
		});
	});
});

describe('latestFinishedSet', () => {
	it('最後に終えたセット', () => {
		expect(
			latestFinishedSet({
				date: '2026-10-01',
				sessions: [
					{
						name: 'A',
						note: '',
						exercises: [
							{
								name: 'X',
								sets: [set(1, '10:00:00'), set(1, '10:05:00')],
							},
						],
					},
					{
						name: null,
						note: '',
						exercises: [{ name: 'Y', sets: [set(1, '10:03:00')] }],
					},
				],
			}),
		).toEqual({
			sessionName: 'A',
			exerciseName: 'X',
			sessionIndex: 0,
			exerciseIndex: 0,
			end: '10:05:00',
		});
		expect(latestFinishedSet(undefined)).toBeNull();
	});
});

describe('やった順の並び', () => {
	const pushDay = (
		exercises: Array<{ name: string; sets: SetLog[] }>,
	): DayLog => ({
		date: '2026-10-01',
		sessions: [{ name: 'PUSH A', note: '', start: '09:50:00', exercises }],
	});
	const active = (exerciseId: string, setIndex: number): ActiveSet => ({
		date: '2026-10-01',
		packageId: 'pk_a',
		exerciseId,
		setIndex,
		startedAt: NOW,
	});
	const view = (day: DayLog, activeSet: ActiveSet | null = null) =>
		build(day, { activeSet })[0]?.cards.map((c) => [
			c.name,
			c.sets.length,
			c.setOffset,
			c.active,
		]);

	it('開始した種目は、やった種目のすぐ下に上がる', () => {
		const day = pushDay([{ name: 'ディップス', sets: [set(8)] }]);
		expect(view(day, active('ex_y', 1))).toEqual([
			['ディップス', 1, 0, false],
			['ケーブルYレイズ', 0, 0, true],
		]);
	});

	it('最後にやった種目の続きなら、そのカードのまま', () => {
		const day = pushDay([
			{ name: 'ケーブルYレイズ', sets: [set(9)] },
			{ name: 'ディップス', sets: [set(8)] },
		]);
		expect(view(day, active('ex_d', 2))).toEqual([
			['ケーブルYレイズ', 1, 0, false],
			['ディップス', 1, 0, true],
		]);
	});

	it('前にやった種目をもう一度始めると、下にもう 1 枚（セット番号は続きから）', () => {
		const day = pushDay([
			{ name: 'ケーブルYレイズ', sets: [set(9)] },
			{ name: 'ディップス', sets: [set(8)] },
		]);
		const cards = build(day, { activeSet: active('ex_y', 2) })[0]?.cards;
		expect(view(day, active('ex_y', 2))).toEqual([
			['ケーブルYレイズ', 1, 0, false],
			['ディップス', 1, 0, false],
			['ケーブルYレイズ', 0, 1, true],
		]);
		expect(new Set(cards?.map((c) => c.key)).size).toBe(3);
	});

	it('ノートで同じ種目が 2 欄に分かれていれば 2 枚。後の欄のセット番号は前の欄の続き', () => {
		const day = pushDay([
			{ name: 'ケーブルYレイズ', sets: [set(9), set(8)] },
			{ name: 'ディップス', sets: [set(8)] },
			{ name: 'ケーブルYレイズ', sets: [set(7)] },
		]);
		expect(view(day)).toEqual([
			['ケーブルYレイズ', 2, 0, false],
			['ディップス', 1, 0, false],
			['ケーブルYレイズ', 1, 2, false],
		]);
		const cards = build(day)[0]?.cards ?? [];
		expect(cards.map((c) => c.source?.exerciseIndex)).toEqual([0, 1, 2]);
	});

	it('各セットの直前の休憩をカードに持つ（前の種目の最後のセットから数える）', () => {
		const timed = (start: string, end: string): SetLog => ({
			...set(8, end),
			start,
		});
		const day = pushDay([
			{
				name: 'ケーブルYレイズ',
				sets: [
					timed('10:00:00', '10:00:30'),
					timed('10:02:00', '10:02:30'),
				],
			},
			{ name: 'ディップス', sets: [timed('10:05:00', '10:05:40')] },
		]);
		const cards = build(day)[0]?.cards ?? [];
		expect(cards[0]?.rests).toEqual([
			null,
			{ sec: 90, prevEnd: '10:00:30' },
		]);
		expect(cards[1]?.rests).toEqual([{ sec: 150, prevEnd: '10:02:30' }]);
		expect(cards).toHaveLength(2);
	});

	it('ノートにある空の欄（セット無し）はやった種目の後ろに回す', () => {
		const day = pushDay([
			{ name: 'ディップス', sets: [] },
			{ name: 'ケーブルYレイズ', sets: [set(9)] },
		]);
		expect(view(day)).toEqual([
			['ケーブルYレイズ', 1, 0, false],
			['ディップス', 0, 0, false],
		]);
	});
});

describe('カードのノート上の位置', () => {
	it('記録済みのカードはセッション・種目の位置を持ち、「その他」が 2 つでも区別できる', () => {
		const sections = build({
			date: '2026-10-01',
			sessions: [
				{
					name: 'PUSH A',
					note: '',
					exercises: [{ name: 'ディップス', sets: [set(8)] }],
				},
				{
					name: null,
					note: '',
					exercises: [{ name: 'ランニング', sets: [set(1)] }],
				},
				{
					name: null,
					note: '',
					exercises: [{ name: 'ランニング', sets: [set(2)] }],
				},
			],
		});
		const push = sections.find((s) => s.key === 'pkg:pk_a');
		expect(
			push?.cards.find((c) => c.name === 'ディップス')?.source,
		).toEqual({ sessionIndex: 0, exerciseIndex: 0 });
		expect(
			push?.cards.find((c) => c.name === 'ケーブルYレイズ')?.source,
		).toBeNull();
		const other = sections.find((s) => s.isOther);
		expect(other?.cards.map((c) => c.source)).toEqual([
			{ sessionIndex: 1, exerciseIndex: 0 },
			{ sessionIndex: 2, exerciseIndex: 0 },
		]);
	});
});

describe('セクションの状態（筋トレの開始・終了）', () => {
	const statusOf = (
		day: DayLog | undefined,
		extra: Parameters<typeof build>[1] = {},
	) => build(day, extra).map((s) => [s.key, s.status]);

	it('予定 → 筋トレ中 → 終了、その他はいつも manual', () => {
		expect(statusOf(undefined, { routines: [routine('pk_a')] })).toEqual([
			['pkg:pk_a', 'planned'],
		]);
		expect(
			statusOf({
				date: '2026-10-01',
				sessions: [{ name: 'PUSH A', note: '', exercises: [] }],
			}),
		).toEqual([['pkg:pk_a', 'planned']]);
		expect(
			statusOf({
				date: '2026-10-01',
				sessions: [
					{
						name: 'PUSH A',
						note: '',
						exercises: [],
						start: '18:30:00',
					},
				],
			}),
		).toEqual([['pkg:pk_a', 'in-progress']]);
		expect(
			statusOf({
				date: '2026-10-01',
				sessions: [
					{
						name: 'PUSH A',
						note: '',
						exercises: [],
						start: '18:30:00',
						end: '19:00:00',
					},
				],
			}),
		).toEqual([['pkg:pk_a', 'finished']]);
		expect(
			statusOf({
				date: '2026-10-01',
				sessions: [{ name: null, note: '', exercises: [] }],
			}),
		).toEqual([['other', 'manual']]);
	});

	it('開始の記録が無くてもセットがあれば記録済み、進行中のセットがあれば筋トレ中', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'PUSH A',
					note: '',
					exercises: [{ name: 'ディップス', sets: [set(8)] }],
				},
			],
		};
		expect(statusOf(day)).toEqual([['pkg:pk_a', 'finished']]);
		expect(
			statusOf(day, {
				activeSet: {
					date: '2026-10-01',
					packageId: 'pk_a',
					exerciseId: 'ex_d',
					setIndex: 2,
					startedAt: NOW,
				},
			}),
		).toEqual([['pkg:pk_a', 'in-progress']]);
	});
});
