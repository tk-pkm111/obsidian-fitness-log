/**
 * 日付（'YYYY-MM-DD'）と時刻（'HH:mm:ss'）の計算・整形。
 *
 * - 日付の加減算・差分は UTC の暦日で行う（夏時間の切り替えで 1 日が 23/25 時間になる影響を受けない）。
 * - 「今日」や時刻の取り出しは端末のローカル時刻。
 * - moment は使わない（src/lib を Obsidian 非依存に保つため）。
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const DAY_MS = 86_400_000;

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function toUtcMs(date: string): number {
	const match = DATE_PATTERN.exec(date);
	if (!match) throw new Error(`Invalid date: ${date}`);
	return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtcMs(ms: number): string {
	const d = new Date(ms);
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 'YYYY-MM-DD' として正しい暦日か（2026-02-30 は false） */
export function isDateString(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const match = DATE_PATTERN.exec(value);
	if (!match) return false;
	return fromUtcMs(toUtcMs(value)) === value;
}

/** Date をローカル時刻の暦日 'YYYY-MM-DD' にする */
export function toDateString(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayString(now: Date = new Date()): string {
	return toDateString(now);
}

export function addDays(date: string, days: number): string {
	return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** to − from（日数） */
export function diffDays(from: string, to: string): number {
	return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** 0=日 … 6=土 */
export function weekdayOf(date: string): number {
	return new Date(toUtcMs(date)).getUTCDay();
}

/** その日を含む週の月曜日 */
export function mondayOf(date: string): string {
	const offset = (weekdayOf(date) + 6) % 7;
	return addDays(date, -offset);
}

/** 'YYYY-MM' */
export function monthOf(date: string): string {
	return date.slice(0, 7);
}

/** '10/1' */
export function formatMonthDay(date: string): string {
	const match = DATE_PATTERN.exec(date);
	if (!match) return date;
	return `${Number(match[2])}/${Number(match[3])}`;
}

/** Date をローカル時刻の 'HH:mm:ss' にする */
export function formatTime(date: Date): string {
	return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** 'H:mm' / 'HH:mm' / 'HH:mm:ss' → 0 時からの秒数。不正なら null */
export function parseTime(value: string): number | null {
	const match = TIME_PATTERN.exec(value.trim());
	if (!match) return null;
	const h = Number(match[1]);
	const m = Number(match[2]);
	const s = match[3] === undefined ? 0 : Number(match[3]);
	if (h > 23 || m > 59 || s > 59) return null;
	return h * 3600 + m * 60 + s;
}

/** 手で打った区切り（全角・'.'）を ':' にそろえる。スマホの数字キーボードには ':' が無く '.' はある */
function clockText(input: string): string {
	return input.normalize('NFKC').trim().replace(/[.。]/g, ':');
}

/** 手で打った時刻 → 0 時からの秒数。'18:30' / '18:30:15' / '18.30'（全角も可）。読めなければ null */
export function parseClockInput(input: string): number | null {
	return parseTime(clockText(input));
}

/**
 * 手で打った長さ（休憩など）→ 秒数。'2:30' / '2.30' / '1:02:03'、数字だけなら分（'3' → 180）。
 * 読めなければ null
 */
export function parseDurationInput(input: string): number | null {
	const text = clockText(input);
	if (/^\d+$/.test(text)) return Number(text) * 60;
	const match = /^(?:(\d+):)?(\d+):([0-5]\d)$/.exec(text);
	if (!match) return null;
	const h = match[1] === undefined ? 0 : Number(match[1]);
	const m = Number(match[2]);
	if (match[1] !== undefined && m > 59) return null;
	return h * 3600 + m * 60 + Number(match[3]);
}

/** 秒数 → 'HH:mm:ss'（24 時間で折り返す） */
export function secondsToTime(seconds: number): string {
	const total = ((Math.floor(seconds) % 86_400) + 86_400) % 86_400;
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** 'HH:mm:ss' を正規化（'7:05' → '07:05:00'）。不正なら null */
export function normalizeTime(value: string): string | null {
	const seconds = parseTime(value);
	return seconds === null ? null : secondsToTime(seconds);
}

/** 'HH:mm:ss' → 'HH:mm' */
export function formatHm(time: string): string {
	const seconds = parseTime(time);
	if (seconds === null) return time;
	return secondsToTime(seconds).slice(0, 5);
}

/**
 * 開始〜終了の秒数。終了が開始より前なら日付をまたいだとみなす。
 * どちらかが不正なら null。
 */
export function spanSeconds(start: string, end: string): number | null {
	const a = parseTime(start);
	const b = parseTime(end);
	if (a === null || b === null) return null;
	return b >= a ? b - a : b + 86_400 - a;
}

/** 経過秒 → '0:45' / '12:03' / '1:02:03' */
export function formatDuration(totalSeconds: number): string {
	const sec = Math.max(0, Math.floor(totalSeconds));
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = sec % 60;
	return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** ISO 時刻から now までの経過秒（負にはしない） */
export function elapsedSeconds(startedAtIso: string, now: Date): number {
	const started = Date.parse(startedAtIso);
	if (Number.isNaN(started)) return 0;
	return Math.max(0, Math.floor((now.getTime() - started) / 1000));
}

/**
 * 1 日の中の時刻（秒）の集まりを、日付をまたぐことも考えて「最初〜最後」に並べる。
 * 24 時間の円の上で最も大きく空いている間を外側とみなす（23:50 と 00:01 なら 23:50 → 00:01）。
 * 区間が 12 時間未満であることを前提にする。空なら null。
 */
export function circularRange(
	seconds: readonly number[],
): { first: number; last: number } | null {
	if (seconds.length === 0) return null;
	const sorted = [...seconds].sort((a, b) => a - b);
	const lowest = sorted[0] ?? 0;
	const highest = sorted[sorted.length - 1] ?? 0;
	let first = lowest;
	let last = highest;
	let widestGap = lowest + 86_400 - highest; // 最後 → 翌日の最初
	for (let i = 0; i < sorted.length - 1; i++) {
		const a = sorted[i] ?? 0;
		const b = sorted[i + 1] ?? 0;
		if (b - a > widestGap) {
			widestGap = b - a;
			first = b;
			last = a;
		}
	}
	return { first, last };
}
