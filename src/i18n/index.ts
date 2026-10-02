import { ja } from './ja';

/**
 * UI 文言の参照。いまは日本語のみ。英語 UI（v2）では言語ごとの辞書を足して切り替える。
 * 日ノートの書式（見出し・表の列名）は文言ではなくファイル形式なので、ここには置かない
 * （src/lib/log/markdown.ts の定数）。
 */
export type MessageKey = keyof typeof ja;

const PLACEHOLDER = /\{(\w+)\}/g;

export function t(
	key: MessageKey,
	vars?: Record<string, string | number>,
): string {
	const template: string = ja[key];
	if (!vars) return template;
	return template.replace(PLACEHOLDER, (whole, name: string) => {
		const value = vars[name];
		return value === undefined ? whole : String(value);
	});
}
