/**
 * data.json（PluginData）の既定値・読み込み時の正規化・マイグレーション・初期データ投入。
 * data.json は Sync や手編集で壊れうるので、読み込み時に型を確かめて不正な要素は捨てる。
 */
import {
	createDefaultExercises,
	INITIAL_PROGRAM_ID,
	instantiateSession,
	PROGRAM_TEMPLATES,
} from './defaults';
import { createResolver, nameKey } from './resolve';
import type {
	ActiveSet,
	Equipment,
	Exercise,
	ExerciseCategory,
	FitnessLogSettings,
	Package,
	PackageItem,
	PackageSection,
	RemovedPackageItem,
	PluginData,
	RecordType,
	Routine,
	RoutineRule,
} from './types';
import { isDateString } from '../time/date';

export const DEFAULT_SETTINGS: FitnessLogSettings = {
	logFolder: 'Fitness/ログ',
	exerciseFolder: 'Fitness/種目',
	fileNameFormat: 'YYYY-MM-DD',
	weightUnit: 'kg',
	weightStep: 2.5,
	showRestTimer: true,
	openOnStartup: false,
	packageSections: false,
};

export function createEmptyData(): PluginData {
	return {
		version: 1,
		settings: { ...DEFAULT_SETTINGS },
		exercises: [],
		packages: [],
		routines: [],
		activeSet: null,
		migrations: [],
	};
}

const CATEGORIES: readonly ExerciseCategory[] = [
	'push',
	'pull',
	'legs',
	'arms',
	'core',
	'cardio',
	'other',
];
const EQUIPMENT: readonly Equipment[] = [
	'machine',
	'cable',
	'smith',
	'barbell',
	'dumbbell',
	'bodyweight',
	'band',
	'other',
];
const RECORD_TYPES: readonly RecordType[] = ['weight-reps', 'reps', 'duration'];

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function nonEmpty(value: unknown): string | undefined {
	const s = str(value)?.trim();
	return s && s.length > 0 ? s : undefined;
}

function num(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: undefined;
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter(
				(v): v is string =>
					typeof v === 'string' && v.trim().length > 0,
			)
		: [];
}

function oneOf<T extends string>(
	value: unknown,
	options: readonly T[],
): T | undefined {
	return options.find((option) => option === value);
}

function normalizeSettings(raw: unknown, legacy: Obj): FitnessLogSettings {
	const s = isObj(raw) ? raw : {};
	const step = num(s.weightStep);
	return {
		// 0.1.0 以前は data.json の直下に logFolder だけを持っていた
		logFolder:
			nonEmpty(s.logFolder) ??
			nonEmpty(legacy.logFolder) ??
			DEFAULT_SETTINGS.logFolder,
		exerciseFolder:
			nonEmpty(s.exerciseFolder) ?? DEFAULT_SETTINGS.exerciseFolder,
		fileNameFormat:
			nonEmpty(s.fileNameFormat) ?? DEFAULT_SETTINGS.fileNameFormat,
		weightUnit:
			oneOf(s.weightUnit, ['kg', 'lb'] as const) ??
			DEFAULT_SETTINGS.weightUnit,
		weightStep:
			step !== undefined && step > 0 ? step : DEFAULT_SETTINGS.weightStep,
		showRestTimer:
			typeof s.showRestTimer === 'boolean'
				? s.showRestTimer
				: DEFAULT_SETTINGS.showRestTimer,
		openOnStartup:
			typeof s.openOnStartup === 'boolean'
				? s.openOnStartup
				: DEFAULT_SETTINGS.openOnStartup,
		packageSections:
			typeof s.packageSections === 'boolean'
				? s.packageSections
				: DEFAULT_SETTINGS.packageSections,
	};
}

function normalizeExercise(raw: unknown): Exercise | null {
	if (!isObj(raw)) return null;
	const id = nonEmpty(raw.id);
	const name = nonEmpty(raw.name);
	if (!id || !name) return null;
	const exercise: Exercise = {
		id,
		name,
		category: oneOf(raw.category, CATEGORIES) ?? 'other',
		recordType: oneOf(raw.recordType, RECORD_TYPES) ?? 'weight-reps',
		aliases: stringList(raw.aliases),
		createdAt: str(raw.createdAt) ?? new Date(0).toISOString(),
	};
	const equipment = oneOf(raw.equipment, EQUIPMENT);
	if (equipment) exercise.equipment = equipment;
	if (raw.unilateral === true) exercise.unilateral = true;
	if (raw.archived === true) exercise.archived = true;
	const path = nonEmpty(raw.path);
	if (path) exercise.path = path;
	return exercise;
}

