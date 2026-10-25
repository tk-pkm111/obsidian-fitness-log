import { describe, expect, it } from 'vitest';
import type { Component as ObsidianComponent } from 'obsidian';
import { BodyLibrary } from '../../src/data/body-library';
import { DataStore } from '../../src/data/data-store';
import { findNotePaths } from '../../src/data/folders';
import { Component, Plugin } from '../__mocks__/obsidian';
import { createFakeApp, FakeFileManager } from '../helpers/fake-app';

const folder = 'Fitness/body-composition';

async function setup() {
	const fake = createFakeApp();
	const store = new DataStore(new Plugin());
	await store.load();
	await fake.vault.createFolder('Fitness');
	await fake.vault.createFolder(folder);
	const note = (name: string, text: string) =>
		fake.vault.create(`${folder}/${name}.md`, text);
	await note(
		'2026-10-15',
		'---\n時刻: "07:02"\n体重: 66.7\n体脂肪率: 18.9\n---\n',
	);
	await note(
		'2026-10-22',
		'---\n体重: 66.7\n体脂肪率: 18.5\n左腕 筋肉量: 2.9\n体幹部 筋肉量評価: 標準\n---\n朝に測った\n',
	);
	// 自動取得が書く一覧のノート（日付の名前ではない）は読まない
	await note('TANITA FIT', '---\n体重: 1\n---\n| 項目 | 値 |\n');
	const body = new BodyLibrary(fake.app, store);
	return { fake, store, body };
}

describe('BodyLibrary', () => {
	it('保存先の日付の名前のノートだけを、日付の順に読む（数字の値だけ）', async () => {
		const { body } = await setup();
		expect(body.isLoaded).toBe(false);
		body.ensureLoaded();
		expect(body.all.map((m) => m.date)).toEqual([
			'2026-10-15',
			'2026-10-22',
		]);
		expect(body.all[1]?.values).toEqual({
			体重: 66.7,
			体脂肪率: 18.5,
			'左腕 筋肉量': 2.9,
		});
		expect(body.all[0]?.time).toBe('07:02');
	});

	it('新しい日はノートを作り、同じ日は入れた項目だけを書き換える（本文は残す）', async () => {
		const { fake, body } = await setup();
		body.ensureLoaded();
		await body.record('2026-10-25', '14:30', { 体重: 67.1 });
		const created = fake.vault.text(`${folder}/2026-10-25.md`);
		expect(FakeFileManager.read(created)).toEqual({
			時刻: '14:30',
			体重: 67.1,
		});
		expect(body.all.map((m) => m.date)).toContain('2026-10-25');

		await body.record('2026-10-22', null, { 体重: 66.4 });
		const text = fake.vault.text(`${folder}/2026-10-22.md`) ?? '';
		expect(FakeFileManager.read(text)).toMatchObject({
			体重: 66.4,
			体脂肪率: 18.5,
			'体幹部 筋肉量評価': '標準',
		});
		expect(text).toContain('朝に測った');
		expect(body.all.find((m) => m.date === '2026-10-22')?.values.体重).toBe(
			66.4,
		);
	});

	it('保存先のフォルダが無ければ作る', async () => {
		const fake = createFakeApp();
		const store = new DataStore(new Plugin());
		await store.load();
		const body = new BodyLibrary(fake.app, store);
		await body.record('2026-10-25', null, { 体重: 60 });
		expect(fake.vault.getFolderByPath(folder)).not.toBeNull();
		expect(body.all).toHaveLength(1);
	});

	it('ノートを外から変えたら読み直す（読んでいないあいだは何もしない）', async () => {
		const { fake, body } = await setup();
		body.registerVaultEvents(
			new Component() as unknown as ObsidianComponent,
		);
		let changes = 0;
		body.onChange(() => changes++);
		fake.vault.externalWrite(
			`${folder}/2026-10-15.md`,
			'---\n体重: 60\n---\n',
		);
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(changes).toBe(0);
		expect(body.isLoaded).toBe(false);

		body.ensureLoaded();
		changes = 0;
		fake.vault.externalWrite(
			`${folder}/2026-10-15.md`,
			'---\n体重: 61\n---\n',
		);
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(changes).toBe(1);
		expect(body.all[0]?.values).toEqual({ 体重: 61 });
	});

	it('保存先の確かめでは、日付の名前で数字の項目のあるノートだけを体組成と数える', async () => {
		const { fake } = await setup();
		await fake.vault.createFolder('Fitness/log');
		await fake.vault.create(
			'Fitness/log/2026-10-22.md',
			'---\ntags: [fitness-log]\nsets: 12\n---\n',
		);
		expect(findNotePaths(fake.app, 'bodyFolder').sort()).toEqual([
			`${folder}/2026-10-15.md`,
			`${folder}/2026-10-22.md`,
		]);
	});
});
