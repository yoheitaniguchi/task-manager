# CLAUDE.md

このファイルは、このリポジトリで作業するAIアシスタント（Claude Code等）向けのガイドです。

## プロジェクト概要

**Task Manager** は Obsidian のプラグインです。パーソナルカンバン + WIP（仕掛かり中作業）摩擦制御を骨格に、会議の重要度×コスト評価と委譲追跡を統合した**個人のフロー制御レイヤー**として設計されています。Backlog/Jira のような記録システム（イシュートラッカー）を代替するものではなく、その上に乗る個人向けのレイヤーです。

- ドキュメント（README.md、REQUIREMENTS.md、USAGE.md）はすべて**日本語**で書かれています。
- ドメイン知識・要件の詳細が必要な場合は `REQUIREMENTS.md` を参照してください（§3.1 にフロントマタースキーマ、§F1〜F9 に機能要件があります）。
- エンドユーザー向けの操作説明は `USAGE.md` です。
- 設計思想の要約は `README.md` の「設計の要点」セクションにもあります（本ファイルの内容と重複しますが、README側がより簡潔です）。

## 技術スタック

- **言語**: TypeScript（strict モード）
- **UIフレームワーク**: Svelte 5（runes：`$state` / `$derived` / `$props()` / `$effect` を使用）
- **プラットフォーム**: Obsidian Plugin API（`obsidian` パッケージ、実行時はホストアプリが提供するため devDependencies 扱い）
- **バンドラー**: esbuild（`esbuild-svelte` + `svelte-preprocess` 経由）、設定は `esbuild.config.mjs`
- **主要ライブラリ**: `ical.js`（ICSカレンダーのパース、会議同期機能用）
- **型チェック**: `tsc --noEmit` + `svelte-check`
- **テスト**: Vitest
- **DB/ORM**: 無し。データは Obsidian Vault 内の Markdown ノート（YAMLフロントマター）として永続化されます。
- **Node**: `mise.toml` で `24.13.0` に固定
- **パッケージマネージャー**: npm（`package-lock.json` あり）

## アーキテクチャ：一方向依存の3層構造

```
ui/  ──→  domain/  ←──  infra/
```

- **`src/domain/`** — 純粋なビジネスロジック。**Obsidian API を一切 import しない**ため、モックなしで完全にユニットテスト可能です。
  - `capacity.ts`（キャパシティ計算）, `checkbox.ts`（チェックボックス⇄タスク変換）, `meetingEval.ts`（会議コスト評価）, `rot.ts`（腐敗＝放置検知）, `sortKey.ts`（fractional indexing によるソートキー）, `taskSchema.ts`（frontmatter⇄Task変換、下記参照）, `transition.ts`（状態遷移）, `types.ts`（型定義）, `wip.ts`（WIP判定）
- **`src/infra/`** — Obsidian API に依存するアダプター層。
  - `TaskRepository.ts`（Vault I/O、mtimeベースの競合検知）, `IcsClient.ts` / `MeetingSync.ts`（ICS同期）, `NoteFactory.ts`（ノート生成・チェックボックス昇格）, `EventLog.ts`（JSONLイベントログ）, `settings.ts`, `TicketProvider.ts`（**インターフェースのみ、意図的に未実装** — チケット連携はスコープ外）
- **`src/ui/`** — Svelte 5コンポーネント + Obsidian連携のグルーコード。
  - `Board.svelte` / `Card.svelte` / `Lane.svelte` / `CapacityBar.svelte`、`BoardView.ts`（Obsidianの `ItemView`）、`SettingsTab.ts`、`modals/`（`DelegationExportModal` / `PlanningModal` / `WeeklySummaryModal` / `WipOverrideModal`）、状態管理は `state.ts`（Svelteストア。モジュールレベルの runes は使わない設計）
- **`src/main.ts`** — プラグインのエントリーポイント（`TaskManagerPlugin extends Plugin`）。ボードビュー、リボンアイコン、コマンド（ボードを開く／タスクノート作成／チェックボックス昇格／プランニング開始／会議・ICS更新）、設定タブ、バックグラウンドジョブ（ICS更新間隔、週次サマリーチェック、Vault外部変更時のWIP超過検知）を登録します。

## 最重要規約：frontmatterキーは1箇所だけ

**フロントマターのキー名（snake_case）がリテラルで登場してよいのは `src/domain/taskSchema.ts` の `FM` 定数オブジェクトだけです。** それ以外のコードは、必ず `Task` 型（camelCase プロパティ）経由でアクセスしてください。新しいフロントマターフィールドを追加する場合も、まず `FM` に追加し、`parseTask()` / `buildFrontmatter()` を通して変換します。

## データモデル

