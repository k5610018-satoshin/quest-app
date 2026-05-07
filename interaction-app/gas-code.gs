/**
 * gas-interaction-sync / code.gs
 * 5年4組 交友関係記録アプリ — GASバックエンド
 *
 * シート: records
 *   列: id, timestamp, date, scene, category, mode, subject,
 *       members (JSON文字列), special, activity, note,
 *       deviceId, synced_at, deleted
 *
 * Script Properties (GASコンソール > プロジェクトの設定 > スクリプトプロパティ):
 *   API_KEY  : 任意の文字列（例: "interactionXXXXXX"）
 *   SHEET_ID : （空にするとスクリプトに紐付いたSSを自動生成）
 */

'use strict';

// ===== 定数 =====
var SHEET_NAME = 'records';
var COLS = ['id','timestamp','date','scene','category','mode',
            'subject','members','special','activity','note',
            'deviceId','synced_at','deleted'];

var PRAISE_SHEET = 'praises';
var PRAISE_COLS = ['id','timestamp','date','studentId','content','scene',
                   'deviceId','synced_at','deleted'];

var EVAL_SHEET = 'evaluations';
var EVAL_COLS = ['id','timestamp','date','studentId','subjectId','unitId',
                 'viewpoint','grade','scale','evidences_json','note','deviceId','synced_at','deleted'];

var ABA_SHEET = 'aba_records';
var ABA_COLS = ['id','timestamp','date','studentId','slot','subject','weather','behaviors',
                'targetStudentIds','antecedent','consequence','response','deviceId','synced_at','deleted'];

var SEATING_SHEET = 'seating_snapshots';
var SEATING_COLS = ['id','date','label','groups_json','deviceId','synced_at','deleted'];

// けテぶれ記録 (新規追加 - これまでGAS同期していなかった)
var KETEBURE_SHEET = 'ketebure_records';
var KETEBURE_COLS = ['id','timestamp','date','studentId','type','rating','aspects_json','notes','deviceId','synced_at','deleted'];

// 名簿 (児童ID→名前変換用): 人間用ビューシートが児童名解決に使う
var ROSTER_SHEET = 'roster';
var ROSTER_COLS = ['id','name','kana','watch','highlight','updated_at'];

// 人間用ビューシート（マシン用シートから自動生成 / 編集禁止）
var VIEW_SHEET_RECORDS = 'view_交友関係';
var VIEW_SHEET_PRAISES = 'view_ほめたい';
var VIEW_SHEET_EVALS   = 'view_評価';
var VIEW_SHEET_ABA     = 'view_ABA';
var VIEW_SHEET_KETE    = 'view_けテぶれ';

// けテぶれ観点ID→ラベル変換
var KETE_ASPECT_LABELS = {
  'ke': '計画', 'te': 'テスト', 'bu': '分析', 're': '練習',  // 宿題
  'kokoro': '心構え', 'tsugi': '次へ'                          // 生活 (ke/buは共通)
};
var ABA_BEHAVIOR_LABELS = {
  'leave': '離席', 'runaway': '飛び出し', 'verbal': '暴言', 'physical': '暴力',
  'complain': '文句', 'destroy': '破壊', 'hitobj': '物に当たる', 'sleep': '寝る',
  'reading': '読書', 'refuse': '課題放棄', 'shout': '叫ぶ', 'cry': '泣く',
  'sulk': 'すねる', 'other': 'その他'
};
var SCENE_LABELS = {
  'morning': '朝', 'recess1': '中休み', 'lunch': '昼休み',
  'cleaning': '掃除', 'after': '放課後', 'lesson': '授業中'
};
var EVIDENCE_LABELS = {
  'observation': '行動観察', 'notebook': 'ノート', 'product': '成果物', 'other': 'その他'
};

// 教科id → 日本語シート名
var SUBJECT_LABELS = {
  'kokugo': '国語', 'sansu': '算数', 'rika': '理科', 'shakai': '社会',
  'taiiku': '体育', 'zukou': '図工', 'doutoku': '道徳'
};
var VIEWPOINT_SHORTS = {
  'knowledge': '知', 'thinking': '思', 'attitude': '態'
};

// ===== 配布版セットアップ用 =====

/**
 * 【配布版用 ワンクリックセットアップ】
 *
 * GASエディタで関数 quickSetup を選んで「実行」を押すだけで完了:
 *  1. ランダムな API_KEY を生成して Script Properties に保存
 *  2. SHEET_ID をこのスクリプトのスプレッドシートIDに設定
 *  3. 必要なシートを全自動作成
 *  4. 完了時に「あなたのAPI_KEY」と「次のステップ」を Logger に表示
 *
 * 戻り値: 表示用文字列（ダイアログにも出す）
 */
function quickSetup() {
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperty('API_KEY');
  var apiKey = existing;
  if (!apiKey) {
    // 16文字ランダム英数字
    var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    apiKey = '';
    for (var i = 0; i < 16; i++) apiKey += chars[Math.floor(Math.random() * chars.length)];
    props.setProperty('API_KEY', apiKey);
  }
  // SHEET_ID 自動設定
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss && !props.getProperty('SHEET_ID')) {
    props.setProperty('SHEET_ID', ss.getId());
  }
  // 必要なシートを事前作成
  try { getOrCreateSheet(); } catch (_) {}
  try { getOrCreateSheetByName_(PRAISE_SHEET, PRAISE_COLS); } catch (_) {}
  try { getOrCreateSheetByName_(EVAL_SHEET, EVAL_COLS); } catch (_) {}
  try { getOrCreateSheetByName_(ABA_SHEET, ABA_COLS); } catch (_) {}
  try { getOrCreateSheetByName_(SEATING_SHEET, SEATING_COLS); } catch (_) {}
  try { getOrCreateSheetByName_(KETEBURE_SHEET, KETEBURE_COLS); } catch (_) {}
  try { getOrCreateSheetByName_(ROSTER_SHEET, ROSTER_COLS); } catch (_) {}

  var msg = '✅ セットアップ完了！\n\n'
    + '━━━━━━━━━━━━━━━━━━━━━━\n'
    + 'あなたのAPI_KEY:\n'
    + '   ' + apiKey + '\n'
    + '━━━━━━━━━━━━━━━━━━━━━━\n\n'
    + '【次のステップ】\n'
    + '1. 上のAPI_KEYをコピーしてメモ\n'
    + '2. メニュー右上「デプロイ」→「新しいデプロイ」→ ⚙ → 「ウェブアプリ」\n'
    + '3. 「次のユーザーとして実行: 自分」「アクセスできるユーザー: 全員」\n'
    + '4. 「デプロイ」→ 表示されるURL（https://script.google.com/macros/.../exec）をコピー\n'
    + '5. 担任記録アプリの「⚙設定 → クラウド同期」に URL と API_KEY を貼付\n'
    + '6. 「同期を有効にする」→ ON → 「今すぐ同期」で完了！';
  Logger.log(msg);
  // ダイアログでも表示（GASエディタから手動実行時）
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('セットアップ完了', msg, ui.ButtonSet.OK);
  } catch (_) { /* UI不可な実行コンテキストでは無視 */ }
  return msg;
}

/** SEATING_SHEET 系の互換ヘルパー（quickSetup から呼ぶ用） */
function getOrCreateSheetByName_(name, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(cols);
  }
  return sheet;
}

// ===== エントリポイント =====

function doPost(e) {
  try {
    var result = handlePost(e);
    return buildResponse(result);
  } catch (err) {
    return buildResponse({ ok: false, error: err.message }, 500);
  }
}

function doGet(e) {
  try {
    var result = handleGet(e);
    return buildResponse(result);
  } catch (err) {
    return buildResponse({ ok: false, error: err.message }, 500);
  }
}

// ===== POST 処理 =====

