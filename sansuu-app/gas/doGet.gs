/**
 * doGet: 教師管理画面・児童アプリのデータ取得
 *
 * GET ?action=units&key=...               -> 全単元
 * GET ?action=progress&student_id=...     -> 児童の進度（最新）
 * GET ?action=heatmap&unit_id=...         -> 単元×全児童の最新進度（教師用）
 * GET ?action=alerts&key=...              -> 連続△アラート対象
 * GET ?action=summary&unit_id=...         -> 単元末集計
 */
function doGet(e) {
  try {
    checkAuth_(e);
    const action = e.parameter.action;

    switch (action) {
      case 'units':
        return jsonResponse_({ ok: true, data: readSheet_('units') });
      case 'students':
        return jsonResponse_({ ok: true, data: readSheet_('students') });
      case 'progress':
        return jsonResponse_({
          ok: true,
          data: readSheet_('progress').filter(r =>
            !e.parameter.student_id || r.student_id === e.parameter.student_id
          )
        });
      case 'heatmap':
        return jsonResponse_({
          ok: true,
          data: buildHeatmap_(e.parameter.unit_id)
        });
      case 'alerts':
        return jsonResponse_({
          ok: true,
          data: detectAlerts_()
        });
      case 'summary':
        return jsonResponse_({
          ok: true,
          data: buildUnitSummary_(e.parameter.unit_id)
        });
      case 'interventions':
        return jsonResponse_({
          ok: true,
          data: readSheet_('interventions').filter(r =>
            !e.parameter.student_id || r.student_id === e.parameter.student_id
          )
        });
      case 'challenges':
        return jsonResponse_({
          ok: true,
          data: readSheet_('challenges').filter(r =>
            !e.parameter.student_id || r.student_id === e.parameter.student_id
          )
        });
      default:
        return jsonResponse_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function readSheet_(name) {
  const sheet = getSheet_().getSheetByName(CONFIG.SHEET_NAMES[name]);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const range = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = range[0];
  return range.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function buildHeatmap_(unitId) {
  if (!unitId) return [];
  const progressRows = readSheet_('progress').filter(r => r.unit_id === unitId);
  // 最新だけ抽出（student_id × item_id で edited_at 降順 1件）
  const map = {};
  progressRows.forEach(r => {
    const key = r.student_id + '|' + r.item_id;
    if (!map[key] || (r.edited_at || '') > (map[key].edited_at || '')) {
      map[key] = r;
    }
  });
  return Object.values(map);
}

function detectAlerts_() {
  const rows = readSheet_('progress');
  const byStudent = {};
  rows.forEach(r => {
    if (!byStudent[r.student_id]) byStudent[r.student_id] = [];
    byStudent[r.student_id].push(r);
  });
  const alerts = [];
  for (const sid in byStudent) {
    const sorted = byStudent[sid].sort((a, b) =>
      (b.edited_at || '').localeCompare(a.edited_at || '')
    ).slice(0, 3);
    const cCount = sorted.filter(r => r.status === 'C').length;
    if (cCount >= 3) {
      alerts.push({
        student_id: sid,
        recent_c_count: cCount,
        last_edited: sorted[0].edited_at
      });
    }
  }
  return alerts;
}

function buildUnitSummary_(unitId) {
  if (!unitId) return [];
  const heat = buildHeatmap_(unitId);
  const summary = {};
  heat.forEach(r => {
    if (!summary[r.student_id]) {
      summary[r.student_id] = { student_id: r.student_id, count_a: 0, count_b: 0, count_c: 0, items_done: 0, items_detail: [] };
    }
    const s = summary[r.student_id];
    if (r.status === 'A') s.count_a++;
    else if (r.status === 'B') s.count_b++;
    else if (r.status === 'C') s.count_c++;
    s.items_done++;
    s.items_detail.push({ item_id: r.item_id, status: r.status });
  });
  return Object.values(summary);
}
