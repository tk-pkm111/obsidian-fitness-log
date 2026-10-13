import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
	applyPackageToFrontmatter,
	PACKAGE_TAG,
	packageFileName,
	packageFromNote,
	packageNoteFrontmatter,
	planPackageMigration,
	remapPackageIds,
	resolvedItemCount,
	serializePackageNote,
	type ResolveExercise,
} from '../../../src/lib/model/package-note';
import { createEmptyData } from '../../../src/lib/model/data';
import type { Package, Routine } from '../../../src/lib/model/types';

const pkg: Package = {
	id: 'pk_push',
	name: 'PUSH A',
	aliases: ['旧PUSH'],
	createdAt: '2026-10-01T00:00:00.000Z',
	note: '胸の日',
	items: [
		{ exerciseId: 'ex_y', targetSets: 2, targetReps: '6-9', restSec: 150 },
		{ exerciseId: 'ex_d', targetSets: 3, targetReps: '8', note: '加重' },
	],
	sections: [{ id: 'sc_1', name: '胸', at: 1 }],
	removedItems: [
		{
			exerciseId: 'ex_old',
			targetSets: 2,
			targetReps: 'AMRAP',
			removedAt: '2026-10-05T10:00:00.000Z',
			after: 'ex_y',
		},
	],
};
const routines: Routine[] = [
	{
		id: 'rt_1',
		packageId: 'pk_push',
		rule: { type: 'weekly', weekdays: [1, 4], intervalWeeks: 1 },
		startDate: '2026-10-01',
		enabled: true,
		skipDates: ['2026-10-13'],
	},
	{
		id: 'rt_2',
		packageId: 'pk_push',
		rule: { type: 'everyNDays', intervalDays: 3 },
		startDate: '2026-09-01',
		endDate: '2026-12-31',
		enabled: false,
		skipDates: [],
	},
];
const names: Record<string, string> = {
	ex_y: 'ケーブルYレイズ',
	ex_d: 'ディップス',
	ex_old: 'ペックフライ',
};
const nameOf = (id: string) => names[id];
const byId: ResolveExercise = (id) => id;

/** ノートに書いて（YAML）読み戻す */
const roundTrip = (
	fm: Record<string, unknown>,
	resolve: ResolveExercise = byId,
	basename = 'PUSH A',
) =>
	packageFromNote(
		{
			basename,
			frontmatter: YAML.parse(YAML.stringify(fm)) as Record<
				string,
				unknown
			>,
		},
		resolve,
	);

