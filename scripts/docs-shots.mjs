// 使い方ドキュメント（docs/guide）の画像を撮り直す。
//
//   npm run docs:shots
//
// - 一時フォルダに撮影用の vault を作る（dev-vault の .obsidian だけを写し、ノートは作りもの: 最初の設定の例・
//   ダミーの記録・ダミーの体組成）。個人の記録は写らない
// - 隔離した Obsidian（scripts/e2e-obsidian.mjs。専用プロファイル）をスマホの幅（420 × 900・emulateMobile・ダーク）で開き、
//   画面を順に操作して docs/guide/images/*.png に保存する
// - 先に npm run build が要らないよう、撮影用の vault にビルドする。終わったら隔離した Obsidian を閉じる
// - 画面の文言・ボタンを変えたら、下の場面の操作も直す
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VAULT = path.join(os.tmpdir(), 'fitness-log-docs-vault');
const STAGING = `${VAULT}-staging`;
const IMAGES = path.resolve('docs/guide/images');
const env = { ...process.env, E2E_VAULT: VAULT };

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date();
const yesterday = new Date(today.getTime() - 86_400_000);

function sh(cmd, args, extra = {}) {
	return execFileSync(cmd, args, { encoding: 'utf8', env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'inherit'] });
}
function e2e(...args) {
	return sh('node', ['scripts/e2e-obsidian.mjs', ...args]);
}
/** 画面で JS を実行する（e2e の helpers: sleep・click・btn・viewText・modalText） */
function run(code) {
	const out = e2e('eval', `${HELPERS}\n${code}`);
	if (out.includes('"error"')) throw new Error(`撮影の操作に失敗: ${out}`);
	return out;
}
function shot(name) {
	// 通知（「今日もお疲れ様でした」など）が前の場面から残っていれば消してから撮る
	e2e('eval', `document.querySelectorAll('.notice').forEach((n) => n.remove()); return 1`);
	e2e('shot', path.join(IMAGES, `${name}.png`));
	console.log(`  ${name}.png`);
}
const pause = (ms) => execFileSync('sleep', [String(ms / 1000)]);

const HELPERS = `
	const s = () => app.plugins.plugins['fitness-log'].services;
	const top = () => { const b = document.querySelector('.fitness-log-body'); if (b) b.scrollTop = 0; };
	const closeModals = async () => { for (let i = 0; i < 4; i++) { const c = document.querySelector('.modal-container'); if (!c) break; c.querySelector('.modal-bg')?.click(); await sleep(300); } };
	const nav = async (label) => { await closeModals(); document.querySelector('.fitness-log-menu-button').click(); await sleep(400); [...document.querySelectorAll('.fitness-log-drawer-item')].find((b) => b.textContent === label).click(); await sleep(1000); top(); };
	const leaf = (text) => [...document.querySelectorAll('.fitness-log-view *')].find((e) => e.children.length === 0 && e.textContent.trim() === text);
	const ready = async () => { for (let i = 0; i < 60 && !(app.workspace.layoutReady && app.plugins.plugins['fitness-log']); i++) await sleep(250); };
`;

// ---------------------------------------------------------------------------
// 撮影用の vault

console.log('撮影用の vault を作ります');
try {
	e2e('quit');
} catch {
	// 動いていなければよい
}
rmSync(VAULT, { recursive: true, force: true });
rmSync(STAGING, { recursive: true, force: true });
mkdirSync(path.join(VAULT, '.obsidian/plugins/fitness-log'), { recursive: true });
for (const f of readdirSync('dev-vault/.obsidian'))
	if (f.endsWith('.json') && !/^(workspace|graph|community-plugins)/.test(f))
		cpSync(path.join('dev-vault/.obsidian', f), path.join(VAULT, '.obsidian', f));
