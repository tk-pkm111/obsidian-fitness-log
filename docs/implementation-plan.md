# Fitness Log 実装計画書（上流設計）

作成日: 2026-10-01 ／ 対象: Obsidian プラグイン `fitness-log`（名前は仮）

この文書は、ユーザーへのヒアリング（要望）、`context/notion/` のドメイン資料、`node_modules/obsidian/obsidian.d.ts` と `references/obsidian-developer-docs/` で裏取りした API をもとに書いた上流設計と実装手順。開発はこの文書のフェーズ順に進める。

---

## 0. 実装状況（2026-10-01 時点）

フェーズ 0〜7 をすべて実装した。`npm run check` 通過（テスト 204 件）。各フェーズの確認手順は、隔離した Obsidian 1.14.3（`npm run e2e`、dev-vault のみ）で実際にクリック・入力して実行し、スクリーンショットと Console（エラー 0 件）で確かめた。**残りはユーザーによる目視と実機（iPhone）での確認**。

| フェーズ | 状態 | 確かめたこと（隔離した Obsidian で） |
|---|---|---|
| 0 土台 | 済 | 開発機の Obsidian は自動更新で既に 1.14.3（インストーラーは 1.12.4）。`minAppVersion` 1.13.0、`display()` 削除後も設定タブが描画される |
| 1 純粋ロジック | 済 | Markdown の往復・壊れたブロックの検出・ルーチン境界・前回値 4 段・統計・テンプレート全種目名の解決（テスト） |
| 2 データ層 | 済 | 仮想 vault で外側テキストの保持・frontmatter 更新・同時書き込みの直列化・壊れたノートに書かない（テスト） |
| 3 今日ページ | 済 | 手順 ①〜⑨ すべて。ノートを手で 7 回に直すと約 1 秒で画面に反映。プラグイン無効→有効・アプリ再読み込み後も進行中セットの経過時間が続く。スマホ幅（400px・`is-phone`）でタップ領域 44px |
| 4 管理 UI | 済 | パッケージの作成・種目追加（検索／新規作成）・並び替え・目標の編集・複製・削除。種目の編集（別名の重複はエラー表示）。時間タイプの種目はプロンプトなしで開始・終了し `- \| -` で記録 |
| 5 ルーチン・日付ナビ | 済 | 「PUSH A を毎週 月・木」「LEGS A を毎週 金」→ 今日(木)・明日(金)に表示、この先 1 週間の予定、スキップと取り消し |
| 6 ログ・Bases | 済 | 185 日分のダミー（`npm run vault:dummy`）で推移チャート・ホバー・自己ベスト・月一覧。`.base` を開くと 185 件の表（日付の降順） |
| 7 仕上げ | 済 | 設定タブ全項目（書式の検証で「MM-DD」を拒否）、`openOnStartup`、`onExternalSettingsChange`（data.json を外から書き換えて反映）、ESLint 警告 0。性能: 索引の構築 185 日分 13 ms、プラグインの有効化 14〜20 ms・`onload` 0.7 ms |

### 実装後のコードレビュー（2026-10-01）

別のエージェントで正しさだけを見るレビューを行い、指摘 11 件をすべて修正して再発防止のテストを足した。主なもの:

