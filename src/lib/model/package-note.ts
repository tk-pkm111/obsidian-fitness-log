/**
 * パッケージノート（1 パッケージ 1 ノート、`{packageFolder}/{パッケージ名}.md`）の frontmatter と、
 * パッケージ・ルーチンの相互変換（Obsidian 非依存）。
 *
 * パッケージとルーチンは以前は data.json にあったが、Obsidian Sync で「インストールされているコミュニティプラグイン」
 * （プラグインの設定）を同期しない人は端末ごとに別々になり、種目ノート（同期される）と食い違っていた。
 * ノートにすれば、ほかのノートと同じく同期される。
 *
 * ```yaml
 * fitness_id: pk_ab12cd34
 * tags: [fitness-package]
 * aliases: [旧PUSH]          # 名前を変える前の名前（過去の日ノートのセッション名と繋がる）
 * order: 0                  # パッケージの一覧での並び
 * created: 2026-10-01T…
 * note: …                   # パッケージのメモ
 * exercises:                # やる順
 *   - name: ケーブルYレイズ   # 読みやすさのため。id が見つからないときは名前（別名も）で繋ぎ直す
 *     id: ex_b19hcx3y
 *     sets: 2
 *     reps: 6-9
 *     rest: 150             # 秒
 *     note: …
 * sections: [{ id, name, at }]
 * removed: [{ name, id, sets, reps, rest, note, after, removed_at }]
 * routines:
 *   - id: rt_…
 *     type: weekly           # weekly | every-n-days
 *     weekdays: [1, 4]
 *     interval_weeks: 1
 *     interval_days: 2
 *     start: 2026-10-01
 *     end: …
 *     enabled: true
 *     skip: [2026-10-13]
 * ```
 * 名前はファイル名（拡張子なし）。本文は利用者のメモで、プラグインは触らない。
 */
import { normalizePackage, normalizeRoutine } from './data';
import { exerciseFileName } from './exercise-note';
import { nameKey } from './resolve';
import type { Package, PackageItem, PluginData, Routine } from './types';

export const PACKAGE_TAG = 'fitness-package';

/** パッケージ・ルーチンを data.json からパッケージノートへ移した印（data.json の migrations） */
export const PACKAGES_IN_VAULT = 'packages-in-vault';

export const PACKAGE_KEYS = {
	id: 'fitness_id',
	tags: 'tags',
	aliases: 'aliases',
	order: 'order',
	created: 'created',
	note: 'note',
	exercises: 'exercises',
	sections: 'sections',
	removed: 'removed',
	routines: 'routines',
} as const;

/** パッケージ名 → ファイル名（拡張子なし）。使えない文字は全角に（種目ノートと同じ規則） */
export function packageFileName(name: string): string {
	return exerciseFileName(name);
}

export interface PackageNote {
	pkg: Package;
	routines: Routine[];
	order: number;
	/** ノートに書いてあった種目名（種目の id → 名前）。種目ノートが見つからない種目の名前を消さないため */
	names: Map<string, string>;
}

/** 種目の id → 名前（見つからなければ undefined） */
export type ExerciseNameOf = (exerciseId: string) => string | undefined;

/**
 * ノートの種目（id と名前）を、今ある種目の id に解決する。
 * id が見つかればそれ、無ければ名前・別名で探す（別の端末で作った種目は id が違うことがある）。
 * どちらでも見つからなければ、ノートの id のまま（「種目のノートが見つかりません」と出す）
 */
export type ResolveExercise = (
	id: string | undefined,
	name: string | undefined,
) => string | undefined;

// ---------------------------------------------------------------------------
// パッケージ → frontmatter

function itemFields(
	item: PackageItem,
	nameOf: ExerciseNameOf,
): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	const name = nameOf(item.exerciseId);
	if (name !== undefined) fields.name = name;
	fields.id = item.exerciseId;
	fields.sets = item.targetSets;
	fields.reps = item.targetReps;
	if (item.restSec !== undefined) fields.rest = item.restSec;
	if (item.note) fields.note = item.note;
	return fields;
}

