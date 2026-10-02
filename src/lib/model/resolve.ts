/**
 * 名前 → 種目／パッケージの解決（本名＋別名）。
 * 日ノートには id ではなく名前を書くので、読み戻すときにここで id に結び付ける。
 */

/**
 * 比較用の正規化キー。
 * - NFKC: 全角英数・全角括弧・半角カナなどを揃える（'ＤＢ（広背筋）' と 'DB(広背筋)' が一致）
 * - 小文字化、空白（全角空白を含む）の除去
 */
export function nameKey(name: string): string {
	return name.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

interface Named {
	id: string;
	name: string;
	aliases: readonly string[];
}

export interface NameResolver<T extends Named> {
	/** 本名を優先し、次に別名で引く。見つからなければ undefined */
	resolve(name: string): T | undefined;
	/** その名前が item の本名または別名か */
	matches(item: T, name: string): boolean;
}

export function createResolver<T extends Named>(
	items: readonly T[],
): NameResolver<T> {
	const byName = new Map<string, T>();
	const byAlias = new Map<string, T>();
	for (const item of items) {
		const key = nameKey(item.name);
		if (!byName.has(key)) byName.set(key, item);
	}
	for (const item of items) {
		for (const alias of item.aliases) {
			const key = nameKey(alias);
			if (!byAlias.has(key)) byAlias.set(key, item);
		}
	}
	return {
		resolve(name) {
			const key = nameKey(name);
			return byName.get(key) ?? byAlias.get(key);
		},
		matches(item, name) {
			const key = nameKey(name);
			return (
				nameKey(item.name) === key ||
				item.aliases.some((alias) => nameKey(alias) === key)
			);
		},
	};
}

/**
 * 名前を変えたときの別名リスト: 旧名を別名に足し、新しい名前と同じ別名は除く。
 * 過去の日ノートは旧名のまま残るので、旧名で引けるようにしておく。
 */
export function aliasesAfterRename(
	oldName: string,
	newName: string,
	aliases: readonly string[],
): string[] {
	const newKey = nameKey(newName);
	const result: string[] = [];
	const seen = new Set<string>([newKey]);
	for (const alias of [...aliases, oldName]) {
		const key = nameKey(alias);
		if (key.length === 0 || seen.has(key)) continue;
		seen.add(key);
		result.push(alias.trim());
	}
	return result;
}

/** 別名の入力（改行・読点・カンマ区切り）をリストにする。空・重複・本名と同じものは除く。 */
export function parseAliasInput(input: string, name: string): string[] {
	const seen = new Set<string>([nameKey(name)]);
	const result: string[] = [];
	for (const raw of input.split(/[\n,、，]/)) {
		const alias = raw.trim();
		const key = nameKey(alias);
		if (key.length === 0 || seen.has(key)) continue;
		seen.add(key);
		result.push(alias);
	}
	return result;
}
