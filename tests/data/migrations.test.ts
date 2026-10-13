import { describe, expect, it } from 'vitest';
import { DataStore } from '../../src/data/data-store';
import {
	ENGLISH_FOLDER_MIGRATION,
	folderRenameMessage,
	LOG_FOLDER_MIGRATION,
	migrateFolderNames,
	migrateLogFolder,
} from '../../src/data/migrations';
import { BLOCK_START } from '../../src/lib/log/markdown';
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

describe('migrateLogFolder（日ノートを Fitness/log/ へ）', () => {
	it('以前の既定（Fitness）なら日付の名前のノートだけを移し、設定を変える。2 回目は何もしない', async () => {
		const { fake, store, plugin } = await setup({
			settings: { logFolder: 'Fitness' },
		});
		await fake.vault.createFolder('Fitness/exercise');
		await fake.vault.create('Fitness/2026-09-30.md', '9/30');
		await fake.vault.create('Fitness/2026-10-01.md', '10/1');
		await fake.vault.create('Fitness/メモ.md', '自分のノート');
		await fake.vault.create('Fitness/exercise/ディップス.md', '種目');

		expect(await migrateLogFolder(fake.app, store)).toBe(2);
		expect(fake.vault.text('Fitness/log/2026-09-30.md')).toBe('9/30');
		expect(fake.vault.text('Fitness/log/2026-10-01.md')).toBe('10/1');
		expect(fake.vault.getFileByPath('Fitness/2026-10-01.md')).toBeNull();
		expect(fake.vault.text('Fitness/メモ.md')).toBe('自分のノート');
		expect(fake.vault.text('Fitness/exercise/ディップス.md')).toBe('種目');
		expect(store.settings.logFolder).toBe('Fitness/log');
		const saved = (await plugin.loadData()) as {
			migrations: string[];
			settings: { logFolder: string };
		};
		expect(saved.migrations).toEqual([LOG_FOLDER_MIGRATION]);
		expect(saved.settings.logFolder).toBe('Fitness/log');

		await fake.vault.create('Fitness/2026-10-02.md', '手で作った');
		expect(await migrateLogFolder(fake.app, store)).toBe(0);
		expect(fake.vault.text('Fitness/2026-10-02.md')).toBe('手で作った');
	});

	it('移動先に同じ日のノートがあれば動かさない', async () => {
		const { fake, store } = await setup({
			settings: { logFolder: 'Fitness' },
		});
		await fake.vault.createFolder('Fitness/log');
		await fake.vault.create('Fitness/log/2026-10-01.md', '新');
		await fake.vault.create('Fitness/2026-10-01.md', '旧');
		expect(await migrateLogFolder(fake.app, store)).toBe(0);
		expect(fake.vault.text('Fitness/log/2026-10-01.md')).toBe('新');
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
		expect(store.settings.logFolder).toBe('Fitness/log');
		expect(fake.vault.getFolderByPath('Fitness/log')).toBeNull();
	});
});

/** プラグインが書いた日ノート・種目ノート（移し先が「プラグインのノートだけ」かを見分けるため） */
const dayNote = (label: string) =>
	`---\ntags:\n  - fitness-log\n---\n${BLOCK_START}\n${label}\n%% fitness-log:end %%\n`;
const exerciseNote = (id: string) =>
	`---\nfitness_id: ${id}\ntags:\n  - fitness-exercise\n---\n`;

async function folders(
	fake: Awaited<ReturnType<typeof setup>>['fake'],
	paths: string[],
) {
	for (const path of paths) {
		const parts = path.split('/');
		for (let i = 1; i <= parts.length; i++) {
			const folder = parts.slice(0, i).join('/');
			if (!fake.vault.getFolderByPath(folder))
				await fake.vault.createFolder(folder);
		}
	}
}