- 各タスク＝ YAMLフロントマター付きの Vault ノート1件（`type: task | meeting | delegated`）。
- ステータスフロー：`backlog → ready → doing → done`。`waiting`（外部ブロッカー待ち）と Expedite（割り込みレーン）は WIP カウントから除外されます。
- **競合処理**：`TaskRepository.update()` は書き込み前にディスク上の `mtime` とキャッシュ済み `mtime` を比較し、不一致なら書き込まずに再読み込みします（Obsidian Sync や他デバイスでの編集との共存のため）。更新自体は手動の read→write ではなく `fileManager.processFrontMatter()` に任せます。
- **WIP摩擦の非対称性**（要求 §F2 の肝）：同じ判定関数を2つの入口から呼びます。UI（D&D・メニュー）は `wouldExceedWip()` で未然にブロックしますが、frontmatter の直接編集はブロック不能なため事後検知（列ヘッダー赤表示＋理由入力モーダル＋ログ記録）になります。
- **イベントログ**：ドメインイベント（`wip-exceeded` / `expedite-started` / `meeting-declined` / `meeting-shortened` / `planning-completed` / `planning-skipped`）は `EventLog` 経由で `.obsidian/plugins/task-manager/events.jsonl` に追記されます（このファイルはVault内であり本リポジトリには含まれません）。

## スコープ外（README「スコープ外」節、要求 §6 参照）

チケットシステムAPI連携／Calendar API(OAuth)／Vault共有によるチーム同期／リードタイム等フロー指標の可視化・週次レビューレポート自動生成／モバイルD&D。これらの実装は求めないでください。

## よく使うコマンド

```bash
npm install

npm run dev          # esbuild watch ビルド（開発時）
npm run build         # tsc --noEmit && svelte-check --threshold error && esbuild production
npm run check          # 型チェックのみ（tsc --noEmit && svelte-check）
npm test               # vitest run（全テスト実行）
npm run test:watch     # vitest watch モード

npx vitest run tests/wip.test.ts   # 単一テストファイルの実行
```

このプラグインには従来型の「devサーバー」はありません（クライアントサイドのObsidianプラグインのため）。動作確認する場合：

1. `npm run build` で `main.js` を生成
2. 検証用 Vault の `.obsidian/plugins/task-manager/` に `main.js` と `manifest.json` を配置
3. Obsidian の設定 → コミュニティプラグイン から有効化
4. リボンの kanban アイコン、またはコマンドパレットの「タスクボードを開く」で起動

README.md に、WIP摩擦・ICS同期・チェックボックス昇格・腐敗検知・競合検知を確認するための**手動E2Eチェックリスト**があります（自動UIテストは無いため、UI/infra層に触れる変更をした場合はこのチェックリストを一通り確認することを推奨します）。

## テスト

- フレームワーク：Vitest（設定：`vitest.config.ts`、`environment: 'node'`）
- テストは `tests/**/*.test.ts` のみが対象で、**`src/domain/` と `src/infra/icsParse.ts` のみをカバー**しています（domain層はObsidian非依存なのでモック無しでそのまま動きます。UI/他のinfraコードにはテストがありません）。
- テストの `describe`/`it` の説明文は日本語で、`REQUIREMENTS.md` の章番号（例：「要求 §3.2」）を参照するスタイルです。新規テストを書く際もこの慣習に合わせてください。
- `tests/helpers.ts` に `makeTask()` などのテスト用ファクトリがあります。
- ドメインロジックを変更したら、対応する `tests/*.test.ts` を必ず更新・追加してください。

## コードスタイル

- **リンター/フォーマッター設定は存在しません**（ESLint、Prettier、`.editorconfig` いずれも無し）。スタイルは strict TypeScript（`tsconfig.json` は `@tsconfig/svelte/tsconfig.json` を継承）と `svelte-check` のみで担保されています。既存コードの慣習（インデントはタブ、命名規則など）に合わせてください。
- コメントはJSDocスタイルで、主に日本語で「なぜ」（設計上の制約・要求仕様の根拠）を説明し、`REQUIREMENTS.md` の章番号を参照する書き方が多く使われています。新規コードでもこの慣習・言語（日本語コメント）を踏襲してください。
- 実装しない防御的な分岐は避け、Vault側のデータが壊れているケース（`taskSchema.ts` のパース関数がやっているように、不正値は握りつぶして既定値に倒す）以外では過剰なエラーハンドリングを増やさないこと。

## CI

`.github/workflows/test.yml` は push / PR のたびに `npm ci && npm test` のみを実行します。**`npm run check`（型チェック）や `npm run build` はCIで実行されていません。** そのため、型やビルドに影響する変更をした場合は、コミット前にローカルで `npm run check`（および必要なら `npm run build`）を実行し、手動で確認してください。

## Git 規約

- 現状は初期段階の小規模リポジトリです。コミットメッセージは短い命令形の英語で、Conventional Commits のようなプレフィックス規約（`feat:` 等）は使われていません。
- `CONTRIBUTING.md` やPRテンプレートは存在しません。

## 環境変数・シークレット

環境変数や `.env` は使用していません。ICS購読URL等のユーザー設定は Obsidian の `loadData()` / `saveData()` 経由で Vault の `data.json` に保存されます（gitignore対象、リポジトリには含まれません）。`.claude/settings.local.json` も同様に gitignore 対象です。
