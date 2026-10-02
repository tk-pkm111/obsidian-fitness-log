import { describe, expect, it } from 'vitest';
import {
	BLOCK_END,
	BLOCK_START,
	formatBlock,
	locateBlock,
	parseBlockContent,
	parseDayNote,
	replaceBlock,
	splitTableRow,
} from '../../../src/lib/log/markdown';
import type { DayLog } from '../../../src/lib/model/types';

/** 実装計画 §4.2 の例（その他の見出し直後に空行が無い形も読めること） */
const PLAN_EXAMPLE = `---
tags:
  - fitness-log
date: 2026-10-01
sets: 4
---
%% fitness-log:start %%
## PUSH A
- 時間: 18:30 – 19:18
- コメント: 調子よし

### ケーブルYレイズ
| セット | 重量 (kg) | 回数 | 開始 | 終了 | コメント |
| ---: | ---: | ---: | --- | --- | --- |
| 1 | 10 | 9 | 18:31:05 | 18:31:50 | |
| 2 | 10 | 8 | 18:34:10 | 18:34:55 | 右肩注意 |

### ディップス
| セット | 重量 (kg) | 回数 | 開始 | 終了 | コメント |
| ---: | ---: | ---: | --- | --- | --- |
| 1 | - | 8 | 18:40:00 | 18:40:40 | |

## その他
### ランニング
| セット | 重量 (kg) | 回数 | 開始 | 終了 | コメント |
| ---: | ---: | ---: | --- | --- | --- |
| 1 | - | - | 19:20:00 | 19:40:00 | |
%% fitness-log:end %%

## 今日のメモ
（ブロックの外はユーザーが自由に書ける。プラグインは触らない）
`;

const EXAMPLE_DAY: DayLog = {
	date: '2026-10-01',
	sessions: [
		{
			name: 'PUSH A',
			note: '調子よし',
			start: '18:30:00',
			end: '19:18:00',
			exercises: [
				{
					name: 'ケーブルYレイズ',
					sets: [
						{
							weight: 10,
							reps: 9,
							start: '18:31:05',
							end: '18:31:50',
							note: '',
						},
						{
							weight: 10,
							reps: 8,
							start: '18:34:10',
							end: '18:34:55',
							note: '右肩注意',
						},
					],
				},
				{
					name: 'ディップス',
					sets: [
						{
							weight: null,
							reps: 8,
							start: '18:40:00',
							end: '18:40:40',
							note: '',
						},
					],
				},
			],
		},
		{
			name: null,
			note: '',
			exercises: [
				{
					name: 'ランニング',
					sets: [
						{
							weight: null,
							reps: null,
							start: '19:20:00',
							end: '19:40:00',
							note: '',
						},
					],
				},
			],
		},
	],
};

