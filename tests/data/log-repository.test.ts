import { beforeEach, describe, expect, it } from 'vitest';
import {
	dateFromNotePath,
	dayNotePath,
	LogParseError,
	LogRepository,
	validateFileNameFormat,
} from '../../src/data/log-repository';
import { appendSet, DayLogError, deleteSet } from '../../src/lib/log/day-ops';
import { BLOCK_END, BLOCK_START } from '../../src/lib/log/markdown';
import type { SetLog } from '../../src/lib/model/types';
import { Notice } from '../__mocks__/obsidian';
import {
	createFakeApp,
	FakeFileManager,
	type FakeApp,
} from '../helpers/fake-app';

const location = { logFolder: 'Fitness', fileNameFormat: 'YYYY-MM-DD' };

const set = (weight: number | null, reps: number | null): SetLog => ({
	weight,
	reps,
	start: '18:31:05',
	end: '18:31:50',
	note: '',
});

const pushA = (s: SetLog) => (day: Parameters<typeof appendSet>[0]) =>
	appendSet(
		day,
		{
			matchSession: (n) => n === 'PUSH A',
			sessionName: 'PUSH A',
			matchExercise: (n) => n === 'ケーブルYレイズ',
			exerciseName: 'ケーブルYレイズ',
		},
		s,
	);

describe('日ノートのパス', () => {
	it('日付 ⇄ パス（書式・サブフォルダ）', () => {
		expect(dayNotePath(location, '2026-10-01')).toBe(
			'Fitness/2026-10-01.md',
		);
		const nested = {
			logFolder: 'Log/Gym/',
			fileNameFormat: 'YYYY/MM/YYYY-MM-DD',
		};
		expect(dayNotePath(nested, '2026-10-01')).toBe(
			'Log/Gym/2026/10/2026-10-01.md',
		);
		expect(dateFromNotePath(nested, 'Log/Gym/2026/10/2026-10-01.md')).toBe(
			'2026-10-01',
		);
	});

	it('日ノートでないファイルは null', () => {
		expect(dateFromNotePath(location, 'Fitness/メモ.md')).toBeNull();
		expect(dateFromNotePath(location, 'Fitness/2026-1-1.md')).toBeNull();
		expect(dateFromNotePath(location, 'Fitness/2026-02-30.md')).toBeNull();
		expect(dateFromNotePath(location, 'Other/2026-10-01.md')).toBeNull();
		expect(
			dateFromNotePath(location, 'Fitness/2026-10-01.base'),
		).toBeNull();
	});

	it('書式の検証: 年月日を含み、ファイル名に使える文字だけ', () => {
		expect(validateFileNameFormat('YYYY-MM-DD')).toBeUndefined();
		expect(
			validateFileNameFormat('YYYY/MM/YYYY-MM-DD ddd'),
		).toBeUndefined();
		expect(validateFileNameFormat('[筋トレ] YYYYMMDD')).toBeUndefined();
		expect(validateFileNameFormat('')).toBeDefined();
		expect(validateFileNameFormat('MM-DD')).toBeDefined(); // 年をまたぐと重なる
		expect(validateFileNameFormat('YYYY-MM')).toBeDefined();
		expect(validateFileNameFormat('YYYY:MM:DD')).toBeDefined();
		expect(validateFileNameFormat('/YYYY-MM-DD')).toBeDefined();
	});
});

