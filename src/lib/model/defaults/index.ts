/**
 * 初期データ（種目マスター・プログラムのテンプレート）と、それをもとに種目・パッケージを作る処理。
 * 実装計画 §7。
 */
import { parseRepRange } from '../../rep-range';
import { newId } from '../ids';
import { exerciseFileName } from '../exercise-note';
import { createResolver, nameKey } from '../resolve';
import type { Exercise, Package, PackageItem } from '../types';
import { DEFAULT_EXERCISES } from './exercises';
import type { ProgramTemplate, SessionTemplate } from './programs';

export { DEFAULT_EXERCISES, type ExerciseSeed } from './exercises';
export {
	INITIAL_PROGRAM_ID,
	PROGRAM_TEMPLATES,
	type ProgramTemplate,
	type SessionTemplate,
} from './programs';

// ---------------------------------------------------------------------------
// 表記の解釈

/** SETS の表記（'2', '1-2'）→ セット数。範囲は中央値を四捨五入（'1-2' → 2）。読めなければ 1。 */
export function parseSetsSpec(spec: string): number {
	const range = parseRepRange(spec);
	if (!range || range.kind === 'amrap') return 1;
	return Math.max(1, Math.round((range.min + range.max) / 2));
}

/** インターバル(分) の表記（'2', '2-3'）→ 秒。範囲は中央値（'2-3' → 150）。空なら undefined。 */
export function parseRestSpec(spec: string): number | undefined {
	const range = parseRepRange(spec);
	if (!range || range.kind === 'amrap') return undefined;
	return Math.round(((range.min + range.max) / 2) * 60);
}

// ---------------------------------------------------------------------------
// 生成

export function createDefaultExercises(
	now: string,
	taken: Set<string> = new Set(),
): Exercise[] {
	return DEFAULT_EXERCISES.map((seed) => {
		const id = newId('ex', taken);
		taken.add(id);
		const exercise: Exercise = {
			id,
			// 種目名はノートのファイル名になるので、使えない文字（/ など）は全角に
			name: exerciseFileName(seed.name),
			category: seed.category,
			equipment: seed.equipment,
			recordType: seed.recordType ?? 'weight-reps',
			aliases: [...(seed.aliases ?? [])],
			createdAt: now,
		};
		if (seed.unilateral) exercise.unilateral = true;
		return exercise;
	});
}

/** 既存のパッケージ名と重ならない名前（'PUSH A' → 'PUSH A（PPL×U-L）' → 'PUSH A（PPL×U-L）2'） */
export function uniquePackageName(
	name: string,
	programName: string,
	existing: readonly string[],
): string {
	const keys = new Set(existing.map(nameKey));
	if (!keys.has(nameKey(name))) return name;
	const withProgram = `${name}（${programName}）`;
	if (!keys.has(nameKey(withProgram))) return withProgram;
	for (let n = 2; ; n++) {
		const candidate = `${withProgram}${n}`;
		if (!keys.has(nameKey(candidate))) return candidate;
	}
}

export interface InstantiateResult {
	pkg: Package;
	/** テンプレートの種目名が種目マスターに無く、新しく作った種目 */
	createdExercises: Exercise[];
}

/**
 * テンプレートのセッションからパッケージを作る。種目名は本名・別名で解決し、
 * 解決できなければ新しい種目（カテゴリ「その他」）を作る。
 */
export function instantiateSession(
	session: SessionTemplate,
	program: ProgramTemplate,
	exercises: readonly Exercise[],
	existingPackages: readonly Package[],
	now: string,
): InstantiateResult {
	const takenExerciseIds = new Set(exercises.map((e) => e.id));
	const pool = [...exercises];
	const createdExercises: Exercise[] = [];
	const items: PackageItem[] = session.rows.map(
		([name, sets, reps, rest, note]) => {
			let exercise = createResolver(pool).resolve(name);
			if (!exercise) {
				exercise = {
					id: newId('ex', takenExerciseIds),
					name: exerciseFileName(name),
					category: 'other',
					recordType: 'weight-reps',
					aliases: [],
					createdAt: now,
				};
				takenExerciseIds.add(exercise.id);
				pool.push(exercise);
				createdExercises.push(exercise);
			}
			const item: PackageItem = {
				exerciseId: exercise.id,
				targetSets: parseSetsSpec(sets),
				targetReps: reps,
			};
			const restSec = parseRestSpec(rest);
			if (restSec !== undefined) item.restSec = restSec;
			if (note) item.note = note;
			return item;
		},
	);
	const pkg: Package = {
		id: newId('pk', new Set(existingPackages.map((p) => p.id))),
		// 旧名（別名）とも重ねない（重なると過去のセッションが新しいパッケージに結び付いてしまう）
		name: uniquePackageName(
			session.name,
			program.name,
			existingPackages.flatMap((p) => [p.name, ...p.aliases]),
		),
		items,
		aliases: [],
		createdAt: now,
	};
	if (session.note) pkg.note = session.note;
	return { pkg, createdExercises };
}
