import { describe, expect, it } from 'vitest';
import {
	applyMeasurement,
	bodyNoteDate,
	measurementFromNote,
	normalizeBodyTime,
	sortMeasurements,
	type BodyMeasurement,
} from '../../../src/lib/body/note';

describe('体組成のノート', () => {
	it('名前が日付のノートだけを読む', () => {
		expect(bodyNoteDate('2026-10-22')).toBe('2026-10-22');
		expect(bodyNoteDate('TANITA')).toBeNull();
		expect(bodyNoteDate('2026-13-01')).toBeNull();
		expect(bodyNoteDate('2026-10-22 朝')).toBeNull();
		expect(
			measurementFromNote('b/一覧.md', '一覧', { 体重: 66.7 }),
		).toBeNull();
	});

	it('数字の値だけを項目として読む（評価の文字・読まないキーは除く）', () => {
		const m = measurementFromNote('b/2026-10-22.md', '2026-10-22', {
			時刻: '7:05',
			体重: 66.7,
			体脂肪率: '18.5',
			'左腕 筋肉量': 2.9,
			'体幹部 筋肉量評価': '標準',
			tags: ['body'],
			fitness_id: 3,
			目標: null,
		});
		expect(m).toEqual({
			date: '2026-10-22',
			time: '07:05',
			path: 'b/2026-10-22.md',
			values: { 体重: 66.7, 体脂肪率: 18.5, '左腕 筋肉量': 2.9 },
		});
	});

	it('時刻は任意。読めない時刻は null', () => {
		expect(
			measurementFromNote('a.md', '2026-10-22', { 体重: 60 })?.time,
		).toBeNull();
		expect(normalizeBodyTime('25:00')).toBeNull();
		expect(normalizeBodyTime(429)).toBe('07:09');
		expect(normalizeBodyTime(1500)).toBeNull();
		expect(normalizeBodyTime(7.5)).toBeNull();
		expect(normalizeBodyTime('14:30')).toBe('14:30');
	});

	it('数字の項目が無いノート・日ノート（タグ fitness-log）は測定にしない', () => {
		expect(
			measurementFromNote('a.md', '2026-10-22', { 時刻: '07:00' }),
		).toBeNull();
		expect(
			measurementFromNote('a.md', '2026-10-22', {
				tags: ['fitness-log'],
				sets: 12,
			}),
		).toBeNull();
		expect(measurementFromNote('a.md', '2026-10-22', null)).toBeNull();
	});

	it('手で入れた項目だけを書き換え、ほかの項目は残す', () => {
		const fm: Record<string, unknown> = {
			時刻: '07:00',
			体重: 66.7,
			体脂肪率: 18.5,
			メモ: '朝',
		};
		applyMeasurement(fm, { 体重: 66.2 }, '21:10');
		expect(fm).toEqual({
			時刻: '21:10',
			体重: 66.2,
			体脂肪率: 18.5,
			メモ: '朝',
		});
		applyMeasurement(fm, { 筋肉量: 51 }, null);
		expect(fm.時刻).toBe('21:10');
		expect(fm.筋肉量).toBe(51);
	});

	it('日付の昇順に。同じ日が 2 つあればパスの順で最初のもの', () => {
		const m = (date: string, path: string): BodyMeasurement => ({
			date,
			time: null,
			path,
			values: { 体重: 1 },
		});
		expect(
			sortMeasurements([
				m('2026-10-22', 'b/2026/2026-10-22.md'),
				m('2026-10-15', 'b/2026-10-15.md'),
				m('2026-10-22', 'b/2026-10-22.md'),
			]).map((x) => x.path),
		).toEqual(['b/2026-10-15.md', 'b/2026-10-22.md']);
	});
});
