/**
 * 種目の選択肢（カテゴリ・器具・記録のしかた）。利用者が足す・名前を変える・消す・並べ替える。
 *
 * - vault の設定ノート（既定は種目フォルダの隣の「Fitness Log 設定.md」。タグ fitness-settings）の
 *   frontmatter が正。端末ごとの data.json には置かない（プラグインの設定を同期しなくても端末間でそろう）
 * - ノートが無いあいだは既定（defaultLists）。最初に一覧を変えたときにノートを作る
 * - 種目ノートの category・equipment には名前（「肩」）をそのまま書く。以前の版の英語のキー（push など）は
 *   読むときに既定の名前にする（categoryName・equipmentName）
 * - 記録のしかたは項目の組み合わせ（record-type.ts）。一覧はその組み合わせに付けた名前
 */
import { t, type MessageKey } from '../../i18n';
import {
	normalizeRecordType,
	recordFields,
	type RecordField,
} from './record-type';
import { CatalogError } from './catalog/errors';
import type { RecordType } from './types';

export interface RecordTypeEntry {
	name: string;
	type: RecordType;
}

export interface ExerciseLists {
	categories: string[];
	equipment: string[];
	recordTypes: RecordTypeEntry[];
}

export type ListKind = keyof ExerciseLists;

export const LISTS_TAG = 'fitness-settings';

/** frontmatter のキー */
export const LISTS_KEYS = {
	categories: 'categories',
	equipment: 'equipment',
	recordTypes: 'record_types',
	tags: 'tags',
} as const;

/** 以前の版の種目ノートのカテゴリ（英語のキー）。既定の一覧の順でもある */
const CATEGORY_KEYS = [
	'push',
	'pull',
	'legs',
	'shoulders',
	'arms',
	'core',
	'cardio',
	'other',
] as const;
const EQUIPMENT_KEYS = [
	'machine',
	'cable',
	'smith',
	'barbell',
	'dumbbell',
	'bodyweight',
	'band',
	'other',
] as const;
const DEFAULT_RECORD_TYPES: readonly RecordType[] = [
	'weight-reps',
	'reps',
	'duration',
	'weight-duration',
	'distance-duration',
];

export type CategoryKey = (typeof CATEGORY_KEYS)[number];
export type EquipmentKey = (typeof EQUIPMENT_KEYS)[number];

function label(prefix: string, key: string): string {
	return t(`${prefix}.${key}` as MessageKey);
}

export function defaultLists(): ExerciseLists {
	return {
		categories: CATEGORY_KEYS.map((k) => label('category', k)),
		equipment: EQUIPMENT_KEYS.map((k) => label('equipment', k)),
		recordTypes: DEFAULT_RECORD_TYPES.map((type) => ({
			name: autoRecordTypeName(type),
			type,
		})),
	};
}

function text(value: unknown): string {
	return typeof value === 'string' || typeof value === 'number'
		? String(value).trim()
		: '';
}

/** 種目ノートのカテゴリ: 以前の英語のキーは既定の名前に。無ければ ''（未設定） */
export function categoryName(value: unknown): string {
	const name = text(value);
	return (CATEGORY_KEYS as readonly string[]).includes(name)
		? label('category', name)
		: name;
}

/** 種目ノートの器具: 以前の英語のキーは既定の名前に。無ければ undefined */
export function equipmentName(value: unknown): string | undefined {
	const name = text(value);
	if (name === '') return undefined;
	return (EQUIPMENT_KEYS as readonly string[]).includes(name)
		? label('equipment', name)
		: name;
}

/** 以前の版の英語のキーが書かれているか（名前に書き直す） */
export function hasLegacyLabel(value: unknown, kind: 'category' | 'equipment') {
	const keys: readonly string[] =
		kind === 'category' ? CATEGORY_KEYS : EQUIPMENT_KEYS;
	return keys.includes(text(value));
}

export function fieldLabel(field: RecordField): string {
	return t(`recordField.${field}` as MessageKey);
}

