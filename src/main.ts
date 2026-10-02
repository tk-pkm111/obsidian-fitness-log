import { Notice, Plugin } from 'obsidian';
import { registerCommands } from './commands';
import { ensureBasesFile } from './data/bases-file';
import { DataStore } from './data/data-store';
import { ExerciseLibrary } from './data/exercise-library';
import { registerFolderFollow, relocateFolders } from './data/folders';
import { LogIndex } from './data/log-index';
import { LogRepository } from './data/log-repository';
import { migrateLogFolder } from './data/migrations';
import { t } from './i18n';
import type { FitnessServices } from './services';
import { SessionController } from './session/session-controller';
import { FitnessLogSettingTab } from './settings';
import { activateMainView } from './ui/activate';
import { openNoteInNewTab, runAction } from './ui/helpers';
import { MainView, VIEW_TYPE_MAIN } from './ui/main-view';

/** 設定画面を開く非公開 API（無ければ案内だけ出す） */
interface SettingHost {
	setting?: { open(): void; openTabById(id: string): unknown };
}

// main.ts はプラグインのライフサイクル（読み込み・登録・解放）だけを担当する。
// 機能の中身は src/ 配下の各モジュールに置く。
export default class FitnessLogPlugin extends Plugin {
	services!: FitnessServices;
	private locationKey = '';
	private exerciseFolder = '';

	async onload(): Promise<void> {
		const store = new DataStore(this);
		await store.load();
		const repository = new LogRepository(this.app, () => store.settings);
		const index = new LogIndex(this.app, repository);
		const controller = new SessionController(store, repository, index);
		const library = new ExerciseLibrary(this.app, store);
		this.services = {
			app: this.app,
			store,
			library,
			repository,
			index,
			controller,
			openSettings: () => this.openSettings(),
			createBasesFile: () => this.createBasesFile(),
		};
		this.locationKey = this.currentLocationKey();
		this.exerciseFolder = store.settings.exerciseFolder;

		this.registerView(
			VIEW_TYPE_MAIN,
			(leaf) => new MainView(leaf, this.services),
		);
		this.addRibbonIcon('dumbbell', t('ribbon.openToday'), () => {
			void activateMainView(this.app, { page: 'today', date: null });
		});
		registerCommands(this);
		this.addSettingTab(new FitnessLogSettingTab(this.app, this));
		this.registerEvent(store.onChange(() => this.onDataChange()));

		// 重い処理（初期データ投入・vault の購読）はレイアウトの準備後に回す
		this.app.workspace.onLayoutReady(() => void this.onLayoutReady());
	}

	onunload(): void {
		// registerView / addCommand / registerEvent などで登録したものは Obsidian が解放する。
		// ビューの leaf は detach しない（ガイドライン: 再読み込み時に元の位置へ戻すため）。
	}

	/** Sync などで data.json が外から変わったとき */
	async onExternalSettingsChange(): Promise<void> {
		await this.services.store.reload();
	}

	private async onLayoutReady(): Promise<void> {
		const { store, index, library } = this.services;
		// フォルダの名前を変えた・移したら設定も追いかける。設定のフォルダが無ければノートのある場所に合わせる
		registerFolderFollow(this, this.app, store);
		await this.relocateFolders();
		// 以前の版（日ノートを Fitness/ の直下に保存）からの移行 → Fitness/ログ/ へ
		const movedNotes = await migrateLogFolder(this.app, store);
		if (movedNotes > 0)
			new Notice(
				t('notice.logFolderMigrated', {
					count: movedNotes,
					folder: store.settings.logFolder,
				}),
			);
		await library.ensureLoaded();
		library.registerVaultEvents(this);
		index.registerVaultEvents(this);
		// 以前の版（種目を data.json に保存していた）からの移行 → 種目ノートを作る
		const migrated = await library.migrateLegacy();
		if (migrated > 0)
			new Notice(
				t('notice.exercisesMigrated', {
					count: migrated,
					folder: library.folderPath,
				}),
			);
		if (!store.current.seededAt) await library.seed();
		if (store.settings.openOnStartup)
			await activateMainView(this.app, { page: 'today', date: null });
	}

	/**
	 * 設定のフォルダが無ければ、ノートのある場所に合わせる。起動直後はノートの frontmatter の
	 * キャッシュがそろっていないことがあるので、見つからなければ索引が済んだときにもう一度だけ探す。
	 */
	private async relocateFolders(): Promise<void> {
		const { store } = this.services;
		await relocateFolders(this.app, store);
		const missing = [
			store.settings.exerciseFolder,
			store.settings.logFolder,
		].some((folder) => this.app.vault.getFolderByPath(folder) === null);
		if (!missing) return;
		const ref = this.app.metadataCache.on('resolved', () => {
			this.app.metadataCache.offref(ref);
			void relocateFolders(this.app, store);
		});
		this.registerEvent(ref);
	}

	private currentLocationKey(): string {
		const { logFolder, fileNameFormat } = this.services.store.settings;
		return `${logFolder}\n${fileNameFormat}`;
	}

	/** ログの保存先・書式・種目フォルダが変わったら読み直す */
	private onDataChange(): void {
		const { store, index, library } = this.services;
		const key = this.currentLocationKey();
		if (key !== this.locationKey) {
			this.locationKey = key;
			if (index.isBuilt) void index.rebuild();
		}
		if (store.settings.exerciseFolder !== this.exerciseFolder) {
			this.exerciseFolder = store.settings.exerciseFolder;
			if (library.isLoaded) void library.reload();
		}
	}

	private openSettings(): void {
		const setting = (this.app as unknown as SettingHost).setting;
		if (!setting) {
			new Notice(t('notice.settingsUnavailable'));
			return;
		}
		setting.open();
		setting.openTabById(this.manifest.id);
	}

	private createBasesFile(): void {
		runAction(this.app, async () => {
			const file = await ensureBasesFile(
				this.app,
				this.services.store.settings.logFolder,
			);
			openNoteInNewTab(this.app, file.path);
		});
	}
}
