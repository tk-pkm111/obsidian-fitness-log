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

/** data.json に保存する、その日だけの並びのキー */
export function dayOrderKey(date: string, sectionKey: string): string {
	return `${date} ${sectionKey}`;
}

/** その日のセクションごとの並び（buildDayModel の orders） */
export function dayOrdersFor(
	data: Readonly<PluginData>,
	date: string,
): Record<string, string[]> {
	const orders: Record<string, string[]> = {};
	for (const [key, list] of Object.entries(data.dayOrders ?? {}))
		if (key.startsWith(`${date} `))
			orders[key.slice(date.length + 1)] = list;
	return orders;
}

/** その日の並びを保存する。2 週間より前の日の並びは消す（今日の画面でしか使わない） */
export function setDayOrder(
	data: PluginData,
	date: string,
	sectionKey: string,
	keys: readonly string[],
	today: string,
): void {
	const oldest = addDays(today, -14);
	const orders: Record<string, string[]> = {};
	for (const [key, list] of Object.entries(data.dayOrders ?? {}))
		if (key.slice(0, 10) >= oldest) orders[key] = list;
	orders[dayOrderKey(date, sectionKey)] = [...keys];
	data.dayOrders = orders;
}
