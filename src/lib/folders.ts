/**
 * 設定のフォルダ（種目ノート・日ノート）を、vault の中でフォルダの名前を変えた・移したときに追いかける。
 * 設定が古いままだとノートが見つからず、パッケージの種目が「?」になり、新しい記録が古い場所に作られてしまうため。
 */

function trimSlashes(path: string): string {
	return path.replace(/^\/+|\/+$/g, '');
}

/**
 * 設定のフォルダ（またはその親）が oldPath から newPath に変わったときの、新しい設定の値。
 * 関係のない変更なら null。
 */
export function followRename(
	folder: string,
	oldPath: string,
	newPath: string,
): string | null {
	const current = trimSlashes(folder);
	const from = trimSlashes(oldPath);
	const to = trimSlashes(newPath);
	if (current === '' || from === '' || from === to) return null;
	if (current === from) return to;
	if (current.startsWith(`${from}/`))
		return `${to}${current.slice(from.length)}`;
	return null;
}

/**
 * ノートのパスから、ノートの置き場所とみなすフォルダ: ノートの share 以上を含むいちばん深いフォルダ
 * （サブフォルダに分けていても、ほかの場所に紛れたノートが少しあっても決まる）。
 * vault の直下に散らばっているなど、決められなければ null。
 */
export function dominantFolder(
	paths: readonly string[],
	share = 0.8,
): string | null {
	if (paths.length === 0) return null;
	const counts = new Map<string, number>();
	for (const path of paths) {
		const parts = trimSlashes(path).split('/').slice(0, -1);
		for (let i = 1; i <= parts.length; i++) {
			const folder = parts.slice(0, i).join('/');
			counts.set(folder, (counts.get(folder) ?? 0) + 1);
		}
	}
	const need = Math.ceil(paths.length * share);
	const depth = (folder: string) => folder.split('/').length;
	let best: string | null = null;
	for (const [folder, n] of counts) {
		if (n < need) continue;
		if (
			best === null ||
			depth(folder) > depth(best) ||
			(depth(folder) === depth(best) && n > (counts.get(best) ?? 0))
		)
			best = folder;
	}
	return best;
}
