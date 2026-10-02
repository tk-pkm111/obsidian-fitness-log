# オンボーディング動画

はじめの設定（「Fitness Log をはじめる」）の下で再生する、使い方の動画（42 秒）。`onboarding.mp4` がその動画で、プラグインは再生を押したときだけ jsDelivr 経由で読み込む（`src/ui/onboarding-video.ts`）。

映像はプラグインの画面と文言を HTML で描き直したもので、時刻 `t` から 1 コマを描く関数（`window.__render(t)`）になっている。音楽・効果音は `audio.mjs` がコードで合成する。映像と音は同じキューシート（`cues.js`、120 BPM）を読む。

| ファイル | 役割 |
|---|---|
| `index.html` | 映像。そのまま開くと再生・シークできるプレビュー（`reel.m4a` があれば音も） |
| `cues.js` | キューシート（章・操作の時刻） |
| `audio.mjs` | 音楽・効果音 → `reel.wav` |
| `render.mjs` | headless Chromium で 1 コマずつ撮って ffmpeg へ（`stills 2.5 8.0 …` で静止画だけも） |
| `render.sh` | 全部の書き出し → `master.mp4`（1080p）と `onboarding.mp4`（720p） |
| `sheet.sh` | 静止画を 3×3 に並べた確認用の 1 枚 |

## 作り直す

プラグインの画面や文言を変えたら、`index.html` の該当する場面を直して書き出す。

```bash
zsh docs/onboarding-video/render.sh   # Node 22 以上・ffmpeg・Playwright の chrome-headless-shell が要る
```

`onboarding.mp4` をコミット・push したら、`src/ui/onboarding-video.ts` の URL をそのコミットに差し替える（jsDelivr はコミット単位で固定されるので、古い版のプラグインは古い動画のまま）。