/** 項目から付ける名前: 「重量 × 回数」「時間のみ」 */
export function autoRecordTypeName(type: RecordType): string {
	const fields = recordFields(type);
	const [only] = fields;
	if (fields.length === 1 && only)
		return t('recordType.only', { field: fieldLabel(only) });
	return fields.map(fieldLabel).join(' × ');
}

/** 記録のしかたの名前（一覧に無ければ項目から） */
export function recordTypeName(type: RecordType, lists: ExerciseLists): string {
	return (
		lists.recordTypes.find((r) => r.type === type)?.name ??
		autoRecordTypeName(type)
	);
}

function uniqueNames(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const seen = new Set<string>();
	const result: string[] = [];
	for (const item of value) {
		const name = text(item);
		if (name === '' || seen.has(name)) continue;
		seen.add(name);
		result.push(name);
	}
	return result;
}

function recordTypeEntries(value: unknown): RecordTypeEntry[] | null {
	if (!Array.isArray(value)) return null;
	const seen = new Set<string>();
	const result: RecordTypeEntry[] = [];
	for (const item of value) {
		const obj: Record<string, unknown> =
			typeof item === 'object' && item !== null && !Array.isArray(item)
				? (item as Record<string, unknown>)
				: { type: item };
		const fields = obj.fields;
		const type = normalizeRecordType(
			Array.isArray(fields) ? fields.map(text).join('-') : obj.type,
		);
		if (!type || seen.has(type)) continue;
		seen.add(type);
		result.push({ name: text(obj.name) || autoRecordTypeName(type), type });
	}
	return result;
}

/** 設定ノートの frontmatter → 一覧（無いキー・読めないキーは既定） */
export function listsFromFrontmatter(
	fm: Record<string, unknown> | null,
): ExerciseLists {
	const defaults = defaultLists();
	if (!fm) return defaults;
	const recordTypes = recordTypeEntries(fm[LISTS_KEYS.recordTypes]);
	return {
		categories:
			uniqueNames(fm[LISTS_KEYS.categories]) ?? defaults.categories,
		equipment: uniqueNames(fm[LISTS_KEYS.equipment]) ?? defaults.equipment,
		// 記録のしかたは 1 つは要る（種目の既定にする）
		recordTypes:
			recordTypes && recordTypes.length > 0
				? recordTypes
				: defaults.recordTypes,
	};
}

