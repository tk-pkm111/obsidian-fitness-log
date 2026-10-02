import {
	normalizePath,
	Notice,
	PluginSettingTab,
	type App,
	type SettingDefinitionItem,
} from 'obsidian';
import { validateFileNameFormat } from './data/log-repository';
import { t } from './i18n';
import { DEFAULT_SETTINGS } from './lib/model/data';
import type { FitnessLogSettings } from './lib/model/types';
import type FitnessLogPlugin from './main';

type SettingsKey = keyof FitnessLogSettings;

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
			return typeof value === 'string' && value.trim().length > 0
				? { exerciseFolder: normalizePath(value.trim()) }
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
	}

	getControlValue(key: string): unknown {
		return this.plugin.services.store.settings[key as SettingsKey];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const patch = coerceSetting(key as SettingsKey, value);
		if (Object.keys(patch).length === 0) return;
		await this.plugin.services.store.update((data) => {
			Object.assign(data.settings, patch);
		});
	}

	getSettingDefinitions(): SettingDefinitionItem<SettingsKey>[] {
		const { services } = this.plugin;
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
						value.trim().length > 0
							? undefined
							: t('settings.logFolder.empty'),
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
						value.trim().length > 0
							? undefined
							: t('settings.logFolder.empty'),
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
