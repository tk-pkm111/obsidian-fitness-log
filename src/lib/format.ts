/**
 * 画面表示用の整形（日ノートの書式ではない）。
 */
import { t } from '../i18n';
import { setDurationSec } from './history/stats';
import type {
	PackageItem,
	RecordType,
	SetLog,
	WeightUnit,
} from './model/types';
import { formatDuration } from './time/date';
import { toDisplayWeight } from './units';

function num(value: number | null): string {
	return value === null ? '-' : String(value);
}

/** 1 セットの結果: '10 kg × 9 回' / '8 回' / '+10 kg × 8 回' / '20:00' */
export function formatSetResult(
	set: SetLog,
	unit: WeightUnit,
	recordType: RecordType,
): string {
	if (recordType === 'duration') return formatDuration(setDurationSec(set));
	const reps = t('format.reps', { n: num(set.reps) });
	if (set.weight === null) return reps;
	const weight = `${toDisplayWeight(set.weight, unit)} ${unit}`;
	return recordType === 'reps'
		? t('format.addedWeight', { weight, reps })
		: t('format.weightReps', { weight, reps });
}

/**
 * 複数セットの要約（前回のヒント・ログの一覧）。同じ重量が続くセットはまとめる。
 * '10 kg × 9, 8 / 12.5 kg × 6'、自重は '8, 7 回'、時間は '20:00, 15:00'
 */
export function formatSetsCompact(
	sets: readonly SetLog[],
	unit: WeightUnit,
	recordType: RecordType,
): string {
	if (recordType === 'duration')
		return sets.map((s) => formatDuration(setDurationSec(s))).join(', ');
	const groups: Array<{ weight: number | null; reps: string[] }> = [];
	for (const set of sets) {
		const last = groups[groups.length - 1];
		if (last && last.weight === set.weight) last.reps.push(num(set.reps));
		else groups.push({ weight: set.weight, reps: [num(set.reps)] });
	}
	return groups
		.map((g) =>
			g.weight === null
				? t('format.reps', { n: g.reps.join(', ') })
				: `${toDisplayWeight(g.weight, unit)} ${unit} × ${g.reps.join(', ')}`,
		)
		.join(' / ');
}

/** 目標: '2 セット × 6-9 回 ・ 休憩 2:30'。回数の目標が無ければ '1 セット' */
export function formatTarget(item: PackageItem): string {
	const parts = [
		item.targetReps.length > 0
			? t('format.target', {
					sets: item.targetSets,
					reps: item.targetReps,
				})
			: t('format.targetSetsOnly', { sets: item.targetSets }),
	];
	if (item.restSec !== undefined)
		parts.push(t('format.rest', { time: formatDuration(item.restSec) }));
	return parts.join(' ・ ');
}
