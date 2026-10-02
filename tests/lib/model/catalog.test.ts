import { beforeEach, describe, expect, it } from 'vitest';
import {
	addPackageItem,
	CatalogError,
	checkCanDeleteExercise,
	createPackage,
	createRoutine,
	deletePackage,
	deleteRoutine,
	duplicatePackage,
	movePackageItemTo,
	packagesUsingExercise,
	parseRestInput,
	planFromTemplate,
	prepareExerciseUpdate,
	prepareNewExercise,
	removeExerciseFromPackages,
	removePackageItem,
	setRoutineEnabled,
	updatePackage,
	updatePackageItem,
	updateRoutine,
	type ExerciseFields,
} from '../../../src/lib/model/catalog';
import { createEmptyData, planSeed } from '../../../src/lib/model/data';
import type { Exercise, PluginData } from '../../../src/lib/model/types';

const NOW = '2026-10-01T00:00:00.000Z';

/** テスト用: 種目を用意して data に入れる（本体ではノートを作る） */
function addExercise(data: PluginData, fields: ExerciseFields): Exercise {
	const exercise = prepareNewExercise(data.exercises, fields, NOW);
	data.exercises.push(exercise);
	return exercise;
}

/** テスト用: 計画（新しい種目＋パッケージ）をそのまま data に入れる */
function applyPlan(
	data: PluginData,
	plan: { exercises: Exercise[]; packages: PluginData['packages'] },
): void {
	data.exercises.push(...plan.exercises);
	data.packages.push(...plan.packages);
}

describe('種目', () => {
	let data: PluginData;
	beforeEach(() => {
		data = createEmptyData();
	});

	it('作成: 名前は必須、本名・別名が他と重なれば拒否', () => {
		const bench = addExercise(data, {
			name: ' ベンチプレス ',
			aliases: ['BP'],
		});
		expect(bench).toMatchObject({
			name: 'ベンチプレス',
			category: 'other',
			recordType: 'weight-reps',
			aliases: ['BP'],
		});
		expect(() =>
			prepareNewExercise(data.exercises, { name: '' }, NOW),
		).toThrow(CatalogError);
		expect(() =>
			prepareNewExercise(data.exercises, { name: 'ｂｐ' }, NOW),
		).toThrow(/ベンチプレス/);
		expect(() =>
			prepareNewExercise(
				data.exercises,
				{ name: 'X', aliases: ['ベンチ プレス'] },
				NOW,
			),
		).toThrow(CatalogError);
	});

	it('名前はファイル名に使える形に揃える（/ などは全角）', () => {
		const ex = addExercise(data, { name: 'S/A ケーブル:サイドレイズ' });
		expect(ex.name).toBe('S／A ケーブル：サイドレイズ');
		// 元の表記でも重なりとして見つかる（名前の照合は NFKC）
		expect(() =>
			prepareNewExercise(
				data.exercises,
				{ name: 'S/A ケーブル:サイドレイズ' },
				NOW,
			),
		).toThrow(CatalogError);
	});

	it('名前を変えると旧名が別名に入る（過去ノートの名前で引ける）', () => {
		const ex = addExercise(data, { name: 'ラットプルダウン' });
		const renamed = prepareExerciseUpdate(data.exercises, ex, {
			name: 'ワイドグリップラットプルダウン',
			category: 'pull',
		});
		expect(renamed).toMatchObject({
			name: 'ワイドグリップラットプルダウン',
			category: 'pull',
			aliases: ['ラットプルダウン'],
		});
		// 元の名前に戻すと、その名前は別名から外れる
		const back = prepareExerciseUpdate(data.exercises, renamed, {
			name: 'ラットプルダウン',
		});
		expect(back.aliases).toEqual(['ワイドグリップラットプルダウン']);
	});

	it('外した任意項目は消す', () => {
		const ex = addExercise(data, {
			name: 'X',
			unilateral: true,
			equipment: 'cable',
		});
		const next = prepareExerciseUpdate(data.exercises, ex, {
			unilateral: false,
			archived: false,
			equipment: undefined,
		});
		expect(next).not.toHaveProperty('unilateral');
		expect(next).not.toHaveProperty('archived');
		expect(next).not.toHaveProperty('equipment');
	});

	it('削除するとパッケージの項目からも外れる。進行中セットの種目は消せない', () => {
		const a = addExercise(data, { name: 'A' });
		const b = addExercise(data, { name: 'B' });
		const pkg = createPackage(data, 'P', NOW);
		addPackageItem(data, pkg.id, a.id);
		addPackageItem(data, pkg.id, b.id);
		expect(packagesUsingExercise(data, a.id).map((p) => p.name)).toEqual([
			'P',
		]);
		removeExerciseFromPackages(data, a.id);
		expect(pkg.items.map((i) => i.exerciseId)).toEqual([b.id]);
		data.activeSet = {
			date: '2026-10-01',
			packageId: pkg.id,
			exerciseId: b.id,
			setIndex: 1,
			startedAt: NOW,
		};
		expect(() => checkCanDeleteExercise(data, b.id)).toThrow(CatalogError);
	});
});

