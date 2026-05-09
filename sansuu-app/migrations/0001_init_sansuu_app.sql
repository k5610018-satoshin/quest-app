-- ============================================================================
-- 算数 自由進度学習アプリ (sansuu-app) v0.1 初期マイグレーション
-- 対応プラン: C:\Users\K5610\.claude\plans\rag-ui-5-effervescent-mountain.md
-- 採択: ハイブリッド構成（児童書込→GAS doPost→Supabase REST + Spreadsheet 両更新）
-- 対応スキーマ: students / units / learning_plans / progress / interventions / challenges
-- ============================================================================

-- 1) 児童名簿
--    student-cards-enriched.json から sansuu_app_sync.py --import-roster で初期投入
--    name は実名がアプリ側に必要な場合のみ class-5-4-2026.md からマージ
CREATE TABLE IF NOT EXISTS students (
  student_id   TEXT PRIMARY KEY,                 -- 'todasho-2026-5-4-01' or UUID
  class_id     TEXT NOT NULL,                    -- '5-4-2026'
  number       INTEGER,                          -- 出席番号
  name         TEXT,                             -- 実名（任意、教師画面用）
  kana         TEXT,                             -- ふりがな（任意）
  active       BOOLEAN NOT NULL DEFAULT true,    -- 在籍フラグ
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_number ON students(class_id, number);

-- 2) 単元マスタ
--    unit_master.json から sansuu_app_sync.py --import-units で初期投入
--    items[] には { item_id, label, level, page } を JSONB で格納
CREATE TABLE IF NOT EXISTS units (
  unit_id         TEXT PRIMARY KEY,              -- 'sansuu-5-04-shousuu-kakezan'
  grade           INTEGER NOT NULL,              -- 5
  subject         TEXT NOT NULL DEFAULT 'sansuu',-- 将来の他教科展開のための列
  display_order   INTEGER,                       -- 単元順序（1〜18）
  term            INTEGER,                       -- 1/2/3 学期
  name            TEXT NOT NULL,                 -- '小数のかけ算'
  hours           INTEGER,                       -- 配当時数
  textbook_pages  TEXT,                          -- '啓林館p.44-65'
  items           JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{item_id, label, level, page}, ...]
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_units_grade_subject ON units(grade, subject, display_order);

-- 3) 児童の学習計画（大計画シート互換、単元×児童で1〜複数レコード）
--    plan_text は自由記述：「◎よかった作戦／△反省／★今回いかすこと」など
CREATE TABLE IF NOT EXISTS learning_plans (
  plan_id     BIGSERIAL PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  unit_id     TEXT NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
  plan_text   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plans_student_unit ON learning_plans(student_id, unit_id);

-- 4) 進度・自己評価（マトリクスの1セル＝1レコード）
--    status: A=◎ばっちり / B=○できた / C=△もう一回 (interaction-app/evaluation-app流儀のA/B/C)
--    1児童×1単元×1項目に複数レコード（時系列で挑戦回数分）
CREATE TABLE IF NOT EXISTS progress (
  progress_id    BIGSERIAL PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  unit_id        TEXT NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
  item_id        TEXT NOT NULL,                  -- units.items[].item_id
  status         TEXT NOT NULL CHECK (status IN ('A','B','C')),
  reason         TEXT,                           -- なぜそう自己評価したか（原因帰属）
  next_strategy  TEXT,                           -- 次の作戦
  reason_tags    JSONB DEFAULT '[]'::jsonb,      -- ['集中できた', '時間が足りない', ...] の配列
  strategy_tag   TEXT,                           -- 'もう1回'/'新しい作戦'/'次に進む'/'教えてもらう'
  device_id      TEXT,                           -- 競合解決ヒント用
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_progress_student_unit ON progress(student_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_progress_unit_item ON progress(unit_id, item_id);
CREATE INDEX IF NOT EXISTS idx_progress_edited ON progress(edited_at DESC);

-- 5) 教師の介入記録（ピン留め・声かけ・サジェスト）
--    ai_generated=true は Claude API による提案を採用したことを示す
CREATE TABLE IF NOT EXISTS interventions (
  intervention_id  BIGSERIAL PRIMARY KEY,
  teacher_id       TEXT NOT NULL DEFAULT 'sato',
  student_id       TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  unit_id          TEXT REFERENCES units(unit_id) ON DELETE SET NULL,
  comment          TEXT,
  kind             TEXT,                         -- 'pin' / 'voice' / 'help_received' / 'ai_suggest'
  ai_generated     BOOLEAN NOT NULL DEFAULT false,
  resolved         BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interventions_student ON interventions(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_unresolved ON interventions(resolved, created_at) WHERE resolved = false;

-- 6) 上位層対応の記録（樋口式：自作問題・攻略文・教えに行く）
CREATE TABLE IF NOT EXISTS challenges (
  challenge_id  BIGSERIAL PRIMARY KEY,
  student_id    TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  unit_id       TEXT NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('self_problem','strategy_text','teach_friend')),
  content       TEXT,                            -- 自作問題の本文／攻略文／教えた相手
  target_student_id TEXT REFERENCES students(student_id),  -- teach_friend の場合の相手
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_challenges_student ON challenges(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_challenges_unit_type ON challenges(unit_id, type);

-- ============================================================================
-- 集計用ビュー（教師管理画面のヒートマップ・到達度マトリクス用）
-- ============================================================================

-- 各児童×単元×項目で「最新の自己評価」だけを抽出
CREATE OR REPLACE VIEW v_progress_latest AS
SELECT DISTINCT ON (student_id, unit_id, item_id)
  student_id,
  unit_id,
  item_id,
  status,
  reason,
  next_strategy,
  reason_tags,
  strategy_tag,
  edited_at
FROM progress
ORDER BY student_id, unit_id, item_id, edited_at DESC;

-- 単元末集計（観点別評価アプリへのevidence送信用）
CREATE OR REPLACE VIEW v_unit_summary AS
SELECT
  p.student_id,
  p.unit_id,
  COUNT(*) FILTER (WHERE p.status = 'A') AS count_a,
  COUNT(*) FILTER (WHERE p.status = 'B') AS count_b,
  COUNT(*) FILTER (WHERE p.status = 'C') AS count_c,
  COUNT(*) AS items_done,
  jsonb_agg(jsonb_build_object('item_id', p.item_id, 'status', p.status) ORDER BY p.item_id) AS items_detail
FROM v_progress_latest p
GROUP BY p.student_id, p.unit_id;

-- 連続△検出（教師アラート用）
CREATE OR REPLACE VIEW v_alert_consecutive_c AS
WITH ranked AS (
  SELECT
    student_id,
    unit_id,
    item_id,
    status,
    edited_at,
    ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY edited_at DESC) AS rn
  FROM v_progress_latest
)
SELECT
  student_id,
  COUNT(*) FILTER (WHERE status = 'C' AND rn <= 3) AS recent_c_count,
  MAX(edited_at) AS last_edited
FROM ranked
GROUP BY student_id
HAVING COUNT(*) FILTER (WHERE status = 'C' AND rn <= 3) >= 3;

-- ============================================================================
-- Row Level Security（学校内利用前提のため、当面は無効化／anon keyフルアクセス）
-- 将来的に学級境界が必要になったときに enable RLS する
-- ============================================================================
-- ALTER TABLE students ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE units ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE learning_plans ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
