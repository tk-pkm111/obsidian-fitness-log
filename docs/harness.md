# 開発環境（ハーネス）の設計

作成日: 2026-10-01

Obsidian プラグイン「Fitness Log」を作るための開発環境を、アプリ本体の設計に入る前に整えた記録。何を・なぜ入れたか、何が未決かをここにまとめる。

## 方針

1. **公式テンプレートに乗る。** Obsidian 公式の `obsidian-sample-plugin`（2026 年版）の構成をそのまま土台にし、ツールの選択で迷わない。公式が `AGENTS.md` を同梱しているので、AI 向けの基本ルールもそれを採用。
2. **「速く直せる」より「壊さない」を優先。** 本番 Vault を触らない、公式ガイドラインを機械的に検査する、純粋ロジックはテストで守る。
3. **AI（Claude Code）が正確に動ける情報を手元に置く。** API の型定義と公式ドキュメントをローカルに置き、記憶で API を書かせない。

## 構成要素

### 1. ツールチェーン（公式テンプレート準拠）

| 役割 | 採用 | 備考 |
|---|---|---|
| 言語 | TypeScript 5.9（`strict` + `noUncheckedIndexedAccess` + 未使用検出） | `src/` → `main.js` に束ねる |
| バンドラ | esbuild 0.28 | 公式は 0.25 固定だが vitest 5 と競合するため最新系に変更 |
| API 型定義 | `obsidian` 1.13.1 | `node_modules/obsidian/obsidian.d.ts` が API の正 |
| 実行環境 | Node 22 / npm 10 | 公式は Node 18+ |
| 開発時の再読み込み | `hot-reload`（pjeby）0.3.1 | `npm run vault:setup` で dev-vault に導入 |

### 2. 品質ゲート（`npm run check`）

| 検査 | ツール | 何を守るか |
|---|---|---|
| 型 | `tsc --noEmit` | API の誤用・null 安全 |
| Lint | ESLint 9 + `eslint-plugin-obsidianmd` 0.4（41 ルール） | Obsidian のプラグイン審査で指摘される項目（モバイル非対応 API、`innerHTML`、設定見出し、コマンド名、`Vault.modify` など）、`manifest.json` の妥当性、使った API の `@since` と `minAppVersion` の整合（構築中に 1.13 専用 API の呼び出しを実際に検出した） |
| アーキテクチャ | ESLint `no-restricted-imports`（`src/lib/**`） | 純粋ロジック層を Obsidian に依存させない |
| 整形 | Prettier（タブ・シングルクォート、公式の `.editorconfig` 準拠） | 差分のノイズを減らす |
| テスト | Vitest 5 | `src/lib/` のロジックと、コマンド登録などの薄い層 |

ESLint の警告も「直す」運用にする（CLAUDE.md に明記）。

### 3. テスト戦略

- npm の `obsidian` パッケージは型定義だけで実行コードが無い。`vitest.config.ts` の alias で `tests/__mocks__/obsidian.ts` に差し替える。モックは必要な API だけを足していく方針（`Events`・`Component`・`debounce`・`TFile`/`TFolder`・`moment`・UI クラスの読み込み用スタブなど）。
- ロジックは `src/lib/` に寄せて普通の TypeScript としてテストする（日ノートの Markdown の往復、ルーチン判定、前回値の引き継ぎ、統計、初期データの整合など）。
- データ層とセッション制御は **仮想 vault**（`tests/helpers/fake-app.ts`）で往復をテストする。中身を文字列で持ち、Obsidian の仕様のうちプラグインが頼るもの（`create` は親フォルダが無いと失敗、`process` は `modify` を発火、`processFrontMatter` は YAML を読み書き）を再現する。YAML は `yaml`、`moment` は Obsidian 同梱と同じ 2.29.4 を devDependencies に置いている（プラグインには同梱されない）。
- 描画とイベントの結線は単体テストしない。代わりに下の「E2E」で実際の Obsidian を操作して確かめ、最後にユーザーが目視する。

### 4. 開発用 Vault（`dev-vault/`）

