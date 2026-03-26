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
  subjects: ['国語','算数','理科','社会','体育','音楽','道徳','総合','図工','家庭科','外国語'],

  // 時間割（1〜6時間目）
  periods: ['1時間目','2時間目','3時間目','4時間目','5時間目','6時間目'],

  // デバッグモード
  debug: false
};
