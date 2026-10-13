import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component as ObsidianComponent } from 'obsidian';
import { DataStore } from '../../src/data/data-store';
import { ExerciseLibrary } from '../../src/data/exercise-library';
import { PackageLibrary } from '../../src/data/package-library';
import {
	createPackage,
	deletePackage,
	updatePackage,
} from '../../src/lib/model/catalog';
import { PACKAGES_IN_VAULT } from '../../src/lib/model/package-note';
import type { Package, Routine } from '../../src/lib/model/types';
import { Component, Plugin } from '../__mocks__/obsidian';
import {
	createFakeApp,
	FakeFileManager,
	type FakeApp,
} from '../helpers/fake-app';

const NOW = '2026-10-01T00:00:00.000Z';
const pushA: Package = {
	id: 'pk_push',
	name: 'PUSH A',
	aliases: [],
	createdAt: NOW,
	items: [
		{ exerciseId: 'ex_y', targetSets: 2, targetReps: '6-9', restSec: 150 },
		{ exerciseId: 'ex_d', targetSets: 2, targetReps: '4-8' },
	],
};
const pullA: Package = {
	id: 'pk_pull',
	name: 'PULL A',
	aliases: [],
	createdAt: NOW,
	items: [{ exerciseId: 'ex_d', targetSets: 3, targetReps: '8' }],
};
const routine: Routine = {
	id: 'rt_push',
	packageId: 'pk_push',
	rule: { type: 'weekly', weekdays: [1, 4], intervalWeeks: 1 },
	startDate: '2026-09-01',
	enabled: true,
	skipDates: ['2026-10-13'],
};
const legacy = (extra: Record<string, unknown> = {}) => ({
	settings: {},
	packages: [pushA, pullA],
	routines: [routine],
	migrations: ['log-folder-v2', 'folder-names-en'],
	seededAt: NOW,
	...extra,
});

async function ensureFolder(fake: FakeApp, path: string) {
	let current = '';
	for (const part of path.split('/')) {
		current = current ? `${current}/${part}` : part;
		if (!fake.vault.getFolderByPath(current))
			await fake.vault.createFolder(current);
	}
}

async function writeExercise(fake: FakeApp, name: string, id: string) {
	await ensureFolder(fake, 'Fitness/exercise');
	await fake.vault.create(
		`Fitness/exercise/${name}.md`,
		`---\nfitness_id: ${id}\ntags:\n  - fitness-exercise\ncategory: push\n---\n`,
	);
}

/** 1 台の端末（同じ vault を見る別の端末は fake を共有して、plugin を分ける） */
async function device(fake: FakeApp, raw: unknown) {
	const plugin = new Plugin();
	if (raw) await plugin.saveData(raw);
	const store = new DataStore(plugin);
	await store.load();
	const library = new ExerciseLibrary(fake.app, store);
	const packages = new PackageLibrary(fake.app, store, library);
	const owner = new Component();
	return { plugin, store, library, packages, owner };
}

async function setup(raw: unknown = legacy()) {
	const fake = createFakeApp();
	await writeExercise(fake, 'ケーブルYレイズ', 'ex_y');
	await writeExercise(fake, 'ディップス', 'ex_d');
	return { fake, ...(await device(fake, raw)) };
}

const fmOf = (fake: FakeApp, path: string) =>
	FakeFileManager.read(fake.vault.text(path));

