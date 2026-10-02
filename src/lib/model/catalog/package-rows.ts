/**
 * パッケージの並び（種目と区切り＝セクション）の操作。
 * 区切りは items の差し込み位置（at）で持つので、種目を動かす・外すときは「行」の並びにしてから組み直す。
 */
import { arrayMove } from '../../list';
import { newId } from '../ids';
import type {
	Package,
	PackageItem,
	PackageSection,
	PluginData,
	RemovedPackageItem,
} from '../types';
import { CatalogError } from './errors';
import { requirePackage } from './packages';

export type PackageRow =
	| { kind: 'section'; section: PackageSection }
	| { kind: 'item'; item: PackageItem; index: number };

/** 区切りを at の順に（同じ位置なら配列の順） */
export function sortedSections(pkg: Package): PackageSection[] {
	return (pkg.sections ?? [])
		.map((section, order) => ({ section, order }))
		.sort((a, b) => a.section.at - b.section.at || a.order - b.order)
		.map(({ section }) => section);
}

/** 種目と区切りを表示の順に並べた行 */
export function packageRows(pkg: Package): PackageRow[] {
	const sections = sortedSections(pkg);
	const rows: PackageRow[] = [];
	let next = 0;
	pkg.items.forEach((item, index) => {
		while (next < sections.length && (sections[next]?.at ?? 0) <= index) {
			const section = sections[next++];
			if (section) rows.push({ kind: 'section', section });
		}
		rows.push({ kind: 'item', item, index });
	});
	for (const section of sections.slice(next))
		rows.push({ kind: 'section', section });
	return rows;
}

/** 行の並びからパッケージの items・sections を組み直す */
export function applyPackageRows(
	pkg: Package,
	rows: readonly PackageRow[],
): void {
	const items: PackageItem[] = [];
	const sections: PackageSection[] = [];
	for (const row of rows) {
		if (row.kind === 'item') items.push(row.item);
		else sections.push({ ...row.section, at: items.length });
	}
	pkg.items = items;
	if (sections.length > 0) pkg.sections = sections;
	else delete pkg.sections;
}

/** 行（種目・区切り）を動かす（区切りを表示しているときのドラッグ） */
export function movePackageRow(
	data: PluginData,
	packageId: string,
	from: number,
	to: number,
): void {
	const pkg = requirePackage(data, packageId);
	applyPackageRows(pkg, arrayMove(packageRows(pkg), from, to));
}

/**
 * 種目だけを動かす（区切りを隠しているときのドラッグ）。区切りは消さずに残し、
 * 動かした種目は新しい並びで直前に来る種目と同じ区切りに入る（先頭なら最初の種目の位置）。
 */
export function movePackageItemTo(
	data: PluginData,
	packageId: string,
	from: number,
	to: number,
): void {
	const pkg = requirePackage(data, packageId);
	const moved = pkg.items[from];
	if (!moved || from === to || to < 0 || to >= pkg.items.length) return;
	const order = arrayMove(pkg.items, from, to);
	const rows = packageRows(pkg).filter(
		(row) => !(row.kind === 'item' && row.item === moved),
	);
	const before = order[to - 1];
	const anchor = before
		? rows.findIndex((row) => row.kind === 'item' && row.item === before) +
			1
		: rows.findIndex((row) => row.kind === 'item');
	rows.splice(anchor < 0 ? rows.length : anchor, 0, {
		kind: 'item',
		item: moved,
		index: -1,
	});
	applyPackageRows(pkg, rows);
}

/** 種目を外す（区切りの位置を詰める） */
/** 外した種目の設定をいくつまで覚えておくか（パッケージごと） */
const MAX_REMOVED_ITEMS = 30;

/**
 * 種目をパッケージから外す。設定（目標・休憩・メモ）と位置は removedItems に覚えておき、
 * もう一度追加するときに戻せるようにする（restorePackageItem）。
 */
export function removePackageItem(
	data: PluginData,
	packageId: string,
	index: number,
	removedAt: string,
): void {
	const pkg = requirePackage(data, packageId);
	const item = pkg.items[index];
	if (!item) return;
	const remembered: RemovedPackageItem = {
		...structuredClone(item),
		removedAt,
		after: pkg.items[index - 1]?.exerciseId ?? null,
	};
	applyPackageRows(
		pkg,
		packageRows(pkg).filter(
			(row) => !(row.kind === 'item' && row.index === index),
		),
	);
	setRemovedItems(pkg, [
		remembered,
		...(pkg.removedItems ?? []).filter(
			(r) => r.exerciseId !== item.exerciseId,
		),
	]);
}

