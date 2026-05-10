#!/usr/bin/env bash
# ==========================================================================
# build.sh — 担任記録アプリ ビルド/バージョン同期スクリプト
#
# 使い方:
#   ./build.sh bump                # CACHE_VERSIONを今日の日付で自動bump
#   ./build.sh bump v20260601a     # 指定versionにbump
#   ./build.sh dist <out_dir>      # 配布版を out_dir にビルド (mode='distribution')
#   ./build.sh check               # バージョン整合性チェックのみ
#
# 同期対象:
#   - service-worker.js  : const CACHE_VERSION = 'vXXX';
#   - config.js          : cacheVersion: 'vXXX'
#   - index.html         : ?v=vXXX  (script src の query string 全て)
# ==========================================================================
set -euo pipefail
# Pythonの日本語print/書き出しが cp932環境でも落ちないように
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CMD="${1:-}"
ARG="${2:-}"

usage() {
  grep -E '^#( |$)' "$0" | sed 's/^# \?//'
  exit 1
}

# --- 現在のバージョン取得 ---
current_sw_version() {
  grep -oE "CACHE_VERSION = '[^']+'" service-worker.js | head -1 | sed "s/CACHE_VERSION = '//" | sed "s/'//"
}
current_config_version() {
  grep -oE "cacheVersion: '[^']+'" config.js | head -1 | sed "s/cacheVersion: '//" | sed "s/'//"
}
current_html_versions() {
  grep -oE '\?v=[^"]+' index.html | sort -u
}

# --- 自動採番: 今日の日付 + 真のbase26連番(a,b,…,z,aa,ab,…,zz,aaa,…) ---
generate_next_version() {
  local today
  today="$(date +v%Y%m%d)"
  local current
  current="$(current_sw_version)"
  if [[ "$current" != "${today}"* ]]; then
    echo "${today}a"
    return
  fi
  local suffix="${current#${today}}"
  if [[ ! "$suffix" =~ ^[a-z]+$ ]]; then
    echo "${today}a"
    return
  fi
  # base26 加算 (a〜z → 1〜26として、最下位から繰上げ)
  python - "$today" "$suffix" <<'PY'
import sys
today, suffix = sys.argv[1], sys.argv[2]
chars = list(suffix)
i = len(chars) - 1
carry = 1
while i >= 0 and carry:
    v = ord(chars[i]) - ord('a') + carry
    if v >= 26:
        chars[i] = 'a'
        carry = 1
    else:
        chars[i] = chr(ord('a') + v)
        carry = 0
    i -= 1
if carry:
    chars.insert(0, 'a')
print(today + ''.join(chars))
PY
}

cmd_check() {
  local sw cfg
  sw="$(current_sw_version)"
  cfg="$(current_config_version)"
  echo "service-worker.js  CACHE_VERSION: $sw"
  echo "config.js          cacheVersion : $cfg"
  echo "index.html         ?v= entries  :"
  current_html_versions | sed 's/^/  /'
  if [[ "$sw" != "$cfg" ]]; then
    echo "⚠ SW と config.js のバージョンが不一致" >&2
    return 1
  fi
  local html_versions
  html_versions="$(current_html_versions | sort -u | wc -l)"
  if [[ "$html_versions" != "1" ]]; then
    echo "⚠ index.html に複数の ?v= バージョンが混在" >&2
    return 1
  fi
  local html_v
  html_v="$(current_html_versions | head -1 | sed 's/?v=//')"
  # vプレフィックスを正規化して比較 (index.htmlは vなし採用)
  local sw_short="${sw#v}"
  local html_v_short="${html_v#v}"
  if [[ "$html_v_short" != "$sw_short" ]]; then
    echo "⚠ index.html ?v=$html_v が SW $sw と不一致" >&2
    return 1
  fi
  echo "✓ 全ファイル整合 ($sw)"
}