describe('パッケージノート', () => {
	it('書いて読み戻すと同じパッケージ・ルーチン（種目名も書く）', () => {
		const fm = packageNoteFrontmatter(pkg, routines, 2, nameOf);
		expect(fm.tags).toEqual([PACKAGE_TAG]);
		expect(fm.exercises).toEqual([
			{
				name: 'ケーブルYレイズ',
				id: 'ex_y',
				sets: 2,
				reps: '6-9',
				rest: 150,
			},
			{
				name: 'ディップス',
				id: 'ex_d',
				sets: 3,
				reps: '8',
				note: '加重',
			},
		]);
		expect((fm.routines as unknown[])[1]).toEqual({
			id: 'rt_2',
			type: 'every-n-days',
			interval_days: 3,
			start: '2026-09-01',
			end: '2026-12-31',
			enabled: false,
		});
		const back = roundTrip(fm);
		expect(back?.pkg).toEqual(pkg);
		expect(back?.routines).toEqual(routines);
		expect(back?.order).toBe(2);
		expect(back?.names.get('ex_old')).toBe('ペックフライ');
	});

	it('YAML の数・日付（Date）も文字列に戻す。名前はファイル名', () => {
		const back = packageFromNote(
			{
				basename: 'LEGS',
				frontmatter: {
					fitness_id: 'pk_l',
					created: new Date('2026-10-01T09:30:00.000Z'),
					exercises: [{ id: 'ex_a', sets: 2, reps: 8 }],
					routines: [
						{
							id: 'rt_l',
							type: 'every-n-days',
							interval_days: 2,
							start: new Date('2026-10-02T00:00:00.000Z'),
							skip: [new Date('2026-10-04T00:00:00.000Z')],
						},
					],
				},
			},
			byId,
		);
		expect(back?.pkg).toMatchObject({
			id: 'pk_l',
			name: 'LEGS',
			createdAt: '2026-10-01T09:30:00.000Z',
			items: [{ exerciseId: 'ex_a', targetSets: 2, targetReps: '8' }],
		});
		expect(back?.routines[0]).toMatchObject({
			packageId: 'pk_l',
			startDate: '2026-10-02',
			skipDates: ['2026-10-04'],
			enabled: true,
		});
	});

	it('id が見つからない種目は名前で繋ぎ直す（別の端末で作った種目）。どちらも無ければ id のまま', () => {
		const fm = packageNoteFrontmatter(pkg, [], 0, nameOf);
		const known: Record<string, string> = {
			ケーブルYレイズ: 'ex_y2',
			ペックフライ: 'ex_p2',
		};
		const resolve: ResolveExercise = (id, name) =>
			(name ? known[name] : undefined) ?? id;
		const back = roundTrip(fm, resolve);
		expect(back?.pkg.items.map((i) => i.exerciseId)).toEqual([
			'ex_y2',
			'ex_d',
		]);
		expect(back?.pkg.removedItems?.[0]).toMatchObject({
			exerciseId: 'ex_p2',
			after: 'ex_y',
		});
		expect(resolvedItemCount(back!.pkg, new Set(['ex_y2']))).toBe(1);
	});

	it('fitness_id が無ければパッケージノートではない。壊れた値は捨てる', () => {
		expect(
			packageFromNote(
				{ basename: 'メモ', frontmatter: { tags: ['x'] } },
				byId,
			),
		).toBeNull();
		const back = packageFromNote(
			{
				basename: 'X',
				frontmatter: {
					fitness_id: 'pk_x',
					exercises: ['x', { sets: 2 }, { id: 'ex_a', sets: 0 }],
					routines: [
						{ id: 'rt_bad', type: 'monthly', start: '2026-10-01' },
					],
					order: 'first',
				},
			},
			byId,
		);
		expect(back?.pkg.items).toEqual([
			{ exerciseId: 'ex_a', targetSets: 1, targetReps: '' },
		]);
		expect(back?.routines).toEqual([]);
		expect(back?.order).toBe(Number.MAX_SAFE_INTEGER);
	});

	it('書き換えは自分のキーだけ。利用者のプロパティとタグは残す', () => {
		const fm: Record<string, unknown> = {
			fitness_id: 'pk_push',
			tags: ['筋トレ', PACKAGE_TAG],
			mine: '自分のプロパティ',
			note: '古いメモ',
		};
		const next = packageNoteFrontmatter(
			{ ...pkg, note: undefined },
			[],
			0,
			nameOf,
		);
		applyPackageToFrontmatter(fm, next);
		expect(fm.mine).toBe('自分のプロパティ');
		expect(fm.tags).toEqual([PACKAGE_TAG, '筋トレ']);
		expect(fm.note).toBeUndefined();
		expect(serializePackageNote(next)).toBe(serializePackageNote(next));
	});

	it('ファイル名に使えない文字は全角に', () => {
		expect(packageFileName(' PUSH/PULL ')).toBe('PUSH／PULL');
	});
});