function normalizePackageItem(raw: unknown): PackageItem | null {
	if (!isObj(raw)) return null;
	const exerciseId = nonEmpty(raw.exerciseId);
	if (!exerciseId) return null;
	const sets = num(raw.targetSets);
	const item: PackageItem = {
		exerciseId,
		targetSets: sets !== undefined && sets >= 1 ? Math.floor(sets) : 1,
		targetReps: str(raw.targetReps)?.trim() ?? '',
	};
	const rest = num(raw.restSec);
	if (rest !== undefined && rest > 0) item.restSec = Math.round(rest);
	const note = nonEmpty(raw.note);
	if (note) item.note = note;
	return item;
}

function normalizePackage(raw: unknown): Package | null {
	if (!isObj(raw)) return null;
	const id = nonEmpty(raw.id);
	const name = nonEmpty(raw.name);
	if (!id || !name) return null;
	const pkg: Package = {
		id,
		name,
		items: Array.isArray(raw.items)
			? raw.items
					.map(normalizePackageItem)
					.filter((i): i is PackageItem => i !== null)
			: [],
		aliases: stringList(raw.aliases),
		createdAt: str(raw.createdAt) ?? new Date(0).toISOString(),
	};
	const note = nonEmpty(raw.note);
	if (note) pkg.note = note;
	const sections = normalizeSections(raw.sections, pkg.items.length);
	if (sections.length > 0) pkg.sections = sections;
	const removed = normalizeRemovedItems(raw.removedItems, pkg.items);
	if (removed.length > 0) pkg.removedItems = removed;
	return pkg;
}

/** 外した種目の設定: 種目ごとに 1 つ（先のものを残す）。今パッケージにある種目は捨てる */
function normalizeRemovedItems(
	raw: unknown,
	items: readonly PackageItem[],
): RemovedPackageItem[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set(items.map((i) => i.exerciseId));
	const result: RemovedPackageItem[] = [];
	for (const value of raw) {
		const item = normalizePackageItem(value);
		if (!item || !isObj(value) || seen.has(item.exerciseId)) continue;
		seen.add(item.exerciseId);
		result.push({
			...item,
			removedAt: str(value.removedAt) ?? new Date(0).toISOString(),
			after: nonEmpty(value.after) ?? null,
		});
	}
	return result;
}

/** 区切り: id・名前が無いものは捨て、位置は 0〜種目数に収める。id が重なれば 2 つ目以降を捨てる */
function normalizeSections(raw: unknown, itemCount: number): PackageSection[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const sections: PackageSection[] = [];
	for (const value of raw) {
		if (!isObj(value)) continue;
		const id = nonEmpty(value.id);
		const name = nonEmpty(value.name);
		if (!id || !name || seen.has(id)) continue;
		seen.add(id);
		const at = num(value.at);
		sections.push({
			id,
			name,
			at:
				at === undefined
					? itemCount
					: Math.min(itemCount, Math.max(0, Math.floor(at))),
		});
	}
	return sections;
}

function normalizeDayOrders(
	raw: unknown,
): Record<string, string[]> | undefined {
	if (!isObj(raw)) return undefined;
	const orders: Record<string, string[]> = {};
	for (const [key, value] of Object.entries(raw)) {
		const list = stringList(value);
		if (list.length > 0 && isDateString(key.slice(0, 10)))
			orders[key] = list;
	}
	return Object.keys(orders).length > 0 ? orders : undefined;
}

function normalizeRule(raw: unknown): RoutineRule | null {
	if (!isObj(raw)) return null;
	if (raw.type === 'weekly') {
		const weekdays = Array.isArray(raw.weekdays)
			? [
					...new Set(
						raw.weekdays.filter(
							(d): d is number =>
								Number.isInteger(d) && d >= 0 && d <= 6,
						),
					),
				].sort()
			: [];
		const interval = num(raw.intervalWeeks);
		return {
			type: 'weekly',
			weekdays,
			intervalWeeks:
				interval !== undefined && interval >= 1
					? Math.floor(interval)
					: 1,
		};
	}
	if (raw.type === 'everyNDays') {
		const interval = num(raw.intervalDays);
		return {
			type: 'everyNDays',
			intervalDays:
				interval !== undefined && interval >= 1
					? Math.floor(interval)
					: 1,
		};
	}
	return null;
}

