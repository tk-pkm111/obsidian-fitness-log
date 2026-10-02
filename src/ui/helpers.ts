import { Notice, setIcon, setTooltip, type App } from 'obsidian';
import { LogParseError } from '../data/log-repository';
import { t } from '../i18n';
import { DayLogError } from '../lib/log/day-ops';
import { CatalogError } from '../lib/model/catalog';
import { SessionError } from '../session/session-controller';

/** vault 内のノートを新しいタブで開く */
export function openNoteInNewTab(app: App, path: string): void {
	const file = app.vault.getFileByPath(path);
	if (file) void app.workspace.getLeaf('tab').openFile(file);
}

/**
 * 画面の操作を実行し、失敗を Notice で知らせる。
 * 記録ブロックが読めないときは「ノートを開く」導線を付ける（データを潰さない方針）。
 */
export function runAction(app: App, action: () => Promise<unknown>): void {
	action().catch((error: unknown) => {
		if (error instanceof LogParseError) {
			const fragment = createFragment((f) => {
				f.createDiv({
					text: t('notice.noteError', {
						path: error.path,
						reason: error.reason,
					}),
				});
				const link = f.createEl('a', {
					text: t('notice.openNote'),
					href: '#',
				});
				link.addEventListener('click', (event) => {
					event.preventDefault();
					openNoteInNewTab(app, error.path);
				});
			});
			new Notice(fragment, 10_000);
			return;
		}
		if (
			error instanceof SessionError ||
			error instanceof DayLogError ||
			error instanceof CatalogError
		) {
			new Notice(error.message);
			return;
		}
		console.error('[fitness-log]', error);
		new Notice(
			t('notice.unexpected', {
				message: error instanceof Error ? error.message : String(error),
			}),
		);
	});
}

/** アイコンだけのボタン（ラベルは aria-label とツールチップに出す） */
export function iconButton(
	parent: HTMLElement,
	icon: string,
	label: string,
	onClick: (event: MouseEvent) => void,
	cls = '',
): HTMLButtonElement {
	const button = parent.createEl('button', {
		cls: `clickable-icon fitness-log-icon-button ${cls}`.trim(),
		attr: { 'aria-label': label, type: 'button' },
	});
	setIcon(button, icon);
	setTooltip(button, label);
	button.addEventListener('click', onClick);
	return button;
}

/** アイコン＋文字のボタン */
export function textButton(
	parent: HTMLElement,
	text: string,
	onClick: (event: MouseEvent) => void,
	options: {
		icon?: string;
		cls?: string;
		cta?: boolean;
		disabled?: boolean;
	} = {},
): HTMLButtonElement {
	const button = parent.createEl('button', {
		cls: `fitness-log-button ${options.cls ?? ''}`.trim(),
		attr: { type: 'button' },
	});
	if (options.cta) button.addClass('mod-cta');
	if (options.icon)
		setIcon(
			button.createSpan({ cls: 'fitness-log-button-icon' }),
			options.icon,
		);
	button.createSpan({ text });
	button.disabled = options.disabled ?? false;
	button.addEventListener('click', onClick);
	return button;
}