function setRemovedItems(
	pkg: Package,
	removed: readonly RemovedPackageItem[],
): void {
	const kept = removed.slice(0, MAX_REMOVED_ITEMS);
	if (kept.length > 0) pkg.removedItems = kept;
	else delete pkg.removedItems;
}

/** 以前このパッケージから外した種目の設定（無ければ undefined） */
export function removedItemOf(
	pkg: Package,
	exerciseId: string,
): RemovedPackageItem | undefined {
	return pkg.removedItems?.find((r) => r.exerciseId === exerciseId);
}

/** 覚えていた設定を捨てる（新しく設定し直すとき） */
export function forgetRemovedItem(pkg: Package, exerciseId: string): void {
	setRemovedItems(
		pkg,
		(pkg.removedItems ?? []).filter((r) => r.exerciseId !== exerciseId),
	);
}

/**
 * 外した種目を、以前の設定で戻す。位置は外したときに直前にあった種目の後ろ
 * （その種目がもう無ければ末尾、先頭だったなら先頭）。覚えていた設定は消す。
 */
export function restorePackageItem(
	data: PluginData,
	packageId: string,
	exerciseId: string,
): PackageItem {
	const pkg = requirePackage(data, packageId);
	const removed = removedItemOf(pkg, exerciseId);
	if (!removed) throw new CatalogError('以前の設定が見つかりません');
	if (pkg.items.some((i) => i.exerciseId === exerciseId))
		throw new CatalogError('この種目はもうパッケージにあります');
	const item: PackageItem = {
		exerciseId: removed.exerciseId,
		targetSets: removed.targetSets,
		targetReps: removed.targetReps,
	};
	if (removed.restSec !== undefined) item.restSec = removed.restSec;
	if (removed.note) item.note = removed.note;
	const rows = packageRows(pkg);
	const isItem = (row: PackageRow, id?: string) =>
		row.kind === 'item' && (id === undefined || row.item.exerciseId === id);
	let at: number;
	if (removed.after === null) {
		const first = rows.findIndex((row) => isItem(row));
		at = first < 0 ? rows.length : first;
	} else {
		const prev = rows.findIndex((row) => isItem(row, removed.after ?? ''));
		at = prev < 0 ? rows.length : prev + 1;
	}
	rows.splice(at, 0, { kind: 'item', item, index: -1 });
	applyPackageRows(pkg, rows);
	forgetRemovedItem(pkg, exerciseId);
	return item;
}

/** 条件に合う種目をすべてのパッケージから外す（種目を消したとき）。覚えていた設定も捨てる */
export function removeItemsWhere(
	data: PluginData,
	predicate: (item: PackageItem) => boolean,
): void {
	for (const pkg of data.packages) {
		applyPackageRows(
			pkg,
			packageRows(pkg).filter(
				(row) => !(row.kind === 'item' && predicate(row.item)),
			),
		);
		setRemovedItems(
			pkg,
			(pkg.removedItems ?? []).filter((r) => !predicate(r)),
		);
	}
}

function checkSectionName(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length === 0)
		throw new CatalogError('セクション名を入力してください');
	return trimmed;
}

/** 区切りを末尾に足す（あとからドラッグで動かす） */
export function addPackageSection(
	data: PluginData,
	packageId: string,
	name: string,
): PackageSection {
	const pkg = requirePackage(data, packageId);
	const section: PackageSection = {
		id: newId('sc', new Set((pkg.sections ?? []).map((s) => s.id))),
		name: checkSectionName(name),
		at: pkg.items.length,
	};
	pkg.sections = [...(pkg.sections ?? []), section];
	return section;
}

export function renamePackageSection(
	data: PluginData,
	packageId: string,
	sectionId: string,
	name: string,
): void {
	const section = requirePackage(data, packageId).sections?.find(
		(s) => s.id === sectionId,
	);
	if (!section) throw new CatalogError('セクションが見つかりません');
	section.name = checkSectionName(name);
}

/** 区切りを消す（中の種目は残り、前の区切りに入る） */
export function removePackageSection(
	data: PluginData,
	packageId: string,
	sectionId: string,
): void {
	const pkg = requirePackage(data, packageId);
	const rest = (pkg.sections ?? []).filter((s) => s.id !== sectionId);
	if (rest.length > 0) pkg.sections = rest;
	else delete pkg.sections;
}

/** 種目が入っている区切り（区切りより前の種目・区切りが無ければ null） */
export function sectionOfItem(
	pkg: Package,
	index: number,
): PackageSection | null {
	let found: PackageSection | null = null;
	for (const section of sortedSections(pkg))
		if (section.at <= index) found = section;
	return found;
}

/** パッケージの一覧の並べ替え */
export function movePackage(data: PluginData, from: number, to: number): void {
	data.packages = arrayMove(data.packages, from, to);
}