- 終了ボタンの連打で同じセットが 2 行になる → 処理中は同じ処理を返す（開始も同様）
- frontmatter の YAML が壊れていると、本文には書けたのに「失敗」扱いになり、やり直しでセットが重複する → 本文を書けたら成功とし、frontmatter の失敗は通知だけ
- 表に知らない列（RPE など）や、メモの `|` で増えたセルが、次の書き込みで黙って消える → 書き込みを止めてノートを開く導線を出す
- セッションのメモの `|` が書くたびに `\` が増える／メモの行が 2 つあると 1 つ消える／セットに時刻が無いと手書きの「時間」が消える
- 日付をまたいだセッションの時間が約 24 時間になる → 24 時間の円で最も空いた間を外側とみなす
- セットの修正・削除が、手編集や「その他」が 2 つある日に別のセットに当たる → 位置（セッション・種目）＋名前＋表示していた値で確かめ、違えば書き換えない
- 名前を変えたパッケージの旧名で、初期データ・テンプレートが同名のパッケージを作る／data.json から年の無いノート名の形式を読み込む／保存先の変更中の索引に古い日が残る／時間タイプに変えた種目のセットを修正すると回数が消える

### 計画から変えたこと・足したこと

- **（2026-10-01 のフィードバック）パッケージは「▶ 筋トレを開始」で始め、「■ 筋トレを終了」で終える**。開始前は畳んで種目名だけ、開始で展開、終了で「今日もお疲れ様でした」とまとめ（時間・セット数・ボリューム）に畳む（「記録を見る」で修正、「再開する」で続き）。日ノートの「- 時間:」はセットからの逆算ではなく、開始・終了ボタンの時刻（'HH:mm:ss'、筋トレ中は終了が空欄）。パッケージ外（その他）は従来どおりセットから計算。筋トレ中のパッケージは同時に 1 つ。
- **（2026-10-01 のフィードバック）種目は data.json ではなく 1 種目 1 ノート（`{exerciseFolder}/{種目名}.md`、既定 `Fitness/種目`）を正にした**。設定（カテゴリ・器具・記録タイプ・片側・別名・アーカイブ）は frontmatter（キーは `fitness_id` / `category` / `equipment` / `record_type` / `unilateral` / `archived`、別名は Obsidian 標準の `aliases`、タグ `fitness-exercise`）、本文はユーザーのノウハウ。編集モーダルのメモ欄は廃止し「ノートを開く」を追加。今日のカードの種目名からもノートを開ける。Properties 欄の変更・ファイル名の変更・削除はプラグインに反映（`ExerciseLibrary`）。以前の data.json の種目は初回起動時に同じ id でノートへ移行。
- **（2026-10-02 のフィードバック・その 4）画面の下の「いまの帯」はやめた**。スマホでは一番下は見づらく、セット中の表示はカードの実行中の行と、「記録」は ■ と重なるため。休憩（経過・目安・進みのバー）は**最後にセットを終えた種目のすぐ下**に出す（`src/lib/today/rest.ts` の `restState` で決め、`today-card.ts` で描く）。筋トレ中とその他だけで、セットの実行中・終えた筋トレ・過去の日・1 時間を超えた休憩では出さない。以下の「その 3」の帯の記述（次の一手のボタンなど）は廃止。
- **（2026-10-02 のフィードバック・その 3: UI/UX の見直し）** 今日の画面を「探さずに次の操作ができる」ように作り直した。
  - **いまの帯**（`src/ui/pages/today-now.ts`、判定は `src/lib/today/now.ts`）: ビューの下に固定（`PageContext.footer`）。セット中は経過と「■ 記録」、休憩中は経過と目安に対する進み（帯の上端の線。目安を過ぎるとオレンジ）と次の一手（目標セット数に届くまでは同じ種目の「▶ セット N」、届いたら次の種目の「▶ 開始」、全部終われば「■ 筋トレを終了」）。目標は画面には出さず、次の一手の判断にだけ使う。休憩はカードから外し、筋トレ中（とその他）のときだけ帯に出すので、**筋トレを終了したあとに休憩タイマーが動き続ける不具合**は起きない。1 時間を超えた休憩は数えない。
  - 見た目: 枠の入れ子をやめた（セクションは見出し＋1 枠のリスト、種目は区切り線の行）。状態は札（予定・● 筋トレ中・✓ 完了）、筋トレ中は「n / m 種目」と進みのバー。開始ボタンは丸。実行中の行は薄い色＋左の線。⋮⋮ はデスクトップでは行に乗せたときだけ。予定は番号付きのやる順の一覧。「記録を見る」はやった種目だけ。ライト／ダークどちらも Obsidian の変数だけで色を決める。
  - 入力: 回数・重量の入力にワンタップの候補（前回の前後 5 つ／目標の幅、重量は刻みの前後。`src/lib/today/quick-values.ts`）。候補を押すとそのまま記録・開始。スマホでは候補があるとキーボードを自動で出さない。
- **（2026-10-02 のフィードバック・その 2）**
  - 「お疲れ様でした」のまとめは種目数・セット数だけ（ボリュームの kg は出さない。終了のお知らせも同じ）。まとめの横に「ノートを開く」。
  - 「再開する」は今日の筋トレだけ（過去の日はタイマーで続きを計れない。`resumeSession` も今日以外は拒否）。過去の日に筋トレ中のまま残ったものを「筋トレを終了」すると、今の時刻ではなく最後のセットの終了を終了時刻にする（`endPastSession`）。
  - 並べ替えはドラッグ＆ドロップ（左の ⋮⋮ をつかむ。↑↓ キーでも可）。Pointer Events で組んだ `src/ui/sortable.ts`（iOS の WebView では HTML の DnD が当てにならないため）。パッケージ一覧・パッケージの種目（▲▼ ボタンは廃止）・今日の画面のまだやっていない種目。今日の画面の並べ替えはその日だけ（`PluginData.dayOrders`、2 週間で消える）で、パッケージの並びは変えない。
  - パッケージのセクション（TaskChute の時間帯の区切りのように「背中」「腕」で種目を分ける）。設定「パッケージのセクションを使う」（既定オフ）で有効にすると、パッケージ画面で「セクションを追加」・ドラッグで位置決め・名前の変更・削除ができ、今日の画面にも見出しとして出る。データは `Package.sections: { id, name, at }[]`（at = その区切りの前にある種目の数）。種目を動かす・外すときは「行」（`packageRows` / `applyPackageRows`）に直してから組み直すので区切りが崩れない。設定をオフにしても区切りは消さずに残す。今日の画面ではやった順のカードもその種目の区切りの中に入り、パッケージに無い種目は「追加した種目」にまとめる。
- **（2026-10-02 のフィードバック）セットの修正はペン（モーダル）ではなく、行の数字をその場で直す形にした**。重量・回数・開始・終了・休憩を押すと入力欄になり、Enter か外を押して確定、Esc で取り消し（`src/ui/inline-input.ts`）。時刻は普段 'HH:mm'、直すときは秒まで。スマホの数字キーボードには ':' が無いので '.' も区切りとして受け付ける（`parseClockInput` / `parseDurationInput`）。休憩は日ノートに列を持たず「前のセットの終了〜このセットの開始」（種目の欄をまたいでやった順につなぐ）。休憩を直すとこのセットの開始と終了を同じだけずらす（`src/lib/log/set-rest.ts`）。ペンの代わりに右にコメント（吹き出し）アイコンを置き、押すとそのセットのコメント（感じたこと）を書ける。コメントがあるとアイコンが色付きになり、行の下に出る。セットの削除は「セット N」を押した（右クリックした）メニューから（確認あり）。
- **（2026-10-02 のフィードバック）「メモ」を「コメント」にした**。日ノートの表の列は `コメント`、セッションの箇条書きは `- コメント:`。以前の `メモ` の列・箇条書きも読み、次に書き込むときに `コメント` に直す。パッケージの種目のメモ（例: ベンチ 60°）は設定値なので「メモ」のまま。
- **（2026-10-01 のフィードバック）種目カードはやった順に並べる**。▶ を押した種目は最後にやった種目のすぐ下へ移り、前にやった種目をもう一度始めると下にもう 1 枚（日ノートでは同じ種目の見出しがもう 1 つ。セット番号は前の欄の続き）。日ノートの種目の並びも「やった種目（やった順）→ まだの種目」に揃える（`appendSet`）。カードは TaskChute と同じく左に ▶／■（アイコンだけ）＋種目名だけにし、目標（2セット×6-9回・休憩2:30）とチェックマーク・「次」の強調はやめた。目標はパッケージ画面の各種目の「詳細設定」に畳み、休憩タイマーの色（目標超えでオレンジ）にだけ使う。
- **（2026-10-01 のフィードバック）日ノートの保存先の既定を `Fitness/` から `Fitness/ログ/` に変えた**。以前の既定のままの vault は、初回起動時に日付名のノートだけを `FileManager.renameFile` で移す（一度きり。`PluginData.migrations` に `log-folder-v2`。移動先に同じ日があれば動かさない。ユーザーが変えた保存先には触らない）。
- **（2026-10-01 のフィードバック）ページ切り替えは上部のタブ列ではなく、左上の ☰ で開く左サイドバー（ドロワー）にした**（TaskChute と同じ形）。ヘッダーは「☰ ／ ‹ 📅 今日 (10/1 木) › ／ ＋」。日付の部分を押すと日付を選べ、＋ からパッケージ・パッケージ外の種目を追加できる。中身は幅 760px の中央寄せをやめ、ビューの幅いっぱいに使う。

- **予定のパッケージ（ルーチン）は畳まずに種目カードを出す**。ジムで開いてすぐ ▶ を押せるように（入力の手間を最小に、の要望を優先）。「このパッケージを始める」ボタンは無くし、最初のセットを終えた時点でノートにセッションができる。スキップした予定は「戻す」で取り消せる。
- **次にやる種目の開始ボタンだけを強調**（直前に終えた種目が目標未達ならその続き、そうでなければ並び順で最初の未達）。休憩タイマーは目標も併記（`休憩 1:23 / 2:30`）。
- **過去日の ▶ は「セットを追加」（タイマーなしの手入力）**、未来日は予定の表示のみ。パッケージに結び付かないセッション名（削除・改名し別名も無いもの）も手入力。
- パッケージの編集はモーダルではなく、**同じページの詳細画面**（スマホで縦に長い編集をしやすく）。
- 時間タイプの種目をパッケージに足すと、既定の目標は 1 セット・回数なし。
- 重量の刻みは min 0.1・任意の刻み（1.25 kg のプレートを許すため。計画は min 0.5・0.5 刻み）。
- 設定画面を開く公開 API が無いため、ビュー右上の歯車は非公開の `app.setting` を使い、無ければ案内の Notice を出す。
- UPPER-LOWER の Notion の見出しは 2 つとも「LOWER B」だったので、A 週側を「LOWER A」とした。初期の種目は 66（ライブラリー 53 ＋ プログラム表にだけある 13）。別名の方針は `src/lib/model/defaults/exercises.ts` の冒頭。
- Bases ファイルはタグに加えてフォルダでも絞り込む（`file.inFolder`）。
- 開発ツールを追加: `npm run e2e`（隔離した Obsidian の自動操作）、`npm run vault:dummy`（ダミーの日ノート）。`docs/harness.md` の 8・9。

---

## 1. 背景と目的（Context）

- Notion には「計画（プログラム）」と「種目ライブラリー」だけがあり、**重量 × 回数の実績ログは存在しない**。このプラグインが最初の実績ログ置き場になる（`context/notion/README.md`）。
- ハーネス（ビルド・Lint・テスト・dev-vault）は 2026-10-01 に構築済み（`docs/harness.md`）。
- ユーザーの要望（ヒアリングの要点）
  1. 種目を登録できる。基本種目はデフォルトで用意しつつ、「＋カスタム」で自由に追加（ジムのマシン違い、自重、ストレッチローラーなど）。
  2. 種目を束ねて「パッケージ」（例: 上半身A／下半身B）を作る。
  3. 種目ごとに **開始／終了ボタン**。開始でタイマーが走り「セット 1」が現れ、終了で記録が残る。もう一度開始で「セット 2」。
  4. 初回だけ「今日は何 kg？」と聞き、以降は前のセットの重量を引き継ぐ（変更は自由）。終了時に「何回できた？」と聞く。
  5. **入力の手間を極限まで減らす**: 前回の記録（**パッケージ × 種目**単位）を次回の初期値にする。上半身A のラットプルダウンと上半身B のラットプルダウンは別管理。
  6. ルーチン: 曜日などの繰り返しルールで、その日のパッケージが何もしなくても表示される（ルーチンタイプ・間隔・開始日・終了日・有効）。
  7. TaskChute 風の画面: 日付ナビ（‹ 今日 (10/1 木) ›）、開始／終了ボタン、時間・回数、コメント。画面内ナビ（ルーチン／ログ／設定…）。時間帯セクションは不要。
  8. ログ: 種目ごとに重量の推移を視覚的に見たい。
  9. 記録は **Markdown** で vault のフォルダに、**記録があった日だけ** 1 日 1 ノート。AI が後で読める形式。
  10. まずはシンプルに。設定は後から機能を継ぎ足せる構造（言語設定なども将来）。

### 決めたこと（ユーザー確認済み・2026-10-01）

| 項目 | 決定 |
|---|---|
| 記録の単位の呼び方 | **セット**（1 回の動作は「回数」）。UI もデータも「セット n: 50 kg × 8 回」 |
| メイン画面の場所 | **メインエリアのタブ**（`ItemView`）。画面内にページ切り替え（今日／パッケージ／種目／ルーチン／ログ） |
| Obsidian バージョン | 開発機を **1.13 系に更新**し `minAppVersion` を `1.13.0` に。宣言的設定のみ（`display()` を削除） |
| 種目・パッケージ・ルーチンの保存先 | **プラグインの `data.json`**（`loadData` / `saveData`） |
| 実績ログの保存先 | **vault 内の Markdown ノート**（1 日 1 ノート、frontmatter + 本文） |

---

## 2. 用語

| 用語 | 意味 | データ |
|---|---|---|
| 種目 (Exercise) | ラットプルダウン等。カテゴリ・器具・記録タイプ・別名を持つ | data.json |
| パッケージ (Package) | 種目の束＋目標（セット数・レップ範囲・休憩）。例: PUSH A、上半身A | data.json |
| ルーチン (Routine) | パッケージを「いつやるか」の繰り返しルール | data.json |
| セッション (Session) | ある日に行ったパッケージ 1 回分の記録（日ノート内の `##` セクション） | 日ノート |
| セット (Set) | 重量 × 回数 × 開始〜終了時刻 × コメント | 日ノート |
| 日ノート (Day log) | `Fitness/ログ/2026-10-01.md`。その日の全セッション | vault |
| 進行中セット (Active set) | 開始ボタンを押してから終了までの状態（タイマー） | data.json（再起動で復元） |

