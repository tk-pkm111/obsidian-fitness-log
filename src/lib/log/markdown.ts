/**
 * 日ノートの管理ブロック（`%% fitness-log:start %%` 〜 `%% fitness-log:end %%`）と DayLog の相互変換。
 *
 * - プラグインが書き換えるのはブロックの中だけ。外側（frontmatter・ユーザーのメモ）は保持する。
 * - ブロックを解釈できないとき（表を壊した等）は書き込まない。parseBlock はエラーを返し、
 *   呼び出し側（LogRepository）はノートを書き換えずに利用者へ知らせる。
 * - 見出し・列名はファイル形式（AI や人が読む前提）なので UI 言語とは独立した定数にしている。
 */
import type { DayLog, ExerciseLog, SessionLog, SetLog } from '../model/types';
import { nameKey } from '../model/resolve';
import { formatHm, normalizeTime } from '../time/date';
import { sessionSpan } from './summary';

export const BLOCK_START = '%% fitness-log:start %%';
export const BLOCK_END = '%% fitness-log:end %%';
/** パッケージ外のセッションの見出し */
export const OTHER_SESSION_HEADING = 'その他';

const COLUMNS = [
	'セット',
	'重量 (kg)',
	'回数',
	'開始',
	'終了',
	'コメント',
] as const;
/** 以前の版の列名（読むときだけ受け付ける。書くときは COLUMNS） */
const LEGACY_COLUMNS: Readonly<Record<string, number>> = { メモ: 5 };
const EMPTY_CELL = '-';
const TIME_LABEL = '時間';
const NOTE_LABEL = 'コメント';
/** 以前の版のセッションのコメントの見出し */
const LEGACY_NOTE_LABEL = 'メモ';

/** 表の見出しのセル → 列の番号（COLUMNS の位置）。知らない列は -1 */
function columnOf(cell: string): number {
	const index = (COLUMNS as readonly string[]).indexOf(cell);
	return index >= 0 ? index : (LEGACY_COLUMNS[cell] ?? -1);
}

// ---------------------------------------------------------------------------
// ブロックの位置

export interface BlockLocation {
	/** BLOCK_START 行の先頭 */
	start: number;
	/** BLOCK_END 行の末尾（改行は含まない） */
	end: number;
	/** 2 つの行の間の本文 */
	inner: string;
}

export type LocateResult =
	| { kind: 'found'; block: BlockLocation }
	| { kind: 'missing' }
	| { kind: 'broken'; reason: string };

function lineRanges(text: string): Array<{ start: number; end: number }> {
	const ranges: Array<{ start: number; end: number }> = [];
	let pos = 0;
	while (pos <= text.length) {
		const nl = text.indexOf('\n', pos);
		const end = nl === -1 ? text.length : nl;
		ranges.push({ start: pos, end });
		if (nl === -1) break;
		pos = nl + 1;
	}
	return ranges;
}

function lineText(text: string, range: { start: number; end: number }) {
	return text.slice(range.start, range.end).replace(/\r$/, '').trim();
}

export function locateBlock(text: string): LocateResult {
	const ranges = lineRanges(text);
	const starts = ranges.filter((r) => lineText(text, r) === BLOCK_START);
	const ends = ranges.filter((r) => lineText(text, r) === BLOCK_END);
	if (starts.length === 0 && ends.length === 0) return { kind: 'missing' };
	if (starts.length !== 1 || ends.length !== 1)
		return {
			kind: 'broken',
			reason: '開始・終了の目印がそれぞれ 1 つずつではありません',
		};
	const [startLine] = starts;
	const [endLine] = ends;
	if (!startLine || !endLine || endLine.start < startLine.end)
		return { kind: 'broken', reason: '終了の目印が開始より前にあります' };
	const innerStart = Math.min(startLine.end + 1, endLine.start);
	return {
		kind: 'found',
		block: {
			start: startLine.start,
			// CRLF のノートでは行末の \r を残す（外側の改行コードを変えない）
			end: text[endLine.end - 1] === '\r' ? endLine.end - 1 : endLine.end,
			inner: text.slice(innerStart, endLine.start),
		},
	};
}

