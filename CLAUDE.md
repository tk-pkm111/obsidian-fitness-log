# Fitness Log — Obsidian プラグイン開発

@AGENTS.md

上の AGENTS.md は Obsidian 公式テンプレート同梱の汎用ガイド（英語）。以下はこのプロジェクト固有の決めごと。

## このプロジェクト

- 目的: Obsidian 上で筋トレのログを記録するプラグイン（id: `fitness-log`、名前は仮）。
- 状態: 2026-10-01 にハーネス（開発環境）を構築し、上流設計を固め、**実装計画のフェーズ 0〜7 を実装した**（実装状況と計画からの変更点は `docs/implementation-plan.md` の冒頭）。残りはユーザーによる実機（iPhone）確認と、公開前の決めごと（下の「未決事項」）。
- **実装計画: `docs/implementation-plan.md`**（データ設計・画面設計・使う API・フェーズ 0〜7）。経緯とハーネスの構成は `docs/harness.md`。
- **体組成のページ: `docs/body-composition-plan.md`**（ノートの形・画面・フェーズ 1〜8。2026-10-25 に実装）。触れる見本は `docs/body-composition/mock.html`（数値は作りもの）。
- 設計の前提資料: `context/notion/README.md`（Notion から書き出したメニュー・種目一覧・計測項目）。Notion には「計画」と「種目一覧」しかなく、重量×回数の実績ログは存在しない。

## レイアウト

```
src/main.ts        ライフサイクルのみ（登録・onLayoutReady・外部変更の再読込）
src/commands.ts    コマンド登録
src/settings.ts    設定タブ（宣言的。getControlValue/setControlValue で data.json の settings に接続）
src/services.ts    画面・コマンドに渡すサービスのまとまり
src/i18n/          UI 文言（t('key')）。日ノートの見出し・列名はファイル形式なので src/lib/log/markdown.ts の定数
src/lib/           Obsidian 非依存の純粋ロジック（'obsidian' の import は ESLint で禁止）
src/data/          data.json（DataStore）・日ノート（LogRepository）・履歴索引（LogIndex）・種目ノート（ExerciseLibrary）・パッケージノート（PackageLibrary）・設定ノート（ListsLibrary）・体組成のノート（BodyLibrary）
src/session/       開始・終了・修正の手順（SessionController）
src/ui/            メインビュー（ItemView）・各ページ・モーダル・SVG チャート
tests/             vitest。'obsidian' は tests/__mocks__/obsidian.ts、vault は tests/helpers/fake-app.ts の仮想 vault
scripts/           dev-vault の準備・参照資料の取得・ダミーデータ・E2E（隔離した Obsidian の自動操作）
dev-vault/         開発専用 Vault。ビルド成果物がここにコピーされる
context/notion/    ドメイン知識（Notion 書き出し）
references/        公式ドキュメント・公式テンプレートのローカルコピー（git 管理外）
docs/              設計メモ
```

## コマンド（npm scripts 経由で実行する）

| コマンド | 役割 |
|---|---|
| `npm run dev` | 監視ビルド。`dev-vault/.obsidian/plugins/fitness-log/` に自動コピー → hot-reload が再読み込み |
| `npm run build` | 本番ビルド（型チェック込み、minify）。dev-vault にもコピーされる |
| `npm run check` | typecheck + lint + format:check + test。**コードを変えたら最後に必ず通す** |
| `npm run format` / `npm run lint:fix` | 自動整形・自動修正 |
| `npm run test:watch` | テストの監視実行 |
| `npm run e2e -- launch\|eval '<js>'\|click '<selector>'\|drag '<selector>' <dy>\|shot <png>\|quit` | 隔離した Obsidian（専用プロファイル・dev-vault のみ）を起動して自動操作・スクリーンショット。使い方は `docs/harness.md` の「E2E」 |
| `npm run vault:dummy -- --folder Fitness-dummy` | dev-vault にダミーの日ノートを作る（チャート・性能の確認用） |
| `npm run vault:setup` | dev-vault と hot-reload の再セットアップ |
| `npm run docs:shots` / `docs:bundle` / `docs:export -- <フォルダ>` | 使い方ドキュメントの画像の撮り直し・全ページのまとめ・Publish 用フォルダへの書き出し（`docs/guide/README.md`） |
| `npm run references:fetch` | references/ を最新に更新 |

## 作業の進め方

1. Obsidian API に触る変更は、先に `.claude/skills/obsidian-plugin-dev/SKILL.md` の手順で公式ドキュメントと `node_modules/obsidian/obsidian.d.ts` を確認する。記憶で API を書かない。
2. ロジックは `src/lib/` に置いてテストを書く。Obsidian API に触る層（コマンド・ビュー・設定）は薄く保つ。
3. 終わる前に `npm run check` を通す。ESLint の警告（`obsidianmd/*`）も直す。
4. 機能・画面を変えたら、使い方ドキュメント（`docs/guide/`）の説明も直し、画面が変わったら `npm run docs:shots` で画像を撮り直して `npm run docs:bundle` でまとめを作り直す（書き方は `docs/guide/README.md`）。
5. UI の変更は `npm run build` の後に `npm run e2e` で隔離した Obsidian を操作して確かめる（スクリーンショットを見る・`window.__errs` が空か確認する）。そのうえで、`npm run dev` を動かした状態で dev-vault を開いて目視してもらうよう、確認手順を具体的に書いて依頼する（実機・手触りは自動では分からない）。
6. commit / push は頼まれたときだけ。リポジトリは GitHub の公開リポジトリ `tk-pkm111/obsidian-fitness-log`（コミットしたものは誰でも見られる。個人的なデータを入れない）。スマホ確認用の版は `npm version patch` → `git push --follow-tags` で出す（`docs/harness.md` の「スマホで確認（BRAT）」）。

