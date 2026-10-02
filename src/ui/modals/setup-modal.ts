import { Modal, normalizePath, Notice, setIcon, type App } from 'obsidian';
import {
	countForeignNotes,
	ensureFolder,
	findNotePaths,
	type FolderKey,
} from '../../data/folders';
import { LOG_FOLDER_MIGRATION } from '../../data/migrations';
import { t } from '../../i18n';
import { folderCounts, foldersOverlap } from '../../lib/folders';
import { DEFAULT_SETTINGS } from '../../lib/model/data';
import { DEFAULT_EXERCISES } from '../../lib/model/defaults';
import type { FitnessServices } from '../../services';
import { activateMainView } from '../activate';
import { checkNoteFolders } from '../folder-check';
import { FolderSuggest } from '../folder-suggest';
import { runAction, textButton } from '../helpers';

/** 既定の保存先（Fitness/ログ・Fitness/種目）の、親とその中のフォルダ名 */
function splitDefault(path: string): { parent: string; child: string } {
	const index = path.lastIndexOf('/');
	return index < 0
		? { parent: '', child: path }
		: { parent: path.slice(0, index), child: path.slice(index + 1) };
}
const LOG_DEFAULT = splitDefault(DEFAULT_SETTINGS.logFolder);
const EXERCISE_DEFAULT = splitDefault(DEFAULT_SETTINGS.exerciseFolder);

function join(parent: string, child: string): string {
	const p = normalizePath(parent.trim());
	return p === '' || p === '/' ? child : `${p}/${child}`;
}

/**
 * はじめの設定（オンボーディング）。初めての人が迷わないよう、決めることは 1 つだけ:
 * 「保存するフォルダ」（その中に ログ・種目 を作る）。別々のフォルダにしたい人は「フォルダを別々に選ぶ」。
 * - 入れ直したときなど vault に既に記録・種目のノートがあれば、その場所をそのまま使う（別々の欄に入れておく）
 * - 「はじめる」までは何も作らない。よく使う種目とメニューの例は、保存先を決めてから足りない分だけ入れる
 * - コマンド「保存先を設定」でやり直せる（保存先を変えたらノートを移すか聞く）
 */
export class SetupModal extends Modal {
	constructor(
		app: App,
		private readonly services: FitnessServices,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, services } = this;
		const { store } = services;
		const first = store.needsSetup;
		this.setTitle(first ? t('setup.title') : t('setup.titleAgain'));
		contentEl.addClass('fitness-log-setup');

		const found = {
			logFolder: this.found('logFolder'),
			exerciseFolder: this.found('exerciseFolder'),
		};
		const hasExisting =
			found.logFolder.length > 0 || found.exerciseFolder.length > 0;
		contentEl.createEl('p', {
			text:
				hasExisting && first ? t('setup.introFound') : t('setup.intro'),
		});

		// かんたん: 1 つのフォルダ（その中に ログ・種目 を作る）
		const simple = contentEl.createDiv({ cls: 'fitness-log-setup-field' });
		simple.createDiv({
			cls: 'fitness-log-setup-label',
			text: t('setup.folderLabel'),
		});
		const parent = this.folderInput(simple, LOG_DEFAULT.parent);
		const preview = simple.createDiv({ cls: 'fitness-log-muted' });
		const showPreview = () =>
			preview.setText(
				t('setup.folderPreview', {
					log: join(parent.value, LOG_DEFAULT.child),
					exercise: join(parent.value, EXERCISE_DEFAULT.child),
				}),
			);
		parent.addEventListener('input', showPreview);
		showPreview();

		// 別々: 記録と種目のフォルダ（見つかったノートの場所を押して選べる）
		const separate = contentEl.createDiv({
			cls: 'fitness-log-setup-separate',
		});
		const log = this.separateField(
			separate,
			'logFolder',
			t('setup.logLabel'),
			first && found.logFolder[0]
				? found.logFolder[0].folder
				: store.settings.logFolder,
			found.logFolder,
		);
		const exercise = this.separateField(
			separate,
			'exerciseFolder',
			t('setup.exerciseLabel'),
			first && found.exerciseFolder[0]
				? found.exerciseFolder[0].folder
				: store.settings.exerciseFolder,
			found.exerciseFolder,
		);
		// 種目の保存先に、種目ではないノートがあれば知らせる（種目として読まれてしまう）
		const warn = exercise.createDiv({ cls: 'fitness-log-setup-warning' });
		const exerciseInput = exercise.querySelector('input');
		const checkForeign = () => {
			const folder = normalizePath(exerciseInput?.value.trim() ?? '');
			const n =
				folder && folder !== '/'
					? countForeignNotes(this.app, folder)
					: 0;
			warn.setText(n > 0 ? t('setup.foreignNotes', { n }) : '');
		};
		exerciseInput?.addEventListener('input', checkForeign);
		checkForeign();

		// 既にノートがある・やり直しのときは別々の欄、初めてならかんたんな 1 つの欄
		let separateMode = hasExisting || !first;
		const toggle = contentEl.createEl('button', {
			cls: 'fitness-log-setup-toggle',
			attr: { type: 'button' },
		});
		const setMode = (value: boolean) => {
			separateMode = value;
			simple.toggleClass('fitness-log-hidden', value);
			separate.toggleClass('fitness-log-hidden', !value);
			toggle.empty();
			toggle.createSpan({
				text: value
					? t('setup.useOneFolder')
					: t('setup.chooseSeparately'),
			});
			setIcon(toggle.createSpan(), 'chevron-right');
		};
		toggle.addEventListener('click', () => setMode(!separateMode));
		setMode(separateMode);