---

## 3. 全体像

```
┌─ UI（Obsidian 依存・薄い） ─────────────────────────────────────┐
│  MainView (ItemView, メインエリア)                              │
│   ├ 今日ページ  ├ パッケージページ ├ 種目ページ ├ ルーチン ├ ログ   │
│   └ モーダル: 重量入力 / 回数入力 / 種目選択(Fuzzy) / 各編集      │
└───────────────┬─────────────────────────────────────────────────┘
                │ イベント(Events) / 呼び出し
┌─ アプリ層（Obsidian 依存） ──────────────────────────────────────┐
│  SessionController  開始・終了・修正の手順。activeSet を管理       │
│  DataStore          data.json の読み書き・マイグレーション・外部変更 │
│  LogRepository      日ノートの作成/更新（Vault.process, frontmatter）│
│  LogIndex           ログフォルダを走査してメモリ上に履歴索引を保持   │
└───────────────┬─────────────────────────────────────────────────┘
                │ 純粋関数を呼ぶ
┌─ src/lib（Obsidian 非依存・vitest で検証） ───────────────────────┐
│  model/types, model/ids, model/defaults(初期データ)                │
│  log/markdown(日ノート⇄モデルの相互変換), log/summary(集計)        │
│  schedule/routine(その日のパッケージ判定)                           │
│  history/carry-over(前回値の選択), history/stats(推移・ベスト)       │
│  time/*(日付・時刻の整形), rep-range(既存)                          │
└──────────────────────────────────────────────────────────────────┘
```