cmd_bump() {
  local new_v="${ARG:-}"
  if [[ -z "$new_v" ]]; then
    new_v="$(generate_next_version)"
  fi
  echo "新バージョン: $new_v"
  local sw_old cfg_old
  sw_old="$(current_sw_version)"
  cfg_old="$(current_config_version)"
  # service-worker.js
  sed -i.bak "s/CACHE_VERSION = '[^']*'/CACHE_VERSION = '$new_v'/" service-worker.js
  # config.js
  sed -i.bak "s/cacheVersion: '[^']*'/cacheVersion: '$new_v'/" config.js
  # index.html: 全ての ?v=XXX を置換 (vプレフィックスは付けず日付部分のみ)
  local new_v_short="${new_v#v}"
  sed -i.bak "s/?v=v\?[a-zA-Z0-9_-]*/?v=$new_v_short/g" index.html
  rm -f service-worker.js.bak config.js.bak index.html.bak
  echo "✓ 更新完了:"
  echo "  service-worker.js: $sw_old → $new_v"
  echo "  config.js        : $cfg_old → $new_v"
  echo "  index.html       : ?v= 全て → $new_v"
  cmd_check
}

cmd_dist() {
  local out_dir="${ARG:-../dist}"
  if [[ -z "$out_dir" ]]; then
    echo "使い方: ./build.sh dist <out_dir>" >&2
    exit 1
  fi
  echo "配布版を $out_dir に生成中..."
  mkdir -p "$out_dir"
  # 配布対象ファイル（個人専用ファイルは除外）
  local files=(
    index.html styles.css service-worker.js manifest.json
    config.js students.js eval-data.js eval-data-extra.js
    idb-storage.js app.js cloud-sync.js health-monitor.js
    analytics-plus.js dashboard-overview.js seating-planner.js
    seating-correlation.js centrality-extra.js print-report.js
    search-bar.js templates.js photo-library.js voice-memo.js
    ai-insights.js extra-features.js onboarding-wizard.js
    icon-192.png icon-512.png
    setup-gas.html gas-code.gs gas-appsscript.json
    diagnostic.html recovery.html auto-sync.html
    README.md
  )
  for f in "${files[@]}"; do
    if [[ -f "$f" ]]; then
      cp "$f" "$out_dir/"
    else
      echo "⚠ 不在: $f"
    fi
  done
  # 配布版に変換: mode='distribution', defaultSync=空, 個人defaultClassId空欄
  python - "$out_dir" <<'PY'
import re, sys, os, glob
out = sys.argv[1]

def transform(path, fn):
    with open(path, 'r', encoding='utf-8') as f:
        txt = f.read()
    new_txt = fn(txt)
    if new_txt != txt:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_txt)
        return True
    return False

# 1) config.js: mode/defaultSync/defaultClassId/aiFukutannin/seatingSheetSync
def fix_config(t):
    t = re.sub(r"mode:\s*'personal'", "mode: 'distribution'", t)
    t = re.sub(r"defaultSync:\s*\{[^}]*\}", "defaultSync: { endpoint: '', apiKey: '' }", t, flags=re.DOTALL)
    t = re.sub(r"defaultClassId:\s*'[^']*'", "defaultClassId: ''", t)
    t = re.sub(r"aiFukutannin:\s*true", "aiFukutannin: false", t)
    t = re.sub(r"seatingSheetSync:\s*true", "seatingSheetSync: false", t)
    return t
transform(os.path.join(out, 'config.js'), fix_config)
print("[OK] config.js -> distribution mode")