describe('パッケージ', () => {
	let data: PluginData;
	let exerciseId: string;
	beforeEach(() => {
		data = createEmptyData();
		exerciseId = addExercise(data, { name: 'ディップス' }).id;
	});

	it('作成: 空・重複・「その他」は拒否', () => {
		createPackage(data, 'PUSH A', NOW);
		expect(() => createPackage(data, 'push a', NOW)).toThrow(CatalogError);
		expect(() => createPackage(data, ' ', NOW)).toThrow(CatalogError);
		expect(() => createPackage(data, 'その他', NOW)).toThrow(/使えません/);
	});

	it('名前を変えると旧名が別名に入り、旧名で新しく作ることはできない', () => {
		const pkg = createPackage(data, '上半身A', NOW);
		updatePackage(data, pkg.id, { name: 'UPPER A', note: ' 胸の日 ' });
		expect(pkg).toMatchObject({
			name: 'UPPER A',
			aliases: ['上半身A'],
			note: '胸の日',
		});
		expect(() => createPackage(data, '上半身A', NOW)).toThrow(CatalogError);
		updatePackage(data, pkg.id, { note: '' });
		expect(pkg).not.toHaveProperty('note');
	});

	it('項目の追加・修正・並び替え・削除', () => {
		const pkg = createPackage(data, 'P', NOW);
		const other = addExercise(data, { name: 'ベンチ' }).id;
		addPackageItem(data, pkg.id, exerciseId);
		addPackageItem(data, pkg.id, other, {
			targetSets: 3,
			targetReps: '4-8',
			restSec: 180,
		});
		expect(pkg.items[0]).toEqual({
			exerciseId,
			targetSets: 2,
			targetReps: '6-9',
		});
		updatePackageItem(data, pkg.id, 0, {
			targetSets: 4,
			targetReps: 'AMRAP',
			restSec: 90,
			note: '加重',
		});
		expect(pkg.items[0]).toEqual({
			exerciseId,
			targetSets: 4,
			targetReps: 'AMRAP',
			restSec: 90,
			note: '加重',
		});
		updatePackageItem(data, pkg.id, 0, { restSec: null, note: '' });
		expect(pkg.items[0]).toEqual({
			exerciseId,
			targetSets: 4,
			targetReps: 'AMRAP',
		});
		expect(() =>
			updatePackageItem(data, pkg.id, 0, { targetSets: 0 }),
		).toThrow(CatalogError);
		expect(() =>
			updatePackageItem(data, pkg.id, 0, { targetReps: '9-6' }),
		).toThrow(CatalogError);
		movePackageItemTo(data, pkg.id, 0, 1);
		expect(pkg.items.map((i) => i.exerciseId)).toEqual([other, exerciseId]);
		movePackageItemTo(data, pkg.id, 1, 2); // 範囲外では何もしない
		expect(pkg.items.map((i) => i.exerciseId)).toEqual([other, exerciseId]);
		removePackageItem(data, pkg.id, 0, NOW);
		expect(pkg.items.map((i) => i.exerciseId)).toEqual([exerciseId]);
		expect(() => addPackageItem(data, pkg.id, 'ex_none')).toThrow(
			CatalogError,
		);
	});

	it('複製は名前を重ならないようにし、すぐ後ろに入れる', () => {
		const a = createPackage(data, 'A', NOW);
		createPackage(data, 'B', NOW);
		addPackageItem(data, a.id, exerciseId);
		const copy = duplicatePackage(data, a.id, NOW);
		const copy2 = duplicatePackage(data, a.id, NOW);
		expect(data.packages.map((p) => p.name)).toEqual([
			'A',
			'A のコピー 2',
			'A のコピー',
			'B',
		]);
		expect(copy.items).toEqual(a.items);
		expect(copy.items).not.toBe(a.items);
		expect(copy2.id).not.toBe(copy.id);
	});

	it('削除するとルーチンも消え、進行中セットはパッケージ外になる', () => {
		const pkg = createPackage(data, 'A', NOW);
		data.routines.push({
			id: 'rt_1',
			packageId: pkg.id,
			rule: { type: 'everyNDays', intervalDays: 1 },
			startDate: '2026-10-01',
			enabled: true,
			skipDates: [],
		});
		data.activeSet = {
			date: '2026-10-01',
			packageId: pkg.id,
			exerciseId,
			setIndex: 1,
			startedAt: NOW,
		};
		deletePackage(data, pkg.id);
		expect(data.packages).toEqual([]);
		expect(data.routines).toEqual([]);
		expect(data.activeSet?.packageId).toBeNull();
	});

	it('テンプレートから 1 セッション・プログラム全体を追加する計画（名前が重なれば番号を添える）', () => {
		const empty = createEmptyData();
		const one = planFromTemplate(empty, 'ppl', 'PUSH A', NOW);
		expect(one.packages.map((p) => p.name)).toEqual(['PUSH A']);
		expect(one.exercises.length).toBeGreaterThan(0); // マスターに無い種目は新しく作る計画に入る
		expect(empty.packages).toEqual([]); // 計画だけで data は変えない
		applyPlan(empty, one);
		const all = planFromTemplate(empty, 'ppl-ul', null, NOW);
		expect(all.packages.map((p) => p.name)).toEqual([
			'LEGS A',
			'PUSH A 2',
			'PULL A',
			'LOWER',
			'UPPER',
		]);
		// 同じ計画の中で同じ種目を 2 回作らない
		const names = all.exercises.map((e) => e.name);
		expect(new Set(names).size).toBe(names.length);
		expect(() => planFromTemplate(empty, 'none', null, NOW)).toThrow(
			CatalogError,
		);
	});
});

