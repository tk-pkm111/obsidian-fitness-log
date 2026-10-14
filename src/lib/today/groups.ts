/**
 * 今日の画面で、パッケージのセクション（区切り）ごとに種目カードを分ける。
 * カードの並び（やった順 → まだの種目）は buildDayModel のまま、区切りごとに振り分けるだけ。
 */
import { arrayMove } from '../list';
import { sectionOfItem, sortedSections } from '../model/catalog/package-rows';
import type { Package, PackageSection, PluginData } from '../model/types';
import { addDays } from '../time/date';
import { cardOrderKey, type CardModel } from './day-model';

export interface CardGroup {
	/** none: 区切りより前（見出し無し）／section: 区切り／extra: パッケージに無い種目（あとから足した） */
	kind: 'none' | 'section' | 'extra';
	section: PackageSection | null;
	cards: CardModel[];
}

/** 区切りが無い（または使わない）ときは 1 つのまとまり。カードの無い区切りは出さない */
export function groupCards(
	cards: readonly CardModel[],
	pkg: Package | null,
	enabled: boolean,
): CardGroup[] {
	const sections = pkg && enabled ? sortedSections(pkg) : [];
	if (!pkg || sections.length === 0)
		return [{ kind: 'none', section: null, cards: [...cards] }];
	const none: CardModel[] = [];
	const extra: CardModel[] = [];
	const bySection = new Map<string, CardModel[]>();
	for (const card of cards) {
		const exerciseId = card.exercise?.id;
		const index =
			exerciseId === undefined
				? -1
				: pkg.items.findIndex((i) => i.exerciseId === exerciseId);
		if (index < 0) {
			extra.push(card);
			continue;
		}
		const section = sectionOfItem(pkg, index);
		if (!section) none.push(card);
		else
			bySection.set(section.id, [
				...(bySection.get(section.id) ?? []),
				card,
			]);
	}
	const groups: CardGroup[] = [];
	if (none.length > 0)
		groups.push({ kind: 'none', section: null, cards: none });
	for (const section of sections) {
		const list = bySection.get(section.id);
		if (list) groups.push({ kind: 'section', section, cards: list });
	}
	if (extra.length > 0)
		groups.push({ kind: 'extra', section: null, cards: extra });
	return groups;
}

/** ドラッグで並べ替えられるカード（まだやっていない・実行中でない種目） */
export function isReorderable(card: CardModel): boolean {
	return card.sets.length === 0 && !card.active && card.exercise !== null;
}

/**
 * まとまりの中で from → to に動かしたときの、セクション全体の「まだの種目」の並び（キー）。
 * 他のまとまりのカードの位置は変えない。
 */
export function reorderWithinGroup(
	allCards: readonly CardModel[],
	groupCards: readonly CardModel[],
	from: number,
	to: number,
): string[] {
	const movable = groupCards.filter(isReorderable).map(cardOrderKey);
	const moved = arrayMove(movable, from, to);
	const inGroup = new Set(movable);
	let next = 0;
	return allCards
		.filter((c) => c.sets.length === 0 && !c.active)
		.map(cardOrderKey)
		.map((key) => (inGroup.has(key) ? (moved[next++] ?? key) : key));
}

/** data.json に保存する、その日だけの並び・外した種目のキー */
export function dayOrderKey(date: string, sectionKey: string): string {
	return `${date} ${sectionKey}`;
}

/** 'YYYY-MM-DD セクションのキー' → 一覧 から、その日の分だけをセクションのキーで引けるように */
function entriesFor(
	map: Readonly<Record<string, string[]>> | undefined,
	date: string,
): Record<string, string[]> {
	const result: Record<string, string[]> = {};
	for (const [key, list] of Object.entries(map ?? {}))
		if (key.startsWith(`${date} `))
			result[key.slice(date.length + 1)] = list;
	return result;
}

/**
 * その日・そのセクションの一覧を入れ替える（空なら消す）。
 * 2 週間より前の日のものは消す（今日の画面でしか使わない）
 */
function withEntry(
	map: Readonly<Record<string, string[]>> | undefined,
	date: string,
	sectionKey: string,
	keys: readonly string[],
	today: string,
): Record<string, string[]> | undefined {
	const oldest = addDays(today, -14);
	const result: Record<string, string[]> = {};
	for (const [key, list] of Object.entries(map ?? {}))
		if (key.slice(0, 10) >= oldest) result[key] = list;
	const entryKey = dayOrderKey(date, sectionKey);
	if (keys.length > 0) result[entryKey] = [...keys];
	else delete result[entryKey];
	return Object.keys(result).length > 0 ? result : undefined;
}

/** その日のセクションごとの並び（buildDayModel の orders） */
export function dayOrdersFor(
	data: Readonly<PluginData>,
	date: string,
): Record<string, string[]> {
	return entriesFor(data.dayOrders, date);
}

/** その日の並びを保存する。2 週間より前の日の並びは消す（今日の画面でしか使わない） */
export function setDayOrder(
	data: PluginData,
	date: string,
	sectionKey: string,
	keys: readonly string[],
	today: string,
): void {
	const orders = withEntry(data.dayOrders, date, sectionKey, keys, today);
	if (orders) data.dayOrders = orders;
	else delete data.dayOrders;
}

/** その日のセクションごとの「この日から外した」種目のカードのキー（buildDayModel の removed） */
export function dayRemovedFor(
	data: Readonly<PluginData>,
	date: string,
): Record<string, string[]> {
	return entriesFor(data.dayRemoved, date);
}

/** まだやっていない種目を「この日から外す」。「種目を追加」で戻すときは removed=false */
export function setDayRemoved(
	data: PluginData,
	date: string,
	sectionKey: string,
	cardKey: string,
	removed: boolean,
	today: string,
): void {
	const current = dayRemovedFor(data, date)[sectionKey] ?? [];
	const keys = removed
		? [...new Set([...current, cardKey])]
		: current.filter((k) => k !== cardKey);
	const next = withEntry(data.dayRemoved, date, sectionKey, keys, today);
	if (next) data.dayRemoved = next;
	else delete data.dayRemoved;
}

/**
 * その日のセクションの並び・外した種目を別のセクションへ移す（パッケージを変えたとき）。
 * to が null なら消す（パッケージをその日から外したとき。もう一度足したら最初から）
 */
export function moveDaySection(
	data: PluginData,
	date: string,
	from: string,
	to: string | null,
	today: string,
): void {
	const move = (
		map: Record<string, string[]> | undefined,
	): Record<string, string[]> | undefined => {
		const keys = entriesFor(map, date)[from];
		if (!keys) return map;
		let next = withEntry(map, date, from, [], today);
		if (to !== null) next = withEntry(next, date, to, keys, today);
		return next;
	};
	const orders = move(data.dayOrders);
	if (orders) data.dayOrders = orders;
	else delete data.dayOrders;
	const removed = move(data.dayRemoved);
	if (removed) data.dayRemoved = removed;
	else delete data.dayRemoved;
}