function handlePost(e) {
  var params = JSON.parse((e && e.postData && e.postData.contents) || '{}');

  // APIキー認証
  var key = (e && e.parameter && e.parameter.key) || params.key || '';
  if (!checkApiKey(key)) {
    throw new Error('Unauthorized: invalid API key');
  }

  var action = params.action || 'add';
  var dataType = params.dataType || 'record';
  var deviceId = params.deviceId || 'unknown';
  var now = new Date().toISOString();

  // ===== 名簿同期 (児童ID→名前変換用、人間用ビューが参照) =====
  if (dataType === 'roster') {
    if (action === 'set' || action === 'bulk_set') {
      var students = params.students || [];
      setRosterAll(students, now);
      return { ok: true, action: 'roster_set', count: students.length };
    }
    throw new Error('Unknown roster action: ' + action);
  }

  // ===== ビュー再生成 (人間用シートを更新) =====
  // params.type で1種類だけ生成可能（GAS 6分タイムアウト対策）
  //   全件:   {dataType:'views', action:'rebuild'}
  //   個別:   {dataType:'views', action:'rebuild', type:'records'|'praises'|'evaluations'|'aba'|'ketebure'}
  if (dataType === 'views' && action === 'rebuild') {
    if (params.type) {
      var stats1 = rebuildOneView(params.type);
      return { ok: true, action: 'view_rebuilt', type: params.type, stats: stats1 };
    }
    var stats = rebuildAllViews();
    return { ok: true, action: 'views_rebuilt', stats: stats };
  }

  // ===== 席替えスナップショット =====
  if (dataType === 'seating') {
    var ssheet = getOrCreateSeatingSheet();
    if (action === 'add') {
      var snap = params.snapshot || params.seating;
      if (!snap || !snap.id) throw new Error('seating.id required');
      if (!findRowById(ssheet, snap.id)) {
        appendSeatingSnapshot(ssheet, snap, deviceId, now);
        return { ok: true, action: 'seating_added', id: snap.id };
      }
      return { ok: true, action: 'seating_skipped_duplicate', id: snap.id };
    }
    if (action === 'bulk_add' || action === 'sync') {
      var snaps = params.snapshots || [];
      var sAdded = 0, sSkipped = 0;
      for (var si = 0; si < snaps.length; si++) {
        var snp = snaps[si];
        if (!snp || !snp.id) continue;
        if (!findRowById(ssheet, snp.id)) {
          appendSeatingSnapshot(ssheet, snp, deviceId, now);
          sAdded++;
        } else sSkipped++;
      }
      return { ok: true, action: 'seating_bulk_add', added: sAdded, skipped: sSkipped };
    }
    if (action === 'delete') {
      var sId = params.id || (params.snapshot && params.snapshot.id);
      if (!sId) throw new Error('id required');
      var sRow = findRowById(ssheet, sId);
      if (sRow) {
        ssheet.getRange(sRow, SEATING_COLS.indexOf('deleted') + 1).setValue('1');
        ssheet.getRange(sRow, SEATING_COLS.indexOf('synced_at') + 1).setValue(now);
        return { ok: true, action: 'seating_deleted', id: sId };
      }
      return { ok: true, action: 'seating_not_found', id: sId };
    }
    throw new Error('Unknown seating action: ' + action);
  }

  // ===== ABA =====
  if (dataType === 'aba') {
    var asheet = getOrCreateAbaSheet();
    if (action === 'add' || action === 'edit') {
      var ar = params.aba || params.record;
      if (!ar || !ar.id) throw new Error('aba.id required');
      var arow = findRowById(asheet, ar.id);
      if (arow) updateAbaRecord(asheet, arow, ar, deviceId, now);
      else appendAbaRecord(asheet, ar, deviceId, now);
      return { ok: true, action: arow ? 'aba_updated' : 'aba_added', id: ar.id };
    }
    if (action === 'bulk_add' || action === 'sync') {
      var aArr = params.abaRecords || [];
      var aAdded = 0, aSkipped = 0;
      for (var ai = 0; ai < aArr.length; ai++) {
        var ax = aArr[ai];
        if (!ax || !ax.id) continue;
        if (!findRowById(asheet, ax.id)) {
          appendAbaRecord(asheet, ax, deviceId, now);
          aAdded++;
        } else aSkipped++;
      }
      return { ok: true, action: 'aba_bulk_add', added: aAdded, skipped: aSkipped };
    }
    if (action === 'delete') {
      var aId = params.id || (params.aba && params.aba.id);
      if (!aId) throw new Error('id required');
      var ar2 = findRowById(asheet, aId);
      if (ar2) {
        asheet.getRange(ar2, ABA_COLS.indexOf('deleted') + 1).setValue('1');
        asheet.getRange(ar2, ABA_COLS.indexOf('synced_at') + 1).setValue(now);
        return { ok: true, action: 'aba_deleted', id: aId };
      }
      return { ok: true, action: 'aba_not_found', id: aId };
    }
    throw new Error('Unknown aba action: ' + action);
  }

  // ===== 評価 (evaluations) =====
  if (dataType === 'evaluation') {
    var esheet = getOrCreateEvalSheet();
    if (action === 'add' || action === 'edit') {
      var ev = params.evaluation || params.record;
      if (!ev || !ev.id) throw new Error('evaluation.id required');
      var existRow = findRowById(esheet, ev.id);
      if (existRow) {
        updateEvalRecord(esheet, existRow, ev, deviceId, now);
      } else {
        appendEvalRecord(esheet, ev, deviceId, now);
      }
      // 教科別マトリクスシートも更新
      try { updateMatrixCell(ev); } catch (e) { Logger.log('matrix update failed: ' + e.message); }
      return { ok: true, action: action === 'edit' ? 'eval_updated' : 'eval_added', id: ev.id };
    }
    if (action === 'bulk_add' || action === 'sync') {
      var evals = params.evaluations || [];
      var addedE = 0, skippedE = 0;
      for (var k = 0; k < evals.length; k++) {
        var e0 = evals[k];
        if (!e0 || !e0.id) continue;
        if (!findRowById(esheet, e0.id)) {
          appendEvalRecord(esheet, e0, deviceId, now);
          try { updateMatrixCell(e0); } catch (_) {}
          addedE++;
        } else {
          skippedE++;
        }
      }
      return { ok: true, action: 'eval_bulk_add', added: addedE, skipped: skippedE };
    }
    if (action === 'delete') {
      var eid = params.id || (params.evaluation && params.evaluation.id);
      if (!eid) throw new Error('id required');
      var erow = findRowById(esheet, eid);
      if (erow) {
        // 元の値を取得してマトリクスからもクリア
        var oldEv = readEvalRow(esheet, erow);
        esheet.getRange(erow, EVAL_COLS.indexOf('deleted') + 1).setValue('1');
        esheet.getRange(erow, EVAL_COLS.indexOf('synced_at') + 1).setValue(now);
        try { clearMatrixCell(oldEv); } catch (_) {}
        return { ok: true, action: 'eval_deleted', id: eid };
      }
      return { ok: true, action: 'eval_not_found', id: eid };
    }
    throw new Error('Unknown evaluation action: ' + action);
  }

  // ===== ほめたい (praises) =====
  if (dataType === 'praise') {
    var psheet = getOrCreatePraiseSheet();
    if (action === 'add') {
      var p = params.praise;
      if (!p || !p.id) throw new Error('praise.id required');
      if (!findRowById(psheet, p.id)) {
        appendPraiseRecord(psheet, p, deviceId, now);
        return { ok: true, action: 'praise_added', id: p.id };
      }
      return { ok: true, action: 'praise_skipped_duplicate', id: p.id };
    }
    if (action === 'bulk_add' || action === 'sync') {
      var praises = params.praises || [];
      var added = 0, skipped = 0;
      for (var i = 0; i < praises.length; i++) {
        var pr = praises[i];
        if (!pr || !pr.id) continue;
        if (!findRowById(psheet, pr.id)) {
          appendPraiseRecord(psheet, pr, deviceId, now);
          added++;
        } else {
          skipped++;
        }
      }
      return { ok: true, action: 'praise_bulk_add', added: added, skipped: skipped };
    }
    if (action === 'edit') {
      var p2 = params.praise;
      if (!p2 || !p2.id) throw new Error('praise.id required');
      var row2 = findRowById(psheet, p2.id);
      if (row2) {
        updatePraiseRecord(psheet, row2, p2, deviceId, now);
        return { ok: true, action: 'praise_updated', id: p2.id };
      }
      appendPraiseRecord(psheet, p2, deviceId, now);
      return { ok: true, action: 'praise_added_on_edit', id: p2.id };
    }
    if (action === 'delete') {
      var pid = params.id || (params.praise && params.praise.id);
      if (!pid) throw new Error('id required');
      var row3 = findRowById(psheet, pid);
      if (row3) {
        psheet.getRange(row3, PRAISE_COLS.indexOf('deleted') + 1).setValue('1');
        psheet.getRange(row3, PRAISE_COLS.indexOf('synced_at') + 1).setValue(now);
        return { ok: true, action: 'praise_deleted', id: pid };
      }
      return { ok: true, action: 'praise_not_found', id: pid };
    }
    throw new Error('Unknown praise action: ' + action);
  }

  // ===== けテぶれ (ketebure) =====
  if (dataType === 'ketebure') {
    var ksheet = getOrCreateKetebureSheet();
    if (action === 'add' || action === 'edit') {
      var k = params.ketebure || params.record;
      if (!k || !k.id) throw new Error('ketebure.id required');
      var krow = findRowById(ksheet, k.id);
      if (krow) {
        updateKetebureRecord(ksheet, krow, k, deviceId, now);
      } else {
        appendKetebureRecord(ksheet, k, deviceId, now);
      }
      return { ok: true, action: action === 'edit' ? 'ketebure_updated' : 'ketebure_added', id: k.id };
    }
    if (action === 'bulk_add' || action === 'sync') {
      var kets = params.ketebureRecords || params.kete || [];
      var addedK = 0, skippedK = 0;
      for (var kk = 0; kk < kets.length; kk++) {
        var k0 = kets[kk];
        if (!k0 || !k0.id) continue;
        if (!findRowById(ksheet, k0.id)) {
          appendKetebureRecord(ksheet, k0, deviceId, now);
          addedK++;
        } else {
          skippedK++;
        }
      }
      return { ok: true, action: 'ketebure_bulk_add', added: addedK, skipped: skippedK };
    }
    if (action === 'delete') {
      var kid = params.id || (params.ketebure && params.ketebure.id);
      if (!kid) throw new Error('id required');
      var krow2 = findRowById(ksheet, kid);
      if (krow2) {
        ksheet.getRange(krow2, KETEBURE_COLS.indexOf('deleted') + 1).setValue('1');
        ksheet.getRange(krow2, KETEBURE_COLS.indexOf('synced_at') + 1).setValue(now);
        return { ok: true, action: 'ketebure_deleted', id: kid };
      }
      return { ok: true, action: 'ketebure_not_found', id: kid };
    }
    throw new Error('Unknown ketebure action: ' + action);
  }

  // ===== 交友関係レコード (records) — 既存ロジック =====
  var sheet = getOrCreateSheet();

  if (action === 'add') {
    var record = params.record;
    if (!record || !record.id) throw new Error('record.id is required');
    if (!findRowById(sheet, record.id)) {
      appendRecord(sheet, record, deviceId, now);
      return { ok: true, action: 'added', id: record.id };
    } else {
      return { ok: true, action: 'skipped_duplicate', id: record.id };
    }

  } else if (action === 'bulk_add' || action === 'sync') {
    var records = params.records || [];
    var added = 0, skipped = 0;
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (!rec || !rec.id) continue;
      if (!findRowById(sheet, rec.id)) {
        appendRecord(sheet, rec, deviceId, now);
        added++;
      } else {
        skipped++;
      }
    }
    return { ok: true, action: 'bulk_add', added: added, skipped: skipped };

  } else if (action === 'edit') {
    var record = params.record;
    if (!record || !record.id) throw new Error('record.id is required');
    var row = findRowById(sheet, record.id);
    if (row) {
      updateRecord(sheet, row, record, deviceId, now);
      return { ok: true, action: 'updated', id: record.id };
    } else {
      // 存在しなければ追加
      appendRecord(sheet, record, deviceId, now);
      return { ok: true, action: 'added_on_edit', id: record.id };
    }

  } else if (action === 'delete') {
    var id = params.id || (params.record && params.record.id);
    if (!id) throw new Error('id is required for delete');
    var row = findRowById(sheet, id);
    if (row) {
      // 論理削除: deleted カラムに '1' をセット
      var deletedCol = COLS.indexOf('deleted') + 1;
      sheet.getRange(row, deletedCol).setValue('1');
      var syncedCol = COLS.indexOf('synced_at') + 1;
      sheet.getRange(row, syncedCol).setValue(now);
      return { ok: true, action: 'deleted', id: id };
    } else {
      return { ok: true, action: 'not_found', id: id };
    }

  } else {
    throw new Error('Unknown action: ' + action);
  }
}