原則:
- **日ノートが実績の唯一の正**。プラグインは自分が書いたブロックを読み戻して画面を作る（手で直してもよい）。`data.json` には実績を持たない（Sync 競合・肥大化を避ける）。
- 書き込みは必ず `Vault.process`（本文）と `FileManager.processFrontMatter`（frontmatter）。`Vault.modify` / Adapter は使わない。
- ロジックは `src/lib/` に置き、UI は描画と呼び出しだけ。

---

## 4. データ設計

### 4.1 `data.json`（`PluginData`）

```ts
// src/lib/model/types.ts（抜粋。すべて Obsidian 非依存）
export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'arms' | 'core' | 'cardio' | 'other';
export type Equipment = 'machine' | 'cable' | 'smith' | 'barbell' | 'dumbbell' | 'bodyweight' | 'band' | 'other';
/** 記録タイプ: 重量×回数（既定）/ 回数のみ（自重）/ 時間のみ（有酸素・ストレッチ） */
export type RecordType = 'weight-reps' | 'reps' | 'duration';

export interface Exercise {
	id: string;                 // 'ex_' + ランダム 8 文字
	name: string;
	category: ExerciseCategory;
	equipment?: Equipment;
	recordType: RecordType;
	unilateral?: boolean;       // 片側種目（v1 では表示のみ。左右別記録は v2）
	aliases: string[];          // 表記ゆれ。名前を変えたら旧名を自動で追加
	note?: string;
	archived?: boolean;
	createdAt: string;          // ISO 8601
}

export interface PackageItem {
	exerciseId: string;
	targetSets: number;         // 2
	targetReps: string;         // '6-9' | 'AMRAP' | '8'（既存 parseRepRange で解釈）
	restSec?: number;           // 120
	note?: string;              // 'ベンチ 60°' など
}
export interface Package {
	id: string;                 // 'pk_' + 8 文字
	name: string;               // 'PUSH A'
	items: PackageItem[];
	aliases: string[];          // 名前変更時の旧名
	note?: string;
	createdAt: string;
}

export type RoutineRule =
	| { type: 'weekly'; weekdays: number[]; intervalWeeks: number }  // 0=日 … 6=土。intervalWeeks=2 で隔週
	| { type: 'everyNDays'; intervalDays: number };                  // 開始日から N 日ごと
export interface Routine {
	id: string;                 // 'rt_' + 8 文字
	packageId: string;
	rule: RoutineRule;
	startDate: string;          // 'YYYY-MM-DD'
	endDate?: string;
	enabled: boolean;
	skipDates: string[];        // 「今日はスキップ」した日
}

export interface ActiveSet {
	date: string;               // 'YYYY-MM-DD'（セッションの日）
	packageId: string | null;   // null = パッケージ外（その他）
	exerciseId: string;
	setIndex: number;           // 1 始まり
	weight?: number;            // kg（単位は設定に従い表示だけ変換）
	startedAt: string;          // ISO 8601（再起動後も経過時間を復元）
}

export interface FitnessLogSettings {
	logFolder: string;          // 'Fitness/ログ'（当初は 'Fitness'。§0 参照）
	fileNameFormat: string;     // 'YYYY-MM-DD'（moment 書式）
	weightUnit: 'kg' | 'lb';
	weightStep: number;         // 2.5
	showRestTimer: boolean;     // true
	openOnStartup: boolean;     // false
}

export interface PluginData {
	version: 1;                 // マイグレーション用
	settings: FitnessLogSettings;
	exercises: Exercise[];
	packages: Package[];
	routines: Routine[];
	activeSet: ActiveSet | null;
	seededAt?: string;          // 初期データ投入済みの印
}
```

- 既存 `src/settings.ts` の `FitnessLogSettings`（`logFolder` のみ）をこの形に拡張する。`normalizeLogFolder` は流用。
- **宣言的設定の保存経路**: 既定では Obsidian が `this.plugin.settings[key]` を書き戻して `saveData()` を呼ぶ。`PluginData` は入れ子なので、設定タブで `getControlValue` / `setControlValue` を上書きし、`DataStore.save()`（data.json 全体を書く）に通す（公式ガイド `Plugins/User interface/Settings.md` の「Custom settings storage」の手順）。
- `Plugin.onExternalSettingsChange`（@since 1.5.7）で Sync 等による外部変更時に再読込し、ビューを再描画する。

### 4.2 日ノート（Markdown 仕様）

パス: `{logFolder}/{moment(date).format(fileNameFormat)}.md`（既定 `Fitness/ログ/2026-10-01.md`）。**最初のセットを記録した時（またはパッケージを今日に追加した時）に作成**。記録がない日は作らない。

```markdown
---
tags:
  - fitness-log
date: 2026-10-01
packages:
  - PUSH A
exercises:
  - ケーブルYレイズ
  - ディップス
sets: 4
volume_kg: 1120
duration_min: 48
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
```

ルール:
- プラグインが管理するのは `%% fitness-log:start %%` 〜 `%% fitness-log:end %%` の間だけ。更新時はこの範囲だけを再生成し、外側は保持する（`Vault.process` のコールバック内で「読み取り → 解析 → 変更 → 再生成」を同期的に行い、1 回の原子的な書き込みにする）。
- frontmatter は `processFrontMatter` で **集計キーだけ** 上書き（`tags` は `fitness-log` を追加するだけで他は保持）。Bases / Dataview の表やグラフにそのまま使える。
- 種目・パッケージは **名前** で書く（id は書かない。AI・人が読める）。読み戻し時に名前→id は本名＋別名で解決。解決できない名前も履歴としてはそのまま扱う。
- 重量は常に kg で保存（単位設定は表示のみ）。空欄は `-`。時刻は `HH:mm:ss`（セットは数十秒なので秒が要る）。
- 管理ブロックが解釈できないとき（表を壊した等）は **書き込まず** Notice で知らせてノートを開く導線を出す（データを潰さない）。
- 前日からの日付またぎ: セットは `activeSet.date` の日ノートに入る（表示中の日付＝セッションの日）。

