import { beforeEach, describe, expect, it } from 'vitest';
import { DataStore } from '../../src/data/data-store';
import { LogIndex } from '../../src/data/log-index';
import { LogParseError, LogRepository } from '../../src/data/log-repository';
import type { Exercise, Package } from '../../src/lib/model/types';
import {
	SessionController,
	SessionError,
} from '../../src/session/session-controller';
import { Plugin } from '../__mocks__/obsidian';
import {
	createFakeApp,
	FakeFileManager,
	type FakeApp,
} from '../helpers/fake-app';

const NOW = '2026-10-01T00:00:00.000Z';
const exercises: Exercise[] = [
	{
		id: 'ex_y',
		name: 'ケーブルYレイズ',
		category: 'push',
		recordType: 'weight-reps',
		aliases: [],
		createdAt: NOW,
	},
	{
		id: 'ex_d',
		name: 'ディップス',
		category: 'arms',
		recordType: 'reps',
		aliases: [],
		createdAt: NOW,
	},
];
const pushA: Package = {
	id: 'pk_a',
	name: 'PUSH A',
	aliases: [],
	createdAt: NOW,
	items: [{ exerciseId: 'ex_y', targetSets: 2, targetReps: '6-9' }],
};

describe('SessionController', () => {
	let fake: FakeApp;
	let store: DataStore;
	let index: LogIndex;
	let controller: SessionController;
	let clock: Date;
	const path = 'Fitness/ログ/2026-10-01.md';

	beforeEach(async () => {
		fake = createFakeApp();
		store = new DataStore(new Plugin());
		await store.load();
		await store.update((d) => {
			d.exercises = structuredClone(exercises);
			d.packages = [structuredClone(pushA)];
		});
		const repo = new LogRepository(fake.app, () => store.settings);
		index = new LogIndex(fake.app, repo);
		await index.ensureBuilt();
		clock = new Date(2026, 9, 1, 18, 31, 5);
		controller = new SessionController(store, repo, index, () => clock);
	});

	it('開始 → 終了で日ノートに 1 セット書き、進行中セットを消す', async () => {
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		expect(store.current.activeSet).toMatchObject({
			setIndex: 1,
			weight: 10,
			packageId: 'pk_a',
		});
		clock = new Date(2026, 9, 1, 18, 31, 50);
		await controller.finishSet(9);
		expect(store.current.activeSet).toBeNull();
		const text = fake.vault.text(path)!;
		expect(text).toContain('## PUSH A');
		expect(text).toContain('| 1 | 10 | 9 | 18:31:05 | 18:31:50 | |');
		expect(FakeFileManager.read(text)).toMatchObject({
			sets: 1,
			volume_kg: 90,
		});
		// 索引にも即座に反映される
		expect(
			controller.doneSets(
				'2026-10-01',
				{ packageId: 'pk_a', sessionName: null },
				'ex_y',
			),
		).toHaveLength(1);
	});

	it('2 セット目は setIndex 2。行内で変えた重量で記録する', async () => {
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await controller.finishSet(9);
		const second = await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		expect(second.setIndex).toBe(2);
		await controller.updateActiveWeight(12.5);
		await controller.finishSet(8);
		expect(fake.vault.text(path)).toContain('| 2 | 12.5 | 8 |');
		expect(FakeFileManager.read(fake.vault.text(path))).toMatchObject({
			sets: 2,
			volume_kg: 190,
		});
	});

	it('進行中セットは同時に 1 つ', async () => {
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await expect(
			controller.startSet({
				date: '2026-10-01',
				packageId: null,
				exerciseId: 'ex_d',
				weight: null,
			}),
		).rejects.toBeInstanceOf(SessionError);
	});

	it('取り消しはノートに書かない', async () => {
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await controller.cancelSet();
		expect(store.current.activeSet).toBeNull();
		expect(fake.vault.getFileByPath(path)).toBeNull();
	});

	it('パッケージ外の自重種目は「その他」に重量 - で書く', async () => {
		await controller.startSet({
			date: '2026-10-01',
			packageId: null,
			exerciseId: 'ex_d',
			weight: null,
		});
		await controller.finishSet(8);
		const text = fake.vault.text(path)!;
		expect(text).toContain(
			'## その他\n- 時間: 18:31 – 18:31\n\n### ディップス',
		);
		expect(text).toContain('| 1 | - | 8 |');
	});

	it('ノートが壊れていたら書かずに、進行中セットを残す', async () => {
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await controller.finishSet(9);
		fake.vault.externalWrite(
			path,
			fake.vault.text(path)!.replace('| 1 | 10 |', '| 1 | 重い |'),
		);
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await expect(controller.finishSet(8)).rejects.toBeInstanceOf(
			LogParseError,
		);
		expect(store.current.activeSet).not.toBeNull();
	});

	it('セットの修正・削除・メモ', async () => {
		await controller.addSet(
			'2026-10-01',
			{ packageId: 'pk_a', sessionName: null },
			'ex_y',
			{
				weight: 10,
				reps: 9,
				start: null,
				end: null,
				note: '',
			},
		);
		const address = {
			sessionIndex: 0,
			exerciseIndex: 0,
			sessionName: 'PUSH A',
			exerciseName: 'ケーブルYレイズ',
			setIndex: 0,
		};
		await controller.editSet('2026-10-01', address, {
			reps: 7,
			note: '右肩注意',
		});
		expect(fake.vault.text(path)).toContain(
			'| 1 | 10 | 7 | - | - | 右肩注意 |',
		);
		await controller.setSessionNote(
			'2026-10-01',
			{ packageId: 'pk_a', sessionName: null },
			'調子よし',
		);
		expect(fake.vault.text(path)).toContain('- コメント: 調子よし');
		await controller.deleteSet('2026-10-01', address);
		expect(fake.vault.text(path)).not.toContain('ケーブルYレイズ');
		expect(FakeFileManager.read(fake.vault.text(path))).toMatchObject({
			sets: 0,
		});
	});

	it('パッケージ・種目をその日に追加し、空なら外せる', async () => {
		await controller.addPackageToDay('2026-10-01', 'pk_a');
		await controller.addExerciseToDay(
			'2026-10-01',
			{ packageId: 'pk_a', sessionName: null },
			'ex_d',
		);
		expect(index.day('2026-10-01')?.sessions).toEqual([
			{
				name: 'PUSH A',
				note: '',
				exercises: [{ name: 'ディップス', sets: [] }],
			},
		]);
		await controller.removeSessionFromDay('2026-10-01', {
			packageId: 'pk_a',
			sessionName: null,
		});
		expect(index.day('2026-10-01')?.sessions).toEqual([]);
	});

	it('ルーチンのスキップと取り消し', async () => {
		await store.update((d) => {
			d.routines = [
				{
					id: 'rt_1',
					packageId: 'pk_a',
					rule: { type: 'everyNDays', intervalDays: 1 },
					startDate: '2026-09-01',
					enabled: true,
					skipDates: [],
				},
			];
		});
		await controller.skipRoutine('rt_1', '2026-10-01');
		await controller.skipRoutine('rt_1', '2026-10-01');
		expect(store.current.routines[0]?.skipDates).toEqual(['2026-10-01']);
		await controller.unskipRoutine('rt_1', '2026-10-01');
		expect(store.current.routines[0]?.skipDates).toEqual([]);
	});
});

