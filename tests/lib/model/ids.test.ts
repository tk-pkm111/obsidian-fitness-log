import { describe, expect, it } from 'vitest';
import { newId } from '../../../src/lib/model/ids';

describe('newId', () => {
	it('接頭辞 + 8 文字の英小文字・数字', () => {
		expect(newId('ex')).toMatch(/^ex_[a-z0-9]{8}$/);
		expect(newId('pk')).toMatch(/^pk_[a-z0-9]{8}$/);
		expect(newId('rt')).toMatch(/^rt_[a-z0-9]{8}$/);
	});

	it('1 万件作っても重複しない', () => {
		const ids = new Set(Array.from({ length: 10_000 }, () => newId('ex')));
		expect(ids.size).toBe(10_000);
	});

	it('taken にある id は返さない', () => {
		const taken = new Set<string>();
		for (let i = 0; i < 100; i++) taken.add(newId('ex', taken));
		expect(taken.size).toBe(100);
	});
});