### 4.3 前回値の引き継ぎ（`src/lib/history/carry-over.ts`）

パッケージ P の種目 E で「セット n」を始めるときの初期値:

1. 同じセッション内にセット n−1 があれば、その重量（ユーザー要望: 2 セット目以降は前のセットを引き継ぐ）。
2. なければ、**P で E を行った直近のセッション**（表示中の日付より前）のセット n の重量と回数。n がそれより多ければ最後のセットの値。
3. P での履歴がなければ、**他のパッケージ**での E の直近を使い、「前回（他パッケージ）」と表示する。
4. それもなければ空（重量プロンプトは空欄）。

回数プロンプトの初期値も同じ順序（1 は「同セッションのセット n−1 の回数」）。カードには「前回 10 kg × 9, 8（9/28）」のヒントを常に表示する。

### 4.4 ルーチン判定（`src/lib/schedule/routine.ts`）

`packagesForDate(routines, date): Routine[]` — `enabled` かつ `startDate ≤ date ≤ endDate` かつ `skipDates` に含まれず、
- `weekly`: `weekdays` に曜日が含まれ、かつ `startDate` の週から数えた週数が `intervalWeeks` の倍数（週の起点は月曜固定・設定にしない）。
- `everyNDays`: `(date − startDate) % intervalDays === 0`。
同じパッケージが複数ルーチンで当たっても 1 回だけ。

### 4.5 履歴索引（`LogIndex`）

- 起動時には何もしない。**ビューを開いた時**に `getFolderByPath(logFolder)` 直下の `.md` のうちファイル名が `fileNameFormat` で日付として解釈できるものを `cachedRead` → 解析してメモリに持つ（年 150 ノート程度なら数十 ms）。
- `vault.on('create'|'modify'|'delete'|'rename')` をレイアウト準備後に登録し、ログフォルダ内の変更だけを `debounce` 300 ms で再解析（該当ファイルのみ）。
- 提供する問い合わせ: `day(date)`, `exerciseHistory(name)`（降順）, `packageHistory(name)`, `allDays()`。
- 全ファイル走査は `vault.getFiles()` ではなくフォルダの `children` だけを見る（ガイドライン準拠）。

---

## 5. 画面設計

### 5.1 MainView（`ItemView`、view type `fitness-log-main`）

- `navigation = false`（ファイルを開くビューではない）。アイコン `dumbbell`。表示名「Fitness Log」。
- 開き方: リボンアイコン／コマンド「今日のトレーニングを開く」→ `getLeavesOfType` で既存を再利用、なければ `workspace.getLeaf('tab')` → `setViewState({ type, active: true })` → `revealLeaf`。ビューの参照はプラグインに持たない。
- 構成: 上部にページ切り替え（今日 ／ パッケージ ／ 種目 ／ ルーチン ／ ログ）＋ 右端に設定（Obsidian の設定タブを開く）。スマホは同じタブ列を横スクロール。TaskChute の左ナビに相当。
- 状態（表示ページ・選択日）は `getState/setState` で保存し、再起動後も同じページに戻る。
- タイマー更新は `this.registerInterval(window.setInterval(..., 1000))`（ビューの Component に紐づけて自動解放）。再描画は差分（タイマー文字だけ更新）。

### 5.2 今日ページ

```
‹   今日 (10/1 木)   ›   [今日]
──────────────────────────────────────────
▸ PUSH A                     18:30 –  進行中   [メモ]
  ケーブルYレイズ   2セット × 6-9回 ／ 休憩 2-3分
    前回 10 kg × 9, 8 (9/28)
    セット 1   10 kg × 9 回   18:31–18:31 (0:45)        [✎]
    セット 2   [10  ] kg   ⏱ 0:32            [■ 終了]
    （終了後）休憩 1:23
  ディップス       2セット × 4-8回                      [▶ 開始]
    …
  ＋ 種目を追加
▸ LEGS A（予定）  ── 未開始                [▶ このパッケージを始める] [今日はスキップ]
＋ パッケージを追加      ＋ パッケージ外の種目を追加
```

- 表示するセクション = その日の日ノートにあるセッション ∪ ルーチンで予定されたパッケージ（未開始は「予定」表示）。
- **開始**（種目カードの ▶）
  - その種目の今日 1 セット目 → **重量入力モーダル**（大きな数値入力・`inputmode="decimal"`・± `weightStep` ボタン・初期値は §4.3）。「開始」で `activeSet` を保存し、行「セット 1」が走り始める。
  - 2 セット目以降 → プロンプトなしで即開始。重量は行内で編集できる（前セットの値を引き継ぎ）。
  - `recordType: 'reps'`（自重）は重量プロンプトを出さない（必要なら行内で加重を入力）。`'duration'` は重量・回数とも聞かない。
  - 進行中セットは **同時に 1 つ**。他の種目の開始ボタンは無効化し「進行中」を示す。
- **終了**（■）→ **回数入力モーダル**（`inputmode="numeric"`・±1・初期値は §4.3）。確定で日ノートに追記（なければ作成）、`activeSet` を消し、休憩タイマー（カウントアップ）を表示。目標休憩を過ぎたら色を変える（通知は出さない）。
- 行の [✎] で重量・回数・メモの修正と削除。セクションの [メモ] でセッションのメモ。（→ §0: 数字はその場で直す形に、メモはコメントに変えた）
- 目標セット数に達したカードはチェック表示（追加セットは可能）。
- 過去日: 同じ画面で閲覧・修正できる。未来日: 予定だけ表示。
- 「今日はスキップ」はそのルーチンの `skipDates` に日付を入れる（ノートには書かない）。

### 5.3 パッケージページ／種目ページ

- パッケージ一覧 → 編集（名前・メモ・項目の並び替え（▲▼ボタン。ドラッグはスマホで扱いにくい）・項目の目標セット/レップ/休憩・削除・複製）。項目追加は **種目選択モーダル**（`FuzzySuggestModal`、本名＋別名で検索。該当なしなら「"〇〇" を新しい種目として作成」を先頭に出す）。
- 「テンプレートから追加」: Notion のプログラム（PPL／UPPER-LOWER／PPL×U-L／全身法）を内蔵テンプレートとして選べる。
- 種目一覧（カテゴリ別・検索）→ 編集（名前・カテゴリ・器具・記録タイプ・片側・別名・メモ・アーカイブ）。名前を変えたら旧名を別名に自動追加（過去ノートの名前と繋がる）。

