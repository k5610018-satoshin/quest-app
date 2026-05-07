# 担任記録アプリ 引き継ぎノート (2026-05-07 後半: 全力安定化フェーズ)

> 最新コミット: `da8bc38` Phase 2-A 全実装 + B2/B3 GAS自動BU + gas-code.gs 同梱

## 自宅PC・校務PC 両方でやること

```bash
cd ~/quest-app
git pull --ff-only
```

ブラウザのアプリをハードリロード（Ctrl+Shift+R）→ SW更新 → `v20260507f` 反映。

---

## 完了した実装（Phase 2-A + B2/B3）

### A. クライアント側（自動・即時有効）

| # | 機能 | 場所 |
|---|------|------|
| A1 | ヘッダ右に **L1/L2/L3 件数バッジ常時表示**。乖離時に黄/赤＋点滅 | health-monitor.js |
| A2 | 件数20%減・3層乖離・pendingQueue滞留 を **能動 toast 警告** | health-monitor.js |
| A3 | 設定タブ「📊 診断レポート」モーダル（3層件数表+全件pull/再送/コピー/詳細リンク） | health-monitor.js |
| A4 | 配布版で syncConfig 未設定時に **setup-gas.html ウィザード自動誘導** | health-monitor.js |
| A5 | 「🔍 同期診断＆コピー」ボタン → DevTools貼付スクリプト相当を UI化、結果クリップボード | health-monitor.js |

ヘッダの3層バッジをクリックするだけで A3 モーダルが開きます。

### B. GAS側（**手動1クリック有効化が必要**）

| # | 機能 | 関数名 |
|---|------|--------|
| B2 | 毎日03:00 snapshot＋件数大幅減でメール警告（90日retention） | `installDailySnapshotTrigger` |
| B3 | 毎週日曜04:00 Drive コピー（12週retention） | `installWeeklyBackupTrigger` |
| 一括 | 上記2つを同時設定＋初回snapshot取得 | `setupAllAutoBackups` |

#### 有効化手順（1分・1度だけ）

1. https://script.google.com/d/1ThCRpKVirUsUxOtsgN0CKLxijqeUNVzmT5SQm6j2hvl2y-sCfYgXpkK-/edit を開く
2. 関数選択ドロップダウンで `setupAllAutoBackups` を選択
3. 「実行」ボタン → 初回は **権限承認**（Drive/メール/トリガー）
4. 「OK」アラートが出れば完了

または、スプレッドシートを開くと **「🛡 自動バックアップ」メニュー** が表示されるので、そこから「🚀 全部設定する（推奨）」を1クリックでもOK。

---

## 残タスク（ユーザー判断 or 別途）

### 個人Chrome同期問題（HANDOVER前半より）
校務PC個人Chromeでの同期未確認問題は、新設の **「🔍 同期診断＆コピー」ボタン**（設定→クラウド同期）で1クリック診断可。コンソール＋クリップボードに出力される。

### スプレッドシート診断
新設の **「📊 診断レポート」モーダル**（同上）で 3層件数を集約表示。乖離があればワンクリックで全件pull。

---

## ファイル構成（最新）

```
interaction-app/
├── app.js                  ─ メイン
├── cloud-sync.js           ─ クラウド同期
├── idb-storage.js          ─ IndexedDB二重化
├── health-monitor.js       ─ 健全性監視＋診断（Phase 2-A NEW）
├── service-worker.js       ─ オフラインキャッシュ (v20260507f)
├── recovery.html           ─ 独立復旧ツール
├── diagnostic.html         ─ 詳細診断ページ
├── gas-code.gs             ─ GAS最新版同梱（setup-gas.html がfetch可能）
├── setup-gas.html          ─ 配布用セットアップウィザード
└── ...
```

## スプレッドシート情報（変更なし）

- **Sheet ID**: `1pQZcMFAal9kXrzYunmMgt3DiWO9dEguf4iNZv_4fk3w`
- **Sheet名**: ★学級記録システムデータ
- GAS Script ID: `1ThCRpKVirUsUxOtsgN0CKLxijqeUNVzmT5SQm6j2hvl2y-sCfYgXpkK-`

---

## 自動バックアップ層構成（多層防御の最新像）

```
[ユーザー操作]
    │
    ▼
L0  state.ui (in-memory)
    │  saveState()
    ├──▶ L1 localStorage 'interactionApp_v1'           ← マルチタブ防衛・shrink検知
    ├──▶ L2 IndexedDB    'interactionApp/appState'     ← 起動時自動マージ復元
    │
    │  pushFromGas / pendingQueue
    └──▶ L3 GoogleSpreadsheet (machine-readable + view_*)
            │
            │  毎日03:00 takeDailySnapshot
            ├──▶ L3.1 'snapshots' シート（90日件数履歴＋警告メール）
            │
            │  毎週日04:00 takeWeeklyBackup
            └──▶ L3.2 Google Drive '担任記録アプリ_バックアップ' フォルダ（12週コピー）
```

5層 (L0-L3.2) で守る構造。L3 が消えても L3.2 から復元可、L1 が消えても L2 / L3 から自動復元、UI 件数バッジで即視認。