describe('SessionController（レビューで見つかった不具合の再発防止）', () => {
	it('終了を連打しても 1 セットだけ記録する', async () => {
		const fake = createFakeApp();
		const store = new DataStore(new Plugin());
		await store.load();
		await store.update((d) => {
			d.exercises = structuredClone(exercises);
			d.packages = [structuredClone(pushA)];
		});
		const repo = new LogRepository(fake.app, () => store.settings);
		const index = new LogIndex(fake.app, repo);
		await index.ensureBuilt();
		const controller = new SessionController(store, repo, index);
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await Promise.all([controller.finishSet(9), controller.finishSet(9)]);
		const day = await repo.readDay('2026-10-01');
		expect(day.sessions[0]?.exercises[0]?.sets).toHaveLength(1);
		expect(store.current.activeSet).toBeNull();
	});

	it('開始を連打しても 2 つ目はエラー（進行中は 1 つ）', async () => {
		const fake = createFakeApp();
		const store = new DataStore(new Plugin());
		await store.load();
		await store.update((d) => {
			d.exercises = structuredClone(exercises);
		});
		const repo = new LogRepository(fake.app, () => store.settings);
		const controller = new SessionController(
			store,
			repo,
			new LogIndex(fake.app, repo),
		);
		const params = {
			date: '2026-10-01',
			packageId: null,
			exerciseId: 'ex_y',
			weight: 10,
		};
		const results = await Promise.allSettled([
			controller.startSet(params),
			controller.startSet(params),
		]);
		expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
	});
});

