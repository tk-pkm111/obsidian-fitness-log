import { moment, normalizePath, Notice, type App, type TFile } from 'obsidian';
import { t } from '../i18n';
import { cloneDay } from '../lib/log/day-ops';
import { parseDayNote, replaceBlock } from '../lib/log/markdown';
import { applySummaryToFrontmatter } from '../lib/log/summary';
import type { DayLog } from '../lib/model/types';

/** 日ノートの置き場所（設定の logFolder / fileNameFormat） */
export interface LogLocation {
	logFolder: string;
	fileNameFormat: string;
}

const ISO_DATE = 'YYYY-MM-DD';

/** 日ノートの vault 内パス（'Fitness/2026-10-01.md'） */
export function dayNotePath(location: LogLocation, date: string): string {
	const name = moment(date, ISO_DATE, true).format(location.fileNameFormat);
	return normalizePath(`${location.logFolder}/${name}.md`);
}

function folderPrefix(logFolder: string): string {
	const folder = normalizePath(logFolder);
	return folder === '/' || folder === '' ? '' : `${folder}/`;
}

/**
 * パスが日ノートならその日付。ファイル名を書式で厳密に解釈し、書式化し直して同じになるものだけ
 * （'2026-1-1.md' のような揺れや、ログフォルダ内の普通のノートは日ノートとみなさない）。
 */
export function dateFromNotePath(
	location: LogLocation,
	path: string,
): string | null {
	const prefix = folderPrefix(location.logFolder);
	if (!path.startsWith(prefix) || !path.endsWith('.md')) return null;
	const relative = path.slice(prefix.length, -'.md'.length);
	const parsed = moment(relative, location.fileNameFormat, true);
	if (
		!parsed.isValid() ||
		parsed.format(location.fileNameFormat) !== relative
	)
		return null;
	return parsed.format(ISO_DATE);
}