// ===== GET 処理 =====

function handleGet(e) {
  var params = (e && e.parameter) || {};

  // APIキー認証
  if (!checkApiKey(params.key || '')) {
    throw new Error('Unauthorized: invalid API key');
  }

  // info アクション: シートIDとURLを返す
  if (params.action === 'info') {
    var sheet = getOrCreateSheet();
    var ss = sheet.getParent();
    var psheet = getOrCreatePraiseSheet();
    var esheet = getOrCreateEvalSheet();
    var asheet = getOrCreateAbaSheet();
    var ssheet = getOrCreateSeatingSheet();
    var ketsheet = getOrCreateKetebureSheet();
    return {
      ok: true,
      sheet_id: ss.getId(),
      sheet_url: ss.getUrl(),
      sheet_name: ss.getName(),
      total_rows: Math.max(0, sheet.getLastRow() - 1),
      praise_rows: Math.max(0, psheet.getLastRow() - 1),
      eval_rows: Math.max(0, esheet.getLastRow() - 1),
      aba_rows: Math.max(0, asheet.getLastRow() - 1),
      seating_rows: Math.max(0, ssheet.getLastRow() - 1),
      ketebure_rows: Math.max(0, ketsheet.getLastRow() - 1),
      server_time: new Date().toISOString()
    };
  }

  // rename アクション: スプレッドシートのファイル名を変更
  if (params.action === 'rename') {
    var newName = params.name || '';
    if (!newName) throw new Error('name parameter required');
    var sheet = getOrCreateSheet();
    var ss = sheet.getParent();
    var oldName = ss.getName();
    ss.rename(newName);
    return { ok: true, old_name: oldName, new_name: ss.getName() };
  }

  var since = params.since || null;
  var dataType = params.dataType || 'record'; // 'record' | 'praise' | 'all'
  var result = { ok: true, server_time: new Date().toISOString() };

  // 交友関係レコード
  if (dataType === 'record' || dataType === 'all') {
    var sheet = getOrCreateSheet();
    var data = sheet.getDataRange().getValues();
    var header = data[0];
    var idIdx = header.indexOf('id');
    var tsIdx = header.indexOf('synced_at');
    var records = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[idIdx]) continue;
      if (since) {
        var syncedAt = row[tsIdx] ? String(row[tsIdx]) : '';
        if (syncedAt && syncedAt <= since) continue;
      }
      var obj = {};
      for (var c = 0; c < header.length; c++) obj[header[c]] = row[c];
      if (typeof obj.members === 'string' && obj.members) {
        try { obj.members = JSON.parse(obj.members); } catch (_) { obj.members = []; }
      }
      records.push(obj);
    }
    result.records = records;
    if (dataType === 'record') result.total = records.length;
  }

  // 席替え
  if (dataType === 'seating' || dataType === 'all') {
    var ssheet = getOrCreateSeatingSheet();
    var sdata = ssheet.getDataRange().getValues();
    var snaps = [];
    if (sdata.length >= 2) {
      var shead = sdata[0];
      var sidIdx = shead.indexOf('id');
      var stsIdx = shead.indexOf('synced_at');
      for (var sii = 1; sii < sdata.length; sii++) {
        var srow = sdata[sii];
        if (!srow[sidIdx]) continue;
        if (since) {
          var sSyncedAt = srow[stsIdx] ? String(srow[stsIdx]) : '';
          if (sSyncedAt && sSyncedAt <= since) continue;
        }
        var sobj = {};
        for (var sc = 0; sc < shead.length; sc++) sobj[shead[sc]] = srow[sc];
        if (typeof sobj.groups_json === 'string' && sobj.groups_json) {
          try { sobj.groups = JSON.parse(sobj.groups_json); } catch (_) { sobj.groups = []; }
        }
        snaps.push(sobj);
      }
    }
    result.seatingSnapshots = snaps;
  }

  // ABA
  if (dataType === 'aba' || dataType === 'all') {
    var asheet = getOrCreateAbaSheet();
    var adata = asheet.getDataRange().getValues();
    var abaList = [];
    if (adata.length >= 2) {
      var ahead = adata[0];
      var aidIdx = ahead.indexOf('id');
      var atsIdx = ahead.indexOf('synced_at');
      for (var ai = 1; ai < adata.length; ai++) {
        var arow = adata[ai];
        if (!arow[aidIdx]) continue;
        if (since) {
          var aSyncedAt = arow[atsIdx] ? String(arow[atsIdx]) : '';
          if (aSyncedAt && aSyncedAt <= since) continue;
        }
        var aobj = {};
        for (var ac = 0; ac < ahead.length; ac++) aobj[ahead[ac]] = arow[ac];
        abaList.push(aobj);
      }
    }
    result.abaRecords = abaList;
  }

  // 評価
  if (dataType === 'evaluation' || dataType === 'all') {
    var esheet = getOrCreateEvalSheet();
    var edata = esheet.getDataRange().getValues();
    if (edata.length >= 2) {
      var ehead = edata[0];
      var eidIdx = ehead.indexOf('id');
      var etsIdx = ehead.indexOf('synced_at');
      var evals = [];
      for (var ei = 1; ei < edata.length; ei++) {
        var erow = edata[ei];
        if (!erow[eidIdx]) continue;
        if (since) {
          var eSyncedAt = erow[etsIdx] ? String(erow[etsIdx]) : '';
          if (eSyncedAt && eSyncedAt <= since) continue;
        }
        var eobj = {};
        for (var ec = 0; ec < ehead.length; ec++) eobj[ehead[ec]] = erow[ec];
        evals.push(eobj);
      }
      result.evaluations = evals;
    } else {
      result.evaluations = [];
    }
  }

  // ほめたい
  if (dataType === 'praise' || dataType === 'all') {
    var psheet = getOrCreatePraiseSheet();
    var pdata = psheet.getDataRange().getValues();
    if (pdata.length >= 2) {
      var phead = pdata[0];
      var pidIdx = phead.indexOf('id');
      var ptsIdx = phead.indexOf('synced_at');
      var praises = [];
      for (var j = 1; j < pdata.length; j++) {
        var prow = pdata[j];
        if (!prow[pidIdx]) continue;
        if (since) {
          var pSyncedAt = prow[ptsIdx] ? String(prow[ptsIdx]) : '';
          if (pSyncedAt && pSyncedAt <= since) continue;
        }
        var pobj = {};
        for (var pc = 0; pc < phead.length; pc++) pobj[phead[pc]] = prow[pc];
        praises.push(pobj);
      }
      result.praises = praises;
    } else {
      result.praises = [];
    }
  }

  // けテぶれ
  if (dataType === 'ketebure' || dataType === 'all') {
    var ketsheet = getOrCreateKetebureSheet();
    var ketdata = ketsheet.getDataRange().getValues();
    if (ketdata.length >= 2) {
      var khead = ketdata[0];
      var kidIdx = khead.indexOf('id');
      var ktsIdx = khead.indexOf('synced_at');
      var kets = [];
      for (var ki = 1; ki < ketdata.length; ki++) {
        var krow0 = ketdata[ki];
        if (!krow0[kidIdx]) continue;
        if (since) {
          var kSyncedAt = krow0[ktsIdx] ? String(krow0[ktsIdx]) : '';
          if (kSyncedAt && kSyncedAt <= since) continue;
        }
        var kobj = {};
        for (var kc = 0; kc < khead.length; kc++) kobj[khead[kc]] = krow0[kc];
        if (typeof kobj.aspects_json === 'string' && kobj.aspects_json) {
          try { kobj.aspects = JSON.parse(kobj.aspects_json); } catch (_) { kobj.aspects = []; }
        }
        kets.push(kobj);
      }
      result.ketebureRecords = kets;
    } else {
      result.ketebureRecords = [];
    }
  }

  return result;
}