### 5.4 ルーチンページ

- 一覧（パッケージ名・ルール要約「毎週 月・木」「3 日ごと」・期間・有効トグル）。
- 編集モーダル（TaskChute のルーチン設定に対応）: ルーチンタイプ（週ごと（曜日指定）／N 日ごと）、間隔、開始日、終了日（任意）、有効、曜日ボタン。保存／ルーチンを外す／キャンセル。
- 開始予定時刻は持たない（時間帯セクションは不要との要望）。

### 5.5 ログページ

- 種目を選ぶ（検索）→ セッション一覧（日付・パッケージ・「10×9, 10×8」）＋ **折れ線チャート**（セッションごとの最大重量・ボリューム＝Σ重量×回数、推定 1RM（Epley: w × (1 + reps/30)））。チャートは `createSvg` で自前描画（ライブラリを足さない）。
- 「自己ベスト」（最大重量・最大ボリューム・推定 1RM）。
- 月ごとの一覧（日付・パッケージ・セット数・ボリューム）→ 日付をタップで今日ページに移動／日ノートを開く。
- Bases 連携（任意）: コマンド「ログの Bases ファイルを作成」で `{logFolder}/トレーニングログ.base` を生成（table ビュー、フィルタ `file.hasTag("fitness-log")`、列 `date, packages, sets, volume_kg, duration_min`）。`.base` の YAML は `BasesConfigFile`（`filters` / `views[].type,name,order`）に沿う。実装時に help.obsidian.md/bases/syntax で書式を最終確認する。

### 5.6 モバイル配慮

- タップ領域は最小 44 px、主要ボタンは行の右端に固定。数値は専用モーダル（キーボード種別を `inputmode` で指定）。
- `is-phone` / `is-mobile`（Obsidian が body に付与）で CSS を切り替え、JS で `Platform.isPhone` は最小限。
- 進行中セットは `data.json` に ISO 時刻で保存するので、スマホのスリープ・アプリ再起動後も経過時間が正しく復元される。
- 動作確認は `this.app.emulateMobile(true)` と実機。

---

## 6. 設定・コマンド

### 6.1 設定タブ（宣言的 `getSettingDefinitions()` のみ）

| 名前 | control | key | 既定 |
|---|---|---|---|
| ログの保存先 | `folder`（vault のフォルダ選択） | `logFolder` | `Fitness` |
| ノート名の形式 | `text`（`validate`: 今日を書式化→厳密に解釈し直せること） | `fileNameFormat` | `YYYY-MM-DD` |
| 重量の単位 | `dropdown` kg／lb | `weightUnit` | `kg` |
| 重量の刻み | `number`（min 0.5, step 0.5） | `weightStep` | `2.5` |
| 休憩タイマーを表示 | `toggle` | `showRestTimer` | `true` |
| 起動時に今日の画面を開く | `toggle` | `openOnStartup` | `false` |
| （グループ「データ」）初期データを再投入 / Bases ファイルを作成 | `action` | — | — |

- 見出しは「データ」グループのみ（一般設定は見出しなし）。文言は日本語、英単語は sentence case。
- 言語設定は v2（文言は最初から `src/i18n/ja.ts` に集約し `t('key')` で参照しておく）。

### 6.2 コマンド（id は固定・ホットキー既定なし）

| id | 名前 | 内容 |
|---|---|---|
| `open-today` | 今日のトレーニングを開く | MainView を今日ページで開く |
| `open-log` | トレーニングログを開く | MainView をログページで開く |
| `create-bases-file` | ログの Bases ファイルを作成 | §5.5 |

既存の `show-status`（動作確認）は削除する。リボンアイコン: `dumbbell`「今日のトレーニング」。

---

## 7. 初期データ（`src/lib/model/defaults.ts`）

- **種目**: Notion ライブラリーの 53 種目（`context/notion/02_exercise-library/README.md`）をそのまま投入。カテゴリは LEGS/PULL/PUSH/ARMS をマップし、腹筋系（ケーブルアブクランチ・ハンギングレッグレイズ・マシンアブクランチ）は `core`。器具は名前から推定（マシン／ケーブル／スミス／ダンベル／自重）。`recordType` はディップス・チンニング・ハンギングレッグレイズを `reps`、他は `weight-reps`。
- **別名**: プログラム表の表記ゆれを `aliases` に入れておく（例）。

| 種目（本名） | 別名 |
|---|---|
| 45°レッグプレス | HS 45°レッグプレス |
| ルーマニアンデッドリフト | DB ルーマニアンデットリフト、（DBorバーベル/スミス）ルーマニアンデッドリフト |
| スティフレッグデッドリフト | SLDL |
| マシンアダクター | アダクター |
| レッグエクステンション | HS レッグエクステンション |
| シーテッドレッグカール（ワンレッグ） | レッグカール、ハムストリングカール |
| トライセップスプッシュダウン | EZバー ケーブルトライセプスプッシュダウン、トライセプスプッシュダウン |
| ケーブルシングルアームラットプルダウン（広背筋） | S/A ケーブルプルダウン（広背筋） |
| ダンベルプリーチャーカール | DBプリチャーカール、S/A DB プリチャーカール |
| ダンベルハンマーカール | DBハンマーカール、シーテッドDBハンマーカール |
| オルタネイトダンベルカール | オルタネイトDBカール（スピネイト） |
| ペックフライ | HS マシンペックフライ |
| スミスマシンインクラインプレス | スミスマシン インクラインプレス |
| チェストサポーテッドT-BARロウ | チェストサポーテッドT-BARロウorDBロウ（上背部） |

  ライブラリーにない種目（ハンギングレッグレイズ、マシンアブクランチ、スミスマシンorDBフラットプレス、スミスマシン ショルダー/ハイインクラインプレス、シーテッドケーブルフライ、ワンレッグ-レッグエクステンション 等。クロスボディケーブルエクステンションは「クロスボディーケーブルエクステンション」の別名）は実装時に `context/notion/01_training-programs/*.md` を突き合わせて追加・別名化し、テストで「テンプレートの全種目名が種目マスターで解決できる」ことを保証する。
