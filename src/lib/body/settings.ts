/**
 * 体組成の設定（設定ノート「Fitness Log 設定.md」の frontmatter が正。端末ごとの data.json には置かない）。
 * - body_composition: 「体組成を記録する」。無ければオフ
 * - body_items: 丸に出す全身の項目と、その並び・単位。無ければ既定（体重・体脂肪率・筋肉量）
 * - body_goals: 目標（全身の項目だけ。since は決めた日＝進み具合の起点）
 */
import { t } from '../../i18n';
import { CatalogError } from '../model/catalog/errors';
import { isDateString } from '../time/date';
import {
	DEFAULT_BODY_ITEMS,
	isPartKey,
	knownItem,
	type BodyItem,
} from './items';

export const BODY_KEYS = {
	enabled: 'body_composition',
	items: 'body_items',
	goals: 'body_goals',
} as const;

export interface BodyGoal {
	name: string;
	/** 目標の値（ノートの単位。重さは kg） */
	target: number;
	/** 決めた日 'YYYY-MM-DD' */
	since: string;
}

export interface BodySettings {
	enabled: boolean;
	items: BodyItem[];
	goals: BodyGoal[];
}

export function defaultBodySettings(): BodySettings {
	return {
		enabled: false,
		items: DEFAULT_BODY_ITEMS.map((item) => ({ ...item })),
		goals: [],
	};
}

function text(value: unknown): string {
	return typeof value === 'string' || typeof value === 'number'
		? String(value).trim()
		: '';
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function itemsFrom(value: unknown): BodyItem[] | null {
	if (!Array.isArray(value)) return null;
	const seen = new Set<string>();
	const items: BodyItem[] = [];
	for (const raw of value) {
		const obj = record(raw);
		const name = text(obj ? obj.name : raw);
		if (name === '' || seen.has(name) || isPartKey(name)) continue;
		seen.add(name);
		const unit =
			obj && obj.unit !== undefined && obj.unit !== null
				? text(obj.unit)
				: (knownItem(name)?.unit ?? '');
		items.push({ name, unit });
	}
	return items;
}

function goalsFrom(value: unknown): BodyGoal[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const goals: BodyGoal[] = [];
	for (const raw of value) {
		const obj = record(raw);
		if (!obj) continue;
		const name = text(obj.name);
		const target =
			typeof obj.target === 'number'
				? obj.target
				: Number(text(obj.target));
		const since = text(obj.since);
		if (
			name === '' ||
			seen.has(name) ||
			isPartKey(name) ||
			!Number.isFinite(target) ||
			text(obj.target) === '' ||
			!isDateString(since)
		)
			continue;
		seen.add(name);
		goals.push({ name, target, since });
	}
	return goals;
}

/** 設定ノートの frontmatter → 体組成の設定（無いキー・読めないキーは既定） */
export function bodySettingsFromFrontmatter(
	fm: Record<string, unknown> | null,
): BodySettings {
	const defaults = defaultBodySettings();
	if (!fm) return defaults;
	return {
		enabled: fm[BODY_KEYS.enabled] === true,
		items: itemsFrom(fm[BODY_KEYS.items]) ?? defaults.items,
		goals: goalsFrom(fm[BODY_KEYS.goals]),
	};
}

/** 体組成の設定を frontmatter に書く（processFrontMatter のコールバック内で）。ほかのキーは残す */
export function applyBodySettingsToFrontmatter(
	fm: Record<string, unknown>,
	settings: BodySettings,
): void {
	fm[BODY_KEYS.enabled] = settings.enabled;
	fm[BODY_KEYS.items] = settings.items.map((item) => ({
		name: item.name,
		unit: item.unit,
	}));
	fm[BODY_KEYS.goals] = settings.goals.map((goal) => ({
		name: goal.name,
		target: goal.target,
		since: goal.since,
	}));
}

// ---------------------------------------------------------------------------
// 設定の変更（新しい設定を返す。名前の重なり・空はエラー）

function clone(settings: BodySettings): BodySettings {
	return {
		enabled: settings.enabled,
		items: settings.items.map((item) => ({ ...item })),
		goals: settings.goals.map((goal) => ({ ...goal })),
	};
}

export function setBodyEnabled(
	settings: BodySettings,
	enabled: boolean,
): BodySettings {
	return { ...clone(settings), enabled };
}

/** 項目の名前を確かめる（空・重なり・部位の項目はエラー） */
export function checkBodyItemName(
	items: readonly BodyItem[],
	name: string,
): string {
	const trimmed = name.trim();
	if (trimmed === '') throw new CatalogError(t('lists.error.empty'));
	if (isPartKey(trimmed)) throw new CatalogError(t('body.error.itemPart'));
	if (items.some((item) => item.name === trimmed))
		throw new CatalogError(t('lists.error.duplicate', { name: trimmed }));
	return trimmed;
}

export function addBodyItem(
	settings: BodySettings,
	name: string,
	unit: string,
): BodySettings {
	const next = clone(settings);
	next.items.push({
		name: checkBodyItemName(next.items, name),
		unit: unit.trim(),
	});
	return next;
}

export function removeBodyItem(
	settings: BodySettings,
	index: number,
): BodySettings {
	const next = clone(settings);
	next.items.splice(index, 1);
	return next;
}

export function moveBodyItem(
	settings: BodySettings,
	from: number,
	to: number,
): BodySettings {
	const { length } = settings.items;
	if (from < 0 || from >= length || to < 0 || to >= length) return settings;
	const next = clone(settings);
	const [item] = next.items.splice(from, 1);
	if (item) next.items.splice(to, 0, item);
	return next;
}

export function setBodyItemUnit(
	settings: BodySettings,
	index: number,
	unit: string,
): BodySettings {
	const next = clone(settings);
	const item = next.items[index];
	if (item) item.unit = unit.trim();
	return next;
}

/** 目標を決める・変える。今ある目標の値を変えるときは、決めた日（起点）はそのまま */
export function setBodyGoal(
	settings: BodySettings,
	name: string,
	target: number,
	today: string,
): BodySettings {
	if (isPartKey(name) || !Number.isFinite(target)) return settings;
	const next = clone(settings);
	const existing = next.goals.find((goal) => goal.name === name);
	if (existing) existing.target = target;
	else next.goals.push({ name, target, since: today });
	return next;
}

export function removeBodyGoal(
	settings: BodySettings,
	name: string,
): BodySettings {
	const next = clone(settings);
	next.goals = next.goals.filter((goal) => goal.name !== name);
	return next;
}