// ===== 内部ユーティリティ =====

function checkApiKey(key) {
  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty('API_KEY') || '';
  // 未設定時のみ「初回登録」を受け付ける（教師1人運用前提のシンプル化）
  // 8文字以上のkeyを受信したら、それを以後のAPI_KEYとして保存
  if (!stored) {
    if (key && key.length >= 8) {
      props.setProperty('API_KEY', key);
      return true;
    }
    return false;
  }
  return key === stored;
}

function getOrCreateSheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('SHEET_ID') || '';
  var ss;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); }
    catch (_) { ss = null; }
  }
  if (!ss) {
    // 自動生成: スクリプトオーナーのDriveに新規SS作成
    ss = SpreadsheetApp.create('interaction-sync-data');
    props.setProperty('SHEET_ID', ss.getId());
    Logger.log('New SS created: ' + ss.getId());
  }
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // ヘッダ行
    sheet.getRange(1, 1, 1, COLS.length).setValues([COLS]);
    sheet.setFrozenRows(1);
    // 既存シートは削除しない
    Logger.log('Sheet "records" created.');
  }
  return sheet;
}

function findRowById(sheet, id) {
  var idCol = 1; // id は1列目
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // 1-indexed, +1 for header
  }
  return null;
}

function appendRecord(sheet, record, deviceId, now) {
  var row = buildRow(record, deviceId, now);
  sheet.appendRow(row);
}

function updateRecord(sheet, rowNum, record, deviceId, now) {
  var row = buildRow(record, deviceId, now);
  sheet.getRange(rowNum, 1, 1, COLS.length).setValues([row]);
}

function buildRow(record, deviceId, now) {
  return COLS.map(function(col) {
    if (col === 'deviceId') return deviceId || record.deviceId || '';
    if (col === 'synced_at') return now;
    if (col === 'members') {
      var m = record.members;
      if (Array.isArray(m)) return JSON.stringify(m);
      return m || '[]';
    }
    if (col === 'deleted') return record.deleted ? '1' : '';
    var v = record[col];
    return v !== undefined && v !== null ? v : '';
  });
}

function buildResponse(data, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ===== ほめたい (praises) シート操作 =====

function getOrCreatePraiseSheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('SHEET_ID') || '';
  var ss;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); }
    catch (_) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('interaction-sync-data');
    props.setProperty('SHEET_ID', ss.getId());
  }
  var sheet = ss.getSheetByName(PRAISE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PRAISE_SHEET);
    sheet.getRange(1, 1, 1, PRAISE_COLS.length).setValues([PRAISE_COLS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendPraiseRecord(sheet, praise, deviceId, now) {
  sheet.appendRow(buildPraiseRow(praise, deviceId, now));
}

function updatePraiseRecord(sheet, rowNum, praise, deviceId, now) {
  sheet.getRange(rowNum, 1, 1, PRAISE_COLS.length).setValues([buildPraiseRow(praise, deviceId, now)]);
}

function buildPraiseRow(praise, deviceId, now) {
  return PRAISE_COLS.map(function(col) {
    if (col === 'deviceId') return deviceId || praise.deviceId || '';
    if (col === 'synced_at') return now;
    if (col === 'deleted') return praise.deleted ? '1' : '';
    var v = praise[col];
    return v !== undefined && v !== null ? v : '';
  });
}

// ===== 評価 (evaluations) シート操作 =====

function getOrCreateEvalSheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('SHEET_ID') || '';
  var ss;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); }
    catch (_) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('interaction-sync-data');
    props.setProperty('SHEET_ID', ss.getId());
  }
  var sheet = ss.getSheetByName(EVAL_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(EVAL_SHEET);
    sheet.getRange(1, 1, 1, EVAL_COLS.length).setValues([EVAL_COLS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendEvalRecord(sheet, ev, deviceId, now) {
  sheet.appendRow(buildEvalRow(ev, deviceId, now));
}

function updateEvalRecord(sheet, rowNum, ev, deviceId, now) {
  sheet.getRange(rowNum, 1, 1, EVAL_COLS.length).setValues([buildEvalRow(ev, deviceId, now)]);
}

function buildEvalRow(ev, deviceId, now) {
  return EVAL_COLS.map(function(col) {
    if (col === 'deviceId') return deviceId || ev.deviceId || '';
    if (col === 'synced_at') return now;
    if (col === 'deleted') return ev.deleted ? '1' : '';
    if (col === 'evidences_json') {
      // 評価材料（複数type+詳細）をJSON文字列で保存
      try { return JSON.stringify(ev.evidences || []); } catch (_) { return '[]'; }
    }
    if (col === 'note') return ev.note || '';
    var v = ev[col];
    return v !== undefined && v !== null ? v : '';
  });
}

function readEvalRow(sheet, rowNum) {
  var row = sheet.getRange(rowNum, 1, 1, EVAL_COLS.length).getValues()[0];
  var obj = {};
  for (var i = 0; i < EVAL_COLS.length; i++) obj[EVAL_COLS[i]] = row[i];
  // evidences_json を配列に復元
  if (obj.evidences_json) {
    try { obj.evidences = JSON.parse(obj.evidences_json); } catch (_) { obj.evidences = []; }
  } else {
    obj.evidences = [];
  }
  return obj;
}

// ===== けテぶれ (ketebure) シート操作 =====

function getOrCreateKetebureSheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('SHEET_ID') || '';
  var ss;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); }
    catch (_) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('interaction-sync-data');
    props.setProperty('SHEET_ID', ss.getId());
  }
  var sheet = ss.getSheetByName(KETEBURE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(KETEBURE_SHEET);
    sheet.getRange(1, 1, 1, KETEBURE_COLS.length).setValues([KETEBURE_COLS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendKetebureRecord(sheet, k, deviceId, now) {
  sheet.appendRow(buildKetebureRow(k, deviceId, now));
}

function updateKetebureRecord(sheet, rowNum, k, deviceId, now) {
  sheet.getRange(rowNum, 1, 1, KETEBURE_COLS.length).setValues([buildKetebureRow(k, deviceId, now)]);
}

function buildKetebureRow(k, deviceId, now) {
  return KETEBURE_COLS.map(function(col) {
    if (col === 'deviceId') return deviceId || k.deviceId || '';
    if (col === 'synced_at') return now;
    if (col === 'deleted') return k.deleted ? '1' : '';
    if (col === 'aspects_json') {
      try { return JSON.stringify(k.aspects || []); } catch (_) { return '[]'; }
    }
    var v = k[col];
    return v !== undefined && v !== null ? v : '';
  });
}

function readKetebureRow(sheet, rowNum) {
  var row = sheet.getRange(rowNum, 1, 1, KETEBURE_COLS.length).getValues()[0];
  var obj = {};
  for (var i = 0; i < KETEBURE_COLS.length; i++) obj[KETEBURE_COLS[i]] = row[i];
  if (obj.aspects_json) {
    try { obj.aspects = JSON.parse(obj.aspects_json); } catch (_) { obj.aspects = []; }
  } else {
    obj.aspects = [];
  }
  return obj;
}

// ===== 教科別マトリクスシート =====
//
// 各教科シートのスキーマ:
//   行1: 出席 | 児童名 | <unit名>-知 | <unit名>-思 | <unit名>-態 | <unit名>-知 | ...
//   行2-29: 児童データ (出席番号順)

function getOrCreateSubjectSheet(subjectId) {
  var name = SUBJECT_LABELS[subjectId] || subjectId;
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, 2).setValues([['出席', '児童名']]);
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);
  }
  return sheet;
}