describe('parseDayNote', () => {
	it('計画書の例を DayLog に読める（- は null、その他は name: null）', () => {
		const result = parseDayNote(PLAN_EXAMPLE, '2026-10-01');
		expect(result).toEqual({ ok: true, day: EXAMPLE_DAY });
	});

	it('ブロックが無いノートは空の日', () => {
		expect(parseDayNote('# メモだけ\n', '2026-10-01')).toEqual({
			ok: true,
			day: { date: '2026-10-01', sessions: [] },
		});
	});

	it('時刻は HH:mm:ss に揃え、全角数字・小数カンマ・単位付きも読む', () => {
		const inner = [
			'## PUSH A',
			'### ベンチ',
			'| セット | 重量 (kg) | 回数 | 開始 | 終了 | メモ |',
			'| --- | --- | --- | --- | --- | --- |',
			'| 1 | １２,５ | 8回 | 7:05 | 7:06 | |',
			'| 2 | 60kg | 5 | | | |',
		].join('\n');
		const result = parseBlockContent(inner, '2026-10-01');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.day.sessions[0]?.exercises[0]?.sets).toEqual([
			{
				weight: 12.5,
				reps: 8,
				start: '07:05:00',
				end: '07:06:00',
				note: '',
			},
			{ weight: 60, reps: 5, start: null, end: null, note: '' },
		]);
	});

	it('列の順番が入れ替わっていても見出しで読む', () => {
		const inner = [
			'## A',
			'### X',
			'| セット | 回数 | 重量 (kg) | メモ |',
			'| --- | --- | --- | --- |',
			'| 1 | 8 | 50 | よし |',
		].join('\n');
		const result = parseBlockContent(inner, '2026-10-01');
		expect(
			result.ok && result.day.sessions[0]?.exercises[0]?.sets[0],
		).toEqual({
			weight: 50,
			reps: 8,
			start: null,
			end: null,
			note: 'よし',
		});
	});

	it('メモ中のエスケープされた | はセルを分けない', () => {
		expect(splitTableRow('| 1 | a \\| b | c |')).toEqual([
			'1',
			'a | b',
			'c',
		]);
		expect(splitTableRow('| 1 | 2')).toEqual(['1', '2']);
		expect(splitTableRow('not a row')).toBeNull();
	});

	describe('壊れたブロックはエラーにする（書き込みで消さない）', () => {
		const cases: Array<[string, string]> = [
			[
				'数値でない重量',
				'## A\n### X\n| セット | 重量 (kg) | 回数 |\n| --- | --- | --- |\n| 1 | 重い | 8 |',
			],
			[
				'読めない時刻',
				'## A\n### X\n| セット | 重量 (kg) | 回数 | 開始 |\n| --- | --- | --- | --- |\n| 1 | 10 | 8 | 25:00 |',
			],
			[
				'区切り行が無い',
				'## A\n### X\n| セット | 重量 (kg) | 回数 |\n| 1 | 10 | 8 |',
			],
			[
				'必要な列が無い',
				'## A\n### X\n| セット | 回数 |\n| --- | --- |\n| 1 | 8 |',
			],
			[
				'見出しの前の表',
				'## A\n| セット | 重量 (kg) | 回数 |\n| --- | --- | --- |',
			],
			['セッションの前の種目', '### X'],
			['知らない行', '## A\n自由に書いた文章'],
			['種目の下の箇条書き', '## A\n### X\n- メモ: ここには書けない'],
		];
		for (const [label, inner] of cases) {
			it(label, () => {
				const result = parseBlockContent(inner, '2026-10-01');
				expect(result.ok, label).toBe(false);
			});
		}

		it('目印が 2 つずつある', () => {
			const text = `${BLOCK_START}\n${BLOCK_END}\n${BLOCK_START}\n${BLOCK_END}\n`;
			expect(locateBlock(text).kind).toBe('broken');
			expect(parseDayNote(text, '2026-10-01').ok).toBe(false);
		});

		it('終了の目印だけがある', () => {
			expect(locateBlock(`メモ\n${BLOCK_END}\n`).kind).toBe('broken');
		});
	});
});

describe('formatBlock', () => {
	it('生成 → 解析で元に戻る', () => {
		const block = formatBlock(EXAMPLE_DAY);
		const result = parseDayNote(block, EXAMPLE_DAY.date);
		expect(result).toEqual({ ok: true, day: EXAMPLE_DAY });
	});

	it('生成結果は決定的（解析 → 生成を繰り返しても変わらない）', () => {
		const once = formatBlock(EXAMPLE_DAY);
		const parsed = parseDayNote(once, EXAMPLE_DAY.date);
		if (!parsed.ok) throw new Error(parsed.error);
		expect(formatBlock(parsed.day)).toBe(once);
	});

	it('時間はセットから計算し、空のメモ欄は "| |" で閉じる', () => {
		const block = formatBlock(EXAMPLE_DAY);
		expect(block).toContain('- 時間: 18:30:00 – 19:18:00');
		expect(block).toContain('| 1 | 10 | 9 | 18:31:05 | 18:31:50 | |');
		expect(block).toContain('| 1 | - | 8 | 18:40:00 | 18:40:40 | |');
		expect(block).toContain('## その他');
	});

	it('メモの | と改行をエスケープして往復できる', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'A',
					note: '一行目\n二行目',
					exercises: [
						{
							name: 'X',
							sets: [
								{
									weight: 61.23496,
									reps: 8,
									start: null,
									end: null,
									note: 'a | b',
								},
							],
						},
					],
				},
			],
		};
		const block = formatBlock(day);
		expect(block).toContain('| 1 | 61.235 | 8 | - | - | a \\| b |');
		const parsed = parseDayNote(block, day.date);
		expect(parsed.ok && parsed.day.sessions[0]?.note).toBe('一行目 二行目');
		expect(
			parsed.ok && parsed.day.sessions[0]?.exercises[0]?.sets[0]?.note,
		).toBe('a | b');
	});

	it('種目の無いセッション（予定だけ追加した日）も往復できる', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [{ name: 'LEGS A', note: '', exercises: [] }],
		};
		expect(formatBlock(day)).toBe(
			`${BLOCK_START}\n## LEGS A\n${BLOCK_END}`,
		);
		expect(parseDayNote(formatBlock(day), day.date)).toEqual({
			ok: true,
			day,
		});
	});
});

