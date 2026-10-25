import {
	normalizePath,
	Notice,
	PluginSettingTab,
	type App,
	type SettingDefinitionItem,
} from 'obsidian';
import { FOLDER_KEYS, type FolderKey } from './data/folders';
import { foldersOverlap } from './lib/folders';
import { validateFileNameFormat } from './data/log-repository';
import { t } from './i18n';
import { DEFAULT_SETTINGS } from './lib/model/data';
import type { ExerciseLists, ListKind } from './lib/model/lists';
import type { FitnessLogSettings } from './lib/model/types';
import type FitnessLogPlugin from './main';
import { checkNoteFolders } from './ui/folder-check';
import { BodyItemsModal } from './ui/modals/body-items-modal';
import { ListEditModal } from './ui/modals/list-edit-modal';
import type { BodyItem } from './lib/body/items';

type SettingsKey = keyof FitnessLogSettings;
/** 設定ノートに書く設定（data.json の settings ではない） */
const BODY_ENABLED_KEY = 'bodyComposition';
type ControlKey = SettingsKey | typeof BODY_ENABLED_KEY;

/** 体組成の項目を短く（「体重・体脂肪率・筋肉量 ほか 6 項目」） */
export function bodyItemsSummary(items: readonly BodyItem[]): string {
	if (items.length === 0) return t('settings.bodyItems.none');
	const names = items
		.slice(0, 3)
		.map((item) => item.name)
		.join('・');
	return items.length > 3
		? t('settings.bodyItems.more', { names, n: items.length - 3 })
		: names;
}

/** 一覧の中身を短く（「プッシュ・プル・脚 …」） */
function listSummary(lists: ExerciseLists, kind: ListKind): string {
	const names =
		kind === 'recordTypes'
			? lists.recordTypes.map((r) => r.name)
			: lists[kind];
	const shown = names.slice(0, 5).join('・');
	return names.length > 5 ? `${shown} …` : shown;
}

/** 空ならデフォルトに戻し、パス表記を Obsidian 流に揃える */
export function normalizeLogFolder(value: string): string {
	const trimmed = value.trim();
	return normalizePath(
		trimmed.length > 0 ? trimmed : DEFAULT_SETTINGS.logFolder,
	);
}

/** 設定タブからの値を型に合わせて受け取る（不正な値は採用しない） */
export function coerceSetting(
	key: SettingsKey,
	value: unknown,
): Partial<FitnessLogSettings> {
	switch (key) {
		case 'logFolder':
			return typeof value === 'string'
				? { logFolder: normalizeLogFolder(value) }
				: {};
		case 'exerciseFolder':
		case 'packageFolder':
		case 'bodyFolder':
			return typeof value === 'string' && value.trim().length > 0
				? { [key]: normalizePath(value.trim()) }
				: {};
		case 'fileNameFormat':
			return typeof value === 'string' &&
				validateFileNameFormat(value) === undefined
				? { fileNameFormat: value.trim() }
				: {};
		case 'weightUnit':
			return value === 'kg' || value === 'lb'
				? { weightUnit: value }
				: {};
		case 'weightStep':
			return typeof value === 'number' &&
				Number.isFinite(value) &&
				value > 0
				? { weightStep: value }
				: {};
		case 'showRestTimer':
		case 'openOnStartup':
		case 'packageSections':
			return typeof value === 'boolean' ? { [key]: value } : {};
	}
}

/**
 * 宣言的な設定タブ（1.13.0+）。設定は data.json の settings（入れ子）にあるので、
 * getControlValue / setControlValue を上書きして DataStore 経由で読み書きする
 * （公式ガイド Plugins/User interface/Settings.md「Custom settings storage」）。
 */