function ensureStudentRow(sheet, studentId, studentName) {
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (Number(ids[i][0]) === Number(studentId)) return i + 2;
    }
  }
  // 出席番号順に挿入
  var insertAt = 2;
  if (lastRow >= 2) {
    var ids2 = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    insertAt = lastRow + 1;
    for (var j = 0; j < ids2.length; j++) {
      if (Number(ids2[j][0]) > Number(studentId)) {
        insertAt = j + 2;
        sheet.insertRowsBefore(insertAt, 1);
        break;
      }
    }
  }
  sheet.getRange(insertAt, 1, 1, 2).setValues([[studentId, studentName || '']]);
  return insertAt;
}

// unitId+viewpoint に対応する列番号を返す。なければ append。
function ensureMatrixColumn(sheet, unitId, unitName, viewpoint) {
  var colLabel = (unitName || unitId) + '-' + (VIEWPOINT_SHORTS[viewpoint] || viewpoint);
  var lastCol = sheet.getLastColumn();
  if (lastCol >= 3) {
    var headers = sheet.getRange(1, 3, 1, lastCol - 2).getValues()[0];
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]) === colLabel) return i + 3;
    }
  }
  var newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(colLabel);
  return newCol;
}

function getStudentName(studentId) {
  // students.js の名簿が無いので、評価レコードから推測 or "" を返す。
  // ここでは記録された ev.studentName があれば優先、無ければ空。
  return '';
}

// 教科シートの該当セルを書き込み
function updateMatrixCell(ev) {
  if (!ev || !ev.subjectId || !ev.unitId || !ev.viewpoint || !ev.studentId) return;
  var sheet = getOrCreateSubjectSheet(ev.subjectId);
  var name = ev.studentName || '';
  // 名前が無ければ既存行から拾う、それもなければ空のまま
  var row = ensureStudentRow(sheet, ev.studentId, name);
  if (!name) {
    // 既存セル(B列)が空ならそのまま
  } else {
    sheet.getRange(row, 2).setValue(name);
  }
  var col = ensureMatrixColumn(sheet, ev.unitId, ev.unitName || ev.unitId, ev.viewpoint);
  sheet.getRange(row, col).setValue(ev.grade || '');
}

// ===== ABA シート操作 =====

function getOrCreateAbaSheet() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  var sheet = ss.getSheetByName(ABA_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ABA_SHEET);
    sheet.getRange(1, 1, 1, ABA_COLS.length).setValues([ABA_COLS]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  // === スキーマ追従: 不足列を末尾に追加（既存データを破壊しない）===
  try {
    var lastCol = sheet.getLastColumn();
    var existingHeader = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    var existingSet = {};
    existingHeader.forEach(function(h) { if (h) existingSet[String(h)] = true; });
    var missing = ABA_COLS.filter(function(c) { return !existingSet[c]; });
    if (missing.length > 0) {
      var startCol = lastCol + 1;
      sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
      Logger.log('aba_records: added missing columns: ' + missing.join(','));
    }
  } catch (e) {
    Logger.log('aba_records schema migration failed: ' + e.message);
  }
  return sheet;
}

function appendAbaRecord(sheet, ar, deviceId, now) {
  sheet.appendRow(buildAbaRow(ar, deviceId, now, sheet));
}

function updateAbaRecord(sheet, rowNum, ar, deviceId, now) {
  var row = buildAbaRow(ar, deviceId, now, sheet);
  sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
}

// ===== 席替えスナップショット シート =====
function getOrCreateSeatingSheet() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  var sheet = ss.getSheetByName(SEATING_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SEATING_SHEET);
    sheet.getRange(1, 1, 1, SEATING_COLS.length).setValues([SEATING_COLS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendSeatingSnapshot(sheet, snap, deviceId, now) {
  var row = SEATING_COLS.map(function(col) {
    if (col === 'deviceId') return deviceId || snap.deviceId || '';
    if (col === 'synced_at') return now;
    if (col === 'deleted') return snap.deleted ? '1' : '';
    if (col === 'groups_json') {
      var g = snap.groups;
      if (Array.isArray(g)) return JSON.stringify(g);
      return g || '[]';
    }
    var v = snap[col];
    return v !== undefined && v !== null ? v : '';
  });
  sheet.appendRow(row);
}

// シート実際のヘッダ順に従って値を組み立てる（migration で末尾追加された列にも追従）
function _buildAbaCellFor(col, ar, deviceId, now) {
  if (col === 'deviceId') return deviceId || ar.deviceId || '';
  if (col === 'synced_at') return now;
  if (col === 'deleted') return ar.deleted ? '1' : '';
  if (col === 'behaviors') {
    var b = ar.behaviors;
    if (Array.isArray(b)) return JSON.stringify(b);
    return b || '[]';
  }
  if (col === 'targetStudentIds') {
    if (Array.isArray(ar.targetStudentIds) && ar.targetStudentIds.length > 0) {
      return JSON.stringify(ar.targetStudentIds);
    }
    if (ar.targetStudentId) return JSON.stringify([ar.targetStudentId]);
    return '';
  }
  var v = ar[col];
  return v !== undefined && v !== null ? v : '';
}

function buildAbaRow(ar, deviceId, now, sheet) {
  // sheet が渡されればその実ヘッダ順、なければ ABA_COLS 順（後方互換）
  var headers;
  if (sheet) {
    var lastCol = sheet.getLastColumn();
    headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : ABA_COLS;
  } else {
    headers = ABA_COLS;
  }
  return headers.map(function(col) { return _buildAbaCellFor(col, ar, deviceId, now); });
}

function clearMatrixCell(ev) {
  if (!ev || !ev.subjectId || !ev.unitId || !ev.viewpoint || !ev.studentId) return;
  var sheet = getOrCreateSubjectSheet(ev.subjectId);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var row = -1;
  for (var i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === Number(ev.studentId)) { row = i + 2; break; }
  }
  if (row < 0) return;
  var lastCol = sheet.getLastColumn();
  if (lastCol < 3) return;
  var headers = sheet.getRange(1, 3, 1, lastCol - 2).getValues()[0];
  var colLabel = (ev.unitName || ev.unitId) + '-' + (VIEWPOINT_SHORTS[ev.viewpoint] || ev.viewpoint);
  for (var j = 0; j < headers.length; j++) {
    if (String(headers[j]) === colLabel) {
      sheet.getRange(row, j + 3).clearContent();
      return;
    }
  }
}

// ============================================================================
// 名簿管理 (ROSTER_SHEET) — ビュー生成で児童名を解決するため
// ============================================================================

function getOrCreateRosterSheet() {
  return getOrCreateSheetByName_(ROSTER_SHEET, ROSTER_COLS);
}

function setRosterAll(students, now) {
  // データ完全消失を防ぐためにロックを取る
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('roster lock timeout');
  }
  try {
    var sheet = getOrCreateRosterSheet();
    // 既存をクリア（書式は残す）
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      // 全列をクリア（過去にカラムが減った場合の残骸も消す）
      var lastCol = Math.max(sheet.getLastColumn(), ROSTER_COLS.length);
      sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    }
    if (!students || students.length === 0) {
      Logger.log('setRosterAll: empty students - roster cleared but no rows written');
      return;
    }
    var rows = students.map(function(s) {
      return [
        s.id, s.name || '', s.kana || '',
        s.watch ? '1' : '', s.highlight ? '1' : '',
        now
      ];
    });
    sheet.getRange(2, 1, rows.length, ROSTER_COLS.length).setValues(rows);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function loadRosterMap() {
  // id → name のMapを返す
  var map = {};
  try {
    var sheet = getOrCreateRosterSheet();
    if (sheet.getLastRow() < 2) return map;
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      var id = data[i][0];
      var name = data[i][1];
      if (id && name) map[id] = name;
    }
  } catch (_) {}
  return map;
}

