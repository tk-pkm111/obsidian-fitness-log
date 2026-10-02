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
export function removePackageItem(
	data: PluginData,
	packageId: string,
	index: number,
): void {
	const pkg = requirePackage(data, packageId);
	applyPackageRows(
		pkg,
		packageRows(pkg).filter(
			(row) => !(row.kind === 'item' && row.index === index),
		),
	);
}

/** 条件に合う種目をすべてのパッケージから外す（種目を消したとき） */
export function removeItemsWhere(
	data: PluginData,
	predicate: (item: PackageItem) => boolean,
): void {
	for (const pkg of data.packages)
		applyPackageRows(
			pkg,
			packageRows(pkg).filter(
				(row) => !(row.kind === 'item' && predicate(row.item)),
			),
		);
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
