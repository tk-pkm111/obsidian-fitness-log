/**
 * 並べ替え（ドラッグ＆ドロップ・キーボードの ↑↓）の計算。
 */

/** from の要素が新しい並びで to の位置に来るように動かした配列（元の配列は変えない）。範囲外ならそのまま */
export function arrayMove<T>(
	list: readonly T[],
	from: number,
	to: number,
): T[] {
	const next = [...list];
	if (
		from === to ||
		from < 0 ||
		from >= next.length ||
		to < 0 ||
		to >= next.length
	)
		return next;
	const [item] = next.splice(from, 1);
	if (item !== undefined) next.splice(to, 0, item);
	return next;
}

/**
 * つかんでいる要素の中心 y から、落とす位置（新しい並びでの番号）を決める。
 * midpoints はつかんでいる要素を除いた残りの要素の中心（上から順）。
 */
export function dropIndex(midpoints: readonly number[], y: number): number {
	let index = 0;
	for (const mid of midpoints) if (y > mid) index++;
	return index;
}
