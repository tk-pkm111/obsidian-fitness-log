import { t } from './i18n';
import type FitnessLogPlugin from './main';
import { activateMainView } from './ui/activate';
import { openSetup } from './ui/modals/setup-modal';

// コマンド名にプラグイン名は付けない（Obsidian が自動で前に付ける）。id はリリース後に変えない。
export function registerCommands(plugin: FitnessLogPlugin): void {
	plugin.addCommand({
		id: 'open-today',
		name: t('command.openToday'),
		callback: () =>
			void activateMainView(plugin.app, { page: 'today', date: null }),
	});
	plugin.addCommand({
		id: 'open-log',
		name: t('command.openLog'),
		callback: () => void activateMainView(plugin.app, { page: 'log' }),
	});
	plugin.addCommand({
		id: 'setup',
		name: t('command.setup'),
		callback: () => openSetup(plugin.app, plugin.services),
	});
	plugin.addCommand({
		id: 'create-bases-file',
		name: t('command.createBases'),
		callback: () => plugin.services.createBasesFile(),
	});
}
