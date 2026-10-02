import { describe, expect, it } from 'vitest';
import { DataStore } from '../../src/data/data-store';
import {
	LOG_FOLDER_MIGRATION,
	migrateLogFolder,
} from '../../src/data/migrations';
import { Plugin } from '../__mocks__/obsidian';
import { createFakeApp } from '../helpers/fake-app';

async function setup(raw: unknown) {
	const fake = createFakeApp();
	const plugin = new Plugin();
	await plugin.saveData(raw);
	const store = new DataStore(plugin);
	await store.load();
	await fake.vault.createFolder('Fitness');
	return { fake, store, plugin };
}

describe('migrateLogFolder（日ノートを Fitness/ログ/ へ）', () => {
	it('以前の既定（Fitness）なら日付の名前のノートだけを移し、設定を変える。2 回目は何もしない', async () => {
		const { fake, store, plugin } = await setup({
			settings: { logFolder: 'Fitness' },
		});
		await fake.vault.createFolder('Fitness/種目');
		await fake.vault.create('Fitness/2026-09-30.md', '9/30');
		await fake.vault.create('Fitness/2026-10-01.md', '10/1');
		await fake.vault.create('Fitness/メモ.md', '自分のノート');
		await fake.vault.create('Fitness/種目/ディップス.md', '種目');

		expect(await migrateLogFolder(fake.app, store)).toBe(2);
		expect(fake.vault.text('Fitness/ログ/2026-09-30.md')).toBe('9/30');
		expect(fake.vault.text('Fitness/ログ/2026-10-01.md')).toBe('10/1');
		expect(fake.vault.getFileByPath('Fitness/2026-10-01.md')).toBeNull();
		expect(fake.vault.text('Fitness/メモ.md')).toBe('自分のノート');
		expect(fake.vault.text('Fitness/種目/ディップス.md')).toBe('種目');
		expect(store.settings.logFolder).toBe('Fitness/ログ');
		const saved = (await plugin.loadData()) as {
			migrations: string[];
			settings: { logFolder: string };
		};
		expect(saved.migrations).toEqual([LOG_FOLDER_MIGRATION]);
		expect(saved.settings.logFolder).toBe('Fitness/ログ');

		await fake.vault.create('Fitness/2026-10-02.md', '手で作った');
		expect(await migrateLogFolder(fake.app, store)).toBe(0);
		expect(fake.vault.text('Fitness/2026-10-02.md')).toBe('手で作った');
	});

	it('移動先に同じ日のノートがあれば動かさない', async () => {
		const { fake, store } = await setup({
			settings: { logFolder: 'Fitness' },
		});
		await fake.vault.createFolder('Fitness/ログ');
		await fake.vault.create('Fitness/ログ/2026-10-01.md', '新');
		await fake.vault.create('Fitness/2026-10-01.md', '旧');
		expect(await migrateLogFolder(fake.app, store)).toBe(0);
		expect(fake.vault.text('Fitness/ログ/2026-10-01.md')).toBe('新');
		expect(fake.vault.text('Fitness/2026-10-01.md')).toBe('旧');
	});

	it('ユーザーが変えた保存先はそのまま（移行済みの印だけ付ける）', async () => {
		const { fake, store } = await setup({
			settings: { logFolder: 'Journal/筋トレ' },
		});
		await fake.vault.create('Fitness/2026-10-01.md', '旧');
		expect(await migrateLogFolder(fake.app, store)).toBe(0);
		expect(store.settings.logFolder).toBe('Journal/筋トレ');
		expect(fake.vault.text('Fitness/2026-10-01.md')).toBe('旧');
		expect(store.current.migrations).toEqual([LOG_FOLDER_MIGRATION]);
	});

	it('はじめて使う vault では何も動かさない', async () => {
		const { fake, store } = await setup({});
		expect(await migrateLogFolder(fake.app, store)).toBe(0);
		expect(store.settings.logFolder).toBe('Fitness/ログ');
		expect(fake.vault.getFolderByPath('Fitness/ログ')).toBeNull();
	});
});
