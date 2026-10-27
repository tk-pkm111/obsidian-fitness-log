/**
 * 今日の画面の種目の 📈（前回までの記録）: その種目の直近の記録と、いちばんのセット。
 * 表示中の日より前だけを使う（今日のセットは画面に出ている）。
 */
import { hasField } from '../model/record-type';
import type { RecordType, SetLog } from '../model/types';
import type { ExerciseOccurrence } from './carry-over';
import { setDurationSec } from './stats';

export interface RecentRecord {
	date: string;
	/** パッケージ名。null は単発の種目（パッケージ外） */
	sessionName: string | null;
	/** やった順（同じセッションで欄が分かれていてもつなげる） */
	sets: SetLog[];
}

/**
 * date より前の直近 limit 回（新しい順）。同じ日・同じセッションの欄（同じ種目を後でもう一度やった）は 1 回にまとめる。
 * occurrences は collectOccurrences の順（新しい順。同じ日はノートの後ろの欄ほど先）
 */
export function recentRecords(
	occurrences: readonly ExerciseOccurrence[],
	date: string,
	limit: number,
): RecentRecord[] {
	const records: RecentRecord[] = [];
	for (const occurrence of occurrences) {
		if (occurrence.date >= date) continue;
		const last = records[records.length - 1];
		if (
			last &&
			last.date === occurrence.date &&
			last.sessionName === occurrence.sessionName
		) {
			// 後ろの欄が先に来るので、前の欄のセットを前につなげる
			last.sets = [...occurrence.sets, ...last.sets];
			continue;
		}
		if (records.length >= limit) break;
		records.push({
			date: occurrence.date,
			sessionName: occurrence.sessionName,
			sets: [...occurrence.sets],
		});
	}
	return records;
}

/**
 * date より前で、いちばんのセット（新しい順の最初の 1 つ）。比べるのは記録のしかたの最初の項目:
 * 重量（同じなら回数の多い方）→ 回数（同じなら重量の重い方）→ 距離 → 時間
 */
export function bestRecordSet(
	occurrences: readonly ExerciseOccurrence[],
	date: string,
	recordType: RecordType,
): { set: SetLog; date: string } | null {
	const keys: Array<(set: SetLog) => number | null> = hasField(
		recordType,
		'weight',
	)
		? [(s) => s.weight, (s) => s.reps]
		: hasField(recordType, 'reps')
			? [(s) => s.reps, (s) => s.weight]
			: hasField(recordType, 'distance')
				? [(s) => s.distance ?? null]
				: [(s) => (s.start && s.end ? setDurationSec(s) : null)];
	const [primary] = keys;
	let best: { set: SetLog; date: string } | null = null;
	for (const occurrence of occurrences) {
		if (occurrence.date >= date) continue;
		for (const set of occurrence.sets) {
			const value = primary?.(set);
			if (value === null || value === undefined) continue;
			if (!best || compare(set, best.set, keys) > 0)
				best = { set, date: occurrence.date };
		}
	}
	return best;
}

function compare(
	a: SetLog,
	b: SetLog,
	keys: ReadonlyArray<(set: SetLog) => number | null>,
): number {
	for (const key of keys) {
		const x = key(a) ?? -Infinity;
		const y = key(b) ?? -Infinity;
		if (x !== y) return x > y ? 1 : -1;
	}
	return 0;
}