- **パッケージ**: 初回起動時に **PPL（三分割）の 6 セッション**（LEGS A / PUSH A / PULL A / LEG B / PUSH B / PULL B）を投入（Notion で最終編集が最新のプログラム）。UPPER-LOWER／PPL×U-L／全身法は内蔵テンプレートとして「テンプレートから追加」で選べる。`SETS` の `1-2` は 2、`インターバル(分)` の `2-3` は 150 秒のように中央値へ丸める（純粋関数・テスト）。
- **ルーチン**: 既定なし（ユーザーが設定）。
- 投入は `onLayoutReady` 後に `seededAt` が無いときだけ。設定の「初期データを再投入」で不足分だけ追加（上書きしない）。

---

## 8. 使う Obsidian API（型定義で確認済み）と守ること

| 用途 | API（`@since`） | 備考 |
|---|---|---|
| ビュー | `Plugin.registerView`, `ItemView`（`contentEl`, `getViewType/getDisplayText/getIcon`, `onOpen/onClose`, `getState/setState`）, `Workspace.getLeavesOfType/getLeaf('tab')/revealLeaf`, `WorkspaceLeaf.setViewState` | ビュー参照を保持しない。`leaf.view instanceof MainView` で判定（Deferred view 対応）。`onunload` で leaf を detach しない |
| 起動 | `Workspace.onLayoutReady` | 初期データ投入・vault イベント登録・`openOnStartup` はここ |
| data.json | `Plugin.loadData/saveData`, `onExternalSettingsChange`(1.5.7) | |
| ノート | `Vault.getFolderByPath/getFileByPath/createFolder/create/cachedRead/process`(1.1.0), `FileManager.processFrontMatter`(1.4.4), `normalizePath` | `createFolder` は親が無い場合に備えて階層ごとに作る |
| 設定 | `PluginSettingTab.getSettingDefinitions`(1.13.0), control: `folder/text/dropdown/number/toggle`, `action`, `type: 'group'` | `getControlValue/setControlValue` を上書き |
| 入力 | `Modal`(`setTitle`, `contentEl`), `FuzzySuggestModal`, `Setting`+`ButtonComponent/TextComponent/DropdownComponent`, `createEl/createDiv/createSvg`, `setIcon` | `innerHTML` 禁止。スタイルは `styles.css` の `.fitness-log-*` と CSS 変数 |
| 時刻 | `import { moment } from 'obsidian'`（ファイル名書式のみ）, `Notice`, `debounce`, `Platform` | `src/lib` は moment を使わず `Date` で済ませる（Obsidian 非依存を守る） |
| Bases（任意） | `.base` ファイルを `Vault.create` で生成。`registerBasesView`(1.10.0) は v2 候補 | |

- モバイル: Node/Electron API なし、正規表現の後読みなし、`requestUrl`（今回は通信なし）。
- 文言: 日本語、sentence case。コマンド名にプラグイン名を含めない。`console.log` を残さない。

---

## 9. ファイル構成（新規 / 変更）

```
src/main.ts                    変更: registerView, ribbon, onLayoutReady(seed, index, openOnStartup), onExternalSettingsChange
src/commands.ts                変更: open-today / open-log / create-bases-file
src/settings.ts                変更: 設定項目の拡張、display() 削除、get/setControlValue で DataStore に接続
src/i18n/ja.ts, index.ts       新規: UI 文言の集約 t()
src/lib/model/types.ts         新規: §4.1 の型
src/lib/model/ids.ts           新規: 接頭辞付きランダム id（crypto.getRandomValues。Node/ブラウザ両対応）
src/lib/model/defaults.ts      新規: 初期種目・別名・プログラムテンプレート（§7）
src/lib/model/resolve.ts       新規: 名前→種目/パッケージの解決（本名・別名、NFC 正規化・空白無視）
src/lib/log/markdown.ts        新規: 管理ブロックの抽出/置換、DayLog ⇄ Markdown の相互変換（§4.2）
src/lib/log/summary.ts         新規: frontmatter 用集計（sets, volume_kg, duration_min, packages, exercises）
src/lib/schedule/routine.ts    新規: packagesForDate、ルール要約文
src/lib/history/carry-over.ts  新規: §4.3
src/lib/history/stats.ts       新規: セッション別 最大重量/ボリューム/推定1RM、自己ベスト
src/lib/time/date.ts           新規: 'YYYY-MM-DD' の加減算・曜日・HH:mm:ss 整形・経過秒
src/lib/rep-range.ts           既存: そのまま利用
src/data/data-store.ts         新規: PluginData の読込（マイグレーション・正規化）/保存/変更イベント
src/data/log-repository.ts     新規: 日ノートの path 解決、作成、updateDay(date, mutator)（Vault.process 内で解析→変更→再生成）、frontmatter 更新、書き込みキュー
src/data/log-index.ts          新規: §4.5
src/session/session-controller.ts 新規: startSet/finishSet/cancelSet/editSet/deleteSet/addPackageToDay/skipRoutine
src/ui/main-view.ts            新規: ItemView、ページ切り替え、状態保存
src/ui/pages/today-page.ts, package-section.ts, exercise-card.ts, set-row.ts, rest-timer.ts
src/ui/pages/packages-page.ts, exercises-page.ts, routines-page.ts, log-page.ts, chart.ts
src/ui/modals/number-prompt-modal.ts（重量/回数）, exercise-suggest-modal.ts, exercise-edit-modal.ts, package-edit-modal.ts, routine-edit-modal.ts, set-edit-modal.ts, confirm-modal.ts
styles.css                     変更: .fitness-log-* のスタイル（CSS 変数: --interactive-accent, --background-secondary, --background-modifier-border, --text-muted, --size-4-*, --radius-m, --font-ui-*, --input-height, --color-green/--color-orange）
tests/__mocks__/obsidian.ts    変更: ItemView, Modal(onOpen/close), FuzzySuggestModal, Events, debounce, moment（npm の moment を再輸出）, setIcon, Vault/FileManager の最小スタブ
tests/lib/**/*.test.ts         新規: 各純粋ロジック
tests/data/log-repository.test.ts, tests/session/session-controller.test.ts 新規: モック vault での往復
manifest.json / versions.json  変更: minAppVersion 1.13.0
docs/harness.md                変更: 「1.13 に更新した」追記
README.md                      変更: 機能・ノート形式の説明
```

---

## 10. 実装フェーズ

各フェーズの終わりに `npm run check`（型・Lint・整形・テスト）を通し、UI を含むフェーズは `npm run dev` + dev-vault で目視確認を依頼する。commit は頼まれたときだけ。

