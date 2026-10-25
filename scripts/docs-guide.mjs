// 使い方ドキュメント（docs/guide）の書き出し。
//
//   npm run docs:bundle                 # docs/fitness-log-guide.md（全ページを 1 つにまとめたもの。AI エージェントに渡す用）
//   npm run docs:export -- <フォルダ>    # Obsidian Publish 用のフォルダへページと画像をコピーする
//
// - ページは Obsidian の書き方（[[ページ名]]・![[画像|幅]]）。Publish でそのまま表示できる
// - 並び順は下の PAGES。ページを足したらここにも足す
// - export は上書きするだけで、書き出し先のほかのファイルは消さない。書き出し先のフォルダは先に作っておく
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('docs/guide');
const PAGES = [
	'01 はじめに/Fitness Log とは.md',
	'01 はじめに/インストール.md',
	'01 はじめに/最初の設定.md',
	'02 今日のトレーニング/筋トレを記録する.md',
	'02 今日のトレーニング/記録を直す.md',
	'02 今日のトレーニング/単発の種目.md',
	'03 パッケージとルーチン/パッケージ.md',
	'03 パッケージとルーチン/ルーチン.md',
	'04 種目/種目.md',
	'05 ログ/ログ.md',
	'06 体組成/体組成.md',
	'06 体組成/ほかのアプリから取り込む.md',
	'07 データと設定/設定.md',
	'07 データと設定/複数の端末で使う.md',
	'07 データと設定/ノートの形式.md',
	'08 困ったとき/よくある質問.md',
];

function checkPages() {
	const missing = PAGES.filter((p) => !existsSync(path.join(ROOT, p)));
	if (missing.length > 0) throw new Error(`ページがありません: ${missing.join(', ')}`);
	const onDisk = readdirSync(ROOT, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name !== 'images')
		.flatMap((d) =>
			readdirSync(path.join(ROOT, d.name))
				.filter((f) => f.endsWith('.md'))
				.map((f) => `${d.name}/${f}`),
		);
	const unlisted = onDisk.filter((p) => !PAGES.includes(p));
	if (unlisted.length > 0) throw new Error(`PAGES に無いページ: ${unlisted.join(', ')}`);
}

/** 1 つにまとめる: 見出しを 2 段下げ、画像は名前だけ、[[リンク]] は「」に */
function bundle() {
	checkPages();
	const parts = [
		'# Fitness Log 使い方ガイド（全ページ）',
		'',
		'Obsidian のプラグイン「Fitness Log」の使い方とノートの形式のまとめ。docs/guide の各ページを `npm run docs:bundle` で 1 つにしたもの（直接は編集しない）。',
		'',
	];
	for (const page of PAGES) {
		const [chapter, file] = page.split('/');
		const title = file.replace(/\.md$/, '');
		// コードの例（```）の中は変えない
		let fenced = false;
		const body = readFileSync(path.join(ROOT, page), 'utf8')
			.split('\n')
			.map((line) => {
				if (/^```/.test(line)) {
					fenced = !fenced;
					return line;
				}
				if (fenced) return line;
				return line
					.replace(/^(#{1,4}) /, (_, hashes) => `#${hashes} `)
					.replace(/!\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, '（画像: $1）')
					.replace(/\[\[([^\]|]+)(\|([^\]]*))?\]\]/g, (_, target, __, label) => `「${label ?? target}」`);
			})
			.join('\n')
			.trim();
		parts.push(`## ${chapter.replace(/^\d+ /, '')} / ${title}`, '', body, '');
	}
	const out = path.resolve('docs/fitness-log-guide.md');
	writeFileSync(out, `${parts.join('\n').trimEnd()}\n`);
	console.log(`${path.relative(process.cwd(), out)}: ${PAGES.length} ページをまとめました`);
}

function exportTo(target) {
	checkPages();
	if (!target) throw new Error('書き出し先のフォルダを指定してください');
	const dest = path.resolve(target);
	if (!existsSync(dest)) throw new Error(`書き出し先がありません（先に作ってください）: ${dest}`);
	let pages = 0;
	for (const page of PAGES) {
		const to = path.join(dest, page);
		mkdirSync(path.dirname(to), { recursive: true });
		copyFileSync(path.join(ROOT, page), to);
		pages++;
	}
	const images = path.join(ROOT, 'images');
	mkdirSync(path.join(dest, 'images'), { recursive: true });
	let files = 0;
	for (const name of readdirSync(images)) {
		copyFileSync(path.join(images, name), path.join(dest, 'images', name));
		files++;
	}
	console.log(`${dest}: ページ ${pages} 件・画像 ${files} 件を書き出しました（Obsidian で「Publish changes」を押すと公開されます）`);
}

const [command, arg] = process.argv.slice(2);
if (command === 'bundle') bundle();
else if (command === 'export') exportTo(arg);
else {
	console.error('使い方: node scripts/docs-guide.mjs bundle | export <フォルダ>');
	process.exit(1);
}