/** ファイル名に使えない文字（Windows・モバイルを含めて安全な範囲） */
const FORBIDDEN_FILENAME_CHARS = /[\\:*?"<>|#^[\]]/;

/**
 * ノート名の書式の検証。日付ごとに別のノートになり、ノート名から日付に戻せること。
 * 問題があればその説明を返す。
 */
export function validateFileNameFormat(format: string): string | undefined {
	const text = format.trim();
	if (text.length === 0) return '書式を入力してください。';
	if (text.startsWith('/') || text.endsWith('/'))
		return '先頭・末尾に / は使えません。';
	const location = { logFolder: 'x', fileNameFormat: text };
	const samples = ['2001-02-03', '2026-12-31', '2027-01-09'];
	for (const date of samples) {
		const path = dayNotePath(location, date);
		const name = path.slice('x/'.length, -'.md'.length);
		if (FORBIDDEN_FILENAME_CHARS.test(name))
			return 'ファイル名に使えない文字が含まれます。';
		if (dateFromNotePath(location, path) !== date)
			return '年・月・日を含む書式にしてください（例: YYYY-MM-DD）。';
	}
	return undefined;
}

/** 管理ブロックが読めない日ノート。書き込まずに利用者へ知らせる。 */
export class LogParseError extends Error {
	constructor(
		readonly path: string,
		readonly reason: string,
	) {
		super(`${path}: ${reason}`);
		this.name = 'LogParseError';
	}
}

/**
 * 日ノートの読み書き。
 * - 本文は Vault.process（読み取り → 解析 → 変更 → 再生成を 1 回の原子的な書き込みで）
 * - frontmatter は FileManager.processFrontMatter（集計キーだけを上書き）
 * - 連打などで書き込みが重ならないよう、updateDay は 1 本の列に並べて順に実行する
 */
export class LogRepository {
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly app: App,
		private readonly location: () => LogLocation,
	) {}

	get folderPath(): string {
		return normalizePath(this.location().logFolder);
	}

	pathFor(date: string): string {
		return dayNotePath(this.location(), date);
	}

	dateFor(path: string): string | null {
		return dateFromNotePath(this.location(), path);
	}

	fileFor(date: string): TFile | null {
		return this.app.vault.getFileByPath(this.pathFor(date));
	}

	/** 日ノートを読む（無ければ空の日）。管理ブロックが壊れていれば LogParseError。 */
	async readDay(date: string): Promise<DayLog> {
		const file = this.fileFor(date);
		if (!file) return { date, sessions: [] };
		const parsed = parseDayNote(
			await this.app.vault.cachedRead(file),
			date,
		);
		if (!parsed.ok) throw new LogParseError(file.path, parsed.error);
		return parsed.day;
	}

	/**
	 * その日の DayLog を変更して書き戻す。ノートが無ければ作る（変更後も空なら作らない）。
	 * mutate が投げたエラー・ブロックの解析エラーのときは何も書き込まない。
	 * 戻り値は書き込んだ DayLog。
	 */
	updateDay(date: string, mutate: (day: DayLog) => void): Promise<DayLog> {
		const run = this.queue.then(() => this.runUpdate(date, mutate));
		this.queue = run.catch(() => undefined);
		return run;
	}

	private async runUpdate(
		date: string,
		mutate: (day: DayLog) => void,
	): Promise<DayLog> {
		const { vault } = this.app;
		const path = this.pathFor(date);
		let file = vault.getFileByPath(path);

		if (!file) {
			const day: DayLog = { date, sessions: [] };
			mutate(day);
			if (day.sessions.length === 0) return day;
			await this.ensureFolder(path);
			file = await vault.create(path, replaceBlock('', day) ?? '');
			await this.updateFrontmatter(file, day);
			return day;
		}

		// 先に読んで検証する（壊れたノート・mutate のエラーでは書き込みを起こさない）
		const current = parseDayNote(await vault.read(file), date);
		if (!current.ok) throw new LogParseError(path, current.error);
		mutate(cloneDay(current.day));

		let written: DayLog | null = null;
		let failure: Error | null = null;
		await vault.process(file, (text) => {
			try {
				const parsed = parseDayNote(text, date);
				if (!parsed.ok) throw new LogParseError(path, parsed.error);
				const day = cloneDay(parsed.day);
				mutate(day);
				const next = replaceBlock(text, day);
				if (next === null)
					throw new LogParseError(
						path,
						'管理ブロックの位置が読めません',
					);
				written = day;
				return next;
			} catch (error) {
				failure =
					error instanceof Error ? error : new Error(String(error));
				return text;
			}
		});
		// コールバック内での代入は型の絞り込みに反映されないので明示する
		const error = failure as Error | null;
		if (error) throw error;
		const result = written as DayLog | null;
		if (!result) throw new Error('日ノートを更新できませんでした');
		await this.updateFrontmatter(file, result);
		return result;
	}

	/**
	 * frontmatter の集計を更新する。本文（セット）はもう書けているので、ここで失敗しても
	 * 例外にしない（例外にすると、呼び出し側が「記録できなかった」と判断してやり直し、セットが重複する）。
	 * YAML が壊れている等は通知だけ出す。次に書き込んだときに改めて更新される。
	 */
	private async updateFrontmatter(file: TFile, day: DayLog): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(
				file,
				(fm: Record<string, unknown>) =>
					applySummaryToFrontmatter(fm, day),
			);
		} catch (error) {
			console.error('[fitness-log] frontmatter update failed', error);
			new Notice(
				t('notice.frontmatterError', {
					path: file.path,
					reason:
						error instanceof Error ? error.message : String(error),
				}),
				10_000,
			);
		}
	}

	/** ノートの親フォルダを階層ごとに作る */
	private async ensureFolder(filePath: string): Promise<void> {
		const parts = filePath.split('/').slice(0, -1);
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (this.app.vault.getFolderByPath(current)) continue;
			try {
				await this.app.vault.createFolder(current);
			} catch (error) {
				// 同時に作られた場合は問題ない
				if (!this.app.vault.getFolderByPath(current)) throw error;
			}
		}
	}
}