describe('data.json → パッケージノートへの移行', () => {
	const note = (p: Package, r: Routine[] = [], order = 0) => ({
		pkg: p,
		routines: r,
		order,
		names: new Map<string, string>(),
	});
	const known = new Set(['ex_y', 'ex_d']);
	// PC: 種目ノートと合っている。スマホ: 端末で別に作った種目の id を指している（全部見つからない）
	const pc: Package = {
		...pkg,
		id: 'pk_pc',
		removedItems: undefined,
	};
	const phone: Package = {
		...pc,
		id: 'pk_phone',
		items: [
			{ exerciseId: 'ex_phone1', targetSets: 2, targetReps: '6-9' },
			{ exerciseId: 'ex_phone2', targetSets: 2, targetReps: '6-9' },
		],
	};
	const pcRoutines = routines.map((r) => ({ ...r, packageId: 'pk_pc' }));
	const phoneRoutine: Routine = {
		...routines[0]!,
		id: 'rt_ph',
		packageId: 'pk_phone',
	};

	it('ノートがまだ無ければ、この端末のパッケージをそのままノートにする（並びも同じ）', () => {
		const second: Package = {
			...pc,
			id: 'pk_2',
			name: 'PULL A',
			aliases: [],
		};
		const plan = planPackageMigration(
			[],
			{ packages: [pc, second], routines: pcRoutines },
			known,
		);
		expect(plan.packages.map((p) => p.id)).toEqual(['pk_pc', 'pk_2']);
		expect(plan.routines).toHaveLength(2);
		expect([plan.written, plan.remap.size]).toEqual([2, 0]);
	});

	it('スマホが先: 見つからない種目のままノートになる → 後で PC が、種目の繋がる方で置き換える（id と名前はノートのまま）', () => {
		const first = planPackageMigration(
			[],
			{ packages: [phone], routines: [phoneRoutine] },
			known,
		);
		expect(first.packages[0]?.id).toBe('pk_phone');
		const plan = planPackageMigration(
			[note(first.packages[0]!, first.routines)],
			{ packages: [pc], routines: pcRoutines },
			known,
		);
		expect(plan.packages).toHaveLength(1);
		expect(plan.packages[0]).toMatchObject({
			id: 'pk_phone',
			name: 'PUSH A',
		});
		expect(plan.packages[0]?.items.map((i) => i.exerciseId)).toEqual([
			'ex_y',
			'ex_d',
		]);
		// PC のルーチンで置き換え、パッケージの id はノートの id に
		expect(plan.routines.map((r) => [r.id, r.packageId])).toEqual([
			['rt_1', 'pk_phone'],
			['rt_2', 'pk_phone'],
		]);
		expect(plan.remap.get('pk_pc')).toBe('pk_phone');
		expect(plan.written).toBe(1);
	});

	it('PC が先: スマホのパッケージ（種目が繋がらない）はノートに負けて、スマホの参照はノートの id に付け替える', () => {
		const plan = planPackageMigration(
			[note(pc, pcRoutines)],
			{ packages: [phone], routines: [phoneRoutine] },
			known,
		);
		expect(plan.packages[0]?.items.map((i) => i.exerciseId)).toEqual([
			'ex_y',
			'ex_d',
		]);
		expect(plan.routines.map((r) => r.id)).toEqual(['rt_1', 'rt_2']);
		expect(plan.remap.get('pk_phone')).toBe('pk_pc');
		expect(plan.written).toBe(0);

		const data = createEmptyData();
		data.activeSet = {
			date: '2026-10-14',
			packageId: 'pk_phone',
			exerciseId: 'ex_y',
			setIndex: 1,
			startedAt: '2026-10-14T10:00:00.000Z',
		};
		data.dayOrders = {
			'2026-10-14 pkg:pk_phone': ['ex:ex_y'],
			'2026-10-14 other': ['ex:a'],
		};
		remapPackageIds(data, plan.remap);
		expect(data.activeSet.packageId).toBe('pk_pc');
		expect(Object.keys(data.dayOrders)).toEqual([
			'2026-10-14 pkg:pk_pc',
			'2026-10-14 other',
		]);
	});

	it('名前（別名）で同じパッケージとみなす。正にした方にルーチンが無ければ、もう一方のルーチンを使う', () => {
		const renamed: Package = {
			...pc,
			id: 'pk_x',
			name: 'PUSH 新',
			aliases: ['PUSH A'],
		};
		const plan = planPackageMigration(
			[note({ ...pc, aliases: [] })],
			{
				packages: [renamed],
				routines: [{ ...routines[0]!, packageId: 'pk_x' }],
			},
			known,
		);
		expect(plan.packages.map((p) => [p.id, p.name])).toEqual([
			['pk_pc', 'PUSH A'],
		]);
		expect(plan.routines.map((r) => r.packageId)).toEqual(['pk_pc']);
		expect(plan.written).toBe(1);
	});
});
