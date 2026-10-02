import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	createDefaultExercises,
	DEFAULT_EXERCISES,
	instantiateSession,
	parseRestSpec,
	parseSetsSpec,
	PROGRAM_TEMPLATES,
	uniquePackageName,
} from '../../../src/lib/model/defaults';
import { createResolver, nameKey } from '../../../src/lib/model/resolve';

const NOW = '2026-10-01T00:00:00.000Z';

/** context/notion/02_exercise-library/README.md の「種目名一覧」から種目名を読む */
function libraryNames(): string[] {
	const text = readFileSync(
		'context/notion/02_exercise-library/README.md',
		'utf8',
	);
	const section =
		text.split('## 種目名一覧（カテゴリ別）')[1]?.split('\n## ')[0] ?? '';
	return section
		.split('\n')
		.filter((line) => line.startsWith('- '))
		.map((line) =>
			line
				.slice(2)
				.replace(/（動画なし）$/, '')
				.trim(),
		);
}

describe('DEFAULT_EXERCISES', () => {
	it('Notion の種目ライブラリー 53 種目をすべて含む', () => {
		const names = libraryNames();
		expect(names).toHaveLength(53);
		const resolver = createResolver(createDefaultExercises(NOW));
		for (const name of names)
			// 種目名はファイル名用に / などを全角にしているので、照合キーで比べる
			expect(nameKey(resolver.resolve(name)?.name ?? ''), name).toBe(
				nameKey(name),
			);
	});

	it('本名・別名の正規化キーが種目間で重ならない（解決が曖昧にならない）', () => {
		const owner = new Map<string, string>();
		for (const seed of DEFAULT_EXERCISES) {
			for (const label of [seed.name, ...(seed.aliases ?? [])]) {
				const key = nameKey(label);
				const prev = owner.get(key);
				expect(
					prev === undefined || prev === seed.name,
					`${label}: ${prev} と ${seed.name}`,
				).toBe(true);
				owner.set(key, seed.name);
			}
		}
	});

	it('記録タイプ: ディップス・チンニング・ハンギングレッグレイズは回数のみ', () => {
		const reps = DEFAULT_EXERCISES.filter(
			(e) => e.recordType === 'reps',
		).map((e) => e.name);
		expect(reps.sort()).toEqual(
			[
				'ディップス',
				'ハンギングレッグレイズ',
				'ワイドグリップチンニング',
			].sort(),
		);
	});

	it('腹筋系は core', () => {
		const core = DEFAULT_EXERCISES.filter((e) => e.category === 'core').map(
			(e) => e.name,
		);
		expect(core.sort()).toEqual(
			[
				'ケーブルアブクランチ',
				'ハンギングレッグレイズ',
				'マシンアブクランチ',
			].sort(),
		);
	});
});

describe('PROGRAM_TEMPLATES', () => {
	const resolver = createResolver(createDefaultExercises(NOW));

	it('4 プログラム・計 18 セッション', () => {
		expect(
			PROGRAM_TEMPLATES.map((p) => [p.name, p.sessions.length]),
		).toEqual([
			['3 分割（プッシュ・プル・脚）', 6],
			['2 分割（上半身・下半身）', 4],
			['5 分割（プッシュ・プル・脚＋上半身・下半身）', 5],
			['全身（3 パターン）', 3],
		]);
	});

	it('テンプレートの全種目名が種目マスターで解決できる', () => {
		const unresolved: string[] = [];
		for (const program of PROGRAM_TEMPLATES)
			for (const session of program.sessions)
				for (const [name] of session.rows)
					if (!resolver.resolve(name))
						unresolved.push(
							`${program.name} / ${session.name} / ${name}`,
						);
		expect(unresolved).toEqual([]);
	});

	it('SETS・REPS・インターバルの表記が読める', () => {
		for (const program of PROGRAM_TEMPLATES)
			for (const session of program.sessions)
				for (const [name, sets, reps, rest] of session.rows) {
					expect(parseSetsSpec(sets), name).toBeGreaterThanOrEqual(1);
					expect(
						/^(\d+(-\d+)?|AMRAP)$/.test(reps),
						`${name}: ${reps}`,
					).toBe(true);
					if (rest !== '')
						expect(parseRestSpec(rest), name).toBeGreaterThan(0);
				}
	});
});

describe('表記の解釈', () => {
	it('SETS の範囲は中央値を四捨五入', () => {
		expect(parseSetsSpec('2')).toBe(2);
		expect(parseSetsSpec('1-2')).toBe(2);
		expect(parseSetsSpec('2-4')).toBe(3);
		expect(parseSetsSpec('')).toBe(1);
	});

	it('インターバル(分) は中央値の秒', () => {
		expect(parseRestSpec('2-3')).toBe(150);
		expect(parseRestSpec('3-5')).toBe(240);
		expect(parseRestSpec('1-2')).toBe(90);
		expect(parseRestSpec('2')).toBe(120);
		expect(parseRestSpec('')).toBeUndefined();
	});
});

describe('instantiateSession', () => {
	const exercises = createDefaultExercises(NOW);
	const program = PROGRAM_TEMPLATES[0]!;
	const pushA = program.sessions.find((s) => s.name === 'PUSH A')!;

	it('テンプレートからパッケージを作る（種目は id で参照・目標値を変換）', () => {
		const { pkg, createdExercises } = instantiateSession(
			pushA,
			exercises,
			[],
			NOW,
		);
		expect(createdExercises).toEqual([]);
		expect(pkg.name).toBe('PUSH A');
		expect(pkg.id).toMatch(/^pk_/);
		const byId = new Map(exercises.map((e) => [e.id, e.name]));
		expect(pkg.items.map((i) => byId.get(i.exerciseId))).toEqual([
			'ケーブルYレイズ',
			'マシンインクラインプレス',
			'スミスマシンインクラインプレス',
			'ディップス',
			'ペックフライ',
			'マシンサイドレイズ',
			'トライセップスプッシュダウン',
		]);
		expect(pkg.items[0]).toEqual({
			exerciseId: pkg.items[0]?.exerciseId,
			targetSets: 2,
			targetReps: '6-9',
			restSec: 150,
		});
		expect(pkg.items[3]?.restSec).toBeUndefined();
		expect(pkg.items[5]?.note).toBe('マシン or ダンベル');
	});

	it('解決できない種目名は新しい種目（その他）として作る', () => {
		const { pkg, createdExercises } = instantiateSession(
			{
				name: 'TEST',
				rows: [
					['未知の種目', '2', '8', '2'],
					['未知の種目', '1', '8', ''],
				],
			},
			exercises,
			[],
			NOW,
		);
		expect(createdExercises).toHaveLength(1);
		expect(createdExercises[0]).toMatchObject({
			name: '未知の種目',
			category: 'other',
			recordType: 'weight-reps',
		});
		expect(pkg.items.map((i) => i.exerciseId)).toEqual([
			createdExercises[0]?.id,
			createdExercises[0]?.id,
		]);
	});

	it('同名のパッケージがあれば番号を添える', () => {
		expect(uniquePackageName('PUSH A', ['PUSH A'])).toBe('PUSH A 2');
		expect(uniquePackageName('PUSH A', ['PUSH A', 'PUSH A 2'])).toBe(
			'PUSH A 3',
		);
		expect(uniquePackageName('PUSH A', [])).toBe('PUSH A');
	});
});
