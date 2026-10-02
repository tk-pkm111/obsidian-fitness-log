import { describe, expect, it } from 'vitest';
import {
	dominantFolder,
	folderMismatch,
	followRename,
	isInside,
	movedPath,
} from '../../src/lib/folders';

describe('followRename', () => {
	it('設定のフォルダそのもの・親の名前の変更を追いかける', () => {
		expect(
			followRename('Fitness/種目', 'Fitness/種目', 'Fitness/exercise'),
		).toBe('Fitness/exercise');
		expect(followRename('Fitness/ログ', 'Fitness', 'Training')).toBe(
			'Training/ログ',
		);
		expect(followRename('Fitness/ログ', 'Fitness', 'Archive/Fitness')).toBe(
			'Archive/Fitness/ログ',
		);
	});

	it('関係のない変更・似た名前のフォルダは無視する', () => {
		expect(
			followRename('Fitness/種目', 'Fitness/ログ', 'Fitness/log'),
		).toBeNull();
		expect(
			followRename('Fitness/種目2', 'Fitness/種目', 'Fitness/x'),
		).toBeNull();
		expect(followRename('Fitness', 'Fit', 'Gym')).toBeNull();
		expect(followRename('', 'Fitness', 'Gym')).toBeNull();
	});
});

describe('dominantFolder', () => {
	it('ノートの 8 割以上を含むいちばん深いフォルダ', () => {
		expect(
			dominantFolder([
				'Fitness/exercise/a.md',
				'Fitness/exercise/b.md',
				'Fitness/exercise/legs/c.md',
				'Fitness/exercise/legs/d.md',
				'Fitness/exercise/e.md',
			]),
		).toBe('Fitness/exercise');
		// ほかの場所に紛れた 1 つは無視
		expect(
			dominantFolder([
				...Array.from(
					{ length: 9 },
					(_, i) => `Fitness/log/2026-09-0${i + 1}.md`,
				),
				'Templates/day.md',
			]),
		).toBe('Fitness/log');
	});

	it('決められなければ null', () => {
		expect(dominantFolder([])).toBeNull();
		expect(dominantFolder(['a.md', 'b.md'])).toBeNull();
		expect(dominantFolder(['A/a.md', 'B/b.md'])).toBeNull();
	});
});

describe('folderMismatch', () => {
	const old = Array.from({ length: 6 }, (_, i) => `Fitness/種目/e${i}.md`);

	it('設定を変えたのにノートが前のフォルダにあれば、その場所と移すノート', () => {
		const m = folderMismatch('02_Config/Fitness/exercise', [
			...old,
			'02_Config/Fitness/exercise/new.md',
		]);
		expect(m?.source).toBe('Fitness/種目');
		expect(m?.paths).toEqual(old);
		expect(m?.inside).toBe(1);
	});

	it('設定のフォルダに大半があれば食い違いなし', () => {
		expect(folderMismatch('Fitness/種目', old)).toBeNull();
		expect(
			folderMismatch('Fitness/種目', [...old, 'Templates/x.md']),
		).toBeNull();
		expect(folderMismatch('Fitness/種目', [])).toBeNull();
	});

	it('移した先のパス（サブフォルダはそのまま）', () => {
		expect(
			movedPath(
				'Fitness/ログ/2026/10-02.md',
				'Fitness/ログ',
				'02_Config/log',
			),
		).toBe('02_Config/log/2026/10-02.md');
		expect(movedPath('Fitness/a.md', 'Fitness', '')).toBe('a.md');
		expect(isInside('Fitness/種目/a.md', 'Fitness')).toBe(true);
		expect(isInside('Fitness2/a.md', 'Fitness')).toBe(false);
		expect(isInside('a.md', '/')).toBe(true);
	});
});
