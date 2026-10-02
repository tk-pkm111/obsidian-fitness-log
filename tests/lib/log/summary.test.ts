import { describe, expect, it } from 'vitest';
import {
	applySummaryToFrontmatter,
	sessionSpan,
	summarizeDay,
} from '../../../src/lib/log/summary';
import type { DayLog, SetLog } from '../../../src/lib/model/types';

const set = (
	weight: number | null,
	reps: number | null,
	start: string | null = null,
	end: string | null = null,
): SetLog => ({ weight, reps, start, end, note: '' });

const day: DayLog = {
	date: '2026-10-01',
	sessions: [
		{
			name: 'PUSH A',
			note: '',
			exercises: [
				{
					name: 'ケーブルYレイズ',
					sets: [
						set(10, 9, '18:31:05', '18:31:50'),
						set(12.5, 8, '18:34:10', '18:34:55'),
					],
				},
				{
					name: 'ディップス',
					sets: [set(null, 8, '18:40:00', '19:18:10')],
				},
			],
		},
		{
			name: null,
			note: '',
			exercises: [
				{
					name: 'ランニング',
					sets: [set(null, null, '20:00:00', '20:20:00')],
				},
			],
		},
		{ name: 'LEGS A', note: '', exercises: [] },
	],
};

describe('summarizeDay', () => {
	it('セット数・ボリューム・パッケージ・種目・時間を集計する', () => {
		expect(summarizeDay(day)).toEqual({
			packages: ['PUSH A', 'LEGS A'],
			exercises: ['ケーブルYレイズ', 'ディップス', 'ランニング'],
			sets: 4,
			volumeKg: 190, // 10×9 + 12.5×8
			durationMin: 67, // PUSH A 18:31:05–19:18:10（47 分）+ その他 20 分
		});
	});

	it('セッションの時間は最初の開始〜最後の終了', () => {
		expect(sessionSpan(day.sessions[0]!)).toEqual({
			start: '18:31:05',
			end: '19:18:10',
		});
		expect(sessionSpan(day.sessions[2]!)).toBeNull();
	});
});

describe('applySummaryToFrontmatter', () => {
	it('集計キーだけを上書きし、他のキーとタグを保持する', () => {
		const fm: Record<string, unknown> = {
			tags: ['gym'],
			mood: 'good',
			sets: 99,
		};
		applySummaryToFrontmatter(fm, day);
		expect(fm).toEqual({
			tags: ['gym', 'fitness-log'],
			mood: 'good',
			date: '2026-10-01',
			packages: ['PUSH A', 'LEGS A'],
			exercises: ['ケーブルYレイズ', 'ディップス', 'ランニング'],
			sets: 4,
			volume_kg: 190,
			duration_min: 67,
		});
	});

	it('タグが文字列でも配列にして足し、既にあれば重複させない', () => {
		const fm: Record<string, unknown> = { tags: 'gym, diary' };
		applySummaryToFrontmatter(fm, day);
		expect(fm.tags).toEqual(['gym', 'diary', 'fitness-log']);
		applySummaryToFrontmatter(fm, day);
		expect(fm.tags).toEqual(['gym', 'diary', 'fitness-log']);
		const withHash: Record<string, unknown> = { tags: ['#fitness-log'] };
		applySummaryToFrontmatter(withHash, day);
		expect(withHash.tags).toEqual(['#fitness-log']);
	});
});

describe('日付をまたいだセッション', () => {
	it('時間は 11 分（1438 分にならない）', () => {
		const night: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'A',
					note: '',
					exercises: [
						{
							name: 'X',
							sets: [
								set(10, 8, '23:50:00', '23:51:00'),
								set(10, 8, '23:59:00', '00:01:00'),
							],
						},
					],
				},
			],
		};
		expect(sessionSpan(night.sessions[0]!)).toEqual({
			start: '23:50:00',
			end: '00:01:00',
		});
		expect(summarizeDay(night).durationMin).toBe(11);
	});
});
