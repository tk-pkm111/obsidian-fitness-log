# 開発用 Vault

Fitness Log プラグインを試すための専用 Vault です。**普段使いの Vault（Evergreens など）では開発中のプラグインを動かさないでください。** 書き込み処理のバグでノートを壊す可能性があります。

## 使い方

1. プロジェクトのルートで `npm run dev` を実行する（ビルドして `.obsidian/plugins/fitness-log/` にコピーし、変更を監視し続ける）
2. Obsidian でこのフォルダ（`dev-vault`）を Vault として開く
3. 初回は「コミュニティプラグインを信頼して有効化しますか」と聞かれるので有効化する
4. 左のリボンのダンベルのアイコン（またはコマンドパレットで「Fitness Log: 今日のトレーニングを開く」）で今日の画面が開けば動いている

`hot-reload` プラグインが入っているので、ソースを保存するたびに自動で再読み込みされます。再読み込みされないときは **設定 → コミュニティプラグイン** でプラグインをオフ→オンする。

## 中身

- `.obsidian/plugins/hot-reload/` — 自動再読み込み用（`npm run vault:setup` で取得）
- `.obsidian/plugins/fitness-log/` — ビルド成果物（`npm run dev` / `npm run build` でコピー）
- `Fitness/` — 記録（日ノート）の保存先。セットを記録すると作られる
- それ以外のノートは自由にテスト用に作ってよい。推移チャートを試すなら `npm run vault:dummy -- --folder Fitness-dummy` でダミーの記録を作り、設定の「ログの保存先」を `Fitness-dummy` にする