function _resolveName(id, rosterMap) {
  if (id == null || id === '') return '';
  return rosterMap[id] || ('ID:' + id);
}

// '1' 文字列／真偽値／数値1のいずれでも削除と判定（Sheets が型変換するため）
function _isDeleted(v) {
  if (v === '1' || v === 1 || v === true) return true;
  if (typeof v === 'string' && v.trim() === '1') return true;
  return false;
}

// けテぶれ評価値の正規化: 旧データ ◎/○/△ も A/B/C に揃えて view に表示
function _normKetRating(r) {
  if (r === '◎') return 'A';
  if (r === '○') return 'B';
  if (r === '△') return 'C';
  return r || '';
}

function _formatTime(ts) {
  if (!ts) return '';
  try {
    var d = new Date(ts);
    return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  } catch (_) { return String(ts); }
}

function _ensureViewSheet(name, headers) {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('SHEET_ID') || '';
  var ss;
  if (ssId) { try { ss = SpreadsheetApp.openById(ssId); } catch (_) { ss = null; } }
  if (!ss) {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (_) { ss = null; }
  }
  if (!ss) throw new Error('スプレッドシートにアクセス不可。SHEET_ID 未設定の可能性。');
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  // 既存のマージを完全に解除してからクリア（「マージ衝突」エラー回避）
  try {
    var dataRange = sheet.getDataRange();
    if (dataRange.getNumRows() > 0) dataRange.breakApart();
  } catch (_) {}
  sheet.clearContents();
  sheet.clearFormats();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e3f0fb');
  sheet.setFrozenRows(1);
  // 注釈行
  sheet.getRange(2, 1, 1, headers.length).merge().setValue('⚠ このシートは自動生成です。直接編集しないでください（machine 用シートが正本。「🔄 ビュー再生成」で最新化）。');
  sheet.getRange(2, 1).setFontColor('#888').setFontStyle('italic').setBackground('#fff8e0');
  sheet.setFrozenRows(2);
  return sheet;
}

function rebuildAllViews() {
  // 同時実行を防ぐためスクリプトロックを取得（最大20秒待機）
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return {
      records: 'error: another rebuild in progress',
      praises: 'skipped',
      evaluations: 'skipped',
      aba: 'skipped',
      ketebure: 'skipped',
      _locked: true
    };
  }
  try {
    var roster = loadRosterMap();
    if (!roster || Object.keys(roster).length === 0) {
      // ローテーションで roster が空のときに名前列が全部空になるのを防ぐ
      Logger.log('rebuildAllViews: roster is empty - skipping name resolution will produce blank names');
    }
    var stats = {};
    try { stats.records = rebuildRecordsView(roster); } catch (e) { stats.records = 'error: ' + e.message; Logger.log('records: ' + e.stack); }
    try { stats.praises = rebuildPraisesView(roster); } catch (e) { stats.praises = 'error: ' + e.message; Logger.log('praises: ' + e.stack); }
    try { stats.evaluations = rebuildEvalsView(roster); } catch (e) { stats.evaluations = 'error: ' + e.message; Logger.log('evals: ' + e.stack); }
    try { stats.aba = rebuildAbaView(roster); } catch (e) { stats.aba = 'error: ' + e.message; Logger.log('aba: ' + e.stack); }
    try { stats.ketebure = rebuildKeteView(roster); } catch (e) { stats.ketebure = 'error: ' + e.message; Logger.log('kete: ' + e.stack); }
    return stats;
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// 1種類だけ再生成（タイムアウト対策・クライアントから順次呼び出す）
function rebuildOneView(type) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { error: 'another rebuild in progress', _locked: true };
  }
  try {
    var roster = loadRosterMap();
    if (!roster || Object.keys(roster).length === 0) {
      Logger.log('rebuildOneView(' + type + '): roster is empty');
    }
    switch (type) {
      case 'records':     return { type: 'records',     count: rebuildRecordsView(roster) };
      case 'praises':     return { type: 'praises',     count: rebuildPraisesView(roster) };
      case 'evaluations': return { type: 'evaluations', count: rebuildEvalsView(roster) };
      case 'aba':         return { type: 'aba',         count: rebuildAbaView(roster) };
      case 'ketebure':    return { type: 'ketebure',    count: rebuildKeteView(roster) };
      default:
        throw new Error('Unknown view type: ' + type);
    }
  } catch (e) {
    Logger.log('rebuildOneView(' + type + '): ' + e.stack);
    return { type: type, error: e.message };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function rebuildRecordsView(rosterMap) {
  var view = _ensureViewSheet(VIEW_SHEET_RECORDS,
    ['日時', '日付', '場面', '教科', '主役', '一緒にいた子', '活動', 'メモ', '特殊状況', '削除']);
  var src = getOrCreateSheet();
  if (src.getLastRow() < 2) return 0;
  var data = src.getDataRange().getValues();
  var hdr = data[0];
  var col = function(name) { return hdr.indexOf(name); };
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[col('id')]) continue;
    var members = r[col('members')];
    if (typeof members === 'string') {
      try { members = JSON.parse(members); } catch (_) { members = []; }
    }
    var memberNames = (members || []).map(function(m) { return _resolveName(m, rosterMap); }).join('・');
    out.push([
      _formatTime(r[col('timestamp')]),
      r[col('date')] || '',
      SCENE_LABELS[r[col('scene')]] || r[col('scene')] || '',
      SUBJECT_LABELS[r[col('lessonSubjectId')]] || '',
      _resolveName(r[col('subject')], rosterMap),
      memberNames,
      r[col('activity')] || '',
      r[col('note')] || '',
      r[col('special')] === 'alone' ? '一人で' : (r[col('special')] === 'with_teacher' ? '先生と' : (r[col('special')] === 'other_class' ? '他クラスと' : '')),
      _isDeleted(r[col('deleted')]) ? '削除済' : ''
    ]);
  }
  if (out.length > 0) {
    view.getRange(3, 1, out.length, out[0].length).setValues(out);
  }
  return out.length;
}