describe('parseRestInput', () => {
	it('分:秒・分・秒の表記を秒にする', () => {
		expect(parseRestInput('2:30')).toBe(150);
		expect(parseRestInput('2.5')).toBe(150);
		expect(parseRestInput('3分')).toBe(180);
		expect(parseRestInput('90s')).toBe(90);
		expect(parseRestInput('９０秒')).toBe(90);
		expect(parseRestInput('')).toBeNull();
		expect(parseRestInput('2:75')).toBeUndefined();
		expect(parseRestInput('abc')).toBeUndefined();
	});
});

describe('ルーチン', () => {
	let data: PluginData;
	let packageId: string;
	const weekly = (weekdays: number[], intervalWeeks = 1) => ({
		type: 'weekly' as const,
		weekdays,
		intervalWeeks,
	});
	beforeEach(() => {
		data = createEmptyData();
		packageId = createPackage(data, 'PUSH A', NOW).id;
	});

	it('作成: 曜日は重複を除いて並べる', () => {
		const routine = createRoutine(data, {
			packageId,
			rule: weekly([4, 1, 4]),
			startDate: '2026-10-01',
			enabled: true,
		});
		expect(routine).toMatchObject({
			rule: { type: 'weekly', weekdays: [1, 4], intervalWeeks: 1 },
			skipDates: [],
		});
		expect(routine).not.toHaveProperty('endDate');
	});

	it('検証: パッケージ・開始日・終了日・曜日・間隔', () => {
		const base = {
			packageId,
			rule: weekly([1]),
			startDate: '2026-10-01',
			enabled: true,
		};
		expect(() =>
			createRoutine(data, { ...base, packageId: 'pk_none' }),
		).toThrow(/パッケージ/);
		expect(() => createRoutine(data, { ...base, startDate: '' })).toThrow(
			/開始日/,
		);
		expect(() =>
			createRoutine(data, { ...base, endDate: '2026-09-30' }),
		).toThrow(/終了日/);
		expect(() =>
			createRoutine(data, { ...base, rule: weekly([]) }),
		).toThrow(/曜日/);
		expect(() =>
			createRoutine(data, { ...base, rule: weekly([1], 0) }),
		).toThrow(/間隔/);
		expect(() =>
			createRoutine(data, {
				...base,
				rule: { type: 'everyNDays', intervalDays: 1.5 },
			}),
		).toThrow(/間隔/);
		expect(data.routines).toEqual([]);
	});

	it('更新・有効の切り替え・削除（スキップした日は保つ）', () => {
		const routine = createRoutine(data, {
			packageId,
			rule: weekly([1]),
			startDate: '2026-10-01',
			enabled: true,
		});
		routine.skipDates.push('2026-10-05');
		updateRoutine(data, routine.id, {
			packageId,
			rule: { type: 'everyNDays', intervalDays: 3 },
			startDate: '2026-10-02',
			endDate: '2026-12-31',
			enabled: true,
		});
		expect(routine).toMatchObject({
			rule: { type: 'everyNDays', intervalDays: 3 },
			endDate: '2026-12-31',
			skipDates: ['2026-10-05'],
		});
		updateRoutine(data, routine.id, {
			packageId,
			rule: routine.rule,
			startDate: '2026-10-02',
			enabled: true,
		});
		expect(routine).not.toHaveProperty('endDate');
		setRoutineEnabled(data, routine.id, false);
		expect(routine.enabled).toBe(false);
		deleteRoutine(data, routine.id);
		expect(data.routines).toEqual([]);
	});
});

describe('パッケージ名と旧名（レビューで見つかった不具合の再発防止）', () => {
	it('名前を変えたパッケージの旧名で、初期データやテンプレートが新しく作られない', () => {
		const data = createEmptyData();
		applyPlan(data, planSeed(data, NOW));
		const legs = data.packages.find((p) => p.name === 'LEGS A')!;
		updatePackage(data, legs.id, { name: '脚の日' });
		expect(planSeed(data, NOW).packages).toHaveLength(0);
		const [added] = planFromTemplate(data, 'ppl', 'LEGS A', NOW).packages;
		expect(added?.name).toBe('LEGS A 2');
	});
});
