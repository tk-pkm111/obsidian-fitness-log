import type { App } from 'obsidian';
import type { BodyLibrary } from './data/body-library';
import type { DataStore } from './data/data-store';
import type { ExerciseLibrary } from './data/exercise-library';
import type { ListsLibrary } from './data/lists-library';
import type { LogIndex } from './data/log-index';
import type { LogRepository } from './data/log-repository';
import type { PackageLibrary } from './data/package-library';
import type { SessionController } from './session/session-controller';

/** 画面やコマンドに渡す、プラグインの状態と手続きのまとまり */
export interface FitnessServices {
	app: App;
	store: DataStore;
	/** 種目ノート（1 種目 1 ノート）の一覧と読み書き */
	library: ExerciseLibrary;
	/** パッケージノート（1 パッケージ 1 ノート。ルーチンも）の一覧と読み書き */
	packages: PackageLibrary;
	/** 設定ノート（種目の選択肢・体組成の設定） */
	lists: ListsLibrary;
	/** 体組成のノート（1 測定 1 ノート）の一覧と読み書き */
	body: BodyLibrary;
	repository: LogRepository;
	index: LogIndex;
	controller: SessionController;
	/** Obsidian の設定画面でこのプラグインのタブを開く */
	openSettings(): void;
	/** ログの Bases ファイルを作って開く（既にあれば開くだけ） */
	createBasesFile(): void;
}