describe('replaceBlock', () => {
	it('ブロックの外側（frontmatter・ユーザーのメモ）を保持する', () => {
		const updated = replaceBlock(PLAN_EXAMPLE, {
			date: '2026-10-01',
			sessions: [{ name: 'PUSH A', note: '', exercises: [] }],
		});
		expect(updated).not.toBeNull();
		if (updated === null) return;
		expect(updated.startsWith('---\ntags:\n  - fitness-log\n')).toBe(true);
		expect(updated).toContain(
			`${BLOCK_START}\n## PUSH A\n${BLOCK_END}\n\n## 今日のメモ\n（ブロックの外はユーザーが自由に書ける。プラグインは触らない）\n`,
		);
		expect(updated).not.toContain('ケーブルYレイズ');
	});

	it('ブロックが無ければ末尾に足す', () => {
		const day: DayLog = { date: '2026-10-01', sessions: [] };
		expect(replaceBlock('', day)).toBe(`${BLOCK_START}\n${BLOCK_END}\n`);
		expect(replaceBlock('# 自分のメモ\n', day)).toBe(
			`# 自分のメモ\n\n${BLOCK_START}\n${BLOCK_END}\n`,
		);
		expect(replaceBlock('# 自分のメモ', day)).toBe(
			`# 自分のメモ\n\n${BLOCK_START}\n${BLOCK_END}\n`,
		);
	});

	it('目印が壊れていれば null（書き込まない）', () => {
		expect(
			replaceBlock(`${BLOCK_START}\n${BLOCK_START}\n${BLOCK_END}`, {
				date: '2026-10-01',
				sessions: [],
			}),
		).toBeNull();
	});

	it('CRLF のノートでも目印を見つける', () => {
		const text = `前\r\n${BLOCK_START}\r\n## A\r\n${BLOCK_END}\r\n後\r\n`;
		const parsed = parseDayNote(text, '2026-10-01');
		expect(parsed.ok && parsed.day.sessions.map((s) => s.name)).toEqual([
			'A',
		]);
		const updated = replaceBlock(text, {
			date: '2026-10-01',
			sessions: [],
		});
		expect(updated).toBe(`前\r\n${BLOCK_START}\n${BLOCK_END}\r\n後\r\n`);
	});
});

describe('レビューで見つかった不具合の再発防止', () => {
	const roundTrip = (day: DayLog): DayLog => {
		const parsed = parseDayNote(formatBlock(day), day.date);
		if (!parsed.ok) throw new Error(parsed.error);
		return parsed.day;
	};

	it('セッションのメモの | は書くたびに増えない', () => {
		let day: DayLog = {
			date: '2026-10-01',
			sessions: [{ name: 'A', note: 'a | b', exercises: [] }],
		};
		for (let i = 0; i < 3; i++) day = roundTrip(day);
		expect(day.sessions[0]?.note).toBe('a | b');
	});

	it('表に知らない列があれば書き込まない（消えてしまうため）', () => {
		const inner =
			'## A\n### X\n| セット | 重量 (kg) | 回数 | RPE |\n| --- | --- | --- | --- |\n| 1 | 10 | 8 | 9 |';
		const result = parseBlockContent(inner, '2026-10-01');
		expect(result.ok).toBe(false);
		expect(!result.ok && result.error).toContain('RPE');
	});

	it('メモに | をそのまま書いてセルが増えた行は書き込まない', () => {
		const inner =
			'## A\n### X\n| セット | 重量 (kg) | 回数 | 開始 | 終了 | メモ |\n| --- | --- | --- | --- | --- | --- |\n| 1 | 10 | 8 | - | - | 右肩 | 注意 |';
		expect(parseBlockContent(inner, '2026-10-01').ok).toBe(false);
	});

	it('末尾の空のセルを省いた行は読める', () => {
		const inner =
			'## A\n### X\n| セット | 重量 (kg) | 回数 | 開始 | 終了 | メモ |\n| --- | --- | --- | --- | --- | --- |\n| 1 | 10 | 8 |';
		const result = parseBlockContent(inner, '2026-10-01');
		expect(
			result.ok && result.day.sessions[0]?.exercises[0]?.sets[0],
		).toMatchObject({ weight: 10, reps: 8, note: '' });
	});

	it('メモの行が 2 つあれば両方残す', () => {
		const result = parseBlockContent(
			'## A\n- メモ: 一つ目\n- メモ: 二つ目',
			'2026-10-01',
		);
		expect(result.ok && result.day.sessions[0]?.note).toBe('一つ目 二つ目');
	});

	it('パッケージの「時間」は筋トレの開始・終了として読み、読めない手書きは残す', () => {
		const explicit = parseBlockContent(
			'## A\n- 時間: 18:30 – 19:00',
			'2026-10-01',
		);
		expect(explicit.ok && explicit.day.sessions[0]).toMatchObject({
			start: '18:30:00',
			end: '19:00:00',
		});
		const inProgress = parseBlockContent(
			'## A\n- 時間: 18:30:05 –',
			'2026-10-01',
		);
		if (!inProgress.ok) throw new Error(inProgress.error);
		expect(inProgress.day.sessions[0]?.start).toBe('18:30:05');
		expect(inProgress.day.sessions[0]).not.toHaveProperty('end');
		expect(formatBlock(inProgress.day)).toContain('- 時間: 18:30:05 –\n');
		const manual = parseBlockContent(
			'## A\n- 時間: 朝のうち',
			'2026-10-01',
		);
		if (!manual.ok) throw new Error(manual.error);
		expect(manual.day.sessions[0]?.time).toBe('朝のうち');
		expect(formatBlock(manual.day)).toContain('- 時間: 朝のうち');
	});

	it('「その他」の時間はセットから計算し直す（開始・終了を持たない）', () => {
		const other = parseDayNote(PLAN_EXAMPLE, '2026-10-01');
		expect(other.ok && other.day.sessions[1]).not.toHaveProperty('start');
	});

	it('日付をまたいだセッションの時間（23:50 – 00:01）', () => {
		const day: DayLog = {
			date: '2026-10-01',
			sessions: [
				{
					name: 'A',
					note: '',
					exercises: [
						{
							name: 'X',
							sets: [
								{
									weight: 10,
									reps: 8,
									start: '23:50:00',
									end: '23:51:00',
									note: '',
								},
								{
									weight: 10,
									reps: 8,
									start: '23:59:00',
									end: '00:01:00',
									note: '',
								},
							],
						},
					],
				},
			],
		};
		expect(formatBlock(day)).toContain('- 時間: 23:50 – 00:01');
	});
});

