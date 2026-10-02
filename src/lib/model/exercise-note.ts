/**
 * 種目ノート（1 種目 1 ノート）と Exercise の対応。
 *
 * - 種目名 = ノートのファイル名（拡張子なし）。ファイル名に使えない文字は全角に置き換える
 *   （'S/A ケーブルサイドレイズ' → 'S／A ケーブルサイドレイズ'。名前の照合は NFKC なので元の表記でも引ける）
 * - 種目の設定は frontmatter が正（Properties 欄で直しても反映される）。本文はノウハウを書く場所で、プラグインは触らない
 * - 別名は Obsidian 標準の `aliases` に入れる（[[旧名]] のリンクも同じノートに繋がる）
 */
import { createResolver } from './resolve';
import type {
	Equipment,
	Exercise,
	ExerciseCategory,
	RecordType,
} from './types';

export const EXERCISE_TAG = 'fitness-exercise';

/** frontmatter のキー（日ノートの集計キーと同じく英語の小文字で固定する） */
export const EXERCISE_KEYS = {
	id: 'fitness_id',
	category: 'category',
	equipment: 'equipment',
	recordType: 'record_type',
	unilateral: 'unilateral',
	archived: 'archived',
	aliases: 'aliases',
	tags: 'tags',
} as const;

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

const FILENAME_REPLACEMENTS: Record<string, string> = {
	'/': '／',
	'\\': '＼',
	':': '：',
	'*': '＊',
	'?': '？',
	'"': '”',
	'<': '＜',
	'>': '＞',
	'|': '｜',
	'#': '＃',
	'^': '＾',
	'[': '［',
	']': '］',
};

/** 種目名 → ファイル名（拡張子なし）。使えない文字を全角に、空白を詰め、先頭の . を外す */
export function exerciseFileName(name: string): string {
	return name
		.trim()
		.replace(/[/\\:*?"<>|#^[\]]/g, (ch) => FILENAME_REPLACEMENTS[ch] ?? ch)
		.replace(/\s+/g, ' ')
		.replace(/^\.+/, '');
}

function oneOf<T extends string>(
	value: unknown,
	options: readonly T[],
): T | undefined {
	return options.find((option) => option === value);
}

function stringList(value: unknown): string[] {
	const list = Array.isArray(value)
		? value
		: typeof value === 'string'
			? [value]
			: [];
	return list
		.filter(
			(v): v is string | number =>
				typeof v === 'string' || typeof v === 'number',
		)
		.map((v) => String(v).trim())
		.filter((v) => v.length > 0);
}

export interface NoteSource {
	path: string;
	/** ファイル名（拡張子なし）＝種目名 */
	basename: string;
	/** frontmatter（無ければ null） */
	frontmatter: Record<string, unknown> | null;
	/** ファイルの作成時刻（ISO 8601） */
	createdAt: string;
}

/**
 * ノートから Exercise を読む。id が無い（手で作ったノート等）ときは null を返すので、
 * 呼び出し側で id を振って frontmatter に書く。不正な値は既定値に倒す。
 */
export function exerciseFromNote(source: NoteSource): Exercise | null {
	const fm = source.frontmatter ?? {};
	const id = fm[EXERCISE_KEYS.id];
	if (typeof id !== 'string' || id.trim().length === 0) return null;
	const exercise: Exercise = {
		id: id.trim(),
		name: source.basename,
		category: oneOf(fm[EXERCISE_KEYS.category], CATEGORIES) ?? 'other',
		recordType:
			oneOf(fm[EXERCISE_KEYS.recordType], RECORD_TYPES) ?? 'weight-reps',
		aliases: stringList(fm[EXERCISE_KEYS.aliases]),
		createdAt: source.createdAt,
		path: source.path,
	};
	const equipment = oneOf(fm[EXERCISE_KEYS.equipment], EQUIPMENT);
	if (equipment) exercise.equipment = equipment;
	if (fm[EXERCISE_KEYS.unilateral] === true) exercise.unilateral = true;
	if (fm[EXERCISE_KEYS.archived] === true) exercise.archived = true;
	return exercise;
}

/**
 * 種目の設定を frontmatter に書く（processFrontMatter のコールバック内で呼ぶ）。
 * プラグインのキーだけを上書きし、ユーザーが足したキー・タグは残す。
 */
export function applyExerciseToFrontmatter(
	fm: Record<string, unknown>,
	exercise: Pick<
		Exercise,
		| 'id'
		| 'category'
		| 'equipment'
		| 'recordType'
		| 'unilateral'
		| 'archived'
		| 'aliases'
	>,
): void {
	fm[EXERCISE_KEYS.aliases] = [...exercise.aliases];
	const tags = stringList(fm[EXERCISE_KEYS.tags]);
	if (!tags.some((tag) => tag.replace(/^#/, '') === EXERCISE_TAG))
		tags.push(EXERCISE_TAG);
	fm[EXERCISE_KEYS.tags] = tags;
	fm[EXERCISE_KEYS.id] = exercise.id;
	fm[EXERCISE_KEYS.category] = exercise.category;
	if (exercise.equipment) fm[EXERCISE_KEYS.equipment] = exercise.equipment;
	else delete fm[EXERCISE_KEYS.equipment];
	fm[EXERCISE_KEYS.recordType] = exercise.recordType;
	fm[EXERCISE_KEYS.unilateral] = exercise.unilateral === true;
	fm[EXERCISE_KEYS.archived] = exercise.archived === true;
}

/** 新しい種目ノートの中身（frontmatter だけ。本文は空でユーザーが書く） */
export function exerciseNoteFrontmatter(
	exercise: Exercise,
): Record<string, unknown> {
	const fm: Record<string, unknown> = {};
	applyExerciseToFrontmatter(fm, exercise);
	return fm;
}

/**
 * 読み込んだ種目の id の重複を見つける（ノートを複製した場合など）。
 * 2 つ目以降のパスを返すので、呼び出し側で新しい id を振り直す。
 */
export function duplicateIdPaths(exercises: readonly Exercise[]): string[] {
	const seen = new Set<string>();
	const duplicates: string[] = [];
	for (const exercise of exercises) {
		if (seen.has(exercise.id) && exercise.path)
			duplicates.push(exercise.path);
		seen.add(exercise.id);
	}
	return duplicates;
}

/** 名前（本名・別名）が他の種目と重なっていれば、その種目 */
export function findNameConflict(
	exercises: readonly Exercise[],
	labels: readonly string[],
	exceptId?: string,
): Exercise | undefined {
	const others = exercises.filter((e) => e.id !== exceptId);
	const resolver = createResolver(others);
	for (const label of labels) {
		const hit = resolver.resolve(label);
		if (hit) return hit;
	}
	return undefined;
}