describe('migrateFolderNames（保存先の名前を英語に）', () => {
	it('英語の名前のフォルダにノートがあれば、そこへ前のフォルダの中身をまとめ、設定を変える。同じ名前は残す', async () => {
		const { fake, store, plugin } = await setup({
			settings: {
				logFolder: '02_Config/Fitness/ログ',
				exerciseFolder: '02_Config/Fitness/種目',
			},
			migrations: [LOG_FOLDER_MIGRATION],
		});
		await folders(fake, [
			'02_Config/Fitness/log',
			'02_Config/Fitness/ログ',
			'02_Config/Fitness/exercise',
			'02_Config/Fitness/種目',
		]);
		await fake.vault.create(
			'02_Config/Fitness/log/2026-10-01.md',
			dayNote('10/1'),
		);
		await fake.vault.create(
			'02_Config/Fitness/log/2026-10-13.md',
			dayNote('log の 10/13'),
		);
		await fake.vault.create(
			'02_Config/Fitness/ログ/2026-10-12.md',
			dayNote('10/12'),
		);
		await fake.vault.create(
			'02_Config/Fitness/ログ/2026-10-13.md',
			dayNote('ログ の 10/13'),
		);
		await fake.vault.create(
			'02_Config/Fitness/exercise/ディップス.md',
			exerciseNote('ex_d'),
		);
		await fake.vault.create(
			'02_Config/Fitness/種目/ペックフライ.md',
			exerciseNote('ex_p'),
		);

		const results = await migrateFolderNames(fake.app, store);
		expect(results).toEqual([
			{
				key: 'exerciseFolder',
				from: '02_Config/Fitness/種目',
				to: '02_Config/Fitness/exercise',
				moved: 1,
				kept: 0,
			},
			{
				key: 'logFolder',
				from: '02_Config/Fitness/ログ',
				to: '02_Config/Fitness/log',
				moved: 1,
				kept: 1,
			},
		]);
		expect(store.settings.logFolder).toBe('02_Config/Fitness/log');
		expect(store.settings.exerciseFolder).toBe(
			'02_Config/Fitness/exercise',
		);
		expect(fake.vault.text('02_Config/Fitness/log/2026-10-12.md')).toBe(
			dayNote('10/12'),
		);
		// 同じ日のノートは上書きせず、前のフォルダに残す（前のフォルダはゴミ箱に入れない）
		expect(fake.vault.text('02_Config/Fitness/log/2026-10-13.md')).toBe(
			dayNote('log の 10/13'),
		);
		expect(fake.vault.text('02_Config/Fitness/ログ/2026-10-13.md')).toBe(
			dayNote('ログ の 10/13'),
		);
		expect(
			fake.vault.text('02_Config/Fitness/exercise/ペックフライ.md'),
		).toBe(exerciseNote('ex_p'));
		// 空になった前のフォルダはゴミ箱へ
		expect(fake.fileManager.trashed).toEqual(['02_Config/Fitness/種目']);
		expect(fake.vault.getFolderByPath('02_Config/Fitness/種目')).toBeNull();
		const saved = (await plugin.loadData()) as { migrations: string[] };
		expect(saved.migrations).toEqual([
			LOG_FOLDER_MIGRATION,
			ENGLISH_FOLDER_MIGRATION,
		]);
		expect(folderRenameMessage(results)).toBe(
			'保存先のフォルダの名前を英語にしました（種目: 02_Config/Fitness/exercise、記録: 02_Config/Fitness/log）。\n' +
				'記録のノート 1 件は、同じ名前のノートが「02_Config/Fitness/log」にあったので「02_Config/Fitness/ログ」に残しています。開いて見比べてください。',
		);
		// 2 回目は何もしない
		expect(await migrateFolderNames(fake.app, store)).toEqual([]);
	});

	it('英語の名前のフォルダが無ければ中身を移し、ログの Bases ファイルの絞り込みも書き換える', async () => {
		const { fake, store } = await setup({
			settings: {
				logFolder: 'Fitness/ログ',
				exerciseFolder: 'Fitness/種目',
			},
		});
		await folders(fake, ['Fitness/ログ/2026', 'Fitness/種目']);
		await fake.vault.create('Fitness/ログ/2026/10-01.md', dayNote('10/1'));
		await fake.vault.create(
			'Fitness/ログ/トレーニングログ.base',
			'filters:\n  and:\n    - file.hasTag("fitness-log")\n    - file.inFolder("Fitness/ログ")\n',
		);
		await fake.vault.create(
			'Fitness/種目/ディップス.md',
			exerciseNote('ex_d'),
		);

		const results = await migrateFolderNames(fake.app, store);
		expect(results.map((r) => [r.key, r.to, r.moved, r.kept])).toEqual([
			['exerciseFolder', 'Fitness/exercise', 1, 0],
			['logFolder', 'Fitness/log', 2, 0],
		]);
		expect(fake.vault.text('Fitness/log/2026/10-01.md')).toBe(
			dayNote('10/1'),
		);
		expect(fake.vault.text('Fitness/log/トレーニングログ.base')).toContain(
			'file.inFolder("Fitness/log")',
		);
		expect(fake.vault.text('Fitness/exercise/ディップス.md')).toBe(
			exerciseNote('ex_d'),
		);
		expect(fake.vault.getFolderByPath('Fitness/ログ')).toBeNull();
		expect(fake.vault.getFolderByPath('Fitness/種目')).toBeNull();
	});

	it('移し先にプラグインのノートではないノートがあれば、その保存先は変えない', async () => {
		const { fake, store } = await setup({
			settings: {
				logFolder: 'Fitness/ログ',
				exerciseFolder: 'Fitness/種目',
			},
		});
		await folders(fake, [
			'Fitness/種目',
			'Fitness/exercise',
			'Fitness/ログ',
			'Fitness/log',
		]);
		await fake.vault.create(
			'Fitness/種目/ディップス.md',
			exerciseNote('ex_d'),
		);
		await fake.vault.create(
			'Fitness/exercise/筋トレのメモ.md',
			'# 自分のメモ',
		);
		await fake.vault.create('Fitness/log/2026-10-13.md', '自分の日記');

		expect(await migrateFolderNames(fake.app, store)).toEqual([]);
		expect(store.settings.exerciseFolder).toBe('Fitness/種目');
		expect(store.settings.logFolder).toBe('Fitness/ログ');
		expect(fake.vault.text('Fitness/種目/ディップス.md')).toBe(
			exerciseNote('ex_d'),
		);
		expect(store.current.migrations).toContain(ENGLISH_FOLDER_MIGRATION);
	});

	it('自分で付けた名前には触らない。別の端末で先に移していれば設定だけを変える', async () => {
		const { fake, store } = await setup({
			settings: {
				logFolder: 'Journal/筋トレ',
				exerciseFolder: 'Fitness/種目',
			},
		});
		await folders(fake, ['Fitness/exercise']);
		await fake.vault.create(
			'Fitness/exercise/ディップス.md',
			exerciseNote('ex_d'),
		);

		const results = await migrateFolderNames(fake.app, store);
		expect(results).toEqual([
			{
				key: 'exerciseFolder',
				from: 'Fitness/種目',
				to: 'Fitness/exercise',
				moved: 0,
				kept: 0,
			},
		]);
		expect(store.settings.logFolder).toBe('Journal/筋トレ');
		expect(store.settings.exerciseFolder).toBe('Fitness/exercise');
		expect(fake.fileManager.trashed).toEqual([]);
	});
});