// ---------------------------------------------------------------------------
// 解析

export type ParseResult =
	{ ok: true; day: DayLog } | { ok: false; error: string; line?: number };

function parseNumberCell(cell: string): number | null | undefined {
	const text = cell.trim();
	if (text === '' || text === EMPTY_CELL) return null;
	// 全角数字・小数点のカンマ・単位の付け足し（'10kg'）は受け付ける
	const normalized = text
		.normalize('NFKC')
		.replace(/,/g, '.')
		.replace(/\s*(kg|回)$/i, '');
	if (normalized === '') return undefined;
	const value = Number(normalized);
	return Number.isFinite(value) ? value : undefined;
}

function parseTimeCell(cell: string): string | null | undefined {
	const text = cell.trim();
	if (text === '' || text === EMPTY_CELL) return null;
	return normalizeTime(text.normalize('NFKC')) ?? undefined;
}

/** `| a | b \| c |` → ['a', 'b | c']。エスケープされた `\|` はセル内の文字として扱う。 */
export function splitTableRow(line: string): string[] | null {
	const text = line.trim();
	if (!text.startsWith('|')) return null;
	const cells: string[] = [];
	let current = '';
	for (let i = 1; i < text.length; i++) {
		const ch = text[i];
		if (ch === '\\' && text[i + 1] === '|') {
			current += '|';
			i++;
		} else if (ch === '|') {
			cells.push(current.trim());
			current = '';
		} else {
			current += ch;
		}
	}
	// 末尾の `|` が無い行も受け付ける
	if (current.trim().length > 0) cells.push(current.trim());
	return cells;
}

