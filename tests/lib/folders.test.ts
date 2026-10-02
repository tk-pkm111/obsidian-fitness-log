import { describe, expect, it } from 'vitest';
import { dominantFolder, followRename } from '../../src/lib/folders';

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
