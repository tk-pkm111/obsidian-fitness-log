import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component as ObsidianComponent } from 'obsidian';
import { DataStore } from '../../src/data/data-store';
import { ExerciseLibrary } from '../../src/data/exercise-library';
import type { Exercise } from '../../src/lib/model/types';
import { Component, Plugin } from '../__mocks__/obsidian';
import {
	createFakeApp,
	FakeFileManager,
	type FakeApp,
} from '../helpers/fake-app';

const folder = 'Fitness/種目';

async function setup(raw: unknown = null) {
	const fake = createFakeApp();
	const plugin = new Plugin();
	if (raw) await plugin.saveData(raw);
	const store = new DataStore(plugin);
	await store.load();
	const library = new ExerciseLibrary(fake.app, store);
	const owner = new Component();
	return { fake, plugin, store, library, owner };
}

async function writeNote(
	fake: FakeApp,
	name: string,
	frontmatter: string,
	body = '',
) {
	if (!fake.vault.getFolderByPath('Fitness'))
		await fake.vault.createFolder('Fitness');
	if (!fake.vault.getFolderByPath(folder))
		await fake.vault.createFolder(folder);
	await fake.vault.create(
		`${folder}/${name}.md`,
		`---\n${frontmatter}\n---\n${body}`,
	);
}

