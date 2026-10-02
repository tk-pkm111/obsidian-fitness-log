import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogIndex } from '../../src/data/log-index';
import { LogRepository } from '../../src/data/log-repository';
import { appendSet } from '../../src/lib/log/day-ops';
import { formatBlock } from '../../src/lib/log/markdown';
import type { DayLog } from '../../src/lib/model/types';
import type { Component as ObsidianComponent } from 'obsidian';
import { Component } from '../__mocks__/obsidian';
import { createFakeApp, type FakeApp } from '../helpers/fake-app';

const location = { logFolder: 'Fitness', fileNameFormat: 'YYYY-MM-DD' };

const dayWith = (
	date: string,
	session: string,
	exercise: string,
	reps: number,
): DayLog => ({
	date,
	sessions: [
		{
			name: session,
			note: '',
			exercises: [
				{
					name: exercise,
					sets: [
						{ weight: 10, reps, start: null, end: null, note: '' },
					],
				},
			],
		},
	],
});

describe('LogIndex', () => {
	let fake: FakeApp;
	let repo: LogRepository;
	let index: LogIndex;
	let owner: Component;

	beforeEach(async () => {
		fake = createFakeApp();
		repo = new LogRepository(fake.app, () => location);
		await fake.vault.createFolder('Fitness');
		await fake.vault.createFolder('Fitness/2025');
		await fake.vault.create(
			'Fitness/2026-09-28.md',
			`${formatBlock(dayWith('2026-09-28', 'A', 'X', 9))}\n`,
		);
		await fake.vault.create(
			'Fitness/2026-10-01.md',
			`${formatBlock(dayWith('2026-10-01', 'B', 'X', 8))}\n`,
		);
		await fake.vault.create('Fitness/メモ.md', '日ノートではない');
		await fake.vault
			.create('Other/2026-10-02.md', '')
			.catch(() => undefined); // フォルダが無いので作られない
		index = new LogIndex(fake.app, repo);
		owner = new Component();
		index.registerVaultEvents(owner as unknown as ObsidianComponent);
	});

	afterEach(() => {
		owner.unload();
		vi.useRealTimers();
	});

	it('起動時には読まず、ensureBuilt でログフォルダだけを走査する', async () => {
		expect(index.isBuilt).toBe(false);
		expect(index.allDays()).toEqual([]);
		await index.ensureBuilt();
		expect(index.allDays().map((d) => d.date)).toEqual([
			'2026-09-28',
			'2026-10-01',
		]);
		expect(index.occurrences((n) => n === 'X').map((o) => o.date)).toEqual([
			'2026-10-01',
			'2026-09-28',
		]);
	});

	it('ログフォルダが無ければ空', async () => {
		const empty = new LogIndex(createFakeApp().app, repo);
		await empty.ensureBuilt();
		expect(empty.allDays()).toEqual([]);
	});

	it('ログフォルダ内の変更・追加・削除を 300 ms まとめて反映する', async () => {
		await index.ensureBuilt();
		vi.useFakeTimers();
		const changed = vi.fn();
		owner.registerEvent(index.onChange(changed));

		const path = 'Fitness/2026-10-01.md';
		fake.vault.externalWrite(
			path,
			`${formatBlock(dayWith('2026-10-01', 'B', 'X', 3))}\n`,
		);
		fake.vault.externalWrite(
			path,
			`${formatBlock(dayWith('2026-10-01', 'B', 'X', 5))}\n`,
		);
		await fake.vault.create(
			'Fitness/2026-10-02.md',
			`${formatBlock(dayWith('2026-10-02', 'C', 'Y', 1))}\n`,
		);
		expect(index.day('2026-10-02')).toBeUndefined();

		await vi.advanceTimersByTimeAsync(300);
		expect(changed).toHaveBeenCalledTimes(1);
		expect(
			index.day('2026-10-01')?.sessions[0]?.exercises[0]?.sets[0]?.reps,
		).toBe(5);
		expect(index.day('2026-10-02')?.sessions[0]?.name).toBe('C');

		fake.vault.externalDelete('Fitness/2026-09-28.md');
		await vi.advanceTimersByTimeAsync(300);
		expect(index.day('2026-09-28')).toBeUndefined();
	});

	it('ログフォルダ外の変更は無視する', async () => {
		await index.ensureBuilt();
		vi.useFakeTimers();
		const changed = vi.fn();
		owner.registerEvent(index.onChange(changed));
		await fake.vault.createFolder('Other');
		await fake.vault.create('Other/2026-10-05.md', '');
		fake.vault.externalWrite('Fitness/メモ.md', '更新');
		await vi.advanceTimersByTimeAsync(500);
		expect(changed).not.toHaveBeenCalled();
	});

	it('壊れたノートはエラーとして持ち、直れば読み直す', async () => {
		await index.ensureBuilt();
		vi.useFakeTimers();
		const path = 'Fitness/2026-10-01.md';
		const good = fake.vault.text(path)!;
		fake.vault.externalWrite(path, good.replace('| 10 |', '| 重い |'));
		await vi.advanceTimersByTimeAsync(300);
		expect(index.day('2026-10-01')).toBeUndefined();
		expect(index.errorFor('2026-10-01')).toMatchObject({ path });
		fake.vault.externalWrite(path, good);
		await vi.advanceTimersByTimeAsync(300);
		expect(index.errorFor('2026-10-01')).toBeUndefined();
		expect(index.day('2026-10-01')).toBeDefined();
	});

	it('自分で書いた直後は setDay で即座に反映する', async () => {
		await index.ensureBuilt();
		const changed = vi.fn();
		owner.registerEvent(index.onChange(changed));
		const day = await repo.updateDay('2026-10-03', (d) =>
			appendSet(
				d,
				{
					matchSession: (n) => n === 'A',
					sessionName: 'A',
					matchExercise: (n) => n === 'X',
					exerciseName: 'X',
				},
				{ weight: 20, reps: 5, start: null, end: null, note: '' },
			),
		);
		index.setDay(day);
		expect(index.day('2026-10-03')).toEqual(day);
		expect(changed).toHaveBeenCalledTimes(1);
	});

	it('unload で vault の購読を解除する', () => {
		expect(fake.vault.listenerCount('modify')).toBe(1);
		owner.unload();
		expect(fake.vault.listenerCount('modify')).toBe(0);
	});

	it('設定変更で作り直す', async () => {
		await index.ensureBuilt();
		let folder = 'Fitness';
		const movable = new LogIndex(
			fake.app,
			new LogRepository(fake.app, () => ({
				...location,
				logFolder: folder,
			})),
		);
		await movable.ensureBuilt();
		expect(movable.allDays()).toHaveLength(2);
		folder = 'Nowhere';
		await movable.rebuild();
		expect(movable.allDays()).toHaveLength(0);
	});
});

describe('LogIndex（レビューで見つかった不具合の再発防止）', () => {
	it('走査の途中で保存先が変わって作り直しても、古いフォルダの日が残らない', async () => {
		const fake = createFakeApp();
		await fake.vault.createFolder('Fitness');
		await fake.vault.createFolder('Gym');
		await fake.vault.create(
			'Fitness/2026-09-30.md',
			`${formatBlock(dayWith('2026-09-30', 'A', 'X', 1))}\n`,
		);
		await fake.vault.create(
			'Gym/2026-10-01.md',
			`${formatBlock(dayWith('2026-10-01', 'B', 'Y', 2))}\n`,
		);
		let folder = 'Fitness';
		const index = new LogIndex(
			fake.app,
			new LogRepository(fake.app, () => ({
				...location,
				logFolder: folder,
			})),
		);
		const first = index.ensureBuilt();
		folder = 'Gym';
		await index.rebuild();
		await first;
		expect(index.allDays().map((d) => d.date)).toEqual(['2026-10-01']);
	});
});
