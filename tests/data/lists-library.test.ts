import { describe, expect, it } from 'vitest';
import type { Component as ObsidianComponent } from 'obsidian';
import { DataStore } from '../../src/data/data-store';
import { ExerciseLibrary } from '../../src/data/exercise-library';
import { ListsLibrary } from '../../src/data/lists-library';
import { defaultLists } from '../../src/lib/model/lists';
import { Component, Plugin } from '../__mocks__/obsidian';
import { createFakeApp, FakeFileManager } from '../helpers/fake-app';

const folder = 'Fitness/exercise';
const notePath = 'Fitness/Fitness Log 設定.md';

async function setup() {
	const fake = createFakeApp();
	const store = new DataStore(new Plugin());
	await store.load();
	await fake.vault.createFolder('Fitness');
	await fake.vault.createFolder(folder);
	const note = (name: string, fm: string) =>
		fake.vault.create(`${folder}/${name}.md`, `---\n${fm}\n---\n`);
	await note('サイドレイズ', 'fitness_id: ex_s\ncategory: プッシュ');
	await note('ラン', 'fitness_id: ex_r\nrecord_type: distance-duration');
	const library = new ExerciseLibrary(fake.app, store);
	await library.ensureLoaded();
	const lists = new ListsLibrary(fake.app, store, library);
	return { fake, store, library, lists };
}

describe('ListsLibrary', () => {
	it('設定ノートが無ければ既定。最初に足したときに種目フォルダの隣にノートを作る', async () => {
		const { fake, store, lists } = await setup();
		await lists.ensureLoaded();
		expect(store.lists).toEqual(defaultLists());
		expect(fake.vault.text(notePath)).toBeUndefined();
		expect(await lists.addName('categories', ' 胸 ')).toBe('胸');
		const fm = FakeFileManager.read(fake.vault.text(notePath));
		expect(fm.tags).toEqual(['fitness-settings']);
		expect(fm.categories).toContain('胸');
		expect(store.lists.categories).toContain('胸');
	});

	it('カテゴリの名前を変える・消すと、その種目のノートも書き直す', async () => {
		const { fake, store, lists } = await setup();
		await lists.ensureLoaded();
		await lists.rename('categories', 0, '押す');
		const path = `${folder}/サイドレイズ.md`;
		expect(FakeFileManager.read(fake.vault.text(path)).category).toBe(
			'押す',
		);
		expect(lists.usage('categories', 0)).toBe(1);
		await lists.remove('categories', 0);
		expect(FakeFileManager.read(fake.vault.text(path))).not.toHaveProperty(
			'category',
		);
		expect(
			store.current.exercises.find((e) => e.id === 'ex_s')?.category,
		).toBe('');
	});

	it('記録のしかたを消すと、使っていた種目は一覧の先頭の記録のしかたになる', async () => {
		const { fake, lists } = await setup();
		await lists.ensureLoaded();
		const index = lists.lists.recordTypes.findIndex(
			(r) => r.type === 'distance-duration',
		);
		await lists.remove('recordTypes', index);
		expect(
			FakeFileManager.read(fake.vault.text(`${folder}/ラン.md`))
				.record_type,
		).toBe('weight-reps');
	});

	it('ほかの端末で作った設定ノートを読み、変更（Sync）も読み直す', async () => {
		const { fake, store, lists } = await setup();
		await fake.vault.create(
			notePath,
			'---\ntags: [fitness-settings]\ncategories: [胸, 背中]\n---\n',
		);
		await lists.ensureLoaded();
		lists.registerVaultEvents(
			new Component() as unknown as ObsidianComponent,
		);
		expect(store.lists.categories).toEqual(['胸', '背中']);
		const file = fake.vault.getFileByPath(notePath);
		if (!file) throw new Error('note');
		fake.vault.externalWrite(
			notePath,
			'---\ntags: [fitness-settings]\ncategories: [肩]\n---\n',
		);
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(store.lists.categories).toEqual(['肩']);
	});
});
