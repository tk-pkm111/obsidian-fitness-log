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
import { recordFields } from './model/record-type';
import { DISTANCE_UNIT, formatDistance, toDisplayWeight } from './units';

function num(value: number | null): string {
	return value === null ? '-' : String(value);
}

/**
 * 1 セットの結果。記録のしかたの項目を「×」でつなぐ:
 * '10 kg × 9 回' / '8 回' / '+10 kg × 8 回'（回数の種目に重りを足した日）/ '20:00' / '5.2 km × 25:00'
 */
export function formatSetResult(
	set: SetLog,
	unit: WeightUnit,
	recordType: RecordType,
): string {
	const fields = recordFields(recordType);
	const parts: string[] = [];
	if (set.weight !== null) {
		const weight = `${toDisplayWeight(set.weight, unit)} ${unit}`;
		if (fields.includes('weight')) parts.push(weight);
		else if (fields.includes('reps')) parts.push(`+${weight}`);
	}
	if (fields.includes('reps'))
		parts.push(t('format.reps', { n: num(set.reps) }));
	if (fields.includes('distance')) {
		const distance = set.distance ?? null;
		parts.push(
			`${distance === null ? '-' : formatDistance(distance)} ${DISTANCE_UNIT}`,
		);
	}
	if (fields.includes('duration'))
		parts.push(formatDuration(setDurationSec(set)));
	return parts.length > 0 ? parts.join(' × ') : '-';
}

/**
 * 複数セットの要約（前回のヒント・ログの一覧）。重量と回数の種目は、同じ重量が続くセットをまとめる:
 * '10 kg × 9, 8 / 12.5 kg × 6'、自重は '8, 7 回'。ほかは 1 セットずつ '20:00, 15:00'
 */
export function formatSetsCompact(
	sets: readonly SetLog[],
	unit: WeightUnit,
	recordType: RecordType,
): string {
	const fields = recordFields(recordType);
	if (
		!fields.includes('reps') ||
		fields.includes('distance') ||
		fields.includes('duration')
	)
		return sets.map((s) => formatSetResult(s, unit, recordType)).join(', ');
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
