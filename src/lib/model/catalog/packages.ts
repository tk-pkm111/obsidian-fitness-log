/**
 * パッケージ（data.json）への変更操作。PluginData を直接変更する純粋関数。
 */
import { OTHER_SESSION_HEADING } from '../../log/markdown';
import { parseRepRange } from '../../rep-range';
import { instantiateSession, PROGRAM_TEMPLATES } from '../defaults';
import { newId } from '../ids';
import { aliasesAfterRename, nameKey } from '../resolve';
import type {
	Exercise,
	Package,
	PackageItem,
	PluginData,
	RecordType,
} from '../types';
import { CatalogError } from './errors';

/** 日ノートで「パッケージ外」を表す見出しと同じ名前は使えない */
const RESERVED_PACKAGE_NAMES = [OTHER_SESSION_HEADING];

function checkPackageName(
	data: PluginData,
	name: string,
	aliases: readonly string[],
	exceptId?: string,
): void {
	if (name.length === 0)
		throw new CatalogError('パッケージ名を入力してください');
	if (RESERVED_PACKAGE_NAMES.some((r) => nameKey(r) === nameKey(name)))
		throw new CatalogError(`「${name}」はパッケージ名に使えません`);
	const keys = new Set([name, ...aliases].map(nameKey));
	const conflict = data.packages.find(
		(p) =>
			p.id !== exceptId &&
			[p.name, ...p.aliases].some((label) => keys.has(nameKey(label))),
	);
	if (conflict)
		throw new CatalogError(
			`「${conflict.name}」と名前（旧名）が重なっています`,
		);
}

export function requirePackage(data: PluginData, id: string): Package {
	const pkg = data.packages.find((p) => p.id === id);
	if (!pkg) throw new CatalogError('パッケージが見つかりません');
	return pkg;
}

export function createPackage(
	data: PluginData,
	name: string,
	now: string,
): Package {
	const trimmed = name.trim();
	checkPackageName(data, trimmed, []);
	const pkg: Package = {
		id: newId('pk', new Set(data.packages.map((p) => p.id))),
		name: trimmed,
		items: [],
		aliases: [],
		createdAt: now,
	};
	data.packages.push(pkg);
	return pkg;
}

/** 名前・メモを変える。名前を変えたら旧名を別名に足す（過去ノートのセッション名と繋がる）。 */
export function updatePackage(
	data: PluginData,
	id: string,
	fields: { name?: string; note?: string },
): Package {
	const pkg = requirePackage(data, id);
	if (fields.name !== undefined) {
		const name = fields.name.trim();
		const aliases =
			name === pkg.name
				? pkg.aliases
				: aliasesAfterRename(pkg.name, name, pkg.aliases);
		checkPackageName(data, name, aliases, id);
		pkg.name = name;
		pkg.aliases = aliases;
	}
	if (fields.note !== undefined) {
		const note = fields.note.trim();
		if (note) pkg.note = note;
		else delete pkg.note;
	}
	return pkg;
}

/** 名前の重ならないコピーを作る（旧名は引き継がない） */
export function duplicatePackage(
	data: PluginData,
	id: string,
	now: string,
): Package {
	const source = requirePackage(data, id);
	const names = data.packages
		.flatMap((p) => [p.name, ...p.aliases])
		.map(nameKey);
	let name = `${source.name} のコピー`;
	for (let n = 2; names.includes(nameKey(name)); n++)
		name = `${source.name} のコピー ${n}`;
	const copy: Package = {
		...structuredClone(source),
		id: newId('pk', new Set(data.packages.map((p) => p.id))),
		name,
		aliases: [],
		createdAt: now,
	};
	// 外した種目の覚えは元のパッケージのもの
	delete copy.removedItems;
	data.packages.splice(data.packages.indexOf(source) + 1, 0, copy);
	return copy;
}

/** パッケージを消す。使っているルーチンも消し、進行中セットはパッケージ外（その他）に移す。 */
export function deletePackage(data: PluginData, id: string): void {
	requirePackage(data, id);
	data.packages = data.packages.filter((p) => p.id !== id);
	data.routines = data.routines.filter((r) => r.packageId !== id);
	if (data.activeSet?.packageId === id) data.activeSet.packageId = null;
}

