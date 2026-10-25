// 開発用: dev-vault にダミーの日ノート（PPL を回した記録）を作る。
// 推移チャートの見た目と、履歴索引の性能（実装計画 §11: 300 日分で 1 秒未満）の確認に使う。
//
//   npm run vault:dummy                    # 直近 300 日のうち約 6 割の日に記録（dev-vault/Fitness/log）
//   npm run vault:dummy -- --days 60 --end 2026-09-30 --folder Fitness/log
//   npm run vault:dummy -- --body          # 体組成のノート（毎週 1 回・半年分。dev-vault/Fitness/body-composition）
//   npm run vault:dummy -- --body --vault <dev-vault のコピー>   # E2E 用のコピー（一時フォルダの中だけ）に作る
//
// - 書き込み先は dev-vault（か一時フォルダの中のコピー）だけ（本番 Vault は対象外。パスを検査して拒否する）
// - 既にあるノートは上書きしない
// - Markdown はプラグイン本体と同じコード（src/lib）で生成する（esbuild でその場で束ねる）
// - 体組成の値は作りもの（実際の人の記録ではない）
import { build } from 'esbuild';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const bodyMode = process.argv.includes('--body');
const days = Number(args.days ?? 300);
const folder = args.folder ?? (bodyMode ? 'Fitness/body-composition' : 'Fitness/log');
const devVault = path.resolve('dev-vault');
const vault = args.vault && args.vault !== '--body' ? path.resolve(args.vault) : devVault;
const temp = realpathSync(os.tmpdir());
const allowed = (dir) =>
	dir === devVault ||
	[temp, '/private/tmp', '/tmp'].some((root) => realpathSafe(dir).startsWith(root + path.sep));
function realpathSafe(dir) {
	try {
		return realpathSync(dir);
	} catch {
		return dir;
	}
}
const target = path.resolve(vault, folder);
if (!allowed(vault) || !target.startsWith(vault + path.sep)) {
	console.error(`dev-vault（か一時フォルダの中のコピー）の外には書き込みません: ${target}`);
	process.exit(1);
}

if (bodyMode) {
	writeBodyNotes();
	process.exit(0);
}

/** 体組成のノート: 毎週木曜（夏に 2 週・6 月に 1 週あき）の半年分。作りものの値。部位の項目も */
function writeBodyNotes() {
	let s = 7;
	const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
	const rd = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
	const lerp = (a, b, t) => a + (b - a) * t;
	const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	const end = new Date(`${args.end ?? '2026-10-22'}T12:00:00`);
	const dates = [];
	for (let k = 26; k >= 0; k--) {
		const d = new Date(end);
		d.setDate(end.getDate() - k * 7);
		const date = iso(d);
		if (!['2026-06-11', '2026-08-06', '2026-08-13'].includes(date)) dates.push(date);
	}
	const parts = {
		筋肉量: { 体幹部: [25.9, 26.9], 左腕: [2.7, 2.9], 右腕: [2.8, 2.9], 左脚: [9.2, 9.5], 右脚: [9.6, 9.9] },
		脂肪率: { 体幹部: [19, 20.4], 左腕: [12.6, 13.4], 右腕: [12.9, 13.6], 左脚: [19.5, 20.6], 右脚: [18.8, 19.8] },
		筋質点数: { 左腕: [76, 79], 右腕: [72, 74], 左脚: [60, 62], 右脚: [59, 61] },
	};
	mkdirSync(target, { recursive: true });
	let written = 0;
	dates.forEach((date, i) => {
		const t = i / (dates.length - 1);
		const file = path.join(target, `${date}.md`);
		if (existsSync(file)) return;
		const weight = rd(lerp(64, 66.8, t) + rnd() * 0.35, 1);
		const fat = rd(18 + 1.6 * Math.sin(Math.PI * t * 0.9) + rnd() * 0.25, 1);
		const fm = {
			時刻: `07:${String(5 + Math.floor((rnd() + 1) * 10)).padStart(2, '0')}`,
			体重: weight,
			体脂肪率: fat,
			筋肉量: rd(lerp(49.6, 51.2, t) + rnd() * 0.25, 1),
			内臓脂肪レベル: Math.round(lerp(6, 7.2, t) + rnd() * 0.3),
			BMI: rd(weight / (1.72 * 1.72), 1),
			基礎代謝量: Math.round(lerp(1500, 1542, t) + rnd() * 6),
			体内年齢: Math.round(lerp(24, 23, t) + rnd() * 0.4),
			推定骨量: rd(lerp(2.8, 2.9, t) + rnd() * 0.03, 1),
			体水分率: rd(lerp(55.2, 54.5, t) + rnd() * 0.2, 1),
			除脂肪量: rd(weight - (weight * fat) / 100, 1),
			SMI: rd(lerp(8.2, 8.38, t) + rnd() * 0.03, 2),
		};
		for (const [measure, byPart] of Object.entries(parts))
			for (const [part, [a, b]] of Object.entries(byPart)) {
				const decimals = measure === '筋質点数' ? 0 : 1;
				const amp = Math.max(Math.abs(b - a) * 0.2, decimals === 0 ? 0.6 : 0.04);
				fm[`${part} ${measure}`] = rd(lerp(a, b, t) + rnd() * amp, decimals);
			}
		fm['体幹部 筋肉量評価'] = '標準';
		writeFileSync(file, `---\n${YAML.stringify(fm)}---\n`);
		written++;
	});
	// 同じフォルダの一覧のノート（日付の名前ではないので、プラグインは読まない）
	const list = path.join(target, '測定の一覧.md');
	if (!existsSync(list)) writeFileSync(list, '# 測定の一覧\n\n自動取得が書く一覧のノートの例（プラグインは読まない）。\n');
	console.log(`${path.relative(process.cwd(), target)}: 体組成のノートを ${written} 件作成`);
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
