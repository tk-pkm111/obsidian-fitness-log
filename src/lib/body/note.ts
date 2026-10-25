/**
 * 体組成のノート（1 測定 1 ノート、`{bodyFolder}/YYYY-MM-DD.md`）。
 * - frontmatter のプロパティ名が項目名、値は数字だけ。数字でない値（「標準」など）は読まない（消しもしない）
 * - `時刻` は任意（'HH:mm'）
 * - 本文は自由（プラグインは触らない）
 * 形式は docs/body-composition-plan.md §3.1。README にも書く
 */
import { LOG_TAG } from '../log/summary';
import { isDateString } from '../time/date';
import { parseNumberInput } from '../units';

export const BODY_TIME_KEY = '時刻';

/** 項目として読まないキー */
const IGNORED_KEYS = new Set([BODY_TIME_KEY, 'tags', 'aliases', 'cssclasses']);

export interface BodyMeasurement {
	date: string;
	/** 'HH:mm'。書いていなければ null */
	time: string | null;
	path: string;
	/** 項目名 → 値（ノートの単位。重さは kg） */
	values: Record<string, number>;
}

/** ノートの名前（拡張子なし）が日付なら、その日付 */
export function bodyNoteDate(basename: string): string | null {
	return /^\d{4}-\d{2}-\d{2}$/.test(basename) && isDateString(basename)
		? basename
		: null;
}

function hasLogTag(value: unknown): boolean {
	const list: unknown[] = Array.isArray(value) ? value : [value];
	return list.some(
		(tag) =>
			typeof tag === 'string' && tag.replace(/^#/, '').trim() === LOG_TAG,
	);
}

function numberOf(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value !== 'string') return null;
	const parsed = parseNumberInput(value);
	return typeof parsed === 'number' ? parsed : null;
}

/**
 * 'H:mm' / 'HH:mm' → 'HH:mm'。読めなければ null。
 * 引用符の無い 07:09 は YAML 1.1 では 60 進数（429）に読まれるので、分の数として戻す
 */
export function normalizeBodyTime(value: unknown): string | null {
	if (typeof value === 'number')
		return Number.isInteger(value) && value >= 0 && value < 24 * 60
			? `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
			: null;
	if (typeof value !== 'string') return null;
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return null;
	return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/** frontmatter の項目（数字の値）。読まないキー・数字でない値は除く */
export function bodyValues(
	fm: Record<string, unknown>,
): Record<string, number> {
	const values: Record<string, number> = {};
	for (const [key, raw] of Object.entries(fm)) {
		const name = key.trim();
		if (
			name === '' ||
			IGNORED_KEYS.has(name) ||
			name.startsWith('fitness_')
		)
			continue;
		const value = numberOf(raw);
		if (value !== null) values[name] = value;
	}
	return values;
}

/**
 * ノート → 測定。名前が日付でない・日ノート（タグ fitness-log）・数字の項目が 1 つも無いノートは null
 * （同じフォルダの一覧のノートや、保存先を誤って日ノートと同じにしたときに読まない）
 */
export function measurementFromNote(
	path: string,
	basename: string,
	fm: Record<string, unknown> | null | undefined,
): BodyMeasurement | null {
	const date = bodyNoteDate(basename);
	if (!date || !fm || hasLogTag(fm.tags)) return null;
	const values = bodyValues(fm);
	if (Object.keys(values).length === 0) return null;
	return { date, time: normalizeBodyTime(fm[BODY_TIME_KEY]), path, values };
}

/**
 * 手で入れた値を frontmatter に書く（processFrontMatter のコールバック内で）。
 * 入れた項目だけを書き換え、ほかの項目・キーは残す
 */
export function applyMeasurement(
	fm: Record<string, unknown>,
	values: Readonly<Record<string, number>>,
	time: string | null,
): void {
	if (time !== null) fm[BODY_TIME_KEY] = time;
	for (const [name, value] of Object.entries(values)) fm[name] = value;
}

/** 測定を日付の昇順に。同じ日のノートが 2 つあれば（サブフォルダ）パスの順で最初のもの */
export function sortMeasurements(
	measurements: readonly BodyMeasurement[],
): BodyMeasurement[] {
	const byDate = new Map<string, BodyMeasurement>();
	for (const m of [...measurements].sort((a, b) =>
		a.path.localeCompare(b.path),
	))
		if (!byDate.has(m.date)) byDate.set(m.date, m);
	return [...byDate.values()].sort((a, b) =>
		a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
	);
}