- プロジェクト直下の専用 Vault。**プロジェクトのルート自体を Vault として開かない**（`node_modules` などを Obsidian が索引してしまう）。
- `esbuild.config.mjs` の `copy-to-vault` プラグインがビルドのたびに `main.js` / `manifest.json` / `styles.css` を `dev-vault/.obsidian/plugins/fitness-log/` にコピーし、`.hotreload` マーカーを置く。hot-reload がそれを検知して再読み込みする。
- 別の Vault で試すときは `OBSIDIAN_PLUGIN_DIR` 環境変数で向き先を変える。本番 Vault（`~/Documents/Obsidian Vaults/Evergreens` など）は対象外。
- `community-plugins.json` に `hot-reload` と `fitness-log` を登録済み。初回に Obsidian が「信頼して有効化」を聞いてくる。

### 5. 参照情報（`references/`、git 管理外）

| 資料 | 場所 | 用途 |
|---|---|---|
| 公式 Developer Docs の原稿（1,321 ファイル） | `references/obsidian-developer-docs/en/` | ガイド（Plugins/）、API リファレンス（Reference/TypeScript API/）、CSS 変数（Reference/CSS variables/）、プラグイン審査ガイドライン、自己レビューチェックリスト |
| 公式テンプレート | `references/obsidian-sample-plugin/`（`npm run references:fetch`） | 設定ファイルの最新形との差分確認 |
| API 型定義 | `node_modules/obsidian/obsidian.d.ts` | `@since` / `@deprecated` 付きの正確な API |
| ドメイン知識 | `context/notion/` | 筋トレメニュー・種目・計測項目（Notion 書き出し） |

### 6. Claude Code 向けの設定

| ファイル | 役割 |
|---|---|
| `CLAUDE.md` | 毎セッション読まれる短い運用ルール。`@AGENTS.md` で公式の汎用ガイドを取り込む |
| `AGENTS.md` | 公式テンプレート同梱（英語・無改変）。構成・マニフェスト・セキュリティ・UX の原則 |
| `.claude/skills/obsidian-plugin-dev/SKILL.md` | プラグインのコードを書くときに読む手順書: API の調べ方、実装前チェック、dev-vault での確認依頼の書き方、仕上げチェックリスト、1.13 の新 API、リリース |
| `.claude/settings.json` | `npm run *` / `npx tsc` / `vitest` / `eslint` / `prettier` / `git status|diff|log` を許可。それ以外は都度確認 |

フックは入れていない。編集のたびに型チェックを走らせると途中状態で警告が出てノイズになるため、「終了前に `npm run check`」のルールで代替する。

### 7. リリース経路（今は使わない）

- `npm version patch` → `manifest.json` / `versions.json` 更新（`.npmrc` でタグに `v` を付けない）
- `.github/workflows/release.yml`（公式）: タグ push でビルドしてドラフトリリースを作成
- `.github/workflows/ci.yml`: push ごとに build + check
- コミュニティ公開には `README.md` と `LICENSE` が必要（ライセンスは未決）

### 8. E2E（隔離した Obsidian での自動確認）

`scripts/e2e-obsidian.mjs`（`npm run e2e -- <command>`）。2026-10-01 のフェーズ 0〜7 の動作確認はこれで行った。

