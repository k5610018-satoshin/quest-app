'use strict';
/* ==========================================================================
 * config.js — 担任記録アプリ ビルド設定
 *
 * このファイルは個人版/配布版の振る舞いを切り替える唯一のスイッチ。
 * ビルドスクリプト (build.sh) で配布版を作る際は mode='distribution' に
 * 置換され、features.aiFukutannin / seatingSheetSync が false になる。
 *
 * このファイルは index.html で他の全 script より先に読み込むこと。
 * ========================================================================== */

window.APP_CONFIG = {
  // 'personal'  = 佐藤先生個人運用（AI副担任・席替えシート連携あり）
  // 'distribution' = 他の先生に配布（独自連携機能なし、空名簿スタート）
  mode: 'personal',

  // 表示名（配布版では一般的な名前に変更可能）
  brandName: '担任記録アプリ',

  // クラス識別子（複数台で同期する際の区別用、配布版では空欄スタート）
  defaultClassId: '5-4-2026',

  // 個人版のデフォルトGAS同期設定（配布版ではnull → ユーザーが手入力）
  defaultSync: {
    endpoint: 'https://script.google.com/macros/s/AKfycby6OoIJ7xeWRw_7QfMElXRAOrTqb4HqwD6r-MSppY1oZ36jqYtEzufpfKNWFoS7-bpe/exec',
    apiKey:   'cLgXe27Zo-2w7cfL'
  },

  // ---- 機能フラグ ----
  features: {
    // AI副担任向けJSON出力ボタン（個人版のみ）
    aiFukutannin: true,
    // 席替えスプレッドシート → 本アプリへの自動同期（個人版のみ）
    seatingSheetSync: true,
    // GAS経由のクラウド同期（両版で利用可、配布版は各先生が自前GAS構築）
    cloudSync: true,
    // 教科別マトリクスシート出力（成績入力ソフト互換、両版）
    matrixSheet: true,
    // 学年選択（両版とも有効）
    gradeSelector: true,
    // 学級ダッシュボード（両版とも有効）
    dashboard: true,
    // データバックアップ/復元（両版とも有効）
    backup: true,
    // 名簿管理UI（両版とも有効、配布版では特に必須）
    rosterEditor: true,
    // 席替え本機能（NG/性別/希望列、両版）
    seatingPlanner: true
  },

  // 配布版の初期サンプル名簿（mode='distribution' かつ localStorage 空のとき使用）
  sampleStudents: [
    { id: 1, name: '見本 太郎', kana: 'みほん たろう' },
    { id: 2, name: '見本 花子', kana: 'みほん はなこ' },
    { id: 3, name: '見本 次郎', kana: 'みほん じろう' },
    { id: 4, name: '見本 さくら', kana: 'みほん さくら' },
    { id: 5, name: '見本 健太', kana: 'みほん けんた' }
  ]
};

// ===== ヘルパー =====

window.isFeatureEnabled = function(name) {
  return !!(window.APP_CONFIG && window.APP_CONFIG.features && window.APP_CONFIG.features[name]);
};

window.isPersonalMode = function() {
  return window.APP_CONFIG && window.APP_CONFIG.mode === 'personal';
};

window.isDistributionMode = function() {
  return window.APP_CONFIG && window.APP_CONFIG.mode === 'distribution';
};
