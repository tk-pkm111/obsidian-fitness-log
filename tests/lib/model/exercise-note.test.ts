import { describe, expect, it } from 'vitest';
import {
	applyExerciseToFrontmatter,
	duplicateIdPaths,
	exerciseFileName,
	exerciseFromNote,
	findNameConflict,
} from '../../../src/lib/model/exercise-note';
import type { Exercise } from '../../../src/lib/model/types';

const ex = (patch: Partial<Exercise> = {}): Exercise => ({
	id: 'ex_1',
	name: 'ケーブルYレイズ',
	category: 'push',
	recordType: 'weight-reps',
	aliases: [],
	createdAt: '',
	...patch,
});

describe('exerciseFileName', () => {
	it('ファイル名に使えない文字は全角に、空白は詰める', () => {
		expect(exerciseFileName(' S/A  ケーブル:サイドレイズ ')).toBe(
			'S／A ケーブル：サイドレイズ',
		);
		expect(exerciseFileName('A|B#C^D[E]?*"<>\\')).toBe(
			'A｜B＃C＾D［E］？＊”＜＞＼',
		);
		expect(exerciseFileName('.hidden')).toBe('hidden');
	});
});

describe('exerciseFromNote', () => {
	it('frontmatter から読み、名前はファイル名。以前の版の英語のキーは既定の名前で読む', () => {
		const exercise = exerciseFromNote({
			path: 'Fitness/種目/ケーブルYレイズ.md',
			basename: 'ケーブルYレイズ',
			frontmatter: {
				fitness_id: 'ex_1',
				category: 'push',
				equipment: 'cable',
				record_type: 'reps',
				unilateral: true,
				aliases: 'Yレイズ',
				archived: false,
			},
			createdAt: '2026-10-01T00:00:00.000Z',
		});
		expect(exercise).toEqual({
			id: 'ex_1',
			name: 'ケーブルYレイズ',
			category: 'プッシュ',
			equipment: 'ケーブル',
			recordType: 'reps',
			unilateral: true,
			aliases: ['Yレイズ'],
			createdAt: '2026-10-01T00:00:00.000Z',
			path: 'Fitness/種目/ケーブルYレイズ.md',
		});
	});

	it('id が無ければ null（呼び出し側で振る）。カテゴリは名前をそのまま、不正な値は既定値', () => {
		expect(
			exerciseFromNote({
				path: 'a.md',
				basename: 'a',
				frontmatter: null,
				createdAt: '',
			}),
		).toBeNull();
		const loose = exerciseFromNote({
			path: 'a.md',
			basename: 'a',
			frontmatter: {
				fitness_id: 'ex_9',
				category: '胸',
				record_type: 3,
				aliases: [1, '', 'x'],
			},
			createdAt: '',
		});
		expect(loose).toMatchObject({
			category: '胸',
			recordType: 'weight-reps',
			aliases: ['1', 'x'],
		});
	});
});

describe('applyExerciseToFrontmatter', () => {
	it('プラグインのキーだけを書き、ユーザーのキーとタグは残す', () => {
		const fm: Record<string, unknown> = {
			tags: ['筋トレ'],
			動画: 'https://example.com',
			equipment: 'cable',
		};
		applyExerciseToFrontmatter(
			fm,
			ex({ aliases: ['Y'], unilateral: false }),
		);
		expect(fm).toEqual({
			tags: ['筋トレ', 'fitness-exercise'],
			動画: 'https://example.com',
			aliases: ['Y'],
			fitness_id: 'ex_1',
			category: 'push',
			record_type: 'weight-reps',
			unilateral: false,
			archived: false,
		});
	});
});

describe('重複・重なりの検出', () => {
	it('同じ id のノート（複製）は 2 つ目以降のパス', () => {
		expect(
			duplicateIdPaths([
				ex({ path: 'a.md' }),
				ex({ path: 'b.md' }),
				ex({ id: 'ex_2', path: 'c.md' }),
			]),
		).toEqual(['b.md']);
	});

	it('本名・別名が他の種目と重なれば、その種目（自分は除く）', () => {
		const list = [
			ex(),
			ex({ id: 'ex_2', name: 'ベンチ', aliases: ['BP'] }),
		];
		expect(findNameConflict(list, ['bp'])?.id).toBe('ex_2');
		expect(findNameConflict(list, ['ベンチ'], 'ex_2')).toBeUndefined();
	});
});