- Obsidian を **専用のユーザーデータ**（OS の一時フォルダ）と `--remote-debugging-port` で起動し、Chrome DevTools Protocol で JS の実行とスクリーンショットを行う。依存パッケージは不要（Node 22 の `fetch` / `WebSocket`）。
- 本番のユーザーデータ（`~/Library/Application Support/obsidian`）には書き込まない。自動更新で入った本体の asar（現在 1.14.3）を読み取ってコピーするだけなので、インストーラーの版（1.12.4）ではなく実際に使っている版で動く。開く Vault は dev-vault だけ。終了はこのプロファイルのプロセスだけを対象にする。起動中の本番の Obsidian とは別プロセスで、互いに干渉しない。
- ウィンドウが裏に隠れても止まらないよう、タイマーの間引きを無効にするフラグを付けている（付けないと `document.hidden` で待機が進まなくなる）。
- 使い方:

  ```bash
  npm run build                                   # dev-vault にコピー（hot-reload が読み直す）
  npm run e2e -- launch
  npm run e2e -- eval "await click('作成者を信頼しプラグインを有効化'); return Object.keys(app.plugins.plugins)"   # 初回だけ
  npm run e2e -- eval "app.commands.executeCommandById('fitness-log:open-today'); await sleep(800); return viewText()"
  npm run e2e -- shot /tmp/today.png              # 画像を Read で見る
  npm run e2e -- quit
  ```

  `eval` では `sleep` / `btn` / `click` / `modalText` / `viewText` が使え（`eval` の間はフォーカスを模擬するので、裏のウィンドウでも入力欄の focus / blur が起きる）、`window.__errs` に Console のエラーが溜まる。スマホ幅の確認は `window.require('@electron/remote').getCurrentWindow().setSize(400, 860)` の後に `app.emulateMobile(true)`（再読み込みが走る）。1.14 では設定画面が別ウィンドウなので `E2E_TARGET=設定` で対象を切り替える。
- `el.click()` では開かないもの（Obsidian のメニュー）は `npm run e2e -- click '<CSS セレクタ>' [right]` で本物のマウス操作をする（出たメニューの項目を表示する）。並べ替えは `npm run e2e -- drag '<つかむ所のセレクタ>' <dy>`（押して縦に dy ピクセル動かして離す。画面の端に寄せると自動スクロールが効くので、画面の中で動かす）。macOS の Obsidian は既定で OS のネイティブメニューを使い、DOM にも画面写真にも出ないので、確かめるときは先に `app.vault.setConfig('nativeMenus', false)` を実行する（コピーの Vault の設定が変わるだけ）。
- ユーザーが dev-vault を Obsidian で開いているときは、dev-vault をコピーして `E2E_VAULT=<コピーのパス>` で起動する（同じ Vault を 2 つのアプリで開くと data.json や workspace.json を取り合う）。プラグインのコピー先は `OBSIDIAN_PLUGIN_DIR=<コピー>/.obsidian/plugins/fitness-log npm run build` で切り替える。
- 注意: Obsidian 1.14 のドロップダウンは幅計測用の `select` を内部に持つので、`querySelectorAll('select')` の添字は 2 つずつずれる。

### 9. ダミーデータ（`npm run vault:dummy`）

`scripts/generate-dummy-logs.mjs`。PPL を回した日ノートを dev-vault に作る（既定 300 日のうち約 6 割、6 週ごとに +2.5 kg）。Markdown はプラグイン本体と同じコード（`src/lib`）を esbuild でその場で束ねて生成するので、書式がずれない。dev-vault の外には書かない・既存ノートは上書きしない。推移チャートの見た目と、履歴索引の性能（185 日分で 13 ms。目標 1 秒未満）の確認に使った。

### 9. スマホで確認（BRAT）

GitHub のリポジトリ `tk-pkm111/obsidian-fitness-log`（2026-10-02 に非公開で作り、BRAT でトークン無しに入れられるよう同日に公開へ切り替え）のリリースを、iPhone の Obsidian に BRAT で入れる。

- リリース: タグを push すると `.github/workflows/release.yml` が `npm run build` して、`main.js` / `manifest.json` / `styles.css` を添付したリリースを作る（BRAT が読めるよう下書きにしない。ビルドの証明は公開リポジトリのときだけ付ける）。
- 次の版を出す: `npm version patch`（`version-bump.mjs` が manifest.json・versions.json を合わせ、`.npmrc` の設定で `v` の付かないタグ `0.1.1` を作る）→ `git push --follow-tags`。
- iPhone 側: テスト用の vault に BRAT を入れ、「Add beta plugin」に `tk-pkm111/obsidian-fitness-log`（公開リポジトリなのでトークンは不要）。更新は BRAT の「Check for updates」。
- iPhone の Obsidian は 1.13.0 以上が必要（minAppVersion）。

## ワークフロー

```
編集 ─▶ npm run dev（監視）─▶ dev-vault に自動コピー ─▶ hot-reload が再読み込み ─▶ Obsidian で目視
  │                                                        └─▶ npm run e2e（隔離した Obsidian を自動操作・スクショ）
  └─▶ npm run check（型・Lint・整形・テスト）が通るまで終わらない
```

