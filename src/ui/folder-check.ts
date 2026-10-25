import { Notice, type App } from 'obsidian';
import {
	FOLDER_KEYS,
	findBodyNotePaths,
	findNotePaths,
	folderName,
	moveNotes,
	type FolderKey,
} from '../data/folders';
import { t } from '../i18n';
import { folderMismatch, type FolderMismatch } from '../lib/folders';
import type { FitnessServices } from '../services';
import { ChoiceModal } from './modals/choice-modal';

/**
 * 設定の保存先（種目ノート・日ノート）と、ノートの実際の場所の食い違いを調べ、あれば
 * 「ノートを設定の保存先へ移す／保存先をノートのある場所にする」を聞く（設定を変えたのにノートが前の場所にあるなど）。
 * 設定画面を閉じたとき・起動時・「種目ノートを探す」で呼ぶ。食い違いがあったかを返す。
 */
/**
 * 調べるのは 1 つずつ（前の確認・ノートの移動が終わってから次を調べる）。
 * 同じことを 2 回聞いたり、移している途中のノートを数えたりしないため。
 */
let queue: Promise<unknown> = Promise.resolve();

export function checkNoteFolders(
	app: App,
	services: FitnessServices,
	keys: readonly FolderKey[] = FOLDER_KEYS,
): Promise<boolean> {
	const next = queue.then(() => check(app, services, keys));
	queue = next.catch(() => undefined);
	return next;
}

async function check(
	app: App,
	services: FitnessServices,
	keys: readonly FolderKey[],
): Promise<boolean> {
	let found = false;
	for (const key of keys) {
		// 体組成のノートは vault 全体からは探さない（ほかの日付の名前のノートと見分けられないので、
		// 保存先を変えたときに前の保存先の中だけを checkBodyFolderMove で見る）
		if (key === 'bodyFolder') continue;
		const mismatch = folderMismatch(
			services.store.settings[key],
			findNotePaths(app, key),
		);
		if (!mismatch) continue;
		found = true;
		await ask(app, services, key, mismatch);
	}
	return found;
}

/**
 * 体組成の保存先を変えたとき: 前の保存先にある体組成のノートを、新しい保存先へ移すか聞く。
 * 探すのは前の保存先の中だけ（vault のほかの場所の日付の名前のノートは数えない）
 */
export function checkBodyFolderMove(
	app: App,
	services: FitnessServices,
	previous: string,
): Promise<boolean> {
	const next = queue.then(async () => {
		const { store } = services;
		if (!store.bodySettings.enabled) return false;
		const mismatch = folderMismatch(
			store.settings.bodyFolder,
			findBodyNotePaths(app, previous),
		);
		if (!mismatch) return false;
		await ask(app, services, 'bodyFolder', mismatch);
		return true;
	});
	queue = next.catch(() => undefined);
	return next;
}

function ask(
	app: App,
	services: FitnessServices,
	key: FolderKey,
	mismatch: FolderMismatch,
): Promise<void> {
	const { store } = services;
	const target = store.settings[key];
	const name = folderName(key);
	const n = mismatch.paths.length;
	return new Promise((resolve) => {
		const done = (action: () => Promise<void>) => {
			action()
				.catch((error: unknown) => {
					console.error('[fitness-log] folder check', error);
					new Notice(
						t('notice.unexpected', {
							message:
								error instanceof Error
									? error.message
									: String(error),
						}),
					);
				})
				.finally(resolve);
		};
		new ChoiceModal(app, {
			title: t('folders.checkTitle', { name }),
			message: t(
				mismatch.inside > 0
					? 'folders.checkMessageFew'
					: 'folders.checkMessage',
				{
					name,
					target,
					source: mismatch.source,
					n,
					inside: mismatch.inside,
				},
			),
			choices: [
				{
					text: t('folders.moveNotes', { target }),
					desc: t('folders.moveNotesDesc', { n }),
					cta: true,
					onChoose: () =>
						done(async () => {
							const result = await moveNotes(
								app,
								mismatch.paths,
								mismatch.source,
								target,
							);
							if (
								result.moved === 0 &&
								result.skipped.length === 0
							)
								return;
							new Notice(
								result.skipped.length > 0
									? t('folders.movedWithSkips', {
											n: result.moved,
											target,
											skipped: result.skipped.length,
											source: mismatch.source,
										})
									: t('folders.moved', {
											n: result.moved,
											target,
										}),
								10_000,
							);
							// 移したノートを読み直す（vault の変更でも追いつくが、確実に）
							if (key === 'exerciseFolder')
								await services.library.reload();
							else if (key === 'bodyFolder')
								services.body.reload();
							else if (services.index.isBuilt)
								await services.index.rebuild();
						}),
				},
				{
					text: t('folders.useSource', { source: mismatch.source }),
					desc: t('folders.useSourceDesc'),
					onChoose: () =>
						done(async () => {
							await store.update((d) => {
								d.settings[key] = mismatch.source;
							});
							new Notice(
								t('notice.folderFollowed', {
									name,
									folder: mismatch.source,
								}),
							);
						}),
				},
			],
			onDismiss: resolve,
		}).open();
	});
}