function routineFields(routine: Routine): Record<string, unknown> {
	const fields: Record<string, unknown> = { id: routine.id };
	if (routine.rule.type === 'weekly') {
		fields.type = 'weekly';
		fields.weekdays = [...routine.rule.weekdays];
		fields.interval_weeks = routine.rule.intervalWeeks;
	} else {
		fields.type = 'every-n-days';
		fields.interval_days = routine.rule.intervalDays;
	}
	fields.start = routine.startDate;
	if (routine.endDate) fields.end = routine.endDate;
	fields.enabled = routine.enabled;
	if (routine.skipDates.length > 0) fields.skip = [...routine.skipDates];
	return fields;
}

/**
 * パッケージノートの frontmatter（このプラグインのキーだけ。順番は固定）。
 * 書いた内容が変わったかの比較にも使う（JSON にして比べる）
 */
export function packageNoteFrontmatter(
	pkg: Package,
	routines: readonly Routine[],
	order: number,
	nameOf: ExerciseNameOf,
): Record<string, unknown> {
	const fm: Record<string, unknown> = {
		[PACKAGE_KEYS.id]: pkg.id,
		[PACKAGE_KEYS.tags]: [PACKAGE_TAG],
		[PACKAGE_KEYS.aliases]: [...pkg.aliases],
		[PACKAGE_KEYS.order]: order,
		[PACKAGE_KEYS.created]: pkg.createdAt,
	};
	if (pkg.note) fm[PACKAGE_KEYS.note] = pkg.note;
	fm[PACKAGE_KEYS.exercises] = pkg.items.map((i) => itemFields(i, nameOf));
	if (pkg.sections && pkg.sections.length > 0)
		fm[PACKAGE_KEYS.sections] = pkg.sections.map((s) => ({
			id: s.id,
			name: s.name,
			at: s.at,
		}));
	if (pkg.removedItems && pkg.removedItems.length > 0)
		fm[PACKAGE_KEYS.removed] = pkg.removedItems.map((r) => ({
			...itemFields(r, nameOf),
			after: r.after,
			removed_at: r.removedAt,
		}));
	if (routines.length > 0)
		fm[PACKAGE_KEYS.routines] = routines.map(routineFields);
	return fm;
}

/** 書き込みが要るかの比較用（キーの順番は packageNoteFrontmatter で固定） */
export function serializePackageNote(fm: Record<string, unknown>): string {
	return JSON.stringify(fm);
}

/**
 * processFrontMatter のコールバックで、このプラグインのキーを書き換える。
 * 利用者が足したほかのプロパティは残し、タグは利用者のタグを残したまま fitness-package を足す
 */
export function applyPackageToFrontmatter(
	fm: Record<string, unknown>,
	next: Record<string, unknown>,
): void {
	const userTags = Array.isArray(fm[PACKAGE_KEYS.tags])
		? (fm[PACKAGE_KEYS.tags] as unknown[]).filter(
				(t) => typeof t === 'string' && t !== PACKAGE_TAG,
			)
		: [];
	for (const key of Object.values(PACKAGE_KEYS)) delete fm[key];
	for (const [key, value] of Object.entries(next)) fm[key] = value;
	fm[PACKAGE_KEYS.tags] = [PACKAGE_TAG, ...userTags];
}

// ---------------------------------------------------------------------------
// frontmatter → パッケージ

function isObj(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** YAML の読み方によっては日付が Date になる（'2026-10-01' → Date）。文字列に戻す */
function text(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const iso = value.toISOString();
		return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
	}
	return undefined;
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? (value as unknown[]) : [];
}

function textList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map(text)
		.filter((v): v is string => v !== undefined && v.trim().length > 0)
		.map((v) => v.trim());
}

