# 算数 自由進度学習アプリ (sansuu-app) v0.1

5年4組（28名）で算数の自由進度学習を運用するためのデジタル基盤。
樋口万太郎の自由進度学習（4段階フロー＋学習の手引き＋自己評価＋原因帰属）を再現。

詳細プラン: `C:\Users\K5610\.claude\plans\rag-ui-5-effervescent-mountain.md`

---

## ファイル構成

```
sansuu-app/
├── index.html              児童アプリ（PWA、3タブ：手引き・きょう・振り返り）
├── styles.css
├── app.js                  state管理＋イベント
├── cloud-sync.js           GAS↔Supabase 同期（pendingQueue対応）
├── idb-storage.js          L2 IndexedDB ラッパー
├── service-worker.js       PWA キャッシュ
├── manifest.json
├── setup-gas.html          GAS同期設定ページ（先生専用）
├── data/
│   ├── unit_master.json    5年算数 全18単元 152時間 89項目
│   └── prompts.js          静的問いかけ・作戦選択肢
├── supabase/
│   ├── config.toml
│   ├── .env.example
│   ├── setup.ps1           プロジェクト作成スクリプト（PowerShell）
│   └── migrations/
│       └── 20260508120000_init_sansuu_app.sql  6テーブル+3ビュー
├── gas/
│   ├── config.gs / doPost.gs / doGet.gs / snapshot.gs / evidence.gs
│   ├── appsscript.json
│   └── .clasp.json
├── migrations/             Supabase配下のシンボル（参考用）
└── README.md
```

---

## v0.1 の機能（実装済）

### 児童側
- 出席番号タップでログイン（番号1〜28）
- 単元セレクトで18単元を切替、進度バー＋◎○△分布表示
- **[手引き]** タブ：単元目標・基本/応用/チャレンジの項目リスト・各項目の振り返り状況表示
- **[きょう]** タブ：今日±2日のカレンダー＋カード（◎○△ワンタップで振り返りタブへジャンプ）
- **[振り返り]** タブ：項目選択→◎○△→原因タグ複数選択→次の作戦
- フッタ常設：ヘルプ・教えに行く・自作問題・攻略文（樋口式上位層対応）
- localStorage保存＋GAS同期（pendingQueue でオフライン耐性）

### 教師・運用側
- Supabase 6テーブル＋3ビュー（v_progress_latest / v_unit_summary / v_alert_consecutive_c）
- GAS doPost: 児童書込→Spreadsheet+Supabase REST 両更新
- GAS doGet: heatmap/alerts/summary/units/students/progress
- 日次03:00スナップショット（90日保持）
- 観点別評価アプリ向け evidence JSON 出力

### 連携スクリプト（scripts/sansuu_app_sync.py）
- `--all-init` : 名簿＋単元マスタ一括投入
- `--import-roster` : student-cards-enriched.json → students 表
- `--import-units` : unit_master.json → units 表
- `--import-plan FILE.docx` : 大計画シート抽出（手動補正前提）
- `--enrich` : 進度サマリ → student-cards-enriched.json の sansuu_progress
- `--export-evidence UNIT_ID` : 単元末evidence JSON

---

## v0.1 セットアップ手順

### 1. Supabase プロジェクト作成
```powershell
# Personal Access Token を発行: https://supabase.com/dashboard/account/tokens
$env:SUPABASE_ACCESS_TOKEN = 'sbp_xxx'
cd C:\Users\K5610\quest-app\sansuu-app\supabase
.\setup.ps1
# .env が生成されるので、anon_key と service_role_key を貼り付ける
```

### 2. GAS プロジェクト作成
```bash
cd C:/Users/K5610/quest-app/sansuu-app/gas
clasp create --type webapp --title "gas-sansuu-bridge"
clasp push
clasp deploy --description "v0.1"
# 出てきた Web App URL を控える
```

GAS エディタで Properties に以下を設定:
- `SUPABASE_URL` (= .env と同じ)
- `SUPABASE_SERVICE_KEY` (service_role_key)
- `GAS_BRIDGE_API_KEY` (32文字程度のランダム文字列、自分で発行)
- `SHEET_ID` (新規Spreadsheetを作って ID を貼り付け)

GASエディタで `setupSnapshotTrigger()` を一度実行して daily 03:00 トリガーを登録。

