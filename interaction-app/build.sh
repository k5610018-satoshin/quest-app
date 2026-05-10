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

# --- 自動採番: 今日の日付 + 連番(a,b,c…) ---
generate_next_version() {
  local today
  today="$(date +v%Y%m%d)"
  local current
  current="$(current_sw_version)"
  if [[ "$current" == "${today}"* ]]; then
    local suffix="${current#${today}}"
    if [[ "$suffix" =~ ^[a-z]$ ]]; then
      local next_char
      next_char="$(echo "$suffix" | tr 'a-y' 'b-z')"
      if [[ "$suffix" == "z" ]]; then
        echo "${today}aa"
      else
        echo "${today}${next_char}"
      fi
    else
      echo "${today}a"
    fi
  else
    echo "${today}a"
  fi
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
  if [[ "$html_v" != "$sw" ]]; then
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
  # index.html: 全ての ?v=XXX を置換
  sed -i.bak "s/?v=[a-zA-Z0-9_-]*/?v=$new_v/g" index.html
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
  python - "$out_dir/config.js" <<'PY'
import re, sys
p = sys.argv[1]
with open(p, 'r', encoding='utf-8') as f:
    txt = f.read()
# mode を distribution に
txt = re.sub(r"mode:\s*'personal'", "mode: 'distribution'", txt)
# defaultSync を空に
txt = re.sub(
    r"defaultSync:\s*\{[^}]*\}",
    "defaultSync: { endpoint: '', apiKey: '' }",
    txt,
    flags=re.DOTALL
)
# defaultClassId を空に
txt = re.sub(r"defaultClassId:\s*'[^']*'", "defaultClassId: ''", txt)
# aiFukutannin / seatingSheetSync を false に
txt = re.sub(r"aiFukutannin:\s*true", "aiFukutannin: false", txt)
txt = re.sub(r"seatingSheetSync:\s*true", "seatingSheetSync: false", txt)
with open(p, 'w', encoding='utf-8') as f:
    f.write(txt)
print("✓ config.js を配布版に変換")
PY
  echo "✓ 配布版生成完了: $out_dir"
  echo "  確認: 各先生は setup-gas.html を開いて自分のGAS設定を作成"
}

case "$CMD" in
  bump)  cmd_bump ;;
  check) cmd_check ;;
  dist)  cmd_dist ;;
  *)     usage ;;
esac