/** frontmatter の種目 → data.json の形（normalizePackage に通す） */
function rawItem(
	value: unknown,
	resolve: ResolveExercise,
	names: Map<string, string>,
): Record<string, unknown> | null {
	if (!isObj(value)) return null;
	const name = text(value.name)?.trim() || undefined;
	const id = resolve(text(value.id)?.trim() || undefined, name);
	if (!id) return null;
	if (name) names.set(id, name);
	return {
		exerciseId: id,
		targetSets: value.sets,
		// 「8」は YAML では数になる
		targetReps: text(value.reps) ?? '',
		restSec: value.rest,
		note: text(value.note),
	};
}

function rawRule(value: Record<string, unknown>): unknown {
	if (value.type === 'weekly')
		return {
			type: 'weekly',
			weekdays: value.weekdays,
			intervalWeeks: value.interval_weeks,
		};
	if (value.type === 'every-n-days')
		return { type: 'everyNDays', intervalDays: value.interval_days };
	return null;
}

/**
 * パッケージノートを読む。fitness_id が無い・名前（ファイル名）が空なら null（パッケージノートではない）。
 * 不正な値は data.json と同じ規則で捨てる・既定値に倒す
 */
export function packageFromNote(
	source: { basename: string; frontmatter: Record<string, unknown> | null },
	resolve: ResolveExercise,
): PackageNote | null {
	const fm = source.frontmatter ?? {};
	const id = text(fm[PACKAGE_KEYS.id])?.trim();
	if (!id) return null;
	const names = new Map<string, string>();
	const items = list(fm[PACKAGE_KEYS.exercises])
		.map((v) => rawItem(v, resolve, names))
		.filter((v) => v !== null);
	const removed = list(fm[PACKAGE_KEYS.removed])
		.map((v) => {
			const item = rawItem(v, resolve, names);
			if (!item || !isObj(v)) return null;
			const after =
				typeof v.after === 'string'
					? (resolve(v.after, undefined) ?? v.after)
					: null;
			return { ...item, after, removedAt: text(v.removed_at) };
		})
		.filter((v) => v !== null);
	const pkg = normalizePackage({
		id,
		name: source.basename,
		items,
		aliases: textList(fm[PACKAGE_KEYS.aliases]),
		createdAt: text(fm[PACKAGE_KEYS.created]),
		note: text(fm[PACKAGE_KEYS.note]),
		sections: fm[PACKAGE_KEYS.sections],
		removedItems: removed,
	});
	if (!pkg) return null;
	const routines = list(fm[PACKAGE_KEYS.routines])
		.filter(isObj)
		.map((v) =>
			normalizeRoutine({
				id: text(v.id)?.trim(),
				packageId: pkg.id,
				rule: rawRule(v),
				startDate: text(v.start),
				endDate: text(v.end),
				enabled: v.enabled,
				skipDates: textList(v.skip),
			}),
		)
		.filter((r): r is Routine => r !== null);
	const order = fm[PACKAGE_KEYS.order];
	return {
		pkg,
		routines,
		order:
			typeof order === 'number' && Number.isFinite(order)
				? order
				: Number.MAX_SAFE_INTEGER,
		names,
	};
}

/** 種目の id が解決できた数（同じパッケージが 2 つあるとき、どちらが正しいかを決める） */
export function resolvedItemCount(
	pkg: Package,
	known: ReadonlySet<string>,
): number {
	return pkg.items.filter((i) => known.has(i.exerciseId)).length;
}

// ---------------------------------------------------------------------------
// data.json → パッケージノートへの移行（一度きり・端末ごと）

export interface PackageMigrationPlan {
	/** 移行後のパッケージ（並びの順）とルーチン。これをノートに書く */
	packages: Package[];
	routines: Routine[];
	/** この端末の data.json のパッケージの id → ノートのパッケージの id（同じパッケージがノートに先にあったとき） */
	remap: Map<string, string>;
	/** この端末のパッケージをノートに書いた（足した・置き換えた）数 */
	written: number;
}

