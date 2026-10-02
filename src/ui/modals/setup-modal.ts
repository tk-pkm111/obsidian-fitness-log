import { Modal, normalizePath, Notice, type App } from 'obsidian';
import {
	countForeignNotes,
	ensureFolder,
	findNotePaths,
	type FolderKey,
} from '../../data/folders';
import { LOG_FOLDER_MIGRATION } from '../../data/migrations';
import { t } from '../../i18n';
import { folderCounts, foldersOverlap } from '../../lib/folders';
import { DEFAULT_EXERCISES } from '../../lib/model/defaults';
import type { FitnessServices } from '../../services';
import { activateMainView } from '../activate';
import { checkNoteFolders } from '../folder-check';
import { FolderSuggest } from '../folder-suggest';
import { runAction, textButton } from '../helpers';

/**
 * 最初の設定（オンボーディング）: 日ノートと種目ノートの保存先を決めてから、初期データを入れる。
 * - 入れ直したときなど vault に既にノートがあれば、その場所を最初から入れておく（押して選ぶこともできる）
 * - フォルダが無ければ作る。種目ノートと日ノートは別のフォルダにする（混ぜると日ノートが種目として読まれる）
 * - 「はじめる」までは何も作らない。コマンドからやり直せる（そのときは保存先を変えたらノートを移すか聞く）
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
		contentEl.createEl('p', { text: t('setup.intro') });

		const log = this.folderField(
			'logFolder',
			t('setup.logLabel'),
			t('setup.logDesc'),
			first,
		);
		const exercise = this.folderField(
			'exerciseFolder',
			t('setup.exerciseLabel'),
			t('setup.exerciseDesc'),
			first,
		);
		// 種目ノートの保存先に、種目ではないノートがあれば知らせる（種目として読まれ、fitness_id が足される）
		const warn = exercise.box.createDiv({
			cls: 'fitness-log-setup-warning',
		});
		const checkForeign = () => {
			const folder = normalizePath(exercise.input.value.trim());
			const n =
				folder && folder !== '/'
					? countForeignNotes(this.app, folder)
					: 0;
			warn.setText(n > 0 ? t('setup.foreignNotes', { n }) : '');
		};
		exercise.input.addEventListener('input', checkForeign);
		checkForeign();

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
			text: t('setup.seedDesc', { n: DEFAULT_EXERCISES.length }),
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
				const logFolder = normalizePath(log.input.value.trim());
				const exerciseFolder = normalizePath(
					exercise.input.value.trim(),
				);
				if (!log.input.value.trim() || !exercise.input.value.trim()) {
					error.setText(t('setup.empty'));
					return;
				}
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

	/** 名前・説明・入力欄（フォルダの候補つき）と、見つかったノートの場所（押すと入る） */
	private folderField(
		key: FolderKey,
		label: string,
		desc: string,
		first: boolean,
	): { box: HTMLElement; input: HTMLInputElement } {
		const found = folderCounts(findNotePaths(this.app, key)).filter(
			(f) => f.folder !== '/',
		);
		const current = this.services.store.settings[key];
		const box = this.contentEl.createDiv({
			cls: 'fitness-log-setup-field',
		});
		box.createDiv({ cls: 'fitness-log-setup-label', text: label });
		box.createDiv({ cls: 'fitness-log-muted', text: desc });
		const input = box.createEl('input', {
			type: 'text',
			cls: 'fitness-log-setup-input',
			// 入れ直したときは、ノートがある場所を最初から入れておく
			value: first ? (found[0]?.folder ?? current) : current,
			attr: { spellcheck: 'false', autocomplete: 'off' },
		});
		new FolderSuggest(this.app, input);
		if (found.length > 0) {
			const chips = box.createDiv({ cls: 'fitness-log-setup-found' });
			chips.createSpan({
				cls: 'fitness-log-muted',
				text: t('setup.found'),
			});
			for (const { folder, count } of found.slice(0, 3)) {
				const chip = chips.createEl('button', {
					cls: 'fitness-log-chip',
					text: t('setup.foundFolder', { folder, n: count }),
					attr: { type: 'button' },
				});
				chip.addEventListener('click', () => {
					input.value = folder;
					input.dispatchEvent(new Event('input'));
				});
			}
		}
		return { box, input };
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
		// 新しい保存先の種目ノートを読んでから、足りない初期データだけを入れる
		await library.ensureLoaded();
		const result = seed ? await library.seed() : null;
		new Notice(
			result
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
