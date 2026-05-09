/**
 * 算数 自由進度学習アプリ - GAS Bridge 設定
 *
 * Apps Script Properties で以下を設定:
 *   - SUPABASE_URL          : https://xxxx.supabase.co
 *   - SUPABASE_SERVICE_KEY  : Supabase service_role キー（書き込み用）
 *   - GAS_BRIDGE_API_KEY    : 児童アプリ→GAS の認証用ランダム32文字
 *   - SHEET_ID              : ミラー先のSpreadsheet ID
 */

const CONFIG = {
  CLASS_ID: '5-4-2026',
  SHEET_NAMES: {
    students: 'students',
    units: 'units',
    learning_plans: 'learning_plans',
    progress: 'progress',
    interventions: 'interventions',
    challenges: 'challenges',
    snapshots: 'sansuu_snapshots'
  },
  SUPABASE_TABLES: ['students', 'units', 'learning_plans', 'progress', 'interventions', 'challenges']
};

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function getSupabaseUrl_() { return getProp_('SUPABASE_URL'); }
function getSupabaseKey_() { return getProp_('SUPABASE_SERVICE_KEY'); }
function getApiKey_() { return getProp_('GAS_BRIDGE_API_KEY'); }
function getSheet_() { return SpreadsheetApp.openById(getProp_('SHEET_ID')); }

function checkAuth_(e) {
  const givenKey = (e && e.parameter && e.parameter.key) ||
                   (e && e.postData && JSON.parse(e.postData.contents || '{}').apiKey);
  if (!givenKey || givenKey !== getApiKey_()) {
    throw new Error('Unauthorized');
  }
}

function jsonResponse_(obj, code) {
  const out = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return out;
}