### フェーズ 0: 土台の更新（小）
- ユーザー作業: 開発機の Obsidian を 1.13 系へ更新。
- `manifest.json` `minAppVersion: 1.13.0`、`versions.json` を `{"0.1.0": "1.13.0"}`、`src/settings.ts` の `display()` 削除、`docs/harness.md` に追記。
- 確認: `npm run check`。dev-vault で既存の「動作確認」コマンドが動く。

### フェーズ 1: ドメインモデルと純粋ロジック（`src/lib`）
- `types.ts`, `ids.ts`, `defaults.ts`, `resolve.ts`, `time/date.ts`, `log/markdown.ts`, `log/summary.ts`, `schedule/routine.ts`, `history/carry-over.ts`, `history/stats.ts`。
- テスト: Markdown の往復（生成→解析→同一）、外側テキストの保持、壊れたブロックの検出、`-` の扱い、複数セッション／その他、集計値、ルーチン（曜日・隔週・N 日・期間・skipDates・重複排除）、前回値の 4 段フォールバック、統計、テンプレート全種目名が解決できること、id の一意性。
- 確認: `npm run check`。

### フェーズ 2: データ層
- `data-store.ts`（既定値マージ・`version` マイグレーション・`normalizeLogFolder`・保存・変更イベント・外部変更再読込）、`log-repository.ts`（フォルダ作成・ノート作成・`updateDay` を `Vault.process` 内で実行・frontmatter・書き込みキュー）、`log-index.ts`（遅延構築・debounce 再解析）。
- モック拡張とテスト: 仮想 vault（文字列マップ）で `updateDay` が外側テキストを保持し frontmatter を更新すること、日付→パスの解決、索引の問い合わせ。
- 確認: `npm run check`。

### フェーズ 3: 今日ページ MVP（最初に手で使える状態）
- `main-view.ts`（ページ枠・状態保存）、`today-page.ts` 一式、`number-prompt-modal.ts`、`exercise-suggest-modal.ts`、`session-controller.ts`、`i18n/ja.ts`、`styles.css`、`main.ts`/`commands.ts` の更新（registerView・リボン・`open-today`・初期データ投入）。
- この時点ではルーチン未実装のため「＋ パッケージを追加」で手動追加。
- 確認手順（dev-vault）: ① リボンの dumbbell → 今日ページが開く ② 「＋ パッケージを追加」→ PUSH A ③ ケーブルYレイズ ▶ → 重量 10 → 開始 → 数秒後 ■ → 回数 9 → 行「セット 1 10 kg × 9 回」と休憩タイマー ④ もう一度 ▶ → プロンプトなしで開始、重量を行内で 12.5 に変更 → ■ → 回数 8 ⑤ `Fitness/2026-10-01.md` が §4.2 の形で生成され frontmatter に `sets: 2` ⑥ ノートの表の回数を手で 7 に書き換えて保存 → 画面に反映 ⑦ Obsidian を再起動（またはプラグイン off/on）し、進行中セットの経過時間が続いている ⑧ `this.app.emulateMobile(true)` でボタンが押せる幅・数値キーボードが出る ⑨ Console にエラーなし。

### フェーズ 4: パッケージ・種目の管理 UI
- `packages-page.ts`, `package-edit-modal.ts`, `exercises-page.ts`, `exercise-edit-modal.ts`, `confirm-modal.ts`、テンプレートから追加、名前変更→別名追加。
- 確認: パッケージの作成／項目追加（検索・新規作成）／並び替え／複製／削除。種目の追加（自重・時間タイプ）と今日ページでの挙動（プロンプトの省略）。

### フェーズ 5: ルーチンと日付ナビ
- `routines-page.ts`, `routine-edit-modal.ts`、今日ページの ‹ › と予定パッケージ表示、「今日はスキップ」、`open-log` の状態遷移。
- 確認: 「PUSH A を毎週 月・木」を登録 → 今日(木)に自動表示 → 明日に送ると LEGS A（登録していれば）、過去日は記録が見える。隔週・N 日ごとの境界。

### フェーズ 6: ログページと Bases
- `log-page.ts`, `chart.ts`（SVG 折れ線）、自己ベスト、月一覧、`create-bases-file` コマンド。
- 確認: 数日分の記録を入れて推移が描ける。`.base` を開いて表になる（1.13 の Bases で確認）。

### フェーズ 7: 仕上げ
- 設定タブの全項目（`folder` 選択・書式検証・単位・刻み・タイマー・起動時）、`openOnStartup`、`onExternalSettingsChange`、README、`docs/harness.md`、起動時間（設定 → 一般 → 詳細のストップウォッチで `onload` が軽いこと）、実機（iPhone）確認、ESLint 警告ゼロ。

---

## 11. 検証方法（全体）

- 自動: `npm run check`。`src/lib` は往復テストと境界値、データ層は仮想 vault での往復、コマンド登録はモックで。
- 手動（dev-vault のみ・本番 Vault は触らない）: 各フェーズの確認手順。失敗時は **表示 → 開発者ツール** の Console を見る。モバイルは `this.app.emulateMobile(true)` と実機。
- 性能: ログ 300 日分のダミーノートを生成するスクリプト（`scripts/`、Node）で索引構築が 1 秒未満、`onload` が 50 ms 未満。

---

## 12. 前提（変更可）と将来拡張

前提として進めるもの:
- 進行中セットは同時に 1 つ。回数は終了時、重量は初回のみプロンプト（以降は行内編集）。
- 片側種目は v1 では 1 セットとして記録（`unilateral` は保持）。
- 有酸素・ストレッチは `duration` タイプ（時間だけ）で記録。距離などは v2。
- 初期パッケージは PPL（三分割）の 6 セッション。他プログラムはテンプレート。
- 休憩タイマーはカウントアップ表示のみ（通知・音なし）。

v2 候補（データ構造は対応済み／拡張しやすい形にしてある）:
- 左右別記録、ウォームアップセットの区別、RIR の記録、距離・心拍。
- 体重・食事・コンディション（Notion の計測項目: 体重・カロリー・PFC・睡眠・歩数・水分・空腹度・ストレス・身体 8 部位）を同じ日ノートの frontmatter に。
- `registerBasesView` でログ専用の Bases ビュー、週次レポート。
- 英語 UI（`i18n/en.ts` と設定 `language`）。
- プラグイン名／id・ライセンス（公開前に決める）。
