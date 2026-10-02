/**
 * セット間の休憩。日ノートには休憩の列は無く、前のセットの終了〜このセットの開始から求める。
 * 休憩を直すときは、このセットの開始（と終了）をずらす。
 */
import type { ExerciseLog, SetLog } from '../model/types';
import { parseTime, secondsToTime, spanSeconds } from '../time/date';

export interface RestBefore {
	/** 休憩の秒数 */
	sec: number;
	/** 前のセットの終了 'HH:mm:ss' */
	prevEnd: string;
}

/** これより長い間は休憩ではなく、記録の順番が前後したもの（手入力・手編集）とみなす */
const MAX_REST_SEC = 3 * 3600;

/**
 * セッションの各セットの直前の休憩。種目の欄をまたいで、ノートの並び（＝やった順）でつなぐ。
 * exercises[i].sets[j] に対応する二重配列。前のセットの終了・このセットの開始が無ければ null。
 */
export function restsBeforeSets(
	exercises: readonly ExerciseLog[],
): Array<Array<RestBefore | null>> {
	let previous: SetLog | null = null;
	return exercises.map((exercise) =>
		exercise.sets.map((set) => {
			const before = previous;
			previous = set;
			if (!before?.end || !set.start) return null;
			const sec = spanSeconds(before.end, set.start);
			if (sec === null || sec >= MAX_REST_SEC) return null;
			return { sec, prevEnd: before.end };
		}),
	);
}

/**
 * 休憩を restSec に直したセット。開始を「前の終了 + 休憩」にし、終了も同じだけずらす（セットの長さは変えない）。
 * 前の終了が読めなければ null。
 */
export function withRest(
	set: SetLog,
	prevEnd: string,
	restSec: number,
): SetLog | null {
	const prev = parseTime(prevEnd);
	if (prev === null || restSec < 0) return null;
	const start = prev + Math.round(restSec);
	const length =
		set.start && set.end ? spanSeconds(set.start, set.end) : null;
	return {
		...set,
		start: secondsToTime(start),
		end: length === null ? set.end : secondsToTime(start + length),
	};
}
