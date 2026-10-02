/**
 * ルーチン（data.json）への変更操作。PluginData を直接変更する純粋関数。
 */
import { isDateString } from '../../time/date';
import { newId } from '../ids';
import type { PluginData, Routine, RoutineRule } from '../types';
import { CatalogError } from './errors';

export type RoutineFields = Omit<Routine, 'id' | 'skipDates'>;

/** ルーチンの入力を検証する（問題があれば CatalogError） */
export function validateRoutine(data: PluginData, fields: RoutineFields): void {
	if (!data.packages.some((p) => p.id === fields.packageId))
		throw new CatalogError('パッケージを選んでください');
	if (!isDateString(fields.startDate))
		throw new CatalogError('開始日を入力してください');
	if (fields.endDate !== undefined) {
		if (!isDateString(fields.endDate))
			throw new CatalogError('終了日の形式が正しくありません');
		if (fields.endDate < fields.startDate)
			throw new CatalogError('終了日は開始日以降にしてください');
	}
	const rule = fields.rule;
	if (rule.type === 'weekly') {
		if (rule.weekdays.length === 0)
			throw new CatalogError('曜日を 1 つ以上選んでください');
		if (!Number.isInteger(rule.intervalWeeks) || rule.intervalWeeks < 1)
			throw new CatalogError('間隔は 1 以上の整数にしてください');
	} else if (!Number.isInteger(rule.intervalDays) || rule.intervalDays < 1) {
		throw new CatalogError('間隔は 1 以上の整数にしてください');
	}
}

function normalizedRule(rule: RoutineRule): RoutineRule {
	return rule.type === 'weekly'
		? {
				...rule,
				weekdays: [...new Set(rule.weekdays)].sort((a, b) => a - b),
			}
		: { ...rule };
}

export function createRoutine(
	data: PluginData,
	fields: RoutineFields,
): Routine {
	validateRoutine(data, fields);
	const routine: Routine = {
		id: newId('rt', new Set(data.routines.map((r) => r.id))),
		packageId: fields.packageId,
		rule: normalizedRule(fields.rule),
		startDate: fields.startDate,
		enabled: fields.enabled,
		skipDates: [],
	};
	if (fields.endDate !== undefined) routine.endDate = fields.endDate;
	data.routines.push(routine);
	return routine;
}

export function updateRoutine(
	data: PluginData,
	id: string,
	fields: RoutineFields,
): Routine {
	const routine = data.routines.find((r) => r.id === id);
	if (!routine) throw new CatalogError('ルーチンが見つかりません');
	validateRoutine(data, fields);
	routine.packageId = fields.packageId;
	routine.rule = normalizedRule(fields.rule);
	routine.startDate = fields.startDate;
	routine.enabled = fields.enabled;
	if (fields.endDate !== undefined) routine.endDate = fields.endDate;
	else delete routine.endDate;
	return routine;
}

export function setRoutineEnabled(
	data: PluginData,
	id: string,
	enabled: boolean,
): void {
	const routine = data.routines.find((r) => r.id === id);
	if (!routine) throw new CatalogError('ルーチンが見つかりません');
	routine.enabled = enabled;
}

export function deleteRoutine(data: PluginData, id: string): void {
	data.routines = data.routines.filter((r) => r.id !== id);
}
