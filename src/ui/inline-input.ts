import { Platform } from 'obsidian';

/**
 * 文字の見た目のまま、押すとその場で直せる入力欄（セットの重量・回数・時刻・休憩）。
 * スマホで onPick があれば入力欄ではなくボタンにし、押すとスクロールで選ぶ画面（ホイール）を開く。
 * - 押すと全体が選ばれ、そのまま打ち直せる（スマホは inputmode の数字キーボード）
 * - Enter か欄の外を押すと確定、Esc で元に戻す
 * - 幅は中身の文字数に合わせる（--fitness-log-chars）
 * - 確定で画面が描き直されても、data-focus-key で次に押した欄のフォーカスが戻る（MainView）
 */
export interface InlineInputOptions {
	/** 普段の表示（'22:40'） */
	value: string;
	/** 直しているときの値（時刻は秒まで '22:40:01'）。省略時は value */
	editValue?: string;
	label: string;
	focusKey: string;
	inputMode: 'decimal' | 'numeric' | 'text';
	placeholder?: string;
	cls?: string;
	/** 変えた値で確定する。false を返すと元の値に戻す（読めない値など。知らせるのは呼び出し側） */
	onCommit: (text: string) => boolean;
	/** スマホではこちら（ホイールを開く） */
	onPick?: () => void;
}

export function inlineInput(
	parent: HTMLElement,
	options: InlineInputOptions,
): HTMLElement {
	const editValue = options.editValue ?? options.value;
	const placeholder = options.placeholder ?? '';
	const { onPick } = options;
	if (onPick && Platform.isMobile) {
		const button = parent.createEl('button', {
			cls: [
				'fitness-log-inline-edit',
				'is-picker',
				...(options.cls ? [options.cls] : []),
			],
			text: options.value || placeholder,
			attr: {
				type: 'button',
				'aria-label': options.label,
				'data-focus-key': options.focusKey,
			},
		});
		button.toggleClass('is-empty', options.value === '');
		button.addEventListener('click', onPick);
		return button;
	}
	const input = parent.createEl('input', {
		type: 'text',
		cls: ['fitness-log-inline-edit', ...(options.cls ? [options.cls] : [])],
		value: options.value,
		attr: {
			inputmode: options.inputMode,
			enterkeyhint: 'done',
			autocomplete: 'off',
			spellcheck: 'false',
			placeholder,
			'aria-label': options.label,
			'data-focus-key': options.focusKey,
		},
	});
	const fit = () =>
		input.setCssProps({
			'--fitness-log-chars': String(
				Math.max(1, (input.value || placeholder).length),
			),
		});
	fit();

	let cancelled = false;
	input.addEventListener('focus', () => {
		cancelled = false;
		input.value = editValue;
		fit();
		// iOS では focus の直後に選ばないと選択が外れる
		window.setTimeout(() => {
			if (input.doc.activeElement === input)
				input.setSelectionRange(0, input.value.length);
		}, 0);
	});
	input.addEventListener('input', fit);
	input.addEventListener('keydown', (event) => {
		if (event.isComposing) return;
		if (event.key === 'Enter') {
			event.preventDefault();
			input.blur();
		} else if (event.key === 'Escape') {
			// ビューの Esc（メニューを閉じる）に渡さない
			event.preventDefault();
			event.stopPropagation();
			cancelled = true;
			input.blur();
		}
	});
	input.addEventListener('blur', () => {
		const text = input.value.trim();
		const changed = !cancelled && text !== editValue.trim();
		if (changed && options.onCommit(text)) return; // 描き直しで新しい値になる
		input.value = options.value;
		fit();
	});
	return input;
}