describe('PackageLibrary（パッケージ・ルーチンはパッケージノートが正）', () => {
	afterEach(() => vi.useRealTimers());

	it('この端末で初めて: data.json のパッケージ・ルーチンをノートにし、data.json からは消す', async () => {
		const { fake, plugin, store, packages } = await setup();
		expect(await packages.ensureLoaded()).toBe(2);
		expect(fmOf(fake, 'Fitness/package/PUSH A.md')).toEqual({
			fitness_id: 'pk_push',
			tags: ['fitness-package'],
			aliases: [],
			order: 0,
			created: NOW,
			exercises: [
				{
					name: 'ケーブルYレイズ',
					id: 'ex_y',
					sets: 2,
					reps: '6-9',
					rest: 150,
				},
				{ name: 'ディップス', id: 'ex_d', sets: 2, reps: '4-8' },
			],
			routines: [
				{
					id: 'rt_push',
					type: 'weekly',
					weekdays: [1, 4],
					interval_weeks: 1,
					start: '2026-09-01',
					enabled: true,
					skip: ['2026-10-13'],
				},
			],
		});
		expect(fmOf(fake, 'Fitness/package/PULL A.md')).toMatchObject({
			fitness_id: 'pk_pull',
			order: 1,
		});
		expect(store.current.packages).toEqual([pushA, pullA]);
		expect(store.current.routines).toEqual([routine]);
		const saved = (await plugin.loadData()) as Record<string, unknown>;
		expect(saved.packages).toBeUndefined();
		expect(saved.routines).toBeUndefined();
		expect(saved.migrations).toContain(PACKAGES_IN_VAULT);
	});

	it('次の起動からはノートから読む（data.json には無い）', async () => {
		const { fake, plugin, packages } = await setup();
		await packages.ensureLoaded();
		const saved = await plugin.loadData();
		const next = await device(fake, saved);
		expect(await next.packages.ensureLoaded()).toBe(0);
		expect(next.store.current.packages).toEqual([pushA, pullA]);
		expect(next.store.current.routines).toEqual([routine]);
	});

	it('変更・名前の変更・追加・削除をノートに書く（本文と自分のプロパティは残す）', async () => {
		const { fake, store, packages } = await setup();
		await packages.ensureLoaded();
		await fake.vault.process(
			fake.vault.getFileByPath('Fitness/package/PUSH A.md')!,
			(text) =>
				text.replace('---\n', '---\nmine: 自分の\n') +
				'\n胸の日のメモ\n',
		);
		await store.update((d) => {
			const pkg = d.packages.find((p) => p.id === 'pk_push')!;
			pkg.items[0]!.targetSets = 3;
			updatePackage(d, 'pk_push', { name: 'PUSH 新' });
		});
		expect(
			fake.vault.getFileByPath('Fitness/package/PUSH A.md'),
		).toBeNull();
		const fm = fmOf(fake, 'Fitness/package/PUSH 新.md');
		expect(fm).toMatchObject({
			fitness_id: 'pk_push',
			aliases: ['PUSH A'],
			mine: '自分の',
		});
		expect((fm.exercises as Array<{ sets: number }>)[0]?.sets).toBe(3);
		expect(fake.vault.text('Fitness/package/PUSH 新.md')).toContain(
			'胸の日のメモ',
		);

		await store.update((d) => {
			createPackage(d, 'LEGS', NOW);
		});
		expect(fmOf(fake, 'Fitness/package/LEGS.md')).toMatchObject({
			order: 2,
			exercises: [],
		});

		await store.update((d) => deletePackage(d, 'pk_push'));
		expect(fake.fileManager.trashed).toEqual([
			'Fitness/package/PUSH 新.md',
		]);
		expect(store.current.routines).toEqual([]);
		// 並びが詰まる
		expect(fmOf(fake, 'Fitness/package/PULL A.md')).toMatchObject({
			order: 0,
		});
		expect(fmOf(fake, 'Fitness/package/LEGS.md')).toMatchObject({
			order: 1,
		});
	});

	it('ほかの端末の変更（Sync）・ノートの複製・ファイル名の変更を読み直す', async () => {
		const { fake, store, packages, owner } = await setup();
		await packages.ensureLoaded();
		packages.registerVaultEvents(owner as unknown as ObsidianComponent);
		vi.useFakeTimers();
		// 別の端末でセット数を変えた
		fake.vault.externalWrite(
			'Fitness/package/PULL A.md',
			fake.vault
				.text('Fitness/package/PULL A.md')!
				.replace('sets: 3', 'sets: 5'),
		);
		await vi.advanceTimersByTimeAsync(300);
		expect(store.current.packages[1]?.items[0]?.targetSets).toBe(5);
		// 別の端末で作ったパッケージが届いた
		await fake.vault.create(
			'Fitness/package/LEGS.md',
			'---\nfitness_id: pk_legs\ntags: [fitness-package]\norder: 2\nexercises:\n  - name: ディップス\n    id: ex_d\n    sets: 1\n    reps: 8\n---\n',
		);
		await vi.advanceTimersByTimeAsync(300);
		expect(store.current.packages.map((p) => p.name)).toEqual([
			'PUSH A',
			'PULL A',
			'LEGS',
		]);
		expect(store.current.packages[2]?.items[0]?.targetReps).toBe('8');
		// ノートを複製した: 複製には新しい id
		await fake.vault.create(
			'Fitness/package/LEGS のコピー.md',
			fake.vault.text('Fitness/package/LEGS.md')!,
		);
		await vi.advanceTimersByTimeAsync(300);
		const copy = fmOf(fake, 'Fitness/package/LEGS のコピー.md');
		expect(copy.fitness_id).not.toBe('pk_legs');
		await vi.advanceTimersByTimeAsync(300);
		expect(new Set(store.current.packages.map((p) => p.id)).size).toBe(4);
		// Obsidian でファイル名を変えた: 名前が変わり、旧名は別名に残る（ノートにも書き戻す）
		await fake.vault.rename(
			fake.vault.getFileByPath('Fitness/package/PULL A.md')!,
			'Fitness/package/PULL B.md',
		);
		await vi.advanceTimersByTimeAsync(300);
		const pull = store.current.packages.find((p) => p.id === 'pk_pull');
		expect(pull).toMatchObject({ name: 'PULL B', aliases: ['PULL A'] });
		expect(fmOf(fake, 'Fitness/package/PULL B.md').aliases).toEqual([
			'PULL A',
		]);
		// 別の端末で消した
		fake.vault.externalDelete('Fitness/package/LEGS.md');
		await vi.advanceTimersByTimeAsync(300);
		expect(store.current.packages.some((p) => p.id === 'pk_legs')).toBe(
			false,
		);
	});

	it('スマホの状態: 端末で別に作った種目の id を指す data.json のパッケージは、PC が書いた正しいノートに負ける', async () => {
		const { fake, packages: pc } = await setup();
		await pc.ensureLoaded();
		const phoneData = legacy({
			packages: [
				{
					...pushA,
					id: 'pk_phone',
					items: [
						{
							exerciseId: 'ex_phone',
							targetSets: 2,
							targetReps: '6-9',
						},
					],
				},
			],
			routines: [],
			activeSet: {
				date: '2026-10-14',
				packageId: 'pk_phone',
				exerciseId: 'ex_y',
				setIndex: 1,
				startedAt: NOW,
			},
		});
		const phone = await device(fake, phoneData);
		expect(await phone.packages.ensureLoaded()).toBe(0);
		expect(phone.store.current.packages.map((p) => p.id)).toEqual([
			'pk_push',
			'pk_pull',
		]);
		expect(
			phone.store.current.packages[0]?.items.map((i) => i.exerciseId),
		).toEqual(['ex_y', 'ex_d']);
		expect(phone.store.current.routines).toEqual([routine]);
		expect(phone.store.current.activeSet?.packageId).toBe('pk_push');
	});

	it('スマホが先に移しても、後から PC が種目の繋がる方で置き換える', async () => {
		const fake = createFakeApp();
		await writeExercise(fake, 'ケーブルYレイズ', 'ex_y');
		await writeExercise(fake, 'ディップス', 'ex_d');
		const phone = await device(
			fake,
			legacy({
				packages: [
					{
						...pushA,
						id: 'pk_phone',
						items: [
							{
								exerciseId: 'ex_phone',
								targetSets: 2,
								targetReps: '6-9',
							},
						],
					},
				],
				routines: [],
			}),
		);
		await phone.packages.ensureLoaded();
		expect(fmOf(fake, 'Fitness/package/PUSH A.md').fitness_id).toBe(
			'pk_phone',
		);
		const pc = await device(fake, legacy());
		expect(await pc.packages.ensureLoaded()).toBe(2);
		const fm = fmOf(fake, 'Fitness/package/PUSH A.md');
		expect(fm.fitness_id).toBe('pk_phone');
		expect(
			(fm.exercises as Array<{ id: string }>).map((e) => e.id),
		).toEqual(['ex_y', 'ex_d']);
		expect(pc.store.current.packages[0]?.id).toBe('pk_phone');
	});

	it('種目の id が見つからないときは名前で繋ぎ直す（ノートには正しい id を書き戻す）', async () => {
		const { fake } = await setup();
		await ensureFolder(fake, 'Fitness/package');
		await fake.vault.create(
			'Fitness/package/PUSH A.md',
			'---\nfitness_id: pk_push\ntags: [fitness-package]\norder: 0\nexercises:\n  - name: ディップス\n    id: ex_other_device\n    sets: 2\n    reps: 4-8\n---\n',
		);
		const next = await device(
			fake,
			legacy({
				migrations: [PACKAGES_IN_VAULT],
				packages: [],
				routines: [],
			}),
		);
		await next.packages.ensureLoaded();
		expect(next.store.current.packages[0]?.items[0]?.exerciseId).toBe(
			'ex_d',
		);
		await next.store.update(() => undefined);
		expect(
			(
				fmOf(fake, 'Fitness/package/PUSH A.md').exercises as Array<{
					id: string;
				}>
			)[0]?.id,
		).toBe('ex_d');
	});

	it('移せなかったら（同じ名前の別のノートがある）data.json のまま。次の起動でもう一度', async () => {
		const { fake, plugin, store, packages } = await setup();
		await ensureFolder(fake, 'Fitness/package');
		await fake.vault.create('Fitness/package/PULL A.md', '自分のノート');
		await expect(packages.ensureLoaded()).rejects.toThrow('既にあります');
		expect(store.packagesInVault).toBe(false);
		expect(store.current.packages.map((p) => p.id)).toEqual([
			'pk_push',
			'pk_pull',
		]);
		const saved = (await plugin.loadData()) as Record<string, unknown>;
		expect(saved.packages).toHaveLength(2);
		expect(fake.vault.text('Fitness/package/PULL A.md')).toBe(
			'自分のノート',
		);
	});

	it('保存先の設定を変えても、今あるノートは勝手に移さない（移すかは別に聞く）。新しいパッケージは新しい保存先に', async () => {
		const { fake, store, packages } = await setup();
		await packages.ensureLoaded();
		await store.update((d) => {
			d.settings.packageFolder = 'Fitness/menu';
			const pkg = d.packages.find((p) => p.id === 'pk_pull')!;
			pkg.items[0]!.targetSets = 4;
		});
		expect(fake.vault.getFolderByPath('Fitness/menu')).toBeNull();
		expect(fmOf(fake, 'Fitness/package/PULL A.md')).toMatchObject({
			fitness_id: 'pk_pull',
		});
		expect(
			(
				fmOf(fake, 'Fitness/package/PULL A.md').exercises as Array<{
					sets: number;
				}>
			)[0]?.sets,
		).toBe(4);
		await store.update((d) => {
			createPackage(d, 'LEGS', NOW);
		});
		expect(fmOf(fake, 'Fitness/menu/LEGS.md')).toMatchObject({
			exercises: [],
		});
	});

	it('種目の名前を変えたら、パッケージノートの種目名も直す', async () => {
		const { fake, library, packages, owner } = await setup();
		await packages.ensureLoaded();
		library.registerVaultEvents(owner as unknown as ObsidianComponent);
		packages.registerVaultEvents(owner as unknown as ObsidianComponent);
		vi.useFakeTimers();
		await library.update('ex_d', { name: 'ディップス（加重）' });
		await vi.advanceTimersByTimeAsync(1000);
		const names = (
			fmOf(fake, 'Fitness/package/PULL A.md').exercises as Array<{
				name: string;
			}>
		).map((e) => e.name);
		expect(names).toEqual(['ディップス（加重）']);
	});
});
