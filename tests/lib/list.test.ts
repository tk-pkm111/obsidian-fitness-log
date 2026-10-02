import { describe, expect, it } from 'vitest';
import { arrayMove, dropIndex } from '../../src/lib/list';

describe('arrayMove', () => {
	it('from の要素が新しい並びで to に来る。元の配列は変えない', () => {
		const list = ['a', 'b', 'c', 'd'];
		expect(arrayMove(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
		expect(arrayMove(list, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
		expect(arrayMove(list, 1, 1)).toEqual(list);
		expect(arrayMove(list, 0, 9)).toEqual(list);
		expect(list).toEqual(['a', 'b', 'c', 'd']);
	});
});

describe('dropIndex', () => {
	it('中心より下にある要素の数＝落とす位置', () => {
		const mids = [10, 30, 50];
		expect(dropIndex(mids, 0)).toBe(0);
		expect(dropIndex(mids, 31)).toBe(2);
		expect(dropIndex(mids, 99)).toBe(3);
	});
});
