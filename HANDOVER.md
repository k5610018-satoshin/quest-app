# 担任記録アプリ 引き継ぎノート (2026-05-07)

> 校務PC(0248025)で作業 → 自宅PC(K5610)で続きをするときに読むドキュメント

## 自宅PCでのスタート手順

```bash
cd ~/quest-app
git pull --ff-only        # 53fc4d5, 2d680be を取得
cat HANDOVER.md           # このファイル
```

そのあと Claude Code に以下を伝えてください:

> 「`quest-app/HANDOVER.md` を読んで、続きから進めて」

---

## 今日 (2026-05-07) の出来事サマリ

### 事故
- 校務PC(学校アカウントChrome)で記録した本日分のデータがlocalStorageから消失
- クラウドGASには残っていたが `pullFromGas` の `since` フィルタで自動復旧できない構造だった
- 緊急復旧 → 復元成功

### Commitの流れ (本日新規)

| commit | 内容 |
|--------|------|
| 89b309d | (Shinnnosuke=自宅PCユーザー)ほめモード タグ24→12個 |
| f1b5c17 | (Shinnnosuke)ABA 相手児童複数選択 |
| **53fc4d5** | (校務PC側)データ消失からの自動復元 + マルチタブ防衛 + 緊急復元ボタン |
| **2d680be** | (校務PC側)3層ストレージ化(IDB併用) + 緊急復元堅牢化 + 日次/タブ復帰自動pull |

### 実装済みの主な仕組み(v20260507d 時点)

#### 多層ストレージ
- L1: localStorage `interactionApp_v1`
- L2: IndexedDB `interactionApp/appState` (idb-storage.js 新規)
- L3: クラウドGAS

`saveState()` で3層同時書き込み。`init()` の最後に `idbCheckAndRestore()` が起動時IDB照合。

#### 自動同期トリガー
- 起動時、ローカル0件 → 全件pull
- 起動時、日が変わってからの初回 → 全件pull (別端末今日分の取りこぼし防止)
- タブ復帰時(visibilitychange) → 60秒間隔自動pull
- `lastPull` がローカル最古より新しい(矛盾) → 1日巻き戻して取得
- 別タブが少ない件数で上書きを試みた → 自タブで再保存

#### ユーザーが押せる入口
- 設定タブ → クラウド同期 → **🆘 クラウドから緊急復元** ボタン (赤)
- `recovery.html` (アプリ同ディレクトリ・独立ツール)
- デスクトップショートカット「担任記録_復旧ツール」

#### スナップショット
- `interaction-snap-0`〜`-9` (30分ごとローテ10世代)
- `interaction-shrink-log-*` (件数10%以上減で退避、最大3件)
- `interactionApp_v1_backup` (直前の保存)

---

## 未解決の課題（自宅PCで続けるべき）

### 🔴 課題1: 個人アカウントChromeで同期されない (未確定)

校務PC上で「個人アカウントのChrome」(別Chromeプロファイル)で開くと、同日の記録が反映されないと報告あり。原因切り分け未完了。

ユーザーに渡した診断スクリプト（DevTools Console貼り付け用）はまだ結果が返ってきていない:

```js
(async () => {
  const cfg = JSON.parse(localStorage.getItem('interactionApp_gasSync') || '{}');
  const lp = localStorage.getItem('interactionApp_lastPull');
  const data = JSON.parse(localStorage.getItem('interactionApp_v1') || '{}');
  console.log('sync enabled:', cfg.enabled, 'autoSync:', cfg.autoSync);
  console.log('endpoint:', (cfg.endpoint||'').slice(0,80));
  console.log('lastPull:', lp);
  console.log('local total:',
    (data.evaluations||[]).length + (data.praises||[]).length +
    (data.records||[]).length + (data.abaRecords||[]).length);
  // 強制全件pull
  if (state.ui) state.ui.editingRecordId = null;
  localStorage.removeItem('interactionApp_lastPull');
  if (typeof pullFromGas === 'function') {
    try { await pullFromGas({fullPull:true}); } catch(_) { await pullFromGas(); }
    if (typeof refreshAll === 'function') refreshAll();
  }
})();
```

**自宅PCでは個人Chromeにすぐアクセスできる可能性大。診断結果を取得してください。**

### 🔴 課題2: けテぶれの記録がGASに同期されていない

**重要発見**: `pushKetebureToGas` は GAS 側の `dataType=ketebure` ハンドラ未実装のためエラーになる。`cloud-sync.js` の comment:

```js
// GAS側がketebure未対応でもアプリ側はローカル保存できているのでwarnのみ
console.warn('[sync] ketebure push失敗（GAS未対応の可能性、ローカル保存はOK）:', err.message);
```

GAS info の応答にも `kete_rows` フィールドなし。

**現状**: けテぶれ記録は localStorage + IDB のみ。端末を切り替えると消失するリスク。

**対処にはGAS側コード変更が必要**。`gas-code.gs` がリポジトリに無いため、ユーザーが Apps Script エディタからソースコピペで提供する必要あり。

### 🔴 課題3: GASのビューシート再構築が503/タイムアウト

