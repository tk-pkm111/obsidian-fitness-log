import { beforeEach, describe, expect, it } from 'vitest';
import { DataStore } from '../../src/data/data-store';
import { LogIndex } from '../../src/data/log-index';
import { LogParseError, LogRepository } from '../../src/data/log-repository';
import type { Exercise, Package } from '../../src/lib/model/types';
import {
	OTHER_SESSION,
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
	const path = 'Fitness/log/2026-10-01.md';

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
		const ref = { packageId: 'pk_a', sessionName: null };
		await controller.addSessionNote('2026-10-01', ref, '調子よし');
		await controller.addSessionNote('2026-10-01', ref, '右肩に注意');
		expect(fake.vault.text(path)).toContain(
			'- コメント: 調子よし\n- コメント: 右肩に注意',
		);
		await controller.editSessionNote('2026-10-01', ref, 0, '調子よし', '');
		expect(fake.vault.text(path)).not.toContain('調子よし');
		await expect(
			controller.editSessionNote('2026-10-01', ref, 0, '調子よし', 'x'),
		).rejects.toThrow();
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
				notes: [],
				exercises: [{ name: 'ディップス', sets: [] }],
			},
		]);
		await controller.removeSessionFromDay('2026-10-01', {
			packageId: 'pk_a',
			sessionName: null,
		});
		expect(index.day('2026-10-01')?.sessions).toEqual([]);
	});

	it('まだやっていない種目をその日から外す（ノートの空の欄を消し、パッケージの種目は覚える）。「種目を追加」で戻る', async () => {
		const ref = { packageId: 'pk_a', sessionName: null };
		await controller.addPackageToDay('2026-10-01', 'pk_a');
		await controller.addExerciseToDay('2026-10-01', ref, 'ex_d');
		// パッケージに無い種目（ノートの空の欄だけ）: 欄を消す
		await controller.removeExerciseFromDay('2026-10-01', ref, 'ex_d');
		expect(index.day('2026-10-01')?.sessions[0]?.exercises).toEqual([]);
		expect(store.current.dayRemoved).toEqual({
			'2026-10-01 pkg:pk_a': ['ex:ex_d'],
		});
		// パッケージの種目（ノートに無い）: data.json に覚えるだけ
		await controller.removeExerciseFromDay('2026-10-01', ref, 'ex_y');
		expect(store.current.dayRemoved).toEqual({
			'2026-10-01 pkg:pk_a': ['ex:ex_d', 'ex:ex_y'],
		});
		expect(index.day('2026-10-01')?.sessions[0]?.exercises).toEqual([]);
		// 「種目を追加」で戻す
		await controller.addExerciseToDay('2026-10-01', ref, 'ex_y');
		expect(store.current.dayRemoved).toEqual({
			'2026-10-01 pkg:pk_a': ['ex:ex_d'],
		});
		expect(
			index.day('2026-10-01')?.sessions[0]?.exercises.map((e) => e.name),
		).toEqual(['ケーブルYレイズ']);
	});

	it('単発の種目の最後の 1 つを外すと、空になった見出しも消える（コメントがあれば残す）', async () => {
		await controller.addExerciseToDay('2026-10-01', OTHER_SESSION, 'ex_d');
		await controller.addExerciseToDay('2026-10-01', OTHER_SESSION, 'ex_y');
		await controller.removeExerciseFromDay(
			'2026-10-01',
			OTHER_SESSION,
			'ex_d',
		);
		expect(
			index
				.day('2026-10-01')
				?.sessions.map((s) => s.exercises.map((e) => e.name)),
		).toEqual([['ケーブルYレイズ']]);
		await controller.removeExerciseFromDay(
			'2026-10-01',
			OTHER_SESSION,
			'ex_y',
		);
		expect(index.day('2026-10-01')?.sessions).toEqual([]);

		await controller.addExerciseToDay('2026-10-01', OTHER_SESSION, 'ex_d');
		await controller.addSessionNote(
			'2026-10-01',
			OTHER_SESSION,
			'混んでいた',
		);
		await controller.removeExerciseFromDay(
			'2026-10-01',
			OTHER_SESSION,
			'ex_d',
		);
		expect(index.day('2026-10-01')?.sessions).toEqual([
			{ name: null, notes: ['混んでいた'], exercises: [] },
		]);
	});

	it('記録のある種目・進行中のセットの種目は外せない', async () => {
		const ref = { packageId: 'pk_a', sessionName: null };
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await expect(
			controller.removeExerciseFromDay('2026-10-01', ref, 'ex_y'),
		).rejects.toBeInstanceOf(SessionError);
		await controller.finishSet(8);
		await expect(
			controller.removeExerciseFromDay('2026-10-01', ref, 'ex_y'),
		).rejects.toBeInstanceOf(SessionError);
		expect(store.current.dayRemoved).toBeUndefined();
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
		return {
			fake,
			store,
			index,
			controller,
			setClock: (d: Date) => (clock = d),
		};
	}

	it('開始で日ノートに開始時刻、終了で終了時刻を書き、時間は開始〜終了', async () => {
		const { fake, controller, setClock } = await make();
		await controller.startSession('2026-10-01', 'pk_a');
		const path = 'Fitness/log/2026-10-01.md';
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
		await controller.endDay('2026-10-01');
		const text = fake.vault.text(path)!;
		expect(text).toContain('- 時間: 18:30:05 – 19:20:05');
		expect(FakeFileManager.read(text)).toMatchObject({
			duration_min: 50,
			sets: 1,
		});
	});

	it('筋トレ中でも別のパッケージを始められ、「筋トレを終了」でまとめて終える。セットが進行中なら終了できない', async () => {
		const { fake, controller, setClock } = await make();
		const path = 'Fitness/log/2026-10-01.md';
		await controller.startSession('2026-10-01', 'pk_a');
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		setClock(new Date(2026, 9, 1, 18, 31, 0));
		await controller.finishSet(8);
		await controller.startSession('2026-10-01', 'pk_b');
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_b',
			exerciseId: 'ex_d',
			weight: null,
		});
		await expect(controller.endDay('2026-10-01')).rejects.toBeInstanceOf(
			SessionError,
		);
		setClock(new Date(2026, 9, 1, 18, 40, 0));
		await controller.finishSet(10);
		setClock(new Date(2026, 9, 1, 18, 45, 0));
		await controller.endDay('2026-10-01');
		const text = fake.vault.text(path)!;
		// 先のパッケージは最後のセットの終了、最後にやったパッケージは押した時刻
		expect(text).toContain('## PUSH A\n- 時間: 18:30:05 – 18:31:00\n');
		expect(text).toContain('## PULL A\n- 時間: 18:31:00 – 18:45:00\n');
	});

	it('「筋トレを再開」でまとめて筋トレ中に戻る', async () => {
		const { fake, controller } = await make();
		await controller.startSession('2026-10-01', 'pk_a');
		await controller.endDay('2026-10-01');
		await controller.resumeDay('2026-10-01');
		expect(fake.vault.text('Fitness/log/2026-10-01.md')).toContain(
			'- 時間: 18:30:05 –\n',
		);
		await expect(controller.resumeDay('2026-10-01')).rejects.toThrow();
	});

	const routine = (packageId: string) => ({
		id: `rt_${packageId}`,
		packageId,
		rule: { type: 'everyNDays' as const, intervalDays: 1 },
		startDate: '2026-09-01',
		enabled: true,
		skipDates: [] as string[],
	});

	it('筋トレ中でもパッケージを外せる（記録ごと消し、進行中のセットは取り消し、ルーチンの予定はその日スキップ）', async () => {
		const { fake, store, controller } = await make();
		const ref = { packageId: 'pk_a', sessionName: 'PUSH A' };
		await store.update((d) => {
			d.routines = [routine('pk_a')];
			d.dayOrders = { '2026-10-01 pkg:pk_a': ['ex:ex_y'] };
		});
		await controller.startSession('2026-10-01', 'pk_a');
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await controller.finishSet(9);
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await controller.removeSessionFromDay('2026-10-01', ref);
		expect(fake.vault.text('Fitness/log/2026-10-01.md')).not.toContain(
			'PUSH A',
		);
		expect(store.current.activeSet).toBeNull();
		expect(store.current.routines[0]?.skipDates).toEqual(['2026-10-01']);
		expect(store.current.dayOrders).toBeUndefined();
	});

	it('別のパッケージに変える: 記録・開始時刻はそのまま、進行中のセットも移る。もうその日にあるパッケージには変えない', async () => {
		const { fake, store, controller } = await make();
		const ref = { packageId: 'pk_a', sessionName: 'PUSH A' };
		await store.update((d) => {
			d.routines = [routine('pk_a')];
			d.dayRemoved = { '2026-10-01 pkg:pk_a': ['ex:ex_d'] };
		});
		await controller.startSession('2026-10-01', 'pk_a');
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await controller.finishSet(9);
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await controller.changeSessionPackage('2026-10-01', ref, 'pk_b');
		const text = fake.vault.text('Fitness/log/2026-10-01.md')!;
		expect(text).toContain('## PULL A\n- 時間: 18:30:05 –\n');
		expect(text).not.toContain('PUSH A');
		expect(text).toContain('ケーブルYレイズ');
		expect(store.current.activeSet).toMatchObject({ packageId: 'pk_b' });
		// 元のパッケージのルーチンはその日スキップ（変えたのに予定として出ない）
		expect(store.current.routines[0]?.skipDates).toEqual(['2026-10-01']);
		expect(store.current.dayRemoved).toEqual({
			'2026-10-01 pkg:pk_b': ['ex:ex_d'],
		});
		// 進行中のセットは新しいパッケージのセットとして書く
		await controller.finishSet(8);
		expect(
			controller.doneSets(
				'2026-10-01',
				{ packageId: 'pk_b', sessionName: null },
				'ex_y',
			),
		).toHaveLength(2);
		await controller.addPackageToDay('2026-10-01', 'pk_a');
		await expect(
			controller.changeSessionPackage(
				'2026-10-01',
				{ packageId: 'pk_a', sessionName: 'PUSH A' },
				'pk_b',
			),
		).rejects.toBeInstanceOf(SessionError);
	});

	it('ノートに無い予定（ルーチン）を変えたら、その日はスキップして新しいパッケージを足す', async () => {
		const { store, index, controller } = await make();
		await store.update((d) => {
			d.routines = [routine('pk_a')];
		});
		await controller.changeSessionPackage(
			'2026-10-01',
			{ packageId: 'pk_a', sessionName: null },
			'pk_b',
		);
		expect(store.current.routines[0]?.skipDates).toEqual(['2026-10-01']);
		expect(index.day('2026-10-01')?.sessions).toEqual([
			{ name: 'PULL A', notes: [], exercises: [] },
		]);
	});

	it('初期化すると、時刻・記録・コメント・その日の並びを消して予定に戻る（ルーチンはスキップしない。進行中のセットは取り消し）', async () => {
		const { fake, store, index, controller } = await make();
		const ref = { packageId: 'pk_a', sessionName: 'PUSH A' };
		await store.update((d) => {
			d.routines = [routine('pk_a')];
			d.dayOrders = { '2026-10-01 pkg:pk_a': ['ex:ex_d', 'ex:ex_y'] };
			d.dayRemoved = { '2026-10-01 pkg:pk_a': ['ex:ex_d'] };
		});
		await controller.startSession('2026-10-01', 'pk_a');
		await controller.addSessionNote('2026-10-01', ref, '間違えて開始');
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await controller.finishSet(9);
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await controller.resetSessionOnDay('2026-10-01', ref);
		expect(index.day('2026-10-01')?.sessions).toEqual([
			{ name: 'PUSH A', notes: [], exercises: [] },
		]);
		const text = fake.vault.text('Fitness/log/2026-10-01.md')!;
		expect(text).not.toContain('時間');
		expect(text).not.toContain('間違えて開始');
		expect(store.current.activeSet).toBeNull();
		expect(store.current.routines[0]?.skipDates).toEqual([]);
		expect(store.current.dayOrders).toBeUndefined();
		expect(store.current.dayRemoved).toBeUndefined();
	});

	it('単発の種目もパッケージとまとめて終え（開始は最初のセット）、再開・種目の追加で続けられる', async () => {
		const { fake, index, controller, setClock } = await make();
		const path = 'Fitness/log/2026-10-01.md';
		await expect(controller.endDay('2026-10-01')).rejects.toThrow();
		await controller.startSet({
			date: '2026-10-01',
			packageId: null,
			exerciseId: 'ex_y',
			weight: 10,
		});
		setClock(new Date(2026, 9, 1, 18, 31, 0));
		await controller.finishSet(12);
		setClock(new Date(2026, 9, 1, 18, 35, 0));
		await controller.startSession('2026-10-01', 'pk_a');
		setClock(new Date(2026, 9, 1, 18, 40, 0));
		await controller.endDay('2026-10-01');
		// 最後にやったのは「筋トレを開始」したパッケージ（押した時刻）。単発の種目は最後のセットの終了
		expect(fake.vault.text(path)).toContain(
			'## PUSH A\n- 時間: 18:35:00 – 18:40:00\n',
		);
		expect(fake.vault.text(path)).toContain(
			'## その他\n- 時間: 18:30:05 – 18:31:00\n',
		);
		await controller.resumeDay('2026-10-01');
		expect(fake.vault.text(path)).toContain(
			'## その他\n- 時間: 18:30 – 18:31\n',
		);
		await controller.endDay('2026-10-01');
		await controller.addExerciseToDay('2026-10-01', OTHER_SESSION, 'ex_d');
		const other = index
			.day('2026-10-01')
			?.sessions.find((s) => s.name === null);
		expect(other).not.toHaveProperty('end');
		expect(other?.exercises.map((e) => e.name)).toEqual([
			'ケーブルYレイズ',
			'ディップス',
		]);
	});

	it('記録した種目は withSets のときだけ外せる（セットごと消し、パッケージの種目は「外した」と覚える）', async () => {
		const { fake, store, controller } = await make();
		const ref = { packageId: 'pk_a', sessionName: null };
		await controller.startSession('2026-10-01', 'pk_a');
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		await controller.finishSet(9);
		await expect(
			controller.removeExerciseFromDay('2026-10-01', ref, 'ex_y'),
		).rejects.toBeInstanceOf(SessionError);
		await controller.removeExerciseFromDay('2026-10-01', ref, 'ex_y', {
			withSets: true,
		});
		expect(fake.vault.text('Fitness/log/2026-10-01.md')).not.toContain(
			'ケーブルYレイズ',
		);
		expect(store.current.dayRemoved).toEqual({
			'2026-10-01 pkg:pk_a': ['ex:ex_y'],
		});
	});

	it('再開は今日だけ。日が変わってから終えると最後のセットの終了で終える', async () => {
		const { fake, store, controller, setClock } = await make();
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
		await controller.endDay('2026-10-01');
		const path = 'Fitness/log/2026-10-01.md';
		expect(fake.vault.text(path)).toContain('- 時間: 18:30:05 – 18:31:00');
		await expect(controller.resumeDay('2026-10-01')).rejects.toBeInstanceOf(
			SessionError,
		);
		// 今日の並び（その日だけ）
		await controller.reorderDay('2026-10-02', 'pkg:pk_a', ['ex:b', 'ex:a']);
		expect(store.current.dayOrders).toEqual({
			'2026-10-02 pkg:pk_a': ['ex:b', 'ex:a'],
		});
	});

	it('0 時をまたいでも筋トレが続いていれば、前の日も今日と同じ（終了は押した時刻・再開できる）', async () => {
		const { fake, controller, setClock } = await make();
		const path = 'Fitness/log/2026-10-01.md';
		setClock(new Date(2026, 9, 1, 23, 45, 0));
		await controller.startSession('2026-10-01', 'pk_a');
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		setClock(new Date(2026, 9, 2, 0, 10, 0));
		expect(controller.overnight()).toEqual({
			date: '2026-10-01',
			running: true,
		});
		expect(controller.isLive('2026-10-01')).toBe(true);
		await controller.finishSet(9);
		setClock(new Date(2026, 9, 2, 0, 20, 0));
		await controller.endDay('2026-10-01');
		expect(fake.vault.text(path)).toContain(
			'## PUSH A\n- 時間: 23:45:00 – 00:20:00\n',
		);
		// 0 時を過ぎてから終えたので、まだ前の日のまま（再開できる）
		expect(controller.overnight()).toEqual({
			date: '2026-10-01',
			running: false,
		});
		await controller.resumeDay('2026-10-01');
		expect(fake.vault.text(path)).toContain('- 時間: 23:45:00 –\n');
	});

	it('今日の筋トレを始めると、0 時をまたいで続いている前の日の筋トレ（進行中のセットも）を今の時刻で終える', async () => {
		const { fake, store, controller, setClock } = await make();
		setClock(new Date(2026, 9, 1, 23, 45, 0));
		await controller.startSession('2026-10-01', 'pk_a');
		setClock(new Date(2026, 9, 1, 23, 50, 0));
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		setClock(new Date(2026, 9, 2, 0, 30, 0));
		await controller.startSession('2026-10-02', 'pk_b');
		expect(store.current.activeSet).toBeNull();
		const yesterday = fake.vault.text('Fitness/log/2026-10-01.md')!;
		expect(yesterday).toContain('- 時間: 23:45:00 – 00:30:00\n');
		expect(yesterday).toContain('| 1 | 10 | - | 23:50:00 | 00:30:00 | |');
		expect(fake.vault.text('Fitness/log/2026-10-02.md')).toContain(
			'## PULL A\n- 時間: 00:30:00 –\n',
		);
		expect(controller.overnight()).toBeNull();
		expect(controller.isLive('2026-10-01')).toBe(false);
	});

	it('今日のセット（単発の種目）を始めても、前の日の進行中のセットを終えてから始める', async () => {
		const { fake, store, controller, setClock } = await make();
		setClock(new Date(2026, 9, 1, 23, 55, 0));
		await controller.startSet({
			date: '2026-10-01',
			packageId: null,
			exerciseId: 'ex_d',
			weight: null,
		});
		setClock(new Date(2026, 9, 2, 0, 5, 0));
		await controller.startSet({
			date: '2026-10-02',
			packageId: null,
			exerciseId: 'ex_y',
			weight: 10,
		});
		expect(store.current.activeSet).toMatchObject({
			date: '2026-10-02',
			exerciseId: 'ex_y',
		});
		expect(fake.vault.text('Fitness/log/2026-10-01.md')).toContain(
			'## その他\n- 時間: 23:55:00 – 00:05:00\n',
		);
	});

	it('終え忘れて 3 時間を過ぎた前の日は過去の日（今日を始めても触らない）。残ったセットは手で入れて記録できる', async () => {
		const { fake, store, controller, setClock } = await make();
		setClock(new Date(2026, 9, 1, 20, 0, 0));
		await controller.startSession('2026-10-01', 'pk_a');
		await controller.startSet({
			date: '2026-10-01',
			packageId: 'pk_a',
			exerciseId: 'ex_y',
			weight: 10,
		});
		setClock(new Date(2026, 9, 2, 0, 30, 0));
		expect(controller.overnight()).toBeNull();
		await expect(
			controller.startSession('2026-10-02', 'pk_b'),
		).resolves.toBeDefined();
		expect(store.current.activeSet).toMatchObject({ date: '2026-10-01' });
		await controller.recordActiveSet({
			weight: 10,
			reps: 8,
			start: '20:00:00',
			end: '20:01:00',
			note: '',
		});
		expect(store.current.activeSet).toBeNull();
		expect(fake.vault.text('Fitness/log/2026-10-01.md')).toContain(
			'| 1 | 10 | 8 | 20:00:00 | 20:01:00 | |',
		);
	});
});