# 2) students.js: 児童個人情報を完全に空化(空配列 + クラス情報空)
#    実児童名・配慮メモが配布先に漏れるのを絶対に防ぐ
students_js = os.path.join(out, 'students.js')
if os.path.exists(students_js):
    stub = '''/* eslint-disable */
'use strict';
// 配布版: 児童データは空。各先生がアプリの「設定 → 名簿管理」で入力する。
window.APP_DATA = {
  version: 1,
  class: '',
  school: '',
  year: new Date().getFullYear(),
  students: [],
  scenes: [
    { id: 'morning',  label: '朝の時間',     category: 'free' },
    { id: 'class1',   label: '1時間目',      category: 'class' },
    { id: 'class2',   label: '2時間目',      category: 'class' },
    { id: 'break1',   label: '中休み',       category: 'break' },
    { id: 'class3',   label: '3時間目',      category: 'class' },
    { id: 'class4',   label: '4時間目',      category: 'class' },
    { id: 'lunch',    label: '給食',         category: 'meal' },
    { id: 'cleanup',  label: '掃除',         category: 'duty' },
    { id: 'class5',   label: '5時間目',      category: 'class' },
    { id: 'class6',   label: '6時間目',      category: 'class' },
    { id: 'after',    label: '放課後',       category: 'free' },
    { id: 'event',    label: '行事',         category: 'event' },
    { id: 'other',    label: 'その他',       category: 'other' }
  ],
  activities: [
    'おしゃべり', '一緒に遊ぶ', '助け合い', '相談', '注意', 'ふざけ合い',
    'けんか', '譲る', '教える', '学ぶ', '応援', '無視', '巻き込み', 'その他'
  ]
};
'''
    with open(students_js, 'w', encoding='utf-8') as f:
        f.write(stub)
    print("[OK] students.js -> empty stub (個人情報削除済)")

# 3) students.json も空化(あれば)
students_json = os.path.join(out, 'students.json')
if os.path.exists(students_json):
    with open(students_json, 'w', encoding='utf-8') as f:
        f.write('[]')
    print("[OK] students.json -> []")

# 4) クラス名/学校名/個人名のハードコードを一般化
def fix_personal(t):
    t = t.replace('5年4組', '◯年◯組')
    t = t.replace('5-4-2026', '')
    # CSV プレースホルダの汎用例 (佐藤太郎/鈴木花子は誤解を招くので置換)
    t = t.replace('佐藤太郎', '山田太郎').replace('さとうたろう', 'やまだたろう')
    t = t.replace('鈴木花子', '田中花子').replace('すずきはなこ', 'たなかはなこ')
    # 「佐藤先生」「佐藤慎之介」等 → 一般化
    t = re.sub(r'佐藤(慎之介|先生|シンノスケ|しんのすけ)', '担任', t)
    # 単独の「佐藤」も置換 (識別文字列内のみ)
    t = re.sub(r'(?<![一-龯])佐藤(?![一-龯])', '担任', t)
    return t

# 全テキストファイルに対して fix_personal を適用
text_extensions = ('.html', '.js', '.css', '.gs', '.md', '.json', '.txt')
applied = []
for p in glob.glob(os.path.join(out, '*')):
    if not os.path.isfile(p): continue
    if not p.endswith(text_extensions): continue
    if transform(p, fix_personal):
        applied.append(os.path.basename(p))
if applied:
    print("[OK] 個人情報除去:", ', '.join(applied))

# 5) 個人情報チェック (失敗時はerror)
check_targets = glob.glob(os.path.join(out, '*'))
suspicious_terms = ['5年4組', '5-4-2026', '佐藤慎之介', 'satoshin', '0248025@k.nagoya-c.ed.jp']
errors = []
for p in check_targets:
    if not os.path.isfile(p): continue
    if p.endswith('.png') or p.endswith('.gif'): continue
    try:
        with open(p, 'r', encoding='utf-8') as f:
            content = f.read()
        for term in suspicious_terms:
            if term in content:
                errors.append((os.path.basename(p), term))
    except Exception:
        pass

if errors:
    print("\n[ERROR] 個人情報残存検出:")
    for fn, term in errors:
        print(f"  {fn}: '{term}' が含まれます")
    sys.exit(1)
else:
    print("\n[OK] 個人情報チェック: クリーン")
PY
  echo "[OK] 配布版生成完了: $out_dir"
  echo "  確認: 各先生は setup-gas.html を開いて自分のGAS設定を作成"
  echo "  注意: 名簿は 設定 → 名簿管理 で各先生がCSV import or 手入力"
}

case "$CMD" in
  bump)  cmd_bump ;;
  check) cmd_check ;;
  dist)  cmd_dist ;;
  *)     usage ;;
esac