- スプレッドシートを「見やすくする」ために `requestViewRebuild` を試行
- 全タイプ並行: タイムアウト
- 1タイプずつ・3回リトライ: 503エラー連発
- 原因: GAS の rate limit / quota / 一時不調
- **対処**: 時間を空けて再試行 / GAS quota 確認

### 🟡 課題4: gas-code.gs がリポジトリに無い

`setup-gas.html` の Step 2 で `fetch('gas-code.gs')` するが、ファイル無いため取得失敗。配布時にユーザーが GAS コードをコピーできない。

**対処**: ユーザーから現状のApps Scriptコード(コード.gs全文)を貰って `gas-code.gs` として同梱コミット。

---

## ユーザーが明言した本格化の要望

> 「本格的に他の先生たちにも配布することを想定して、アプリを安定化させたい。記録を守るためにできる仕組みを全力で確立してほしい。ただし、他のどの先生でもできる汎用性があるとうれしい。」

> 「何で開いても同じ記録が見れる/記録される/反映される、同期問題は解決した？」

→ 配布視野での全力安定化が継続課題。

---

## 提案して合意済みの Phase 2 ロードマップ

### A. ローカル変更だけで実装可能（次回commitの本命）

| # | 機能 | 効果 |
|---|------|-----|
| A1 | **健全性ダッシュボード** | トップに「ローカル/IDB/クラウド」3層件数を常時表示、緑/黄/赤で異常即視認 |
| A2 | **整合性アラート** | 件数20%減、3層乖離、pendingQueue滞留を能動警告 |
| A3 | **診断ボタン** | 設定タブに「📊診断レポート」ボタン、SW状態・各層件数・lastPull・pendingQueueを1画面表示 |
| A4 | **配布版用 自動診断** | 起動時、設定が壊れていたらonboardingウィザードへ誘導 |

### B. GAS側変更が必要（GAS再デプロイ要、`gas-code.gs` 必須）

| # | 機能 |
|---|------|
| B1 | **けテぶれをGASに対応** ← 課題2の解決 |
| B2 | **GAS日次スナップショット** (Time-driven trigger) |
| B3 | **Google Drive 週次BU** (4つ目の独立保管場所) |

### C. 配布汎用性

| 項目 | 状態 |
|------|------|
| `mode: 'distribution'` ビルド | 既存 |
| `setup-gas.html` ウィザード | 既存だが gas-code.gs 不足 |
| **`gas-code.gs` をリポジトリに同梱** | ← 課題4 |
| API Key 各先生でランダム生成 | 既存(quickSetup関数で) |

---

## 当面の進め方（推奨）

自宅PCで再開時、以下の順:

1. ✅ `git pull --ff-only` で校務PC側の最新を取得 (53fc4d5, 2d680be)
2. ✅ 自宅PCのChromeで担任記録アプリを開き直す → SW更新 → v20260507d 反映
3. **個人ChromeでDevToolsの診断スクリプト実行** → 課題1の切り分け
4. **A1〜A4をまとめて実装** → 1回のcommitでPush
5. **現GAS code を Apps Script エディタからコピーして** `gas-code.gs` として保存・コミット (課題4・C対応)
6. B1〜B3を実装 (gas-code.gs に追加機能)
7. ユーザーがGAS再デプロイ → 自宅・校務両PCで動作確認

---

## スプレッドシート情報 (本日確認)

- **Sheet ID**: `1pQZcMFAal9kXrzYunmMgt3DiWO9dEguf4iNZv_4fk3w`
- **URL**: https://docs.google.com/spreadsheets/d/1pQZcMFAal9kXrzYunmMgt3DiWO9dEguf4iNZv_4fk3w/edit
- **Sheet名**: ★学級記録システムデータ
- **本日件数**: records=22 / praises=4 / evaluations=88 / aba=10 / kete=未対応

GAS Web App URL (個人版固定):
```
https://script.google.com/macros/s/AKfycby6OoIJ7xeWRw_7QfMElXRAOrTqb4HqwD6r-MSppY1oZ36jqYtEzufpfKNWFoS7-bpe/exec
APIキー: cLgXe27Zo-2w7cfL
```

---

## ファイル所在 (校務PC基準・自宅PCも同様の構造のはず)

| 役割 | パス |
|------|------|
| アプリ本体 | `~/quest-app/interaction-app/` |
| メイン | `app.js` |
| クラウド同期 | `cloud-sync.js` |
| IDB併用 | `idb-storage.js` (新規) |
| 復旧ツール | `recovery.html` |
| Service Worker | `service-worker.js` (`v20260507d`) |
| 配布セットアップ | `setup-gas.html` |
| 引き継ぎ(これ) | `~/quest-app/HANDOVER.md` |

校務PCのメモリ:
- `~/.claude/projects/C--Users-0248025/memory/tannin-app-recovery.md` (今日更新済)

---

## 自宅PCのClaudeへの伝言

このHANDOVER.mdを読んだ上で、ユーザーに対して:

1. 「校務PC側で `2d680be` まで進んでいます。自宅PCで `git pull` してください」
2. 「個人Chromeでの同期未確認状態を、まず診断スクリプトで切り分けたいです」
3. 「次の commit で Phase 2-A (A1〜A4) をまとめて実装したいですが、進めてよいですか？」

ユーザーの最優先は **配布視野での同期信頼性** です。
