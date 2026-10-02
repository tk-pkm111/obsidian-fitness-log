import { describe, expect, it } from 'vitest';
import {
	addDays,
	circularRange,
	diffDays,
	elapsedSeconds,
	formatDuration,
	formatHm,
	formatMonthDay,
	formatTime,
	isDateString,
	mondayOf,
	normalizeTime,
	parseClockInput,
	parseDurationInput,
	parseTime,
	spanSeconds,
	toDateString,
	weekdayOf,
} from '../../../src/lib/time/date';

describe('日付', () => {
	it('正しい暦日だけを受け付ける', () => {
		expect(isDateString('2026-10-01')).toBe(true);
		expect(isDateString('2028-02-29')).toBe(true);
		expect(isDateString('2026-02-29')).toBe(false);
		expect(isDateString('2026-13-01')).toBe(false);
		expect(isDateString('2026-1-1')).toBe(false);
		expect(isDateString(20261001)).toBe(false);
	});

	it('月・年をまたいで加減算できる', () => {
		expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
		expect(diffDays('2026-09-28', '2026-10-01')).toBe(3);
		expect(diffDays('2026-10-01', '2026-09-28')).toBe(-3);
	});

	it('曜日と週の月曜日', () => {
		// 2026-10-01 は木曜日
		expect(weekdayOf('2026-10-01')).toBe(4);
		expect(mondayOf('2026-10-01')).toBe('2026-09-28');
		expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // 日曜は前の月曜の週
		expect(mondayOf('2026-10-05')).toBe('2026-10-05');
	});

	it('ローカル時刻の暦日と月日表示', () => {
		expect(toDateString(new Date(2026, 9, 1, 23, 59))).toBe('2026-10-01');
		expect(formatMonthDay('2026-10-01')).toBe('10/1');
	});
});

describe('時刻', () => {
	it('HH:mm:ss を読み書きする', () => {
		expect(parseTime('18:31:05')).toBe(18 * 3600 + 31 * 60 + 5);
		expect(parseTime('7:05')).toBe(7 * 3600 + 5 * 60);
		expect(parseTime('24:00')).toBeNull();
		expect(parseTime('abc')).toBeNull();
		expect(normalizeTime('7:05')).toBe('07:05:00');
		expect(formatHm('18:31:05')).toBe('18:31');
		expect(formatTime(new Date(2026, 9, 1, 9, 3, 7))).toBe('09:03:07');
	});

	it('日付をまたぐ区間は 24 時間足して数える', () => {
		expect(spanSeconds('18:31:05', '18:31:50')).toBe(45);
		expect(spanSeconds('23:59:30', '00:00:15')).toBe(45);
		expect(spanSeconds('x', '00:00:15')).toBeNull();
	});

	it('経過時間を短く表示する', () => {
		expect(formatDuration(45)).toBe('0:45');
		expect(formatDuration(723)).toBe('12:03');
		expect(formatDuration(3723)).toBe('1:02:03');
		expect(formatDuration(-5)).toBe('0:00');
	});

	it('ISO 時刻からの経過秒（未来・不正は 0）', () => {
		const now = new Date('2026-10-01T10:00:30Z');
		expect(elapsedSeconds('2026-10-01T10:00:00Z', now)).toBe(30);
		expect(elapsedSeconds('2026-10-01T10:01:00Z', now)).toBe(0);
		expect(elapsedSeconds('broken', now)).toBe(0);
	});
});

describe('circularRange', () => {
	it('最も大きく空いた間を外側にして最初と最後を決める', () => {
		const t = (s: string) => parseTime(s)!;
		expect(circularRange([t('18:00'), t('18:30'), t('19:00')])).toEqual({
			first: t('18:00'),
			last: t('19:00'),
		});
		expect(circularRange([t('23:50'), t('00:05'), t('23:59')])).toEqual({
			first: t('23:50'),
			last: t('00:05'),
		});
		expect(circularRange([t('10:00')])).toEqual({
			first: t('10:00'),
			last: t('10:00'),
		});
		expect(circularRange([])).toBeNull();
	});
});

describe('手で打った時刻・長さ', () => {
	it('時刻は : のほか . と全角も受け付ける', () => {
		expect(parseClockInput('18:30')).toBe(18 * 3600 + 30 * 60);
		expect(parseClockInput('18.30.15')).toBe(18 * 3600 + 30 * 60 + 15);
		expect(parseClockInput('１８：３０')).toBe(18 * 3600 + 30 * 60);
		expect(parseClockInput('25:00')).toBeNull();
		expect(parseClockInput('1830')).toBeNull();
	});

	it('長さは 分:秒（. も可）、時:分:秒、数字だけなら分', () => {
		expect(parseDurationInput('2:30')).toBe(150);
		expect(parseDurationInput('2.30')).toBe(150);
		expect(parseDurationInput('0:45')).toBe(45);
		expect(parseDurationInput('1:02:03')).toBe(3723);
		expect(parseDurationInput('3')).toBe(180);
		expect(parseDurationInput('2:75')).toBeNull();
		expect(parseDurationInput('abc')).toBeNull();
	});
});
