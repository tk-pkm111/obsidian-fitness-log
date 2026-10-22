/**
 * 記録のしかた（セットで何を記録するか）。記録する項目を決まった順（重量・回数・距離・時間）に
 * '-' でつないだ文字列で表す。以前からの 'weight-reps'（重量 × 回数）・'reps'（回数のみ）・
 * 'duration'（時間のみ）もこの形のまま読める。種目ノートの record_type にもこの文字列を書く。
 *
 * - 重量: セットを始めるときに聞く（2 セット目からは前のセットを引き継ぐ）
 * - 回数・距離: セットを終えるときに聞く
 * - 時間: セットの開始〜終了（タイマー）。記録はいつも残り、「時間」を選ぶと結果として見せる
 */
import type { RecordType } from './types';

export type RecordField = 'weight' | 'reps' | 'distance' | 'duration';

/** 項目の順（記録のしかたの文字列・画面の並び） */
export const RECORD_FIELDS: readonly RecordField[] = [
	'weight',
	'reps',
	'distance',
	'duration',
];

export const DEFAULT_RECORD_TYPE: RecordType = 'weight-reps';

/** 記録する項目（決まった順・重複なし）。読めない値は重量 × 回数 */
export function recordFields(type: RecordType): RecordField[] {
	const normalized = normalizeRecordType(type) ?? DEFAULT_RECORD_TYPE;
	return normalized.split('-') as RecordField[];
}

/** 項目 → 記録のしかたの文字列。項目が無ければ null */
export function recordTypeOf(fields: Iterable<RecordField>): RecordType | null {
	const set = new Set(fields);
	const ordered = RECORD_FIELDS.filter((f) => set.has(f));
	return ordered.length > 0 ? ordered.join('-') : null;
}

/** ノートの値を記録のしかたにする（順番違い・大文字も受け付ける）。読めなければ undefined */
export function normalizeRecordType(value: unknown): RecordType | undefined {
	if (typeof value !== 'string') return undefined;
	const parts = value
		.trim()
		.toLowerCase()
		.split(/[-\s,]+/)
		.filter((p) => p.length > 0);
	if (
		parts.length === 0 ||
		parts.some((p) => !(RECORD_FIELDS as readonly string[]).includes(p))
	)
		return undefined;
	return recordTypeOf(parts as RecordField[]) ?? undefined;
}

export function hasField(type: RecordType, field: RecordField): boolean {
	return recordFields(type).includes(field);
}

/**
 * セットに重量を持つか。重量を記録する種目のほか、回数を記録する種目は「加重」として持てる
 * （自重の種目に重りを足した日。以前からの「回数のみ」と同じ）
 */
export function keepsWeight(type: RecordType): boolean {
	return hasField(type, 'weight') || hasField(type, 'reps');
}
