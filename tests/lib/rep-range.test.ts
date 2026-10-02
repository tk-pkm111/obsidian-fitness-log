import { describe, expect, it } from 'vitest';
import { formatRepRange, parseRepRange } from '../../src/lib/rep-range';

describe('parseRepRange', () => {
	it('"6-9" を範囲として読む', () => {
		expect(parseRepRange('6-9')).toEqual({ kind: 'range', min: 6, max: 9 });
	});

	it('前後の空白や全角のハイフン類も受け付ける', () => {
		expect(parseRepRange(' 4 〜 8 ')).toEqual({
			kind: 'range',
			min: 4,
			max: 8,
		});
	});

	it('数値ひとつは min と max が同じ範囲になる', () => {
		expect(parseRepRange('8')).toEqual({ kind: 'range', min: 8, max: 8 });
	});

	it('AMRAP は大文字小文字を問わない', () => {
		expect(parseRepRange('AMRAP')).toEqual({ kind: 'amrap' });
		expect(parseRepRange('amrap')).toEqual({ kind: 'amrap' });
	});

	it('読めない入力は null', () => {
		for (const input of ['', 'abc', '9-6', '6-', '-9', '6-9-12']) {
			expect(parseRepRange(input), `input: "${input}"`).toBeNull();
		}
	});
});

describe('formatRepRange', () => {
	it('parse した結果を元の表記に戻せる', () => {
		for (const text of ['6-9', '8', 'AMRAP']) {
			const parsed = parseRepRange(text);
			expect(parsed).not.toBeNull();
			if (parsed) expect(formatRepRange(parsed)).toBe(text);
		}
	});
});
