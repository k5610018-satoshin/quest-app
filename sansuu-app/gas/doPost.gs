/**
 * doPost: 児童アプリからの書き込みを受け付ける
 *
 * リクエスト JSON:
 *   {
 *     "apiKey": "...",
 *     "table": "progress" | "learning_plans" | "interventions" | "challenges",
 *     "action": "insert" | "update",
 *     "data": { ... },
 *     "device_id": "chromebook-XX"
 *   }
 *
 * 動作:
 *   1) Spreadsheet の対応シートに行追加（ミラー）
 *   2) Supabase REST API へ INSERT/UPDATE
 *   3) 結果を JSON で返す
 *
 * 失敗時: Supabase が落ちていても Spreadsheet には残るため、後続のリカバリで救える
 */
function doPost(e) {
  try {
    checkAuth_(e);
    const body = JSON.parse(e.postData.contents);
    const table = body.table;
    const action = body.action || 'insert';
    const data = body.data || {};

    if (!CONFIG.SUPABASE_TABLES.includes(table)) {
      return jsonResponse_({ ok: false, error: 'invalid_table' });
    }

    // 1) Spreadsheet ミラー
    const sheetMirrorOk = mirrorToSheet_(table, action, data);

    // 2) Supabase 同期
    const supabaseResult = pushToSupabase_(table, action, data);

    return jsonResponse_({
      ok: true,
      sheet_mirror: sheetMirrorOk,
      supabase: supabaseResult,
      ts: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function mirrorToSheet_(table, action, data) {
  try {
    const ss = getSheet_();
    const sheetName = CONFIG.SHEET_NAMES[table];
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      const headers = Object.keys(data);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = headers.map(h => {
      const v = data[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    sheet.appendRow(row);
    return true;
  } catch (err) {
    Logger.log('mirrorToSheet error: ' + err);
    return false;
  }
}

function pushToSupabase_(table, action, data) {
  try {
    const url = getSupabaseUrl_() + '/rest/v1/' + table;
    const headers = {
      'apikey': getSupabaseKey_(),
      'Authorization': 'Bearer ' + getSupabaseKey_(),
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };
    const options = {
      method: action === 'update' ? 'patch' : 'post',
      headers: headers,
      payload: JSON.stringify(data),
      muteHttpExceptions: true
    };
    const res = UrlFetchApp.fetch(url, options);
    return { code: res.getResponseCode(), text: res.getContentText().substring(0, 200) };
  } catch (err) {
    Logger.log('pushToSupabase error: ' + err);
    return { code: 0, text: String(err) };
  }
}