/** 種目をパッケージに足すときの目標の初期値。時間だけの種目（有酸素・ストレッチ）は回数の目標を持たない */
export function defaultTargets(
	recordType: RecordType,
): Pick<PackageItem, 'targetSets' | 'targetReps'> {
	return recordType === 'duration'
		? { targetSets: 1, targetReps: '' }
		: { targetSets: 2, targetReps: '6-9' };
}

export function addPackageItem(
	data: PluginData,
	packageId: string,
	exerciseId: string,
	item: Partial<Omit<PackageItem, 'exerciseId'>> = {},
): PackageItem {
	const pkg = requirePackage(data, packageId);
	const exercise = data.exercises.find((e) => e.id === exerciseId);
	if (!exercise) throw new CatalogError('種目が見つかりません');
	const defaults = defaultTargets(exercise.recordType);
	const created: PackageItem = {
		exerciseId,
		targetSets: item.targetSets ?? defaults.targetSets,
		targetReps: item.targetReps ?? defaults.targetReps,
	};
	if (item.restSec !== undefined) created.restSec = item.restSec;
	if (item.note) created.note = item.note;
	pkg.items.push(created);
	// 新しく設定したので、以前外したときの設定は捨てる
	if (pkg.removedItems) {
		pkg.removedItems = pkg.removedItems.filter(
			(r) => r.exerciseId !== exerciseId,
		);
		if (pkg.removedItems.length === 0) delete pkg.removedItems;
	}
	return created;
}

export function updatePackageItem(
	data: PluginData,
	packageId: string,
	index: number,
	patch: {
		targetSets?: number;
		targetReps?: string;
		restSec?: number | null;
		note?: string;
	},
): void {
	const item = requirePackage(data, packageId).items[index];
	if (!item) throw new CatalogError('項目が見つかりません');
	if (patch.targetSets !== undefined) {
		if (!Number.isInteger(patch.targetSets) || patch.targetSets < 1)
			throw new CatalogError('セット数は 1 以上の整数にしてください');
		item.targetSets = patch.targetSets;
	}
	if (patch.targetReps !== undefined) {
		const reps = patch.targetReps.trim();
		if (reps !== '' && parseRepRange(reps) === null)
			throw new CatalogError(
				'回数は「8」「6-9」「AMRAP」の形で入力してください',
			);
		item.targetReps = reps;
	}
	if (patch.restSec !== undefined) {
		if (patch.restSec === null) delete item.restSec;
		else item.restSec = patch.restSec;
	}
	if (patch.note !== undefined) {
		const note = patch.note.trim();
		if (note) item.note = note;
		else delete item.note;
	}
}

/**
 * テンプレートからパッケージを足す計画（data は変更しない）。sessionName を省くとプログラムの全セッション。
 * 名前が重なるときはプログラム名を添える。種目マスターで解決できない種目名は新しい種目として計画に入る。
 */
export function planFromTemplate(
	data: Readonly<PluginData>,
	programId: string,
	sessionName: string | null,
	now: string,
): { exercises: Exercise[]; packages: Package[] } {
	const program = PROGRAM_TEMPLATES.find((p) => p.id === programId);
	if (!program) throw new CatalogError('テンプレートが見つかりません');
	const sessions = program.sessions.filter(
		(s) => sessionName === null || s.name === sessionName,
	);
	const allExercises = [...data.exercises];
	const allPackages = [...data.packages];
	const exercises: Exercise[] = [];
	const packages: Package[] = [];
	for (const session of sessions) {
		const { pkg, createdExercises } = instantiateSession(
			session,
			program,
			allExercises,
			allPackages,
			now,
		);
		exercises.push(...createdExercises);
		allExercises.push(...createdExercises);
		allPackages.push(pkg);
		packages.push(pkg);
	}
	return { exercises, packages };
}

// ---------------------------------------------------------------------------
// 休憩時間の入力

/** '2:30' → 150、'2.5' / '2' → 分として 150 / 120、'90s' / '90秒' → 90。空は null、読めなければ undefined */
export function parseRestInput(input: string): number | null | undefined {
	const text = input.normalize('NFKC').trim();
	if (text === '') return null;
	const mss = /^(\d+):([0-5]\d)$/.exec(text);
	if (mss) return Number(mss[1]) * 60 + Number(mss[2]);
	const sec = /^(\d+)\s*(s|秒)$/i.exec(text);
	if (sec) return Number(sec[1]);
	const min = /^(\d+(?:\.\d+)?)\s*(m|分)?$/i.exec(text);
	if (min) return Math.round(Number(min[1]) * 60);
	return undefined;
}
