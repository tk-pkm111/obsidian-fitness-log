/**
 * 種目の作成・変更・削除の準備（純粋関数）。
 * 種目の正は種目ノート（frontmatter）なので、ここでは検証済みの Exercise を作るだけで、
 * ノートへの書き込みは ExerciseLibrary（src/data）が行う。
 */
import { exerciseFileName, findNameConflict } from '../exercise-note';
import { newId } from '../ids';
import { aliasesAfterRename, nameKey } from '../resolve';
import type { Exercise, Package, PluginData } from '../types';
import { CatalogError } from './errors';
import { removeItemsWhere } from './package-rows';

export type ExerciseFields = Partial<
	Omit<Exercise, 'id' | 'createdAt' | 'path'>
> & {
	name: string;
};

function checkName(
	existing: readonly Exercise[],
	name: string,
	aliases: readonly string[],
	exceptId?: string,
): void {
	if (name.length === 0) throw new CatalogError('種目名を入力してください');
	const conflict = findNameConflict(existing, [name, ...aliases], exceptId);
	if (conflict)
		throw new CatalogError(
			`「${conflict.name}」と名前（別名）が重なっています`,
		);
}

/** 新しい種目を作る（名前はファイル名に使える形に揃える）。id を渡すとそれを使う */
export function prepareNewExercise(
	existing: readonly Exercise[],
	fields: ExerciseFields,
	now: string,
	id?: string,
): Exercise {
	const name = exerciseFileName(fields.name);
	const aliases = (fields.aliases ?? []).filter(
		(a) => nameKey(a) !== nameKey(name),
	);
	checkName(existing, name, aliases);
	const exercise: Exercise = {
		id: id ?? newId('ex', new Set(existing.map((e) => e.id))),
		name,
		category: fields.category ?? 'other',
		recordType: fields.recordType ?? 'weight-reps',
		aliases,
		createdAt: now,
	};
	if (fields.equipment) exercise.equipment = fields.equipment;
	if (fields.unilateral) exercise.unilateral = true;
	if (fields.archived) exercise.archived = true;
	return exercise;
}

/** 種目の変更後の姿。名前を変えたら旧名を別名に足す（過去ノートの名前と繋がる） */
export function prepareExerciseUpdate(
	existing: readonly Exercise[],
	current: Exercise,
	fields: Partial<ExerciseFields>,
): Exercise {
	const name = exerciseFileName(fields.name ?? current.name);
	let aliases = fields.aliases ?? current.aliases;
	if (name !== current.name)
		aliases = aliasesAfterRename(current.name, name, aliases);
	checkName(existing, name, aliases, current.id);
	const next: Exercise = {
		...current,
		...fields,
		name,
		aliases,
	};
	if (!next.equipment) delete next.equipment;
	if (!next.unilateral) delete next.unilateral;
	if (!next.archived) delete next.archived;
	return next;
}

/** 種目を消せるか（進行中のセットの種目は消せない） */
export function checkCanDeleteExercise(data: PluginData, id: string): void {
	if (data.activeSet?.exerciseId === id)
		throw new CatalogError('進行中のセットの種目は削除できません');
}

/** パッケージの項目から種目を外す（種目を消したとき。過去の日ノートは名前で残る） */
export function removeExerciseFromPackages(data: PluginData, id: string): void {
	removeItemsWhere(data, (item) => item.exerciseId === id);
}

/** その種目を使っているパッケージ */
export function packagesUsingExercise(data: PluginData, id: string): Package[] {
	return data.packages.filter((p) =>
		p.items.some((i) => i.exerciseId === id),
	);
}