describe('LogRepository.updateDay', () => {
	let fake: FakeApp;
	let repo: LogRepository;

	beforeEach(() => {
		fake = createFakeApp();
		repo = new LogRepository(fake.app, () => location);
	});

	it('ノートが無ければフォルダごと作り、ブロックと frontmatter を書く', async () => {
		await repo.updateDay('2026-10-01', pushA(set(10, 9)));
		const text = fake.vault.text('Fitness/2026-10-01.md');
		expect(text).toBeDefined();
		expect(text).toContain(
			`${BLOCK_START}\n## PUSH A\n- 時間: 18:31 – 18:31\n\n### ケーブルYレイズ`,
		);
		expect(FakeFileManager.read(text)).toEqual({
			tags: ['fitness-log'],
			date: '2026-10-01',
			packages: ['PUSH A'],
			exercises: ['ケーブルYレイズ'],
			sets: 1,
			volume_kg: 90,
			duration_min: 1,
		});
	});

	it('階層の深いフォルダも順に作る', async () => {
		const deep = new LogRepository(fake.app, () => ({
			logFolder: 'A/B',
			fileNameFormat: 'YYYY/MM/YYYY-MM-DD',
		}));
		await deep.updateDay('2026-10-01', pushA(set(10, 9)));
		expect(fake.vault.text('A/B/2026/10/2026-10-01.md')).toContain(
			BLOCK_START,
		);
	});

	it('変更後も空ならノートを作らない', async () => {
		const day = await repo.updateDay('2026-10-01', () => {});
		expect(day.sessions).toEqual([]);
		expect(fake.vault.getFileByPath('Fitness/2026-10-01.md')).toBeNull();
		expect(fake.vault.writes).toBe(0);
	});

	it('既存ノートのブロック外（ユーザーのメモ・他の frontmatter）を保持して追記する', async () => {
		await repo.updateDay('2026-10-01', pushA(set(10, 9)));
		const path = 'Fitness/2026-10-01.md';
		const withMemo = fake.vault
			.text(path)!
			.replace(
				'tags:\n  - fitness-log',
				'tags:\n  - fitness-log\nmood: good',
			)
			.concat('\n## 今日のメモ\n肩が重い\n');
		fake.vault.externalWrite(path, withMemo);

		await repo.updateDay('2026-10-01', pushA(set(10, 8)));
		const text = fake.vault.text(path)!;
		expect(text).toContain('| 2 | 10 | 8 | 18:31:05 | 18:31:50 | |');
		expect(text.endsWith('\n## 今日のメモ\n肩が重い\n')).toBe(true);
		expect(FakeFileManager.read(text)).toMatchObject({
			mood: 'good',
			sets: 2,
			volume_kg: 170,
		});
	});

	it('手で直した値を読み戻して、そこに追記する', async () => {
		await repo.updateDay('2026-10-01', pushA(set(10, 9)));
		const path = 'Fitness/2026-10-01.md';
		fake.vault.externalWrite(
			path,
			fake.vault.text(path)!.replace('| 1 | 10 | 9 |', '| 1 | 10 | 7 |'),
		);
		const day = await repo.updateDay('2026-10-01', pushA(set(12.5, 8)));
		expect(day.sessions[0]?.exercises[0]?.sets.map((s) => s.reps)).toEqual([
			7, 8,
		]);
		expect(FakeFileManager.read(fake.vault.text(path))).toMatchObject({
			volume_kg: 170,
		});
	});

	it('管理ブロックが壊れていれば書き込まずに LogParseError', async () => {
		await repo.updateDay('2026-10-01', pushA(set(10, 9)));
		const path = 'Fitness/2026-10-01.md';
		const broken = fake.vault
			.text(path)!
			.replace('| 1 | 10 | 9 |', '| 1 | 重い | 9 |');
		fake.vault.externalWrite(path, broken);
		const writes = fake.vault.writes;
		await expect(
			repo.updateDay('2026-10-01', pushA(set(10, 8))),
		).rejects.toBeInstanceOf(LogParseError);
		expect(fake.vault.writes).toBe(writes);
		expect(fake.vault.text(path)).toBe(broken);
		await expect(repo.readDay('2026-10-01')).rejects.toBeInstanceOf(
			LogParseError,
		);
	});

	it('変更処理がエラーなら書き込まない', async () => {
		await repo.updateDay('2026-10-01', pushA(set(10, 9)));
		const writes = fake.vault.writes;
		await expect(
			repo.updateDay('2026-10-01', (day) =>
				deleteSet(day, {
					sessionIndex: 0,
					exerciseIndex: 0,
					sessionName: 'PUSH A',
					exerciseName: '無い',
					setIndex: 0,
				}),
			),
		).rejects.toBeInstanceOf(DayLogError);
		expect(fake.vault.writes).toBe(writes);
	});

	it('同時に呼んでも順番に処理され、どちらの変更も残る', async () => {
		await Promise.all([
			repo.updateDay('2026-10-01', pushA(set(10, 9))),
			repo.updateDay('2026-10-01', pushA(set(10, 8))),
			repo.updateDay('2026-10-01', pushA(set(10, 7))),
		]);
		const day = await repo.readDay('2026-10-01');
		expect(day.sessions[0]?.exercises[0]?.sets.map((s) => s.reps)).toEqual([
			9, 8, 7,
		]);
	});

	it('途中で失敗しても後続の書き込みは続く', async () => {
		const failing = repo.updateDay('2026-10-01', () => {
			throw new Error('boom');
		});
		const next = repo.updateDay('2026-10-01', pushA(set(10, 9)));
		await expect(failing).rejects.toThrow('boom');
		await expect(next).resolves.toMatchObject({ date: '2026-10-01' });
	});

	it('ユーザーが同じ名前のノートを先に作っていれば末尾にブロックを足す', async () => {
		await fake.vault.createFolder('Fitness');
		await fake.vault.create('Fitness/2026-10-01.md', '# 今日\n朝ラン\n');
		await repo.updateDay('2026-10-01', pushA(set(10, 9)));
		const text = fake.vault.text('Fitness/2026-10-01.md')!;
		expect(text).toContain(`# 今日\n朝ラン\n\n${BLOCK_START}`);
		expect(text.trimEnd().endsWith(BLOCK_END)).toBe(true);
	});
});

describe('LogRepository（レビューで見つかった不具合の再発防止）', () => {
	it('frontmatter の YAML が壊れていても記録は保存済みとして扱い、やり直しで重複しない', async () => {
		const fake = createFakeApp();
		const repo = new LogRepository(fake.app, () => location);
		await repo.updateDay('2026-10-01', pushA(set(10, 9)));
		const path = 'Fitness/2026-10-01.md';
		fake.vault.externalWrite(
			path,
			fake.vault
				.text(path)!
				.replace('tags:\n  - fitness-log', 'tags: [a'),
		);
		Notice.reset();
		await expect(
			repo.updateDay('2026-10-01', pushA(set(10, 8))),
		).resolves.toBeDefined();
		expect(Notice.shown.some((m) => m.includes('プロパティ'))).toBe(true);
		const day = await repo.readDay('2026-10-01');
		expect(day.sessions[0]?.exercises[0]?.sets.map((s) => s.reps)).toEqual([
			9, 8,
		]);
	});
});