		const seedRow = contentEl.createEl('label', {
			cls: 'fitness-log-setup-seed',
		});
		const seed = seedRow.createEl('input', { type: 'checkbox' });
		seed.checked = first;
		const seedText = seedRow.createDiv();
		seedText.createDiv({
			cls: 'fitness-log-setup-label',
			text: t('setup.seed'),
		});
		seedText.createDiv({
			cls: 'fitness-log-muted',
			text: [
				t('setup.seedDesc', { n: DEFAULT_EXERCISES.length }),
				// 既にノートがあるときだけ（初めての人には要らない情報）
				...(hasExisting || !first ? [t('setup.seedDescExisting')] : []),
			].join(''),
		});

		const error = contentEl.createDiv({ cls: 'fitness-log-prompt-error' });
		const buttons = contentEl.createDiv({
			cls: 'fitness-log-modal-buttons',
		});
		textButton(buttons, t('setup.later'), () => this.close());
		textButton(
			buttons,
			first ? t('setup.start') : t('setup.save'),
			() => {
				const logInput = log.querySelector('input');
				const raw = separateMode
					? {
							log: logInput?.value.trim() ?? '',
							exercise: exerciseInput?.value.trim() ?? '',
						}
					: {
							log: join(parent.value, LOG_DEFAULT.child),
							exercise: join(
								parent.value,
								EXERCISE_DEFAULT.child,
							),
						};
				if (!raw.log || !raw.exercise) {
					error.setText(t('setup.empty'));
					return;
				}
				const logFolder = normalizePath(raw.log);
				const exerciseFolder = normalizePath(raw.exercise);
				if (foldersOverlap(logFolder, exerciseFolder)) {
					error.setText(t('setup.overlap'));
					return;
				}
				this.close();
				runAction(this.app, () =>
					this.apply(logFolder, exerciseFolder, seed.checked, first),
				);
			},
			{ cta: true },
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** vault に既にある記録・種目のノートの場所（多い順） */
	private found(key: FolderKey): Array<{ folder: string; count: number }> {
		return folderCounts(findNotePaths(this.app, key)).filter(
			(f) => f.folder !== '/',
		);
	}

	private folderInput(parent: HTMLElement, value: string): HTMLInputElement {
		const input = parent.createEl('input', {
			type: 'text',
			cls: 'fitness-log-setup-input',
			value,
			attr: { spellcheck: 'false', autocomplete: 'off' },
		});
		new FolderSuggest(this.app, input);
		return input;
	}

	/** 名前・入力欄と、見つかったノートの場所（押すと入る） */
	private separateField(
		parent: HTMLElement,
		key: FolderKey,
		label: string,
		value: string,
		found: ReadonlyArray<{ folder: string; count: number }>,
	): HTMLElement {
		const box = parent.createDiv({ cls: 'fitness-log-setup-field' });
		box.createDiv({ cls: 'fitness-log-setup-label', text: label });
		const input = this.folderInput(box, value);
		if (found.length > 0) {
			const chips = box.createDiv({ cls: 'fitness-log-setup-found' });
			chips.createSpan({
				cls: 'fitness-log-muted',
				text: t('setup.found'),
			});
			for (const { folder, count } of found.slice(0, 3)) {
				const chip = chips.createEl('button', {
					cls: 'fitness-log-chip',
					text: t(
						key === 'logFolder'
							? 'setup.foundLogs'
							: 'setup.foundExercises',
						{ folder, n: count },
					),
					attr: { type: 'button' },
				});
				chip.addEventListener('click', () => {
					input.value = folder;
					input.dispatchEvent(new Event('input'));
				});
			}
		}
		return box;
	}

	private async apply(
		logFolder: string,
		exerciseFolder: string,
		seed: boolean,
		first: boolean,
	): Promise<void> {
		const { store, library } = this.services;
		await ensureFolder(this.app, logFolder);
		await ensureFolder(this.app, exerciseFolder);
		await store.update((d) => {
			d.settings.logFolder = logFolder;
			d.settings.exerciseFolder = exerciseFolder;
			d.setupAt ??= new Date().toISOString();
			// 以前の版の保存先の移行（Fitness/ の直下 → Fitness/ログ）は、保存先を選んだので要らない
			if (!d.migrations.includes(LOG_FOLDER_MIGRATION))
				d.migrations.push(LOG_FOLDER_MIGRATION);
		});
		// 新しい保存先の種目ノートを読んでから、足りない種目・メニューの例だけを入れる
		await library.ensureLoaded();
		const result = seed ? await library.seed() : null;
		new Notice(
			result && result.addedExercises + result.addedPackages > 0
				? t('setup.doneSeeded', {
						exercises: result.addedExercises,
						packages: result.addedPackages,
					})
				: t('setup.done'),
			8000,
		);
		await activateMainView(this.app, { page: 'today', date: null });
		// やり直しで保存先を変えたときは、今あるノートを移すか聞く
		if (!first) await checkNoteFolders(this.app, this.services);
	}
}

export function openSetup(app: App, services: FitnessServices): void {
	new SetupModal(app, services).open();
}