/** 設定ノートのタグを付ける（ほかのタグは残す。移した・名前を変えたノートもタグで見つける） */
export function ensureSettingsTag(fm: Record<string, unknown>): void {
	const tags = Array.isArray(fm[LISTS_KEYS.tags])
		? (fm[LISTS_KEYS.tags] as unknown[]).map(text).filter((v) => v !== '')
		: [];
	if (!tags.some((tag) => tag.replace(/^#/, '') === LISTS_TAG))
		tags.push(LISTS_TAG);
	fm[LISTS_KEYS.tags] = tags;
}

/** 一覧を frontmatter に書く（processFrontMatter のコールバック内で）。ほかのキー・タグは残す */
export function applyListsToFrontmatter(
	fm: Record<string, unknown>,
	lists: ExerciseLists,
): void {
	ensureSettingsTag(fm);
	fm[LISTS_KEYS.categories] = [...lists.categories];
	fm[LISTS_KEYS.equipment] = [...lists.equipment];
	fm[LISTS_KEYS.recordTypes] = lists.recordTypes.map((r) => ({
		name: r.name,
		fields: recordFields(r.type),
	}));
}

/** 設定ノートにタグがあるか（frontmatter の tags） */
export function isListsNote(fm: Record<string, unknown> | null): boolean {
	const tags = fm?.[LISTS_KEYS.tags];
	const list = Array.isArray(tags) ? tags : [tags];
	return list.some((tag) => text(tag).replace(/^#/, '') === LISTS_TAG);
}

/** 既定の記録のしかた（一覧の先頭） */
export function defaultRecordType(lists: ExerciseLists): RecordType {
	return lists.recordTypes[0]?.type ?? 'weight-reps';
}

// ---------------------------------------------------------------------------
// 一覧の変更（新しい一覧を返す。名前の重なり・空はエラー）

/** カテゴリ・器具（名前だけの一覧） */
export type NameListKind = 'categories' | 'equipment';

function cloneLists(lists: ExerciseLists): ExerciseLists {
	return {
		categories: [...lists.categories],
		equipment: [...lists.equipment],
		recordTypes: lists.recordTypes.map((r) => ({ ...r })),
	};
}

function checkName(names: readonly string[], name: string): string {
	const trimmed = name.trim();
	if (trimmed === '') throw new CatalogError(t('lists.error.empty'));
	if (names.includes(trimmed))
		throw new CatalogError(t('lists.error.duplicate', { name: trimmed }));
	return trimmed;
}

function names(lists: ExerciseLists, kind: ListKind): string[] {
	return kind === 'recordTypes'
		? lists.recordTypes.map((r) => r.name)
		: lists[kind];
}

/** 名前を足す（最後に） */
export function addListName(
	lists: ExerciseLists,
	kind: NameListKind,
	name: string,
): ExerciseLists {
	const next = cloneLists(lists);
	next[kind].push(checkName(next[kind], name));
	return next;
}

/** 記録のしかたを足す（同じ項目の組み合わせ・同じ名前は足さない） */
export function addRecordType(
	lists: ExerciseLists,
	type: RecordType,
	name: string,
): ExerciseLists {
	const existing = lists.recordTypes.find((r) => r.type === type);
	if (existing)
		throw new CatalogError(
			t('lists.error.duplicateType', { name: existing.name }),
		);
	const next = cloneLists(lists);
	next.recordTypes.push({
		type,
		name: checkName(
			names(next, 'recordTypes'),
			name.trim() || autoRecordTypeName(type),
		),
	});
	return next;
}

/** 名前を変える（同じ名前ならそのまま） */
export function renameListItem(
	lists: ExerciseLists,
	kind: ListKind,
	index: number,
	name: string,
): ExerciseLists {
	const current = names(lists, kind)[index];
	if (current === undefined || current === name.trim()) return lists;
	const next = cloneLists(lists);
	const trimmed = checkName(
		names(next, kind).filter((_, i) => i !== index),
		name,
	);
	if (kind === 'recordTypes') {
		const entry = next.recordTypes[index];
		if (entry) entry.name = trimmed;
	} else next[kind][index] = trimmed;
	return next;
}

/** 消す。記録のしかたは最後の 1 つは消せない（種目の既定に要る） */
export function removeListItem(
	lists: ExerciseLists,
	kind: ListKind,
	index: number,
): ExerciseLists {
	if (kind === 'recordTypes' && lists.recordTypes.length <= 1)
		throw new CatalogError(t('lists.error.lastType'));
	const next = cloneLists(lists);
	if (kind === 'recordTypes') next.recordTypes.splice(index, 1);
	else next[kind].splice(index, 1);
	return next;
}

/** 並べ替える */
export function moveListItem(
	lists: ExerciseLists,
	kind: ListKind,
	from: number,
	to: number,
): ExerciseLists {
	const next = cloneLists(lists);
	const list: unknown[] =
		kind === 'recordTypes' ? next.recordTypes : next[kind];
	if (from < 0 || from >= list.length || to < 0 || to >= list.length)
		return lists;
	const [item] = list.splice(from, 1);
	list.splice(to, 0, item);
	return next;
}

/**
 * 画面に出すカテゴリの並び: 一覧の順 → 一覧に無いが種目で使っている名前 → 未設定（''）
 * （ノートを手で書き換えた・一覧から消したカテゴリの種目も見えるように）
 */
export function categoryOrder(
	lists: ExerciseLists,
	used: Iterable<string>,
): string[] {
	const order = [...lists.categories];
	let unset = false;
	for (const name of used) {
		if (name === '') unset = true;
		else if (!order.includes(name)) order.push(name);
	}
	if (unset) order.push('');
	return order;
}
