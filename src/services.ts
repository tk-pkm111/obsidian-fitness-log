import type { App } from 'obsidian';
import type { DataStore } from './data/data-store';
import type { ExerciseLibrary } from './data/exercise-library';
import type { LogIndex } from './data/log-index';
import type { LogRepository } from './data/log-repository';
import type { SessionController } from './session/session-controller';

/** 画面やコマンドに渡す、プラグインの状態と手続きのまとまり */
export interface FitnessServices {
	app: App;
	store: DataStore;
	/** 種目ノート（1 種目 1 ノート）の一覧と読み書き */
	library: ExerciseLibrary;
	repository: LogRepository;
	index: LogIndex;
	controller: SessionController;
	/** Obsidian の設定画面でこのプラグインのタブを開く */
	openSettings(): void;
	/** ログの Bases ファイルを作って開く（既にあれば開くだけ） */
	createBasesFile(): void;
}
