// 開発用: dev-vault にダミーの日ノート（PPL を回した記録）を作る。
// 推移チャートの見た目と、履歴索引の性能（実装計画 §11: 300 日分で 1 秒未満）の確認に使う。
//
//   npm run vault:dummy                    # 直近 300 日のうち約 6 割の日に記録（dev-vault/Fitness/ログ）
//   npm run vault:dummy -- --days 60 --end 2026-09-30 --folder Fitness/ログ
//
// - 書き込み先は dev-vault の中だけ（本番 Vault は対象外。パスを検査して拒否する）
// - 既にあるノートは上書きしない
// - Markdown はプラグイン本体と同じコード（src/lib）で生成する（esbuild でその場で束ねる）
import { build } from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const days = Number(args.days ?? 300);
const folder = args.folder ?? 'Fitness/ログ';
const vault = path.resolve('dev-vault');
const target = path.resolve(vault, folder);
if (!target.startsWith(vault + path.sep)) {
	console.error(`dev-vault の外には書き込みません: ${target}`);
	process.exit(1);
}

const bundled = await build({
	stdin: {
		contents: `
			export { formatBlock } from './src/lib/log/markdown';
			export { applySummaryToFrontmatter } from './src/lib/log/summary';
			export { PROGRAM_TEMPLATES, createDefaultExercises } from './src/lib/model/defaults';
			export { createResolver } from './src/lib/model/resolve';
			export { parseRepRange } from './src/lib/rep-range';
			export { addDays, todayString, secondsToTime } from './src/lib/time/date';
		`,
		resolveDir: process.cwd(),
		loader: 'ts',
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	logLevel: 'error',
});
const lib = await import(
	`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

// 再現できる乱数（同じ引数なら同じノート）
let seed = 20261001;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (min, max) => min + Math.floor(random() * (max - min + 1));

const exercises = lib.createDefaultExercises(new Date().toISOString());
const resolver = lib.createResolver(exercises);
const program = lib.PROGRAM_TEMPLATES.find((p) => p.id === 'ppl');
const end = args.end ?? lib.todayString();
const baseWeight = new Map();

let written = 0;
let skipped = 0;
let rotation = 0;
mkdirSync(target, { recursive: true });
for (let i = days - 1; i >= 0; i--) {
	const date = lib.addDays(end, -i);
	if (random() < 0.4) continue; // 休養日
	const file = path.join(target, `${date}.md`);
	if (existsSync(file)) {
		skipped++;
		continue;
	}
	const session = program.sessions[rotation++ % program.sessions.length];
	let clock = 18 * 3600 + pick(0, 90) * 60;
	const logged = [];
	for (const [rawName, setsSpec, repsSpec] of session.rows) {
		const exercise = resolver.resolve(rawName);
		if (!exercise) continue;
		const range = lib.parseRepRange(repsSpec);
		const [lo, hi] = range && range.kind === 'range' ? [range.min, range.max] : [6, 12];
		// 6 週ごとに +2.5 kg、たまに 1 段階下げる（ディロード）
		const blocks = Math.floor((days - i) / 42);
		if (!baseWeight.has(exercise.id)) baseWeight.set(exercise.id, 5 + pick(0, 7) * 5);
		const deload = random() < 0.08 ? 2.5 : 0;
		const weight = Math.max(2.5, baseWeight.get(exercise.id) + blocks * 2.5 - deload);
		const sets = [];
		const count = Math.max(1, Number(setsSpec.split('-').pop()));
		for (let s = 0; s < count; s++) {
			const start = clock;
			clock += pick(30, 60);
			sets.push({
				weight: exercise.recordType === 'weight-reps' ? weight : null,
				reps: Math.max(1, pick(lo, hi) - s),
				start: lib.secondsToTime(start),
				end: lib.secondsToTime(clock),
				note: '',
			});
			clock += pick(90, 210);
		}
		logged.push({ name: exercise.name, sets });
	}
	const day = { date, sessions: [{ name: session.name, note: '', exercises: logged }] };
	const frontmatter = {};
	lib.applySummaryToFrontmatter(frontmatter, day);
	writeFileSync(file, `---\n${YAML.stringify(frontmatter)}---\n${lib.formatBlock(day)}\n`);
	written++;
}
console.log(`${path.relative(process.cwd(), target)}: ${written} 件作成（既存 ${skipped} 件はそのまま）`);