/**
 * この端末の data.json のパッケージ・ルーチンを、vault のパッケージノート（ほかの端末が先に移したもの）と合わせる。
 * - ノートに同じパッケージ（id、無ければ名前・別名）が無ければ、そのままノートにする
 * - あれば、種目の id が今の種目ノートに見つかる数が多い方を正にする（端末ごとに種目を作っていて、
 *   片方の端末のパッケージだけが種目ノートと食い違っている、ということがあるため）。id と名前はノートのまま
 * - ルーチンは正にした方のもの。正にした方に無ければ、もう一方のもの
 */
export function planPackageMigration(
	vault: readonly PackageNote[],
	local: { packages: readonly Package[]; routines: readonly Routine[] },
	knownExerciseIds: ReadonlySet<string>,
): PackageMigrationPlan {
	const entries = vault.map((n) => ({
		pkg: structuredClone(n.pkg),
		routines: structuredClone(n.routines),
		order: n.order,
	}));
	const find = (pkg: Package) =>
		entries.find((e) => e.pkg.id === pkg.id) ??
		entries.find((e) => {
			const keys = new Set([e.pkg.name, ...e.pkg.aliases].map(nameKey));
			return [pkg.name, ...pkg.aliases].some((n) => keys.has(nameKey(n)));
		});
	const remap = new Map<string, string>();
	let written = 0;
	const next = entries.reduce((max, e) => Math.max(max, e.order + 1), 0);
	local.packages.forEach((pkg, index) => {
		const routines = local.routines.filter((r) => r.packageId === pkg.id);
		const entry = find(pkg);
		if (!entry) {
			entries.push({
				pkg: structuredClone(pkg),
				routines: structuredClone(routines),
				order: entries.length === 0 ? index : next + index,
			});
			written++;
			return;
		}
		const id = entry.pkg.id;
		if (pkg.id !== id) remap.set(pkg.id, id);
		const withId = (list: readonly Routine[]) =>
			list.map((r) => ({ ...structuredClone(r), packageId: id }));
		if (
			resolvedItemCount(pkg, knownExerciseIds) >
			resolvedItemCount(entry.pkg, knownExerciseIds)
		) {
			entry.pkg = {
				...structuredClone(pkg),
				id,
				name: entry.pkg.name,
				aliases: [
					...new Set([...entry.pkg.aliases, ...pkg.aliases]),
				].filter((a) => nameKey(a) !== nameKey(entry.pkg.name)),
			};
			if (routines.length > 0) entry.routines = withId(routines);
			written++;
		} else if (entry.routines.length === 0 && routines.length > 0) {
			entry.routines = withId(routines);
			written++;
		}
	});
	const sorted = [...entries].sort(
		(a, b) =>
			a.order - b.order || a.pkg.name.localeCompare(b.pkg.name, 'ja'),
	);
	return {
		packages: sorted.map((e) => e.pkg),
		routines: sorted.flatMap((e) => e.routines),
		remap,
		written,
	};
}

/** パッケージの id を付け替えたとき、この端末だけの参照（進行中セット・その日の並び・外した種目）も付け替える */
export function remapPackageIds(
	data: PluginData,
	remap: ReadonlyMap<string, string>,
): void {
	if (remap.size === 0) return;
	const active = data.activeSet;
	if (active?.packageId)
		active.packageId = remap.get(active.packageId) ?? active.packageId;
	const rekey = (map: Record<string, string[]> | undefined) => {
		if (!map) return map;
		const result: Record<string, string[]> = {};
		for (const [key, list] of Object.entries(map)) {
			const match = /^(\S+) pkg:(.+)$/.exec(key);
			const to = match ? remap.get(match[2] ?? '') : undefined;
			result[to && match ? `${match[1]} pkg:${to}` : key] = list;
		}
		return result;
	};
	const orders = rekey(data.dayOrders);
	if (orders) data.dayOrders = orders;
	const removed = rekey(data.dayRemoved);
	if (removed) data.dayRemoved = removed;
}
