// Frame-accurate renderer: headless Chromium (CDP) → PNG frames → ffmpeg.
//   node render.mjs stills 0.5 2.3 7.1 ...      → stills/t-XX.XX.png
//   node render.mjs video out.mp4 [fps] [from] [to]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Playwright の chrome-headless-shell（npx playwright install chromium-headless-shell）。別の場所なら CHROME_SHELL で指定する
const SHELL = process.env.CHROME_SHELL ?? path.join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const PORT = 9555 + Math.floor(Math.random() * 300);

const chrome = spawn(SHELL, [
	`--remote-debugging-port=${PORT}`, '--headless', '--hide-scrollbars', '--force-device-scale-factor=1',
	'--window-size=1920,1080', '--font-render-hinting=none', '--force-color-profile=srgb',
	'--allow-file-access-from-files', '--disable-background-timer-throttling', '--user-data-dir=' + path.join(here, '.chrome'),
	'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
	for (let i = 0; i < 80; i++) {
		try {
			const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
			const page = list.find((x) => x.type === 'page');
			if (page) return page.webSocketDebuggerUrl;
		} catch {}
		await sleep(100);
	}
	throw new Error('no chrome');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (m) => {
	const msg = JSON.parse(m.data);
	if (msg.id && pending.has(msg.id)) {
		const { res, rej } = pending.get(msg.id);
		pending.delete(msg.id);
		msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
	} else if (msg.method) events.push(msg);
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file://' + path.join(here, 'index.html') + '?render=1' });
for (let i = 0; i < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); i++) await sleep(50);
await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown');
if (errs.length) { console.error('page errors:', JSON.stringify(errs.map((e) => e.params.exceptionDetails), null, 1).slice(0, 2000)); }

async function frame(t) {
	const r = await send('Runtime.evaluate', { expression: `window.__render(${t}); 1`, returnByValue: true });
	if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
	const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
	return Buffer.from(shot.data, 'base64');
}

const [mode, ...args] = process.argv.slice(2);
try {
	if (mode === 'stills') {
		mkdirSync(path.join(here, 'stills'), { recursive: true });
		for (const a of args) {
			const t = +a;
			writeFileSync(path.join(here, 'stills', `t-${t.toFixed(2)}.png`), await frame(t));
		}
		console.log('stills:', args.length);
	} else if (mode === 'video') {
		const out = args[0] ?? 'reel.mp4';
		const fps = +(args[1] ?? 60);
		const from = +(args[2] ?? 0);
		const to = +(args[3] ?? 42);
		const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
			'-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(here, out)], { stdio: ['pipe', 'inherit', 'inherit'] });
		const total = Math.round((to - from) * fps);
		const started = Date.now();
		for (let i = 0; i < total; i++) {
			const buf = await frame(from + i / fps);
			if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
			if (i % 120 === 0) console.log(`frame ${i}/${total}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
		}
		ff.stdin.end();
		await new Promise((r) => ff.on('close', r));
		console.log('done', out, ((Date.now() - started) / 1000).toFixed(0) + 's');
	}
} finally {
	ws.close();
	chrome.kill('SIGKILL');
}
