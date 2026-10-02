import { describe, expect, it } from 'vitest';
import {
	createEmptyData,
	DEFAULT_SETTINGS,
	normalizePluginData,
	planSeed,
} from '../../../src/lib/model/data';
import { DEFAULT_EXERCISES } from '../../../src/lib/model/defaults';

const NOW = '2026-10-01T00:00:00.000Z';

describe('normalizePluginData', () => {
	it('null（初回）は空のデータ', () => {
		expect(normalizePluginData(null)).toEqual(createEmptyData());
	});

	it('0.1.0 以前の形式（直下の logFolder）を settings に移す', () => {
		const data = normalizePluginData({ logFolder: 'Training/Logs' });
		expect(data.settings).toEqual({
			...DEFAULT_SETTINGS,
			logFolder: 'Training/Logs',
		});
	});

	it('壊れた要素は捨て、欠けた項目は既定値で埋める', () => {
		const data = normalizePluginData({
			settings: {
				weightUnit: 'stone',
				weightStep: -1,
				showRestTimer: 'yes',
				logFolder: '  ',
			},
			exercises: [
				{
					id: 'ex_1',
					name: 'ベンチ',
					category: 'chest',
					aliases: ['BP', 3],
				},
				{ id: 'ex_1', name: '重複 id' },
				{ name: 'id なし' },
				'garbage',
			],
			packages: [
				{
					id: 'pk_1',
					name: 'A',
					items: [{ exerciseId: 'ex_1', targetSets: 0 }, { foo: 1 }],
				},
			],
			routines: [
				{
					id: 'rt_1',
					packageId: 'pk_1',
					rule: { type: 'weekly', weekdays: [4, 1, 9, 1] },
					startDate: '2026-10-01',
				},
				{
					id: 'rt_2',
					packageId: 'pk_消えた',
					rule: { type: 'everyNDays', intervalDays: 3 },
					startDate: '2026-10-01',
				},
				{
					id: 'rt_3',
					packageId: 'pk_1',
					rule: { type: 'monthly' },
					startDate: '2026-10-01',
				},
			],
			activeSet: {
				exerciseId: 'ex_1',
				date: '2026-10-01',
				startedAt: 'not a date',
			},
		});
		expect(data.settings).toEqual(DEFAULT_SETTINGS);
		expect(data.exercises).toEqual([
			{
				id: 'ex_1',
				name: 'ベンチ',
				category: 'other',
				recordType: 'weight-reps',
				aliases: ['BP'],
				createdAt: new Date(0).toISOString(),
			},
		]);
		expect(data.packages[0]?.items).toEqual([
			{ exerciseId: 'ex_1', targetSets: 1, targetReps: '' },
		]);
		expect(data.routines).toEqual([
			{
				id: 'rt_1',
				packageId: 'pk_1',
				rule: { type: 'weekly', weekdays: [1, 4], intervalWeeks: 1 },
				startDate: '2026-10-01',
				enabled: true,
				skipDates: [],
			},
		]);
		expect(data.activeSet).toBeNull();
	});

	it('正しい進行中セットは保持する', () => {
		const active = {
			date: '2026-10-01',
			packageId: null,
			exerciseId: 'ex_1',
			setIndex: 2,
			weight: 10,
			startedAt: '2026-10-01T09:00:00.000Z',
		};
		expect(normalizePluginData({ activeSet: active }).activeSet).toEqual(
			active,
		);
	});

	it('パッケージの区切り・その日の並び・セクションの設定を読み、壊れた値は捨てる', () => {
		const data = normalizePluginData({
			settings: { packageSections: true },
			packages: [
				{
					id: 'pk_1',
					name: 'PULL',
					items: [{ exerciseId: 'ex_a', targetSets: 2 }],
					sections: [
						{ id: 'sc_1', name: '背中', at: 0 },
						{ id: 'sc_1', name: '重複', at: 0 },
						{ id: 'sc_2', name: '腕', at: 99 },
						{ id: 'sc_3', name: '' },
						'x',
					],
				},
			],
			dayOrders: {
				'2026-10-01 pkg:pk_1': ['ex:a', 3],
				'broken key': ['ex:a'],
				'2026-10-02 other': 'x',
			},
		});
		expect(data.settings.packageSections).toBe(true);
		expect(data.packages[0]?.sections).toEqual([
			{ id: 'sc_1', name: '背中', at: 0 },
			{ id: 'sc_2', name: '腕', at: 1 },
		]);
		expect(data.dayOrders).toEqual({ '2026-10-01 pkg:pk_1': ['ex:a'] });
		expect(normalizePluginData({}).settings.packageSections).toBe(false);
	});
});

describe('planSeed（初期データの計画）', () => {
	it('初回: 全種目と PPL の 6 パッケージを計画し、data は変えない', () => {
		const data = createEmptyData();
		const plan = planSeed(data, NOW);
		expect(plan.exercises).toHaveLength(DEFAULT_EXERCISES.length);
		expect(plan.packages.map((p) => p.name)).toEqual([
			'LEGS A',
			'PUSH A',
			'PULL A',
			'LEG B',
			'PUSH B',
			'PULL B',
		]);
		expect(data.exercises).toEqual([]);
		const ids = new Set(plan.exercises.map((e) => e.id));
		for (const pkg of plan.packages)
			for (const item of pkg.items)
				expect(ids.has(item.exerciseId)).toBe(true);
	});

	it('種目名はノートのファイル名になるので / などは全角に揃える', () => {
		const names = planSeed(createEmptyData(), NOW).exercises.map(
			(e) => e.name,
		);
		expect(names).toContain('ケーブルベイジアン／インクラインカール');
		expect(names.some((n) => /[/\\:*?"<>|#^[\]]/.test(n))).toBe(false);
	});

	it('再投入は不足分だけ（上書きしない）', () => {
		const data = createEmptyData();
		const first = planSeed(data, NOW);
		data.exercises.push(
			...first.exercises.filter((e) => e.name !== 'ケーブルカール'),
		);
		data.packages.push(
			...first.packages.filter((p) => p.name !== 'PUSH A'),
		);
		const again = planSeed(data, NOW);
		expect(again.exercises.map((e) => e.name)).toEqual(['ケーブルカール']);
		expect(again.packages.map((p) => p.name)).toEqual(['PUSH A']);
	});

	it('ユーザーが同じ種目を別名で登録していれば足さない', () => {
		const data = createEmptyData();
		data.exercises.push({
			id: 'ex_mine',
			name: 'SLDL',
			category: 'legs',
			recordType: 'weight-reps',
			aliases: [],
			createdAt: NOW,
		});
		const plan = planSeed(data, NOW);
		expect(
			plan.exercises.filter(
				(e) => e.name === 'スティフレッグデッドリフト',
			),
		).toHaveLength(0);
	});
});