describe('やった順の記録（同じ種目を 2 回に分けた日）', () => {
	const row = (reps: number, end: string) => ({
		weight: 10,
		reps,
		start: end,
		end,
		note: '',
	});
	const day: DayLog = {
		date: '2026-10-01',
		sessions: [
			{
				name: 'PUSH A',
				note: '',
				start: '18:30:00',
				end: '19:00:00',
				exercises: [
					{
						name: 'マシンインクラインプレス',
						sets: [row(9, '18:31:00')],
					},
					{ name: '45°レッグプレス', sets: [row(12, '18:40:00')] },
					{
						name: 'マシンインクラインプレス',
						sets: [row(8, '18:45:00'), row(7, '18:50:00')],
					},
				],
			},
		],
	};

	it('後の欄のセット番号は前の欄の続き（2, 3）で、読み戻すと欄は分かれたまま', () => {
		const block = formatBlock(day);
		const second = block.slice(
			block.lastIndexOf('### マシンインクラインプレス'),
		);
		expect(second).toContain('| 2 | 10 | 8 |');
		expect(second).toContain('| 3 | 10 | 7 |');
		const parsed = parseDayNote(block, '2026-10-01');
		expect(parsed.ok && parsed.day).toEqual(day);
	});
});

describe('以前の版の書式（「メモ」）', () => {
	const LEGACY = [
		BLOCK_START,
		'## PUSH A',
		'- 時間: 18:30:00 – 19:00:00',
		'- メモ: 調子よし',
		'',
		'### ケーブルYレイズ',
		'| セット | 重量 (kg) | 回数 | 開始 | 終了 | メモ |',
		'| ---: | ---: | ---: | --- | --- | --- |',
		'| 1 | 10 | 9 | 18:31:05 | 18:31:50 | 右肩注意 |',
		BLOCK_END,
	].join('\n');

	it('「メモ」の列・箇条書きも読み、書き直すと「コメント」になる', () => {
		const parsed = parseDayNote(LEGACY, '2026-10-01');
		if (!parsed.ok) throw new Error(parsed.error);
		const session = parsed.day.sessions[0];
		expect(session?.note).toBe('調子よし');
		expect(session?.exercises[0]?.sets[0]?.note).toBe('右肩注意');
		const block = formatBlock(parsed.day);
		expect(block).toContain('- コメント: 調子よし');
		expect(block).toContain(
			'| セット | 重量 (kg) | 回数 | 開始 | 終了 | コメント |',
		);
		expect(block).toContain(
			'| 1 | 10 | 9 | 18:31:05 | 18:31:50 | 右肩注意 |',
		);
		expect(block).not.toContain('メモ');
	});
});