writeFileSync(path.join(VAULT, '.obsidian/community-plugins.json'), '["fitness-log"]');
sh('npm', ['run', 'build'], { OBSIDIAN_PLUGIN_DIR: path.join(VAULT, '.obsidian/plugins/fitness-log') });
// ダミーのノートは最初の設定を撮ってから入れる（最初の設定を「初めての人」の見た目で撮るため）
sh('node', ['scripts/generate-dummy-logs.mjs', '--vault', STAGING, '--folder', 'Fitness/log', '--days', '120', '--end', ymd(yesterday)]);
sh('node', ['scripts/generate-dummy-logs.mjs', '--body', '--vault', STAGING, '--end', ymd(today)]);
mkdirSync(IMAGES, { recursive: true });

// ---------------------------------------------------------------------------
// 撮影

console.log('隔離した Obsidian で撮ります');
e2e('launch');
pause(4000);
run(`await ready(); window.require('@electron/remote').getCurrentWindow().setSize(420, 900); app.emulateMobile(true); return 1`);
pause(5000);
run(`await ready(); try { await click('作成者を信頼しプラグインを有効化'); } catch (e) {} await sleep(2500); app.changeTheme('obsidian'); await sleep(500); return 1`);

// はじめに
shot('setup');
run(`await click('はじめる'); await sleep(4000); return 1`);
cpSync(path.join(STAGING, 'Fitness'), path.join(VAULT, 'Fitness'), { recursive: true });
pause(4000);

// 今日のパッケージ: 今日の曜日が LEGS A になるようにルーチンを決める（場面の種目は LEGS A のもの）
run(`
	await s().index.rebuild?.(); await sleep(1000);
	const wd = new Date().getDay(); const rest = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== wd);
	const id = (n) => s().store.current.packages.find((p) => p.name === n).id;
	const rule = (days) => ({ type: 'weekly', weekdays: days, intervalWeeks: 1 });
	await s().store.update((d) => {
		d.routines.push({ id: 'rt_docs0001', packageId: id('LEGS A'), rule: rule([wd, rest[2], rest[5]]), startDate: '2026-01-01', enabled: true, skipDates: [] });
		d.routines.push({ id: 'rt_docs0002', packageId: id('PUSH A'), rule: rule([rest[0], rest[3]]), startDate: '2026-01-01', enabled: true, skipDates: [] });
		d.routines.push({ id: 'rt_docs0003', packageId: id('PULL A'), rule: rule([rest[1], rest[4]]), startDate: '2026-01-01', enabled: true, skipDates: [] });
	});
	await sleep(800); app.commands.executeCommandById('fitness-log:open-today'); await sleep(1500); top(); return 1`);
shot('today-planned');
run(`document.querySelector('.fitness-log-menu-button').click(); await sleep(600); return 1`);
shot('menu');
run(`document.querySelector('.fitness-log-drawer-backdrop').click(); await sleep(300); return 1`);

// 筋トレを記録する
run(`await click('筋トレを開始'); await sleep(1200); [...document.querySelectorAll('.fitness-log-view button')].filter((b) => b.getAttribute('aria-label') === '開始')[1].click(); await sleep(1000); return 1`);
shot('prompt-weight');
run(`const m = [...document.querySelectorAll('.modal-container')].pop(); [...m.querySelectorAll('button')].find((b) => b.innerText.trim() === '開始').click(); await sleep(4000); top(); return 1`);
shot('today-set-running');
run(`[...document.querySelectorAll('.fitness-log-view button')].find((b) => b.getAttribute('aria-label') === '終了').click(); await sleep(1000); return 1`);
shot('prompt-reps');
run(`
	const m = [...document.querySelectorAll('.modal-container')].pop();
	const quick = [...m.querySelectorAll('button')].filter((b) => /^\\d+$/.test(b.innerText.trim())); quick[Math.min(2, quick.length - 1)].click(); await sleep(1500);
	const date = window.moment().format('YYYY-MM-DD');
	const pk = s().store.current.packages.find((p) => p.name === 'LEGS A');
	const ex = (n) => s().store.current.exercises.find((e) => e.name === n).id;
	await s().controller.startSet({ date, packageId: pk.id, exerciseId: ex('シーテッドカーフレイズ'), weight: 10 }); await sleep(1500); await s().controller.finishSet(8); await sleep(1200);
	await s().controller.startSet({ date, packageId: pk.id, exerciseId: ex('ハンギングレッグレイズ'), weight: null }); await sleep(1500); await s().controller.finishSet(12);
	await sleep(6000); top(); return 1`);
