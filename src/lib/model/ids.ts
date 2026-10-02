const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 8;

export type IdPrefix = 'ex' | 'pk' | 'rt' | 'sc';

/**
 * 接頭辞付きのランダム id（例: 'ex_k3v9q0ab'）。
 * crypto.getRandomValues はブラウザ（Obsidian デスクトップ・モバイル）と Node の両方にある。
 * `taken` を渡すと、既存の id と衝突しないものを返す。
 */
export function newId(prefix: IdPrefix, taken?: ReadonlySet<string>): string {
	for (;;) {
		const bytes = new Uint8Array(ID_LENGTH);
		crypto.getRandomValues(bytes);
		let body = '';
		// 256 は 36 で割り切れないが、表示用 id なので偏りは問題にしない
		for (const byte of bytes) body += ALPHABET[byte % ALPHABET.length];
		const id = `${prefix}_${body}`;
		if (!taken?.has(id)) return id;
	}
}