function normalizeRoutine(raw: unknown): Routine | null {
	if (!isObj(raw)) return null;
	const id = nonEmpty(raw.id);
	const packageId = nonEmpty(raw.packageId);
	const rule = normalizeRule(raw.rule);
	if (!id || !packageId || !rule || !isDateString(raw.startDate)) return null;
	const routine: Routine = {
		id,
		packageId,
		rule,
		startDate: raw.startDate,
		enabled: raw.enabled !== false,
		skipDates: stringList(raw.skipDates).filter(isDateString),
	};
	if (isDateString(raw.endDate)) routine.endDate = raw.endDate;
	return routine;
}

function normalizeActiveSet(raw: unknown): ActiveSet | null {
	if (!isObj(raw)) return null;
	const exerciseId = nonEmpty(raw.exerciseId);
	const startedAt = str(raw.startedAt);
	if (
		!exerciseId ||
		!startedAt ||
		Number.isNaN(Date.parse(startedAt)) ||
		!isDateString(raw.date)
	)
		return null;
	const setIndex = num(raw.setIndex);
	const active: ActiveSet = {
		date: raw.date,
		packageId: nonEmpty(raw.packageId) ?? null,
		exerciseId,
		setIndex:
			setIndex !== undefined && setIndex >= 1 ? Math.floor(setIndex) : 1,
		startedAt,
	};
	const weight = num(raw.weight);
	if (weight !== undefined) active.weight = weight;
	return active;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
	const seen = new Set<string>();
	return items.filter((item) =>
		seen.has(item.id) ? false : (seen.add(item.id), true),
	);
}

/** loadData() の戻り値（null・旧形式・壊れた値を含む）を PluginData にする */
export function normalizePluginData(raw: unknown): PluginData {
	const obj = isObj(raw) ? raw : {};
	const exercises = uniqueById(
		(Array.isArray(obj.exercises) ? obj.exercises : [])
			.map(normalizeExercise)
			.filter((e): e is Exercise => e !== null),
	);
	const packages = uniqueById(
		(Array.isArray(obj.packages) ? obj.packages : [])
			.map(normalizePackage)
			.filter((p): p is Package => p !== null),
	);
	const packageIds = new Set(packages.map((p) => p.id));
	const routines = uniqueById(
		(Array.isArray(obj.routines) ? obj.routines : [])
			.map(normalizeRoutine)
			.filter(
				(r): r is Routine => r !== null && packageIds.has(r.packageId),
			),
	);
	const data: PluginData = {
		version: 1,
		settings: normalizeSettings(obj.settings, obj),
		exercises,
		packages,
		routines,
		activeSet: normalizeActiveSet(obj.activeSet),
		migrations: stringList(obj.migrations),
	};
	const dayOrders = normalizeDayOrders(obj.dayOrders);
	if (dayOrders) data.dayOrders = dayOrders;
	const seededAt = str(obj.seededAt);
	if (seededAt) data.seededAt = seededAt;
	const setupAt = str(obj.setupAt);
	if (setupAt) data.setupAt = setupAt;
	return data;
}

export interface CatalogPlan {
	/** 新しく作る種目（ノートを作ってから使う） */
	exercises: Exercise[];
	/** 新しく足すパッケージ */
	packages: Package[];
}

/**
 * 初期データの計画（data は変更しない）。
 * - 種目: 本名・別名のどちらでも既存と重ならないものだけ
 * - パッケージ: INITIAL_PROGRAM のセッションのうち、同じ名前（旧名を含む）のパッケージが無いものだけ
 * 実行する側は、種目ノートを作ってからパッケージを足し、seededAt を記録する。
 */
export function planSeed(data: Readonly<PluginData>, now: string): CatalogPlan {
	const existing = createResolver(data.exercises);
	const taken = new Set(data.exercises.map((e) => e.id));
	const exercises = createDefaultExercises(now, taken).filter(
		(exercise) =>
			!existing.resolve(exercise.name) &&
			!exercise.aliases.some((alias) => existing.resolve(alias)),
	);
	const allExercises = [...data.exercises, ...exercises];
	const allPackages = [...data.packages];
	const packages: Package[] = [];
	const program = PROGRAM_TEMPLATES.find((p) => p.id === INITIAL_PROGRAM_ID);
	for (const session of program?.sessions ?? []) {
		if (!program) break;
		// 名前を変えたパッケージ（旧名が別名に残る）も「ある」とみなす
		const labels = [session.name, ...(session.aliases ?? [])].map(nameKey);
		const exists = allPackages.some((p) =>
			[p.name, ...p.aliases].some((label) =>
				labels.includes(nameKey(label)),
			),
		);
		if (exists) continue;
		const { pkg, createdExercises } = instantiateSession(
			session,
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
