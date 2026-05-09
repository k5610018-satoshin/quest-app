/**
 * snapshot.gs: 日次バックアップ（L3.1）
 * トリガー: 毎日 03:00 に runDailySnapshot を実行
 */

function runDailySnapshot() {
  const ss = getSheet_();
  const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd_HHmm');
  const snapshotName = CONFIG.SHEET_NAMES.snapshots;

  let snap = ss.getSheetByName(snapshotName);
  if (!snap) {
    snap = ss.insertSheet(snapshotName);
    snap.appendRow(['snapshot_at', 'table', 'json']);
  }

  CONFIG.SUPABASE_TABLES.forEach(table => {
    const rows = readSheet_(table);
    snap.appendRow([ts, table, JSON.stringify(rows)]);
  });

  // 古いスナップショット（90日超）を削除
  pruneOldSnapshots_(snap, 90);
}

function pruneOldSnapshots_(snap, days) {
  if (snap.getLastRow() < 2) return;
  const cutoff = new Date(Date.now() - days * 86400000);
  const cutoffStr = Utilities.formatDate(cutoff, 'Asia/Tokyo', 'yyyy-MM-dd');
  const data = snap.getRange(2, 1, snap.getLastRow() - 1, 1).getValues();
  let toDelete = 0;
  for (const row of data) {
    if (row[0] < cutoffStr) toDelete++;
    else break;
  }
  if (toDelete > 0) {
    snap.deleteRows(2, toDelete);
  }
}

/**
 * 初回セットアップ用：トリガー登録
 * GAS エディタで一度だけ実行してください
 */
function setupSnapshotTrigger() {
  // 既存の同名トリガーを削除
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'runDailySnapshot') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // 毎日3:00に実行
  ScriptApp.newTrigger('runDailySnapshot')
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .create();
  Logger.log('runDailySnapshot trigger set: daily 03:00');
}