function rebuildPraisesView(rosterMap) {
  var view = _ensureViewSheet(VIEW_SHEET_PRAISES,
    ['日時', '日付', '児童', 'タグ', '内容', '場面', '削除']);
  var src = getOrCreatePraiseSheet();
  if (src.getLastRow() < 2) return 0;
  var data = src.getDataRange().getValues();
  var hdr = data[0];
  var col = function(name) { return hdr.indexOf(name); };
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[col('id')]) continue;
    var content = r[col('content')] || '';
    // contentにタグが含まれる場合は分離（"#タグ #タグ 本文"形式想定）
    var tags = '';
    var body = content;
    var tagMatch = String(content).match(/^((?:#\S+\s+)+)/);
    if (tagMatch) {
      tags = tagMatch[1].trim();
      body = String(content).slice(tagMatch[0].length);
    }
    out.push([
      _formatTime(r[col('timestamp')]),
      r[col('date')] || '',
      _resolveName(r[col('studentId')], rosterMap),
      tags,
      body,
      SCENE_LABELS[r[col('scene')]] || r[col('scene')] || '',
      _isDeleted(r[col('deleted')]) ? '削除済' : ''
    ]);
  }
  if (out.length > 0) {
    view.getRange(3, 1, out.length, out[0].length).setValues(out);
  }
  return out.length;
}

function rebuildEvalsView(rosterMap) {
  var view = _ensureViewSheet(VIEW_SHEET_EVALS,
    ['日時', '日付', '児童', '教科', '単元', '観点', '評価', '尺度', '評価材料', '材料の詳細', 'メモ', '削除']);
  var src = getOrCreateEvalSheet();
  if (src.getLastRow() < 2) return 0;
  var data = src.getDataRange().getValues();
  var hdr = data[0];
  var col = function(name) { return hdr.indexOf(name); };
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[col('id')]) continue;
    var evJson = r[col('evidences_json')] || '';
    var evList = [];
    if (evJson) {
      try { evList = JSON.parse(evJson); } catch (_) {}
    }
    var evTypes = evList.map(function(e) { return EVIDENCE_LABELS[e.type] || e.type; }).join('・');
    var evDetails = evList.map(function(e) {
      var lbl = EVIDENCE_LABELS[e.type] || e.type;
      return e.detail ? (lbl + ':' + e.detail) : '';
    }).filter(Boolean).join(' / ');
    out.push([
      _formatTime(r[col('timestamp')]),
      r[col('date')] || '',
      _resolveName(r[col('studentId')], rosterMap),
      SUBJECT_LABELS[r[col('subjectId')]] || r[col('subjectId')] || '',
      r[col('unitId')] || '',
      VIEWPOINT_SHORTS[r[col('viewpoint')]] || r[col('viewpoint')] || '',
      r[col('grade')] || '',
      r[col('scale')] === 5 ? '5段階' : '3段階',
      evTypes,
      evDetails,
      r[col('note')] || '',
      _isDeleted(r[col('deleted')]) ? '削除済' : ''
    ]);
  }
  if (out.length > 0) {
    view.getRange(3, 1, out.length, out[0].length).setValues(out);
  }
  return out.length;
}

function rebuildAbaView(rosterMap) {
  var view = _ensureViewSheet(VIEW_SHEET_ABA,
    ['日時', '日付', '時間帯', '教科', '天気', '対象児童', '行動', '相手', '先行(A)', '結果(C)', '対応', '削除']);
  var src = getOrCreateAbaSheet();
  if (src.getLastRow() < 2) return 0;
  var data = src.getDataRange().getValues();
  var hdr = data[0];
  var col = function(name) { return hdr.indexOf(name); };
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[col('id')]) continue;
    var behaviors = r[col('behaviors')];
    if (typeof behaviors === 'string') {
      try { behaviors = JSON.parse(behaviors); } catch (_) { behaviors = [behaviors]; }
    }
    var behaviorLabels = (behaviors || []).map(function(b) { return ABA_BEHAVIOR_LABELS[b] || b; }).join('・');
    // 相手児童: 新形式 targetStudentIds(JSON配列) と旧形式 targetStudentId(単数) を統合
    var partnerNames = '';
    var tsIdsCol = col('targetStudentIds');
    if (tsIdsCol >= 0 && r[tsIdsCol]) {
      var ids = [];
      try {
        var raw = r[tsIdsCol];
        ids = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (_) { ids = []; }
      if (Array.isArray(ids) && ids.length > 0) {
        partnerNames = ids.map(function(id) { return _resolveName(id, rosterMap); }).join('・');
      }
    }
    if (!partnerNames) {
      var oldCol = col('targetStudentId');
      if (oldCol >= 0 && r[oldCol]) partnerNames = _resolveName(r[oldCol], rosterMap);
    }
    out.push([
      _formatTime(r[col('timestamp')]),
      r[col('date')] || '',
      r[col('slot')] || '',
      SUBJECT_LABELS[r[col('subject')]] || r[col('subject')] || '',
      r[col('weather')] || '',
      _resolveName(r[col('studentId')], rosterMap),
      behaviorLabels,
      partnerNames,
      r[col('antecedent')] || '',
      r[col('consequence')] || '',
      r[col('response')] || '',
      _isDeleted(r[col('deleted')]) ? '削除済' : ''
    ]);
  }
  if (out.length > 0) {
    view.getRange(3, 1, out.length, out[0].length).setValues(out);
  }
  return out.length;
}

function rebuildKeteView(rosterMap) {
  var view = _ensureViewSheet(VIEW_SHEET_KETE,
    ['日時', '日付', '児童', '種別', '評価', '観点', 'メモ', '削除']);
  var src = getOrCreateKetebureSheet();
  if (src.getLastRow() < 2) return 0;
  var data = src.getDataRange().getValues();
  var hdr = data[0];
  var col = function(name) { return hdr.indexOf(name); };
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[col('id')]) continue;
    var aspectsJson = r[col('aspects_json')] || '';
    var aspects = [];
    if (aspectsJson) { try { aspects = JSON.parse(aspectsJson); } catch (_) {} }
    var aspectLabels = (aspects || []).map(function(a) { return KETE_ASPECT_LABELS[a] || a; }).join('・');
    out.push([
      _formatTime(r[col('timestamp')]),
      r[col('date')] || '',
      _resolveName(r[col('studentId')], rosterMap),
      r[col('type')] === 'shukudai' ? '宿題' : (r[col('type')] === 'seikatsu' ? '生活' : r[col('type')] || ''),
      _normKetRating(r[col('rating')]),
      aspectLabels,
      r[col('notes')] || '',
      _isDeleted(r[col('deleted')]) ? '削除済' : ''
    ]);
  }
  if (out.length > 0) {
    view.getRange(3, 1, out.length, out[0].length).setValues(out);
  }
  return out.length;
}

// GAS UI から呼べるカスタムメニュー
function onOpen(e) {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🆘 担任記録')
      .addItem('🔄 人間用ビューを再生成（view_*）', 'menuRebuildViews')
      .addItem('📊 各タブの件数確認', 'menuShowCounts')
      .addToUi();
  } catch (_) { /* doGet 経由では UI 取得不可 */ }
  // 自動バックアップメニューも合わせて表示
  try { onOpenAutoBackup(e); } catch (_) {}
}

function menuRebuildViews() {
  var ui = SpreadsheetApp.getUi();
  ui.alert('🔄 ビュー再生成中...', 'view_交友関係 / view_ほめたい / view_評価 / view_ABA / view_けテぶれ を最新化します。\n\nOKを押すと開始（数秒〜10秒程度）', ui.ButtonSet.OK);
  var stats = rebuildAllViews();
  ui.alert('✅ 完了', '生成件数:\n' +
    '・交友関係: ' + stats.records + '\n' +
    '・ほめたい: ' + stats.praises + '\n' +
    '・評価: ' + stats.evaluations + '\n' +
    '・ABA: ' + stats.aba + '\n' +
    '・けテぶれ: ' + stats.ketebure, ui.ButtonSet.OK);
}

function menuShowCounts() {
  var info = {
    records: getOrCreateSheet().getLastRow() - 1,
    praises: getOrCreatePraiseSheet().getLastRow() - 1,
    evaluations: getOrCreateEvalSheet().getLastRow() - 1,
    aba: getOrCreateAbaSheet().getLastRow() - 1,
    ketebure: getOrCreateKetebureSheet().getLastRow() - 1,
    seating: getOrCreateSeatingSheet().getLastRow() - 1,
    roster: getOrCreateRosterSheet().getLastRow() - 1
  };
  SpreadsheetApp.getUi().alert('📊 件数（machine sheets）',
    '・records: ' + info.records + '\n' +
    '・praises: ' + info.praises + '\n' +
    '・evaluations: ' + info.evaluations + '\n' +
    '・aba: ' + info.aba + '\n' +
    '・ketebure: ' + info.ketebure + '\n' +
    '・seating: ' + info.seating + '\n' +
    '・roster: ' + info.roster + '人',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// ============================================================================
// B2: 日次スナップショット (Time-driven Trigger)
// ============================================================================
//
// 全シートの件数を snapshots シートに毎日 1行追加し、件数大幅減を検知してメール警告。
// retention: 90日分。
// セットアップ: GASエディタで installDailySnapshotTrigger() を1度実行 → 毎日 03:00 に発火
// ============================================================================

var SNAPSHOT_SHEET = 'snapshots';
var SNAPSHOT_COLS = ['ts','records','praises','evaluations','aba','ketebure','seating','roster','total','warning'];

function getOrCreateSnapshotSheet() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  var sheet = ss.getSheetByName(SNAPSHOT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SNAPSHOT_SHEET);
    sheet.appendRow(SNAPSHOT_COLS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SNAPSHOT_COLS.length).setBackground('#e0e0e0').setFontWeight('bold');
  }
  return sheet;
}