export class FitnessLogSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: FitnessLogPlugin,
	) {
		super(app, plugin);
		// 説明（一覧の中身）と出す行（体組成のオン・オフ）は定義を作ったときの値なので、
		// 設定ノートを読んだ・ほかの画面や端末で変えたときに作り直す
		const { store } = plugin.services;
		let last = this.notesKey();
		plugin.registerEvent(
			store.onChange(() => {
				const key = this.notesKey();
				if (key === last) return;
				last = key;
				this.update();
			}),
		);
	}

	private notesKey(): string {
		const { store } = this.plugin.services;
		return JSON.stringify([store.lists, store.bodySettings]);
	}

	/** この画面を開いてから変えた保存先の、変える前の値（閉じたときにノートを移すか聞く） */
	private foldersBefore: Partial<Record<FolderKey, string>> = {};

	getControlValue(key: string): unknown {
		if (key === BODY_ENABLED_KEY)
			return this.plugin.services.store.bodySettings.enabled;
		return this.plugin.services.store.settings[key as SettingsKey];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === BODY_ENABLED_KEY) {
			if (typeof value !== 'boolean') return;
			await this.setBodyEnabled(value);
			return;
		}
		const folderKey = FOLDER_KEYS.find((k) => k === key);
		if (folderKey && !(folderKey in this.foldersBefore))
			this.foldersBefore[folderKey] =
				this.plugin.services.store.settings[folderKey];
		const patch = coerceSetting(key as SettingsKey, value);
		if (Object.keys(patch).length === 0) return;
		await this.plugin.services.store.update((data) => {
			Object.assign(data.settings, patch);
		});
	}

	/**
	 * 閉じたとき: 保存先を変えていれば、今あるノートを新しい保存先へ移すか聞く。
	 * 入力のたびに保存されるので、打っている途中のフォルダに移さないよう、閉じたときにまとめて聞く。
	 */
	hide(): void {
		super.hide();
		const { store } = this.plugin.services;
		const changed = FOLDER_KEYS.filter(
			(key) =>
				this.foldersBefore[key] !== undefined &&
				this.foldersBefore[key] !== store.settings[key],
		);
		this.foldersBefore = {};
		if (changed.length > 0)
			void checkNoteFolders(this.app, this.plugin.services, changed);
	}

	/** 体組成のオン・オフ（設定ノートに書くので、ほかの端末とそろう）。保存先と項目の行を出し直す */
	private async setBodyEnabled(enabled: boolean): Promise<void> {
		const { lists } = this.plugin.services;
		try {
			await lists.setBodyEnabled(enabled);
		} catch (error) {
			new Notice(
				t('notice.unexpected', {
					message:
						error instanceof Error ? error.message : String(error),
				}),
			);
		}
		this.update();
	}

	/** 保存先の入力の確かめ: 空でないこと、ほかの保存先と重ならないこと（記録・種目・パッケージ・体組成は別々） */
	private validateFolder(key: FolderKey, value: string): string | undefined {
		if (value.trim().length === 0) return t('settings.logFolder.empty');
		const folder = normalizePath(value.trim());
		const { settings } = this.plugin.services.store;
		return FOLDER_KEYS.some(
			(other) => other !== key && foldersOverlap(folder, settings[other]),
		)
			? t('settings.folderOverlap')
			: undefined;
	}

	getSettingDefinitions(): SettingDefinitionItem<ControlKey>[] {
		const { services } = this.plugin;
		const bodyEnabled = () => services.store.bodySettings.enabled;
		return [
			{
				name: t('settings.logFolder.name'),
				desc: t('settings.logFolder.desc'),
				control: {
					type: 'folder',
					key: 'logFolder',
					placeholder: DEFAULT_SETTINGS.logFolder,
					defaultValue: DEFAULT_SETTINGS.logFolder,
					validate: (value) =>
						this.validateFolder('logFolder', value),
				},
			},
			{
				name: t('settings.exerciseFolder.name'),
				desc: t('settings.exerciseFolder.desc'),
				control: {
					type: 'folder',
					key: 'exerciseFolder',
					placeholder: DEFAULT_SETTINGS.exerciseFolder,
					defaultValue: DEFAULT_SETTINGS.exerciseFolder,
					validate: (value) =>
						this.validateFolder('exerciseFolder', value),
				},
			},
			{
				name: t('settings.packageFolder.name'),
				desc: t('settings.packageFolder.desc'),
				control: {
					type: 'folder',
					key: 'packageFolder',
					placeholder: DEFAULT_SETTINGS.packageFolder,
					defaultValue: DEFAULT_SETTINGS.packageFolder,
					validate: (value) =>
						this.validateFolder('packageFolder', value),
				},
			},
			{
				name: t('settings.fileNameFormat.name'),
				desc: t('settings.fileNameFormat.desc'),
				control: {
					type: 'text',
					key: 'fileNameFormat',
					placeholder: DEFAULT_SETTINGS.fileNameFormat,
					defaultValue: DEFAULT_SETTINGS.fileNameFormat,
					validate: (value) => validateFileNameFormat(value),
				},
			},
			{
				name: t('settings.weightUnit.name'),
				desc: t('settings.weightUnit.desc'),
				control: {
					type: 'dropdown',
					key: 'weightUnit',
					defaultValue: DEFAULT_SETTINGS.weightUnit,
					options: { kg: 'kg', lb: 'lb' },
				},
			},
			{
				name: t('settings.weightStep.name'),
				desc: t('settings.weightStep.desc'),
				control: {
					type: 'number',
					key: 'weightStep',
					min: 0.1,
					step: 'any',
					defaultValue: DEFAULT_SETTINGS.weightStep,
					validate: (value) =>
						value > 0
							? undefined
							: t('settings.weightStep.invalid'),
				},
			},
			{
				name: t('settings.showRestTimer.name'),
				desc: t('settings.showRestTimer.desc'),
				control: {
					type: 'toggle',
					key: 'showRestTimer',
					defaultValue: true,
				},
			},
			{
				name: t('settings.openOnStartup.name'),
				desc: t('settings.openOnStartup.desc'),
				control: {
					type: 'toggle',
					key: 'openOnStartup',
					defaultValue: false,
				},
			},
			{
				name: t('settings.packageSections.name'),
				desc: t('settings.packageSections.desc'),
				control: {
					type: 'toggle',
					key: 'packageSections',
					defaultValue: DEFAULT_SETTINGS.packageSections,
				},
			},
			{
				// カテゴリ・器具・記録のしかたの一覧（設定ノートに書くので、ほかの端末とそろう）
				type: 'group',
				heading: t('settings.group.lists'),
				items: (
					['categories', 'equipment', 'recordTypes'] as const
				).map((kind) => ({
					name: t(`lists.title.${kind}`),
					desc: listSummary(services.lists.lists, kind),
					action: () =>
						new ListEditModal(this.app, {
							kind,
							lists: services.lists,
							store: services.store,
							onDone: () => this.update(),
						}).open(),
				})),
			},
			{
				// 体組成（オン・オフと項目は設定ノート、保存先は端末ごとの data.json）
				type: 'group',
				heading: t('settings.group.body'),
				items: [
					{
						name: t('settings.bodyEnabled.name'),
						desc: t('settings.bodyEnabled.desc'),
						control: {
							type: 'toggle',
							key: BODY_ENABLED_KEY,
							defaultValue: false,
						},
					},
					{
						name: t('settings.bodyFolder.name'),
						desc: t('settings.bodyFolder.desc'),
						visible: bodyEnabled,
						control: {
							type: 'folder',
							key: 'bodyFolder',
							placeholder: DEFAULT_SETTINGS.bodyFolder,
							defaultValue: DEFAULT_SETTINGS.bodyFolder,
							validate: (value) =>
								this.validateFolder('bodyFolder', value),
						},
					},
					{
						name: t('settings.bodyItems.name'),
						desc: bodyItemsSummary(
							services.store.bodySettings.items,
						),
						visible: bodyEnabled,
						action: () =>
							new BodyItemsModal(this.app, {
								services,
								onDone: () => this.update(),
							}).open(),
					},
				],
			},
			{
				type: 'group',
				heading: t('settings.group.data'),
				items: [
					{
						name: t('settings.reseed.name'),
						desc: t('settings.reseed.desc'),
						action: () => {
							void services.library.seed().then(
								(result) =>
									new Notice(
										t('notice.seeded', {
											exercises: result.addedExercises,
											packages: result.addedPackages,
										}),
									),
							);
						},
					},
					{
						name: t('settings.bases.name'),
						desc: t('settings.bases.desc'),
						action: () => services.createBasesFile(),
					},
				],
			},
		];
	}
}
