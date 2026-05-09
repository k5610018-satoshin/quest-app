/**
 * evidence.gs: 観点別評価アプリへのエビデンスJSON出力
 *
 * GET ?action=evidence&unit_id=...&key=...
 *   → A/B/C 正規化された evidence JSON を返す
 *
 * evaluation-app の取り込み形式に揃える:
 *   {
 *     "subject": "sansuu",
 *     "unit_id": "...",
 *     "unit_name": "...",
 *     "students": [
 *       { "student_id": "...", "items": [...], "summary": {a, b, c} }
 *     ]
 *   }
 */
function buildEvidenceJSON(unitId) {
  if (!unitId) throw new Error('unit_id required');

  const units = readSheet_('units').filter(u => u.unit_id === unitId);
  if (units.length === 0) throw new Error('unit not found: ' + unitId);
  const unit = units[0];

  const summary = buildUnitSummary_(unitId);
  return {
    subject: unit.subject || 'sansuu',
    grade: unit.grade,
    unit_id: unit.unit_id,
    unit_name: unit.name,
    generated_at: new Date().toISOString(),
    students: summary.map(s => ({
      student_id: s.student_id,
      items: s.items_detail,
      summary: { A: s.count_a, B: s.count_b, C: s.count_c, total: s.items_done }
    }))
  };
}

/**
 * doGet 経由で evidence を返す処理は doGet.gs に統合済み
 * ここでは「観点別評価アプリにPOST送信」する関数を提供
 */
function pushEvidenceToEvaluationApp(unitId) {
  const evidence = buildEvidenceJSON(unitId);
  const evaluationEndpoint = getProp_('EVALUATION_APP_ENDPOINT');
  const evaluationKey = getProp_('EVALUATION_APP_KEY');

  if (!evaluationEndpoint) {
    Logger.log('EVALUATION_APP_ENDPOINT not set; skipping push');
    return { ok: false, reason: 'endpoint_missing' };
  }

  const res = UrlFetchApp.fetch(evaluationEndpoint, {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    payload: JSON.stringify({
      apiKey: evaluationKey,
      action: 'import_evidence',
      data: evidence
    }),
    muteHttpExceptions: true
  });
  return { ok: res.getResponseCode() === 200, code: res.getResponseCode() };
}