function isSeparatorRow(cells: string[]): boolean {
	return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

const TIME_RANGE =
	/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[–—~〜-]\s*(\d{1,2}:\d{2}(?::\d{2})?)?$/;

/** '22:40:05 – 23:30:12' / '22:40 – ' → 開始・終了（'HH:mm:ss'）。読めなければ null */
export function parseTimeRange(
	value: string,
): { start: string; end: string | null } | null {
	const match = TIME_RANGE.exec(value.normalize('NFKC').trim());
	if (!match) return null;
	const start = normalizeTime(match[1] ?? '');
	const end = match[2] === undefined ? null : normalizeTime(match[2]);
	if (start === null || (match[2] !== undefined && end === null)) return null;
	return { start, end };
}

function parseBullet(line: string): { label: string; value: string } | null {
	const match = /^[-*]\s+([^:：]+)[:：]\s?(.*)$/.exec(line.trim());
	if (!match) return null;
	return { label: (match[1] ?? '').trim(), value: (match[2] ?? '').trim() };
}

/**
 * 管理ブロックの中身を DayLog にする。解釈できない行があればエラー
 * （再生成で消えてしまうため、知らない行を黙って捨てない）。
 */
export function parseBlockContent(inner: string, date: string): ParseResult {
	const sessions: SessionLog[] = [];
	let session: SessionLog | null = null;
	let exercise: ExerciseLog | null = null;
	/** 表の状態: none → header → separator → rows */
	let table: 'none' | 'header' | 'rows' = 'none';
	let columnIndex: number[] = [];
	let columnCount = 0;

	const lines = inner.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const raw = (lines[i] ?? '').replace(/\r$/, '');
		const line = raw.trim();
		const lineNo = i + 1;
		const fail = (error: string): ParseResult => ({
			ok: false,
			error,
			line: lineNo,
		});

		if (line === '') {
			if (table === 'header') return fail('表の区切り行がありません');
			table = 'none';
			continue;
		}

		const h2 = /^##\s+(.+)$/.exec(line);
		if (h2 && !line.startsWith('###')) {
			const name = (h2[1] ?? '').trim();
			session = {
				name: name === OTHER_SESSION_HEADING ? null : name,
				note: '',
				exercises: [],
			};
			sessions.push(session);
			exercise = null;
			table = 'none';
			continue;
		}

		const h3 = /^###\s+(.+)$/.exec(line);
		if (h3) {
			if (!session)
				return fail(
					'種目の見出しの前にセッションの見出し（##）がありません',
				);
			exercise = { name: (h3[1] ?? '').trim(), sets: [] };
			session.exercises.push(exercise);
			table = 'none';
			continue;
		}

		const cells = splitTableRow(line);
		if (cells) {
			if (!exercise) return fail('種目の見出し（###）の前に表があります');
			if (table === 'none') {
				if (exercise.sets.length > 0)
					return fail('1 つの種目に表が 2 つあります');
				columnIndex = COLUMNS.map((_, column) =>
					cells.findIndex((cell) => columnOf(cell) === column),
				);
				columnCount = cells.length;
				// 知らない列は再生成で消えてしまうので、書き込みを止める
				const unknown = cells.filter((c) => columnOf(c) < 0);
				if (unknown.length > 0)
					return fail(
						`表に知らない列があります: ${unknown.join('・')}`,
					);
				const required = [0, 1, 2];
				if (required.some((c) => (columnIndex[c] ?? -1) < 0))
					return fail(
						`表の見出しが読めません（必要な列: ${COLUMNS.slice(0, 3).join('・')}）`,
					);
				table = 'header';
				continue;
			}
			if (table === 'header') {
				if (!isSeparatorRow(cells))
					return fail('表の区切り行がありません');
				table = 'rows';
				continue;
			}
			if (cells.length > columnCount)
				return fail(
					'セルの数が見出しより多い行があります（コメントに | を書くときは \\| と書いてください）',
				);
			const cell = (column: number) => {
				const index = columnIndex[column] ?? -1;
				return index < 0 ? '' : (cells[index] ?? '');
			};
			const weight = parseNumberCell(cell(1));
			const reps = parseNumberCell(cell(2));
			const start = parseTimeCell(cell(3));
			const end = parseTimeCell(cell(4));
			if (weight === undefined)
				return fail(`重量が数値ではありません: ${cell(1)}`);
			if (reps === undefined)
				return fail(`回数が数値ではありません: ${cell(2)}`);
			if (start === undefined)
				return fail(`開始時刻が読めません: ${cell(3)}`);
			if (end === undefined)
				return fail(`終了時刻が読めません: ${cell(4)}`);
			exercise.sets.push({ weight, reps, start, end, note: cell(5) });
			continue;
		}

		const bullet = parseBullet(line);
		if (bullet && session && !exercise) {
			if (bullet.label === TIME_LABEL) {
				// パッケージのセッションは「筋トレを開始・終了」の時刻。その他はセットから計算し直す。
				// 時刻として読めない手書きの値は消さずに残す
				const range = parseTimeRange(bullet.value);
				if (range && session.name !== null) {
					session.start = range.start;
					if (range.end) session.end = range.end;
				} else if (!range && bullet.value !== '')
					session.time = bullet.value;
				continue;
			}
			if (
				bullet.label === NOTE_LABEL ||
				bullet.label === LEGACY_NOTE_LABEL
			) {
				session.note = session.note
					? `${session.note} ${bullet.value}`
					: bullet.value;
				continue;
			}
		}

		return fail(`解釈できない行です: ${line}`);
	}
	if (table === 'header')
		return { ok: false, error: '表の区切り行がありません' };
	for (const s of sessions)
		if (s.time !== undefined && (s.start || sessionSpan(s))) delete s.time;
	return { ok: true, day: { date, sessions } };
}