## 決めたこと（と理由）

| 項目 | 決定 | 理由 |
|---|---|---|
| リポジトリの単位 | プロジェクトのルート = プラグインのリポジトリ | コミュニティ公開時に `manifest.json` がルートに要る。`context/` `docs/` `dev-vault/` は同居しても問題ない |
| プラグイン id / 名前 | `fitness-log` / `Fitness Log`（仮） | id は公開後に変えられないので、公開前に再検討する |
| `isDesktopOnly` | `false`（モバイル対応） | ジムではスマホで記録するはず。最初から制約を効かせる方が安い |
| `minAppVersion` | `1.13.0`（2026-10-01 に 1.12.0 から変更） | 開発機の Obsidian は 1.14.3（下記「1.13 への移行」）。宣言的設定だけを使う |
| 設定タブ | `getSettingDefinitions()` のみ（`display()` は削除済み） | 公式 Lint が宣言的 API を推奨。`display()` は 1.13.0 で deprecated |
| テスト | Vitest + 手書きモック + 仮想 vault | 軽い。描画は E2E（隔離した Obsidian）と目視で確かめる |
| 整形 | Prettier（公式の editorconfig に合わせる） | AI の編集でスタイルがぶれないように |
| フック | なし | 上記のとおりノイズになる |
| 動画・画像 | 取得しない | ハーネスに不要 |

## 確認してほしいこと

1. ~~**Obsidian を 1.13.8 に更新するか。**~~ → 更新済み（下記「1.13 への移行」）。
2. **プラグイン名 / id。** `fitness-log` は仮。
3. **ライセンス。** 公開するなら `LICENSE` が必要（Obsidian プラグインは MIT が多い）。
4. ~~**初回の動作確認。**~~ → 「動作確認」コマンドはフェーズ 3 で本物のコマンド（今日のトレーニングを開く など）に置き換えた。確認手順は docs/implementation-plan.md の各フェーズ。

## 1.13 への移行（2026-10-01、実装計画のフェーズ 0）

- 開発機の Obsidian: インストーラーは 1.12.4 のままだが、アプリ本体は自動更新（insider）で **1.14.3**（`~/Library/Application Support/obsidian/obsidian-1.14.3.asar`）。「設定 → 一般」に出るのはこちらの版。Obsidian の実行版はインストーラーではなくこの asar で決まる。
- `manifest.json` の `minAppVersion` と `versions.json` を `1.13.0` に上げた。
- `src/settings.ts` の 1.12 向け `display()` を削除し、宣言的設定（`getSettingDefinitions()`）だけにした。
- `eslint-plugin-obsidianmd` の `no-unsupported-api` は minAppVersion を基準に `@since` を検査するので、以後 1.13.0 までの API は Lint で通る。

## 既知の注意点

- `npm audit` が `moment` の moderate 1 件（3 経路）を報告する。`obsidian` パッケージが型のために依存しているだけで、プラグインには同梱されない（Obsidian 本体の moment を使う）。放置でよいが、`npm audit fix --force` は実行しない。
- `.gitignore` で `references/`、`dev-vault/.obsidian/plugins/`、`workspace*.json`、`main.js` を除外している。クローン後は `npm install && npm run vault:setup && npm run references:fetch`。
- `git init` 済みだがコミットはしていない。

## 次のステップ（アプリ設計）※ 2026-10-01 に設計・実装済み（docs/implementation-plan.md）

1. 記録したいこと（種目・重量・回数・RIR・休憩・メモ・体重など）と、Obsidian 上での保存形式（Markdown + frontmatter か JSON か、1 セッション 1 ノートか）を決める。`context/notion/README.md` の「プラグイン設計に効く要点」が出発点。
2. 種目マスターと別名（表記ゆれ）の持ち方を決める。
3. 入力 UI（モーダルかサイドビューか、スマホでの操作）を決める。
4. 一覧・集計の見せ方（Bases ビュー、Dataview 互換、独自ビュー）を決める。