function takeDailySnapshot() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    Logger.log('takeDailySnapshot: lock timeout');
    return null;
  }
  try {
    var ssheet = getOrCreateSnapshotSheet();
    var counts = {
      records: Math.max(0, getOrCreateSheet().getLastRow() - 1),
      praises: Math.max(0, getOrCreatePraiseSheet().getLastRow() - 1),
      evaluations: Math.max(0, getOrCreateEvalSheet().getLastRow() - 1),
      aba: Math.max(0, getOrCreateAbaSheet().getLastRow() - 1),
      ketebure: Math.max(0, getOrCreateKetebureSheet().getLastRow() - 1),
      seating: Math.max(0, getOrCreateSeatingSheet().getLastRow() - 1),
      roster: Math.max(0, getOrCreateRosterSheet().getLastRow() - 1)
    };
    var total = counts.records + counts.praises + counts.evaluations + counts.aba + counts.ketebure;

    var lastRow = ssheet.getLastRow();
    var warning = '';
    if (lastRow >= 2) {
      var prev = ssheet.getRange(lastRow, 1, 1, SNAPSHOT_COLS.length).getValues()[0];
      var prevTotal = prev[SNAPSHOT_COLS.indexOf('total')] || 0;
      var diff = total - prevTotal;
      if (diff <= -10) {
        warning = '減少: ' + diff;
        try {
          var email = Session.getActiveUser().getEmail();
          if (email) {
            MailApp.sendEmail({
              to: email,
              subject: '[担任記録アプリ] 件数大幅減を検知',
              body: '前回比 ' + diff + ' 件減少。\nprev=' + prevTotal + ' / now=' + total + '\n\n'
                  + 'records=' + counts.records + ', praises=' + counts.praises
                  + ', evaluations=' + counts.evaluations + ', aba=' + counts.aba
                  + ', ketebure=' + counts.ketebure + '\n\n'
                  + SpreadsheetApp.getActiveSpreadsheet().getUrl()
            });
          }
        } catch (e) { Logger.log('snapshot mail error: ' + e.message); }
      }
    }

    ssheet.appendRow([
      new Date().toISOString(),
      counts.records, counts.praises, counts.evaluations,
      counts.aba, counts.ketebure, counts.seating, counts.roster,
      total, warning
    ]);

    pruneOldSnapshots(ssheet, 90);
    Logger.log('snapshot: total=' + total + ' ' + (warning || 'OK'));
    return { ok: true, counts: counts, total: total, warning: warning };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function pruneOldSnapshots(sheet, retentionDays) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  var threshold = new Date();
  threshold.setDate(threshold.getDate() - retentionDays);
  var thresholdIso = threshold.toISOString();
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var rowsToDelete = [];
  for (var i = 0; i < data.length; i++) {
    var ts = data[i][0];
    if (ts && String(ts) < thresholdIso) rowsToDelete.push(i + 2);
  }
  rowsToDelete.sort(function(a, b) { return b - a; });
  for (var j = 0; j < rowsToDelete.length; j++) sheet.deleteRow(rowsToDelete[j]);
}

function installDailySnapshotTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'takeDailySnapshot') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('takeDailySnapshot').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Daily snapshot trigger installed (03:00 JST)');
  try {
    SpreadsheetApp.getUi().alert('OK', '毎日 03:00 に snapshots シート へ件数記録。\n10件以上減でメール警告。', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (_) {}
  return 'installed';
}

function uninstallDailySnapshotTrigger() {
  var count = 0;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'takeDailySnapshot') {
      ScriptApp.deleteTrigger(triggers[i]); count++;
    }
  }
  return 'uninstalled:' + count;
}

// ============================================================================
// B3: Google Drive 週次バックアップ (Time-driven Trigger)
// ============================================================================
//
// スプレッドシート全体を Drive にコピー。retention: 直近12週分。
// セットアップ: GASエディタで installWeeklyBackupTrigger() を1度実行 → 毎週日曜 04:00 に発火
// ============================================================================

var BACKUP_FOLDER_NAME = '担任記録アプリ_バックアップ';

function getOrCreateBackupFolder() {
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

function takeWeeklyBackup() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) {
    Logger.log('takeWeeklyBackup: lock timeout');
    _notifyBackupFailure('Lock timeout (別処理が60秒以上継続)');
    return null;
  }
  try {
    var props = PropertiesService.getScriptProperties();
    var ssId = props.getProperty('SHEET_ID');
    if (!ssId) {
      Logger.log('takeWeeklyBackup: SHEET_ID missing');
      _notifyBackupFailure('Script Properties に SHEET_ID が設定されていません');
      return null;
    }
    try {
      var src = DriveApp.getFileById(ssId);
      var folder = getOrCreateBackupFolder();
      var stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd_HHmm');
      var copyName = 'BU_' + stamp;
      var copy = src.makeCopy(copyName, folder);
      Logger.log('weekly backup: ' + copy.getId());
      pruneOldBackups(folder, 12);
      return { ok: true, fileId: copy.getId(), name: copyName, url: copy.getUrl() };
    } catch (e) {
      // Drive 権限不足 / quota / makeCopy 失敗 等
      Logger.log('takeWeeklyBackup error: ' + e.message + '\n' + e.stack);
      _notifyBackupFailure('週次バックアップ失敗: ' + e.message);
      return { ok: false, error: e.message };
    }
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// バックアップ失敗時のメール通知（snapshot側と対称性を持たせる）
function _notifyBackupFailure(reason) {
  try {
    var email = Session.getActiveUser().getEmail();
    if (!email) return;
    MailApp.sendEmail({
      to: email,
      subject: '[担任記録アプリ] 週次バックアップ失敗',
      body: '週次 Drive バックアップが失敗しました。\n\n'
          + '理由: ' + reason + '\n\n'
          + '時刻: ' + new Date().toISOString() + '\n'
          + 'GAS Editor: https://script.google.com/home/projects\n'
          + '対処: Drive権限/Apps Script quota/SHEET_ID 設定 を確認してください。'
    });
  } catch (e) {
    Logger.log('_notifyBackupFailure mail send error: ' + e.message);
  }
}

function pruneOldBackups(folder, keep) {
  var iter = folder.getFiles();
  var files = [];
  while (iter.hasNext()) {
    var f = iter.next();
    if (f.getName().indexOf('BU_') === 0) {
      files.push({ file: f, time: f.getDateCreated().getTime() });
    }
  }
  files.sort(function(a, b) { return b.time - a.time; });
  for (var i = keep; i < files.length; i++) {
    try {
      files[i].file.setTrashed(true);
      Logger.log('pruned old backup: ' + files[i].file.getName());
    } catch (e) { Logger.log('prune error: ' + e.message); }
  }
}

function installWeeklyBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'takeWeeklyBackup') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('takeWeeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(4).create();
  Logger.log('Weekly backup trigger installed (Sun 04:00 JST)');
  try {
    var folder = getOrCreateBackupFolder();
    SpreadsheetApp.getUi().alert('OK', '毎週日曜 04:00 に Drive バックアップ。\nフォルダ: ' + folder.getName() + '\n保持: 12週', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (_) {}
  return 'installed';
}

function uninstallWeeklyBackupTrigger() {
  var count = 0;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'takeWeeklyBackup') {
      ScriptApp.deleteTrigger(triggers[i]); count++;
    }
  }
  return 'uninstalled:' + count;
}

// 統合: 一括有効化（メニューから1クリック）
function setupAllAutoBackups() {
  installDailySnapshotTrigger();
  installWeeklyBackupTrigger();
  takeDailySnapshot();
  try {
    SpreadsheetApp.getUi().alert('OK', '日次snapshot(03:00) + 週次Drive BU(日04:00) を有効化。初回snapshot取得済。', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (_) {}
  return 'all-on';
}

// onOpen に B2/B3 のメニュー追加（既存 onOpen と並んで動作）
function onOpenAutoBackup(e) {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🛡 自動バックアップ')
      .addItem('🚀 全部設定する（推奨）', 'setupAllAutoBackups')
      .addSeparator()
      .addItem('📊 日次snapshot ON', 'installDailySnapshotTrigger')
      .addItem('📅 週次Drive BU ON', 'installWeeklyBackupTrigger')
      .addSeparator()
      .addItem('▶ 今すぐsnapshot取得', 'takeDailySnapshot')
      .addItem('▶ 今すぐ週次BU', 'takeWeeklyBackup')
      .addSeparator()
      .addItem('日次OFF', 'uninstallDailySnapshotTrigger')
      .addItem('週次OFF', 'uninstallWeeklyBackupTrigger')
      .addToUi();
  } catch (_) {}
}