/** ノート全文から DayLog を読む。ブロックが無ければ空の日。 */
export function parseDayNote(text: string, date: string): ParseResult {
	const located = locateBlock(text);
	if (located.kind === 'missing')
		return { ok: true, day: { date, sessions: [] } };
	if (located.kind === 'broken') return { ok: false, error: located.reason };
	return parseBlockContent(located.block.inner, date);
}

// ---------------------------------------------------------------------------
// 生成

/** 数値を短く書く（10 → '10', 12.5 → '12.5', 61.23496 → '61.235'） */
export function formatNumber(value: number): string {
	return String(Math.round(value * 1000) / 1000);
}

/** 表のセル: 改行は空白に、| はエスケープ */
function escapeCell(text: string): string {
	return oneLine(text).replace(/\|/g, '\\|');
}

/** 箇条書きの値: 改行は空白に（表ではないので | はそのまま） */
function oneLine(text: string): string {
	return text.replace(/\r?\n/g, ' ').trim();
}

function formatSetRow(set: SetLog, index: number): string {
	const cells = [
		String(index + 1),
		set.weight === null ? EMPTY_CELL : formatNumber(set.weight),
		set.reps === null ? EMPTY_CELL : formatNumber(set.reps),
		set.start ?? EMPTY_CELL,
		set.end ?? EMPTY_CELL,
		escapeCell(set.note),
	];
	return `| ${cells.join(' | ')} |`.replace(/ {2}\|$/, ' |');
}

function formatSession(session: SessionLog): string[] {
	const lines = [`## ${session.name ?? OTHER_SESSION_HEADING}`];
	const span = sessionSpan(session);
	if (session.name !== null && session.start)
		// 筋トレの開始・終了（進行中は終了が空欄）
		lines.push(
			`- ${TIME_LABEL}: ${session.start} – ${session.end ?? ''}`.trimEnd(),
		);
	else if (span)
		lines.push(
			`- ${TIME_LABEL}: ${formatHm(span.start)} – ${formatHm(span.end)}`,
		);
	else if (session.time)
		lines.push(`- ${TIME_LABEL}: ${oneLine(session.time)}`);
	if (session.note.trim().length > 0)
		lines.push(`- ${NOTE_LABEL}: ${oneLine(session.note)}`);
	// セット番号は種目ごとの通し番号（同じ種目を後でもう一度やった 2 つ目の欄は続きから）
	const counts = new Map<string, number>();
	for (const exercise of session.exercises) {
		const key = nameKey(exercise.name);
		const offset = counts.get(key) ?? 0;
		counts.set(key, offset + exercise.sets.length);
		lines.push('', `### ${exercise.name}`);
		lines.push(`| ${COLUMNS.join(' | ')} |`);
		lines.push('| ---: | ---: | ---: | --- | --- | --- |');
		exercise.sets.forEach((set, index) =>
			lines.push(formatSetRow(set, offset + index)),
		);
	}
	return lines;
}

/** DayLog → 管理ブロック（目印の行を含む。末尾の改行は含まない） */
export function formatBlock(day: DayLog): string {
	const body: string[] = [];
	day.sessions.forEach((session, index) => {
		if (index > 0) body.push('');
		body.push(...formatSession(session));
	});
	return [BLOCK_START, ...body, BLOCK_END].join('\n');
}

/**
 * ノート全文の管理ブロックを day で置き換える。ブロックが無ければ末尾に足す
 * （ユーザーが同じ名前のノートを先に作っていた場合など）。ブロックが壊れていれば null。
 */
export function replaceBlock(text: string, day: DayLog): string | null {
	const located = locateBlock(text);
	const block = formatBlock(day);
	if (located.kind === 'broken') return null;
	if (located.kind === 'missing') {
		if (text.trim().length === 0) return `${block}\n`;
		const separator = text.endsWith('\n') ? '\n' : '\n\n';
		return `${text}${separator}${block}\n`;
	}
	const { start, end } = located.block;
	return text.slice(0, start) + block + text.slice(end);
}
