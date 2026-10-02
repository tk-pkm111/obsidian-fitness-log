/**
 * トレーニングメニューの REPS 表記を扱う（例: "6-9", "8", "AMRAP"）。
 * Notion から持ってきたメニュー表で使われている表記に合わせている
 * （context/notion/01_training-programs/README.md）。
 *
 * src/lib の規約: Obsidian API に依存しない純粋なロジックだけを置く。
 */
export type RepRange =
	{ kind: 'range'; min: number; max: number } | { kind: 'amrap' };

// 正規表現に後読み（lookbehind）は使わない。古い iOS では未対応のため。
const RANGE_PATTERN = /^(\d+)\s*[-–〜~]\s*(\d+)$/;
const SINGLE_PATTERN = /^\d+$/;

export function parseRepRange(input: string): RepRange | null {
	const text = input.trim();
	if (text.length === 0) return null;
	if (/^amrap$/i.test(text)) return { kind: 'amrap' };
	if (SINGLE_PATTERN.test(text)) {
		const n = Number(text);
		return { kind: 'range', min: n, max: n };
	}
	const match = RANGE_PATTERN.exec(text);
	if (!match) return null;
	const [, minText, maxText] = match;
	if (minText === undefined || maxText === undefined) return null;
	const min = Number(minText);
	const max = Number(maxText);
	if (min > max) return null;
	return { kind: 'range', min, max };
}

export function formatRepRange(range: RepRange): string {
	if (range.kind === 'amrap') return 'AMRAP';
	return range.min === range.max
		? String(range.min)
		: `${range.min}-${range.max}`;
}
