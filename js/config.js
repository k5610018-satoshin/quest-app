/**
 * 学びの冒険クエスト - 設定ファイル
 * デプロイ時にGAS URLとクラス情報を更新する
 */
const CONFIG = {
  // GAS WebアプリURL（clasp deploy後に更新）
  gasUrl: 'https://script.google.com/macros/s/AKfycbyOY7WrGPrPCUoVp6DAfaxo36ZKG1mL7vR6KJ4z6PYNiRmp9VNs-gBoDgqfcMy0FPDZBA/exec',

  // クラス設定
  classId: '5年X組',
  className: '5年X組',
  subjects: ['国語','算数','理科','社会','体育','音楽','道徳','総合','図工','家庭科','外国語','学活','行事'],

  // 戸田小学校の時間割（各時間の開始〜終了）
  periodTimes: [
    { period: '1', start: '08:45', end: '09:30' },
    { period: '2', start: '09:40', end: '10:25' },
    { period: '3', start: '10:45', end: '11:30' },
    { period: '4', start: '11:35', end: '12:20' },
    { period: '5', start: '13:50', end: '14:35' },
    { period: '6', start: '14:40', end: '15:25' }
  ],

  // 時間割（1〜6時間目）
  periods: ['1時間目','2時間目','3時間目','4時間目','5時間目','6時間目'],

  // デバッグモード
  debug: false
};