## 守ること

- Obsidian 公式のプラグインガイドラインに従う（`eslint-plugin-obsidianmd` が多くを検出する）。
- モバイル対応（`isDesktopOnly: false`）: Node.js / Electron API 禁止、HTTP は `requestUrl`、OS 判定は `Platform`、正規表現の後読み禁止。
- vault への書き込み: 開いているノートは `Editor`、裏での編集は `Vault.process`、frontmatter は `FileManager.processFrontMatter`、削除は `FileManager.trashFile`。`Vault.modify` と Adapter API は使わない。
- 日ノートはプラグインが管理ブロック（`%% fitness-log:start %%` 〜 `end`）の中だけを書き換える。ブロックが読めないときは書き込まない（データを潰さない）。
- 日ノートは `Fitness/log/YYYY-MM-DD.md`（設定で変更可）。以前の既定（`Fitness/` 直下、`…/ログ`・`…/種目`）のノートは初回起動時に `src/data/migrations.ts` が移す（一度きり、`data.json` の `migrations` に印）。フォルダ名は英語（`log`・`exercise`）。
- 種目は種目ノート（`Fitness/exercise/*.md`）の frontmatter が正。data.json には保存しない（`DataStore.update` が保存時に外す）。ノートの本文には触らない。
- 種目の選択肢（カテゴリ・器具・記録のしかた）は設定ノート（種目フォルダの隣の `Fitness Log 設定.md`、タグ `fitness-settings`）の frontmatter が正（`src/data/lists-library.ts`、形式は `src/lib/model/lists.ts`）。種目ノートの category・equipment は名前（「肩」）で書く。記録のしかたは項目（weight・reps・distance・duration）の組み合わせの文字列（`src/lib/model/record-type.ts`）で、動き（何を聞く・何を出す・どの指標）は項目で決める。`recordType === 'duration'` のような比較は書かない。
- 体組成は 1 測定 1 ノート（`{bodyFolder}/YYYY-MM-DD.md`、`src/data/body-library.ts`、形式は `src/lib/body/note.ts`）。frontmatter のプロパティ名が項目名（日本語）、値は数字だけ、部位は「左腕 筋肉量」。読むのは日付の名前のノートだけ。オン／オフ・丸に出す項目・目標は設定ノートの `body_composition`・`body_items`・`body_goals`。体組成計の評価（標準など）は出さない。個人の体組成の値をリポジトリ・テスト・dev-vault に入れない（ダミーは `npm run vault:dummy -- --body` の作りもの）。
- パッケージとルーチンはパッケージノート（`Fitness/package/*.md`、1 パッケージ 1 ノート）の frontmatter が正（`src/data/package-library.ts`、形式は `src/lib/model/package-note.ts`）。画面は今までどおり `DataStore.update` で `data.packages` / `data.routines` を変え、update の中でノートと違うパッケージだけを書く。data.json には保存しない（移行済みの印 `packages-in-vault`）。今あるノートはそのフォルダのまま（保存先を変えても勝手に移さない）。ユーザーは Obsidian Sync でプラグインの設定を同期していないので、端末間でそろえたいものは必ず vault のノートに置く。
- dev-vault をユーザーが Obsidian で開いて `npm run dev` を動かしているときは、ソースを保存するたびにその dev-vault に反映される（移行などの処理も走る）。E2E は dev-vault のコピー（`E2E_VAULT`）で行う。
- ユーザーの本番 Vault（`~/Documents/Obsidian Vaults/` 配下など）と本番の Obsidian（起動中のアプリ・Obsidian CLI）には絶対に触らない。動作確認は `dev-vault/` と `npm run e2e` の隔離インスタンスのみ。
- UI 文言は日本語で `src/i18n/ja.ts` に集約する。英単語を混ぜるときは sentence case（例: "vault" は小文字）。
- SVG 要素の `cls` は空白区切りにしない（配列で渡す）。HTML 要素と違い例外になる。
- `minAppVersion` は `1.13.0`（宣言的設定 `getSettingDefinitions` のみを使う。開発機の Obsidian は 1.14.3）。1.14 以降専用の API を使う場合は manifest と versions.json を更新する。

## 未決事項（公開前に決める）

プラグイン名/id（`fitness-log` は仮）、ライセンス、英語 UI（i18n の仕組みはある）、v2 候補（左右別記録・ウォームアップ・RIR・体重など。`docs/implementation-plan.md` §12）。