describe('SessionController（筋トレの開始・終了）', () => {
	async function make() {
		const fake = createFakeApp();
		const store = new DataStore(new Plugin());
		await store.load();
		await store.update((d) => {
			d.exercises = structuredClone(exercises);
			d.packages = [
				structuredClone(pushA),
				{ ...structuredClone(pushA), id: 'pk_b', name: 'PULL A' },
			];
		});
		const repo = new LogRepository(fake.app, () => store.settings);
		const index = new LogIndex(fake.app, repo);
		await index.ensureBuilt();
		let clock = new Date(2026, 9, 1, 18, 30, 5);
		const controller = new SessionController(
			store,
			repo,
			index,
			() => clock,
		);
		return { fake, store, controller, setClock: (d: Date) => (clock = d) };
	}

	it('開始で日ノートに開始時刻、終了で終了時刻を書き、時間は開始〜終了', async () => {
		const { fake, controller, setClock } = await make();
		await controller.startSession('2026-10-01', 'pk_a');
		const path = 'Fitness/ログ/2026-10-01.md';
		expect(fake.vault.text(path)).toContain(
			'## PUSH A\n- 時間: 18:30:05 –\n',
		);
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		setClock(new Date(2026, 9, 1, 18, 31, 0));
		await controller.finishSet(9);
		setClock(new Date(2026, 9, 1, 19, 20, 5));
		await controller.endSession('2026-10-01', {
			packageId: 'pk_a',
			sessionName: null,
		});
		const text = fake.vault.text(path)!;
		expect(text).toContain('- 時間: 18:30:05 – 19:20:05');
		expect(FakeFileManager.read(text)).toMatchObject({
			duration_min: 50,
			sets: 1,
		});
	});

	it('筋トレ中に別のパッケージは開始できない。セットが進行中なら終了できない', async () => {
		const { controller } = await make();
		await controller.startSession('2026-10-01', 'pk_a');
		await expect(
			controller.startSession('2026-10-01', 'pk_b'),
		).rejects.toBeInstanceOf(SessionError);
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await expect(
			controller.endSession('2026-10-01', {
				packageId: 'pk_a',
				sessionName: null,
			}),
		).rejects.toBeInstanceOf(SessionError);
		await controller.finishSet(8);
		await controller.endSession('2026-10-01', {
			packageId: 'pk_a',
			sessionName: null,
		});
		await expect(
			controller.startSession('2026-10-01', 'pk_b'),
		).resolves.toBeDefined();
	});

	it('再開すると終了時刻が消えて筋トレ中に戻る', async () => {
		const { fake, controller } = await make();
		await controller.startSession('2026-10-01', 'pk_a');
		await controller.endSession('2026-10-01', {
			packageId: 'pk_a',
			sessionName: null,
		});
		await controller.resumeSession('2026-10-01', {
			packageId: 'pk_a',
			sessionName: null,
		});
		expect(fake.vault.text('Fitness/ログ/2026-10-01.md')).toContain(
			'- 時間: 18:30:05 –\n',
		);
	});

	it('再開は今日だけ。日が変わってから終えると最後のセットの終了で終える', async () => {
		const { fake, store, controller, setClock } = await make();
		const ref = { packageId: 'pk_a', sessionName: null };
		await controller.startSession('2026-10-01', 'pk_a');
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		setClock(new Date(2026, 9, 1, 18, 31, 0));
		await controller.finishSet(9);
		// 翌日
		setClock(new Date(2026, 9, 2, 9, 0, 0));
		await controller.endSession('2026-10-01', ref);
		const path = 'Fitness/ログ/2026-10-01.md';
		expect(fake.vault.text(path)).toContain('- 時間: 18:30:05 – 18:31:00');
		await expect(
			controller.resumeSession('2026-10-01', ref),
		).rejects.toBeInstanceOf(SessionError);
		// 今日の並び（その日だけ）
		await controller.reorderDay('2026-10-02', 'pkg:pk_a', ['ex:b', 'ex:a']);
		expect(store.current.dayOrders).toEqual({
			'2026-10-02 pkg:pk_a': ['ex:b', 'ex:a'],
		});
	});
});