describe('ExerciseLibrary', () => {
	afterEach(() => vi.useRealTimers());

	it('種目フォルダのノートを読み、id の無いノートには振る（手で作った種目）', async () => {
		const { fake, store, library } = await setup();
		await writeNote(
			fake,
			'ケーブルYレイズ',
			'fitness_id: ex_y\ncategory: push\nrecord_type: weight-reps\naliases: [Yレイズ]',
			'## フォーム\n肩をすくめない\n',
		);
		await writeNote(fake, '自分の種目', 'category: legs');
		await library.ensureLoaded();
		const names = store.current.exercises.map((e) => e.name).sort();
		expect(names).toEqual(['ケーブルYレイズ', '自分の種目']);
		const mine = store.current.exercises.find(
			(e) => e.name === '自分の種目',
		);
		expect(mine?.id).toMatch(/^ex_/);
		expect(mine?.category).toBe('legs'); // 振ったのは id だけ（ユーザーの値は消さない）
		expect(
			FakeFileManager.read(fake.vault.text(`${folder}/自分の種目.md`)),
		).toMatchObject({ fitness_id: mine?.id, category: 'legs' });
		// 本文には触らない
		expect(fake.vault.text(`${folder}/ケーブルYレイズ.md`)).toContain(
			'## フォーム\n肩をすくめない\n',
		);
	});

	it('複製して id が重なったノートには新しい id を振る', async () => {
		const { fake, store, library } = await setup();
		await writeNote(fake, 'A', 'fitness_id: ex_same');
		await writeNote(fake, 'B', 'fitness_id: ex_same');
		await library.ensureLoaded();
		const ids = store.current.exercises.map((e) => e.id);
		expect(new Set(ids).size).toBe(2);
	});

	it('作成: frontmatter だけのノートを作り、一覧に入る', async () => {
		const { fake, store, library } = await setup();
		await library.ensureLoaded();
		const created = await library.create({
			name: 'S/A ケーブルサイドレイズ',
			category: 'push',
			unilateral: true,
			aliases: ['片手サイド'],
		});
		expect(created.path).toBe(`${folder}/S／A ケーブルサイドレイズ.md`);
		expect(FakeFileManager.read(fake.vault.text(created.path!))).toEqual({
			aliases: ['片手サイド'],
			tags: ['fitness-exercise'],
			fitness_id: created.id,
			category: 'push',
			record_type: 'weight-reps',
			unilateral: true,
			archived: false,
		});
		expect(store.current.exercises.map((e) => e.id)).toEqual([created.id]);
		await expect(
			library.create({ name: 'S/A ケーブルサイドレイズ' }),
		).rejects.toThrow();
	});

	it('変更: frontmatter を書き換え、名前を変えるとノートの名前も変わり旧名が別名に残る', async () => {
		const { fake, store, library } = await setup();
		await library.ensureLoaded();
		const created = await library.create({ name: 'ラットプルダウン' });
		await fake.vault.process(
			fake.vault.getFileByPath(created.path!)!,
			(t) => `${t}\n## コツ\n胸を張る\n`,
		);
		const updated = await library.update(created.id, {
			name: 'ワイドグリップラットプルダウン',
			category: 'pull',
		});
		expect(updated.path).toBe(
			`${folder}/ワイドグリップラットプルダウン.md`,
		);
		expect(fake.vault.getFileByPath(created.path!)).toBeNull();
		const text = fake.vault.text(updated.path!);
		expect(FakeFileManager.read(text)).toMatchObject({
			category: 'pull',
			aliases: ['ラットプルダウン'],
		});
		expect(text).toContain('## コツ\n胸を張る');
		expect(store.current.exercises[0]?.name).toBe(
			'ワイドグリップラットプルダウン',
		);
	});

	it('Obsidian 側の変更（Properties の編集・ファイル名の変更）を反映する', async () => {
		const { fake, store, library, owner } = await setup();
		await library.ensureLoaded();
		library.registerVaultEvents(owner as unknown as ObsidianComponent);
		const created = await library.create({ name: 'ディップス' });
		vi.useFakeTimers();
		const file = fake.vault.getFileByPath(created.path!)!;
		await fake.fileManager.processFrontMatter(file, (fm) => {
			fm.record_type = 'reps';
		});
		await vi.advanceTimersByTimeAsync(300);
		expect(store.current.exercises[0]?.recordType).toBe('reps');
		await fake.fileManager.renameFile(file, `${folder}/加重ディップス.md`);
		await vi.advanceTimersByTimeAsync(300);
		const renamed = store.current.exercises[0] as Exercise;
		expect(renamed).toMatchObject({
			id: created.id,
			name: '加重ディップス',
			aliases: ['ディップス'],
		});
		owner.unload();
	});

	it('削除: ノートはゴミ箱へ、パッケージの項目からも外す。進行中セットの種目は消せない', async () => {
		const { fake, store, library } = await setup();
		await library.ensureLoaded();
		const a = await library.create({ name: 'A' });
		const b = await library.create({ name: 'B' });
		await store.update((d) => {
			d.packages = [
				{
					id: 'pk_1',
					name: 'P',
					aliases: [],
					createdAt: '',
					items: [
						{ exerciseId: a.id, targetSets: 2, targetReps: '8' },
						{ exerciseId: b.id, targetSets: 2, targetReps: '8' },
					],
				},
			];
			d.activeSet = {
				date: '2026-10-01',
				packageId: 'pk_1',
				exerciseId: b.id,
				setIndex: 1,
				startedAt: '2026-10-01T00:00:00Z',
			};
		});
		await library.remove(a.id);
		expect(fake.fileManager.trashed).toEqual([a.path]);
		expect(
			store.current.packages[0]?.items.map((i) => i.exerciseId),
		).toEqual([b.id]);
		expect(store.current.exercises.map((e) => e.id)).toEqual([b.id]);
		await expect(library.remove(b.id)).rejects.toThrow();
	});

	it('初期データ: 種目ノートと PPL のパッケージを作る。2 回目は何も足さない', async () => {
		const { fake, store, library } = await setup();
		const first = await library.seed(new Date('2026-10-01T00:00:00Z'));
		expect(first.addedPackages).toBe(6);
		expect(first.addedExercises).toBe(store.current.exercises.length);
		expect(
			fake.vault.getFileByPath(
				`${folder}/ケーブルベイジアン／インクラインカール.md`,
			),
		).not.toBeNull();
		const ids = new Set(store.current.exercises.map((e) => e.id));
		for (const pkg of store.current.packages)
			for (const item of pkg.items)
				expect(ids.has(item.exerciseId)).toBe(true);
		expect(store.current.seededAt).toBe('2026-10-01T00:00:00.000Z');
		expect(await library.seed()).toEqual({
			addedExercises: 0,
			addedPackages: 0,
		});
	});

	it('以前の版（種目を data.json に保存）からの移行: 同じ id でノートを作り、data.json から消す', async () => {
		const legacy = [
			{
				id: 'ex_old',
				name: 'ケーブルベイジアン/インクラインカール',
				category: 'arms',
				recordType: 'weight-reps',
				aliases: ['ベイジアン'],
				createdAt: '2026-10-01T00:00:00.000Z',
			},
		];
		const { fake, plugin, store, library } = await setup({
			exercises: legacy,
			packages: [
				{
					id: 'pk_1',
					name: 'P',
					items: [
						{
							exerciseId: 'ex_old',
							targetSets: 2,
							targetReps: '8',
						},
					],
				},
			],
		});
		const count = await library.migrateLegacy();
		expect(count).toBe(1);
		const path = `${folder}/ケーブルベイジアン／インクラインカール.md`;
		expect(FakeFileManager.read(fake.vault.text(path))).toMatchObject({
			fitness_id: 'ex_old',
			category: 'arms',
			aliases: ['ベイジアン'],
		});
		expect(store.current.exercises.map((e) => e.id)).toEqual(['ex_old']);
		expect(await plugin.loadData()).not.toHaveProperty('exercises');
		expect(await library.migrateLegacy()).toBe(0);
	});
});