shot('today-workout');
run(`await click('筋トレを終了'); await sleep(1200); top(); return 1`);
shot('today-finished');

// パッケージ
run(`await nav('パッケージ'); return 1`);
shot('packages');
run(`leaf('PUSH A')?.click(); await sleep(1000); top(); return 1`);
shot('package-edit');
run(`const b = document.querySelector('.fitness-log-view .lucide-sliders-horizontal')?.closest('button'); b.click(); await sleep(800); b.scrollIntoView({ block: 'start' }); document.querySelector('.fitness-log-body').scrollTop -= 60; return 1`);
shot('package-targets');
run(`await nav('ルーチン'); return 1`);
shot('routines');

// 種目
run(`await nav('種目'); return 1`);
shot('exercises');
run(`leaf('ケーブルチェストフライ').closest('.fitness-log-list-body').click(); await sleep(1000); return 1`);
shot('exercise-edit');

// ログ
run(`await nav('ログ'); [...document.querySelectorAll('.fitness-log-view button')].find((b) => b.innerText.trim() === 'PUSH A').click(); await sleep(1000); top(); return 1`);
shot('log-package');
run(`leaf('マシンインクラインプレス').closest('.fitness-log-list-body, button').click(); await sleep(1200); top(); return 1`);
shot('log-exercise');

// 体組成
run(`
	const l = s().lists; await l.setBodyEnabled(true);
	for (const [n, u] of [['内臓脂肪レベル', ''], ['BMI', ''], ['基礎代謝量', 'kcal'], ['体内年齢', '才'], ['推定骨量', 'kg'], ['体水分率', '%']]) await l.addBodyItem(n, u);
	await l.setBodyGoal('体重', 68, '2026-07-02'); await l.setBodyGoal('体脂肪率', 17, '2026-08-27'); await l.setBodyGoal('筋肉量', 52.5, '2026-07-02');
	await sleep(800); await nav('体組成'); await sleep(800); document.querySelector('.fitness-log-body-disc').click(); await sleep(900); top(); return 1`);
shot('body-whole');
run(`document.querySelectorAll('.fitness-log-seg button')[1].click(); await sleep(500); document.querySelector('.fitness-log-body-part-left-leg').click(); await sleep(800); top(); return 1`);
shot('body-parts');
run(`document.querySelectorAll('.fitness-log-seg button')[2].click(); await sleep(700); top(); return 1`);
shot('body-goals');
run(`document.querySelectorAll('.fitness-log-seg button')[0].click(); await sleep(400); document.querySelector('[aria-label="カレンダーで選ぶ"]').click(); await sleep(700); return 1`);
shot('body-calendar');
run(`await closeModals(); document.querySelector('.fitness-log-body-record').click(); await sleep(800); return 1`);
shot('body-record');

// 設定
run(`await closeModals(); app.setting.open(); app.setting.openTabById('fitness-log'); await sleep(1200); return 1`);
shot('settings');
run(`[...document.querySelectorAll('.setting-item')].find((e) => e.textContent.includes('体組成を記録する')).scrollIntoView({ block: 'center' }); await sleep(500); return 1`);
shot('settings-body');

const errors = run(`app.setting.close(); return window.__errs`);
e2e('quit');
console.log(`docs/guide/images に撮りました。Console のエラー: ${errors.trim()}`);
if (!existsSync(path.join(IMAGES, 'settings-body.png'))) process.exit(1);