### 3. データ初期投入
```powershell
$env:PYTHONIOENCODING = 'utf-8'
python C:/Users/K5610/scripts/sansuu_app_sync.py --all-init
```

### 4. 児童アプリの起動・GAS同期設定
```powershell
# ローカルプレビュー
cd C:\Users\K5610\quest-app\sansuu-app
python -m http.server 8080
# ブラウザで http://localhost:8080/setup-gas.html を開いて
# GAS Web App URL と GAS_BRIDGE_API_KEY を入力 → 接続テスト
# OK が出たら http://localhost:8080/index.html を開く
```

### 5. 公開（GitHub Pages）
quest-app が既に GitHub Pages で公開されているなら、サブパス `/sansuu-app/` で同居させる。

---

## v0.1 動作検証チェックリスト

- [ ] `python sansuu_app_sync.py --help` が表示される（実行済 ✅）
- [ ] `unit_master.json` が18単元・152時間・89項目で読める（実行済 ✅）
- [ ] Supabase プロジェクトが作成され、6テーブル＋3ビューが存在する
- [ ] GAS Web App が公開され、`?action=units&key=...` で units が返る
- [ ] `--all-init` で students 28件・units 18件が Supabase に投入される
- [ ] 児童アプリで番号1ログイン→単元選択→振り返り入力→保存
- [ ] Supabase progress テーブルに1件記録される
- [ ] Spreadsheet progress シートにも同じ1件がミラーされる
- [ ] Wi-Fi切断→入力→Wi-Fi復帰で pendingQueue がフラッシュされる
- [ ] 同じ番号で再ログインしたら前の振り返りが◎○△で復元表示される

---

## v0.2 / v1.0 の追加機能（実装済）

### 教師管理画面 (`teacher.html`)
- ヘッダ：[👀ライブ ↔ 🌙放課後] トグル、単元セレクト、アラートバッジ、◎○△進度カウンタ
- ライブモード：ヒートマップ／フィード／座席表／アラート（10秒ポーリング自動更新）
- 放課後モード：到達度マトリクス／伸びカード／補充候補（過半数△を自動抽出）／エクスポート
- 児童詳細パネル：ピン・コメント・AI声かけ案ボタン → interventions テーブル

### 児童側ヘルプ改修 (`index.html` モーダル)
- ヘルプボタン：教科書→ノート→友達→先生 の4段階カード表示
- 「先生に質問」ボタン → interventions に kind=help_received で記録
- 「教えに行く」モーダル：相手の番号タップ＋内容入力 → challenges に teach_friend で記録

### スクリプト追加
- `scripts/sansuu_app_export_daikeikaku.py --unit UNIT_ID` — 単元末マトリクスをWord(A4横)出力。generate_daikeikaku_may.py と同じ書式系（◎○△、配色#D9E5F7、過半数△ハイライト＋補充候補リスト）
- `scripts/generate_sansuu_intro_pptx.py` — 児童向け説明スライド「自由進度学習って何？」12枚PPTX生成（UDデジタル教科書体、淡い青系配色）

### v1.0 で未実装（v2.0以降）
- AI問いかけ（教師画面のClaude API オプトイン）
- 観点別評価アプリへのGAS doPost 自動送信（手動 `--export-evidence` は v0.1 で実装済）
- 樋口万太郎 NotebookLM 連携（教師の手引き入力時補助）

---

## トラブルシュート

- 児童アプリで「単元データを読み込めませんでした」: data/unit_master.json のパスを確認
- GAS同期が動かない: setup-gas.html で「接続テスト」を実行、エラー内容を確認
- pendingQueue が溜まり続ける: setup-gas.html の「クリア」を使うか、localStorage `sansuuApp_pendingQueue` を消す
- Supabase REST 401: service_role_key を再確認、apikey ヘッダーが正しいか

---

## 参考

- プラン全文: `~/.claude/plans/rag-ui-5-effervescent-mountain.md`
- 樋口万太郎の核心: 「その自由進度学習間違っていませんか」「自由進度の作り方×一斉指導の作り方」
- UI設計原則: `~/.claude/projects/C--Users-K5610/memory/feedback_app-design-philosophy.md`
- 大計画シート互換: `~/.claude/projects/C--Users-K5610/memory/daikeikaku-sheet-format.md`
