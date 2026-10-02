import { describe, expect, it, vi } from 'vitest';
import { DataStore } from '../../src/data/data-store';
import { DEFAULT_SETTINGS } from '../../src/lib/model/data';
import { Plugin } from '../__mocks__/obsidian';

describe('DataStore', () => {
	it('読み込み時に正規化し、ログフォルダのパスを揃える', async () => {
		const plugin = new Plugin();
		await plugin.saveData({ logFolder: '/Training//Logs/' });
		const store = new DataStore(plugin);
		await store.load();
		expect(store.settings).toEqual({
			...DEFAULT_SETTINGS,
			logFolder: 'Training/Logs',
		});
	});

	it('最初の設定: data.json が無ければ保存先を聞く。以前の版（seededAt あり）・済み（setupAt）なら聞かない', async () => {
		const fresh = new DataStore(new Plugin());
		await fresh.load();
		expect(fresh.needsSetup).toBe(true);
		await fresh.update((d) => {
			d.setupAt = '2026-10-02T00:00:00.000Z';
		});
		expect(fresh.needsSetup).toBe(false);

		const old = new Plugin();
		await old.saveData({ seededAt: '2026-10-01T00:00:00.000Z' });
		const existing = new DataStore(old);
		await existing.load();
		expect(existing.needsSetup).toBe(false);

		const done = new Plugin();
		await done.saveData({ setupAt: '2026-10-02T00:00:00.000Z' });
		const reloaded = new DataStore(done);
		await reloaded.load();
		expect(reloaded.needsSetup).toBe(false);
	});

	it('update は保存して change を発火する', async () => {
		const plugin = new Plugin();
		const store = new DataStore(plugin);
		await store.load();
		const changed = vi.fn();
		store.onChange(changed);
		await store.update((data) => {
			data.settings.weightStep = 5;
		});
		expect(changed).toHaveBeenCalledTimes(1);
		expect(await plugin.loadData()).toMatchObject({
			settings: { weightStep: 5 },
		});
	});

	it('種目は data.json に保存しない（ノートが正）。以前の版の一覧はノートへ移すまで残す', async () => {
		const plugin = new Plugin();
		const legacy = [
			{
				id: 'ex_old',
				name: 'ベンチ',
				category: 'push',
				recordType: 'weight-reps',
				aliases: [],
				createdAt: '',
			},
		];
		await plugin.saveData({ exercises: legacy, packages: [] });
		const store = new DataStore(plugin);
		await store.load();
		expect(store.current.exercises).toEqual([]);
		await store.update(() => undefined);
		expect(
			(await plugin.loadData()) as { exercises?: unknown[] },
		).toMatchObject({ exercises: legacy });
		expect(store.takeLegacyExercises().map((e) => e.id)).toEqual([
			'ex_old',
		]);
		store.setExercises([
			{
				id: 'ex_new',
				name: 'X',
				category: 'other',
				recordType: 'weight-reps',
				aliases: [],
				createdAt: '',
			},
		]);
		await store.update(() => undefined);
		expect(await plugin.loadData()).not.toHaveProperty('exercises');
		expect(store.current.exercises.map((e) => e.id)).toEqual(['ex_new']);
	});

	it('reload は外部変更を読み直して change を発火する', async () => {
		const plugin = new Plugin();
		const store = new DataStore(plugin);
		await store.load();
		await plugin.saveData({ settings: { weightUnit: 'lb' } });
		const changed = vi.fn();
		store.onChange(changed);
		await store.reload();
		expect(store.settings.weightUnit).toBe('lb');
		expect(changed).toHaveBeenCalledTimes(1);
	});
});

describe('DataStore（レビューで見つかった不具合の再発防止）', () => {
	it('data.json に年の無いノート名の形式が入っていたら既定に戻す（別の年の記録が混ざるため）', async () => {
		const plugin = new Plugin();
		await plugin.saveData({ settings: { fileNameFormat: 'MM-DD' } });
		const store = new DataStore(plugin);
		await store.load();
		expect(store.settings.fileNameFormat).toBe('YYYY-MM-DD');
	});
});
