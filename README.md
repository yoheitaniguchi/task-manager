# Obsidian Task Manager Plugin

パーソナルカンバン + WIP摩擦制御を骨格に、会議の重要度×コスト評価と委譲追跡を統合した
**個人のフロー制御レイヤー**。記録システム（Backlog/Jira 等）を代替するものではない。

- **使い方**: [USAGE.md](USAGE.md)（ユーザー向け操作説明）
- **要件**: [REQUIREMENTS.md](REQUIREMENTS.md)
- 設計方針は本 README の「設計の要点」を参照

## 開発

```bash
npm install
npm test          # domain 層のユニットテスト（Obsidian 非依存）
npm run check     # tsc --noEmit + svelte-check
npm run build     # 上記 + esbuild で main.js を生成
npm run dev       # watch ビルド
```

## Vault へのインストール（動作確認用）

1. `npm run build` で `main.js` を生成する
2. テスト用 Vault の `.obsidian/plugins/task-manager/` に以下を置く
   - `main.js`
   - `manifest.json`
3. Obsidian の設定 → コミュニティプラグイン から有効化する
4. リボンの kanban アイコン、またはコマンド「タスクボードを開く」で起動

## 設計の要点

### 3層 + 依存の一方向化

```
ui/  ──→  domain/  ←──  infra/
```

`src/domain/` は Obsidian API を一切 import しない。WIP判定・キャパシティ計算・
会議評価・腐敗検知・fractional indexing はすべてここにあり、モックなしでテストできる。

### frontmatter のキー名は1箇所だけ

`src/domain/taskSchema.ts` の `FM` 定数のみが snake_case のキー名を持つ。
他のコードは `Task` 型のプロパティ経由でしか触らない。

### 競合検知書き込み

`TaskRepository.update()` は書き込み前にディスクの `mtime` とキャッシュの `mtime` を比較し、
食い違えば**書き込まずに再読み込みする**（Obsidian Sync / 他デバイス編集との共存）。
更新自体は `fileManager.processFrontMatter()` に任せ、手動の read→write はしない。

### WIP摩擦の非対称性

要求 §F2 の肝。同じ判定関数を2つの入口から呼ぶ。

| 経路 | 挙動 |
|---|---|
| UI（D&D・メニュー） | `wouldExceedWip()` でブロック（未然防止） |
| frontmatter 直接編集 | ブロック不可能なので事後検知。列ヘッダー赤表示 + 理由入力モーダル + ログ記録 |

### statusChangedAt

要求 §3.1 の frontmatter 一覧には無いが追加している。F9 の「委譲後7日間状態変化なし」を
検知するには状態変更時刻の永続化が必須なため。`TaskRepository.transition()` が
status と同時に必ず更新し、呼び出し側には委ねない。

### fractional indexing の精度枯渇

同一箇所への反復挿入で倍精度が尽きるため、隣接 gap が閾値（1e-9）を切ったら
その列のみ整数連番へ再配分する。通常時は「書き換えは移動ファイル1件のみ」を維持する。

## 手動E2Eチェックリスト（要求 §7 受入基準）

検証用 Vault を用意して確認する。

- [ ] **1. 状態遷移** — デスクトップで D&D、モバイル（またはカードのタップ/右クリック）で
      メニューから、全列間の移動ができる
- [ ] **2a. WIP摩擦（UI）** — WIP上限3で doing に4件目を D&D → ブロックされ Notice が出る
- [ ] **2b. WIP摩擦（外部編集）** — 別エディタで frontmatter の `status` を書き換えて doing を
      4件にする → doing ヘッダーが赤くなり、理由入力モーダルが出て `events.jsonl` に記録される
- [ ] **3. ICS** — 設定に定例会議を含むテスト用 ICS URL を登録 → 「会議を更新」で当日分の
      会議ノートが生成され、キャパシティバーが会議時間を控除した値になる
- [ ] **4. 昇格** — デイリーノートの `- [ ] やること` にカーソルを置き、コマンド
      「チェックボックスをタスクノートに昇格」→ ノートが生成され、元行が `- [ ] [[やること]]` になる
- [ ] **5. 腐敗検知** — `created_at` を15日前にした backlog カード／`expected_by` を過ぎた
      委譲カード／`status_changed_at` を7日以上前にした委譲カードで、それぞれバッジが出る
- [ ] **6. 競合検知** — Obsidian で開いたまま外部エディタで同じノートを編集し、ボードから
      移動を試みる → 上書きされず「外部で編集されました」の Notice が出て再読み込みされる

## ログ

`.obsidian/plugins/task-manager/events.jsonl` に JSONL で記録する。
成功指標（要求 §8）は4週間の自己運用で判定するため、後から遡れない。初回リリースから記録している。

記録するイベント: `wip-exceeded` / `expedite-started` / `meeting-declined` /
`meeting-shortened` / `planning-completed` / `planning-skipped`

## スコープ外（要求 §6）

チケットシステム API 連携 / Calendar API (OAuth) / Vault共有によるチーム同期 /
リードタイム等フロー指標の可視化 / 週次レビューレポート自動生成 / モバイル D&D

`src/infra/TicketProvider.ts` にインターフェースだけ置いてある（実装なし）。
`ticket_url` は保持と表示のみで、チケットの内容は複製しない。
