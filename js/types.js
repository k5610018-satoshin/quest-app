/**
 * 学びの冒険クエスト - 7つの型定義・キーワード判定
 */

const TYPES = {
  // 型定義
  definitions: [
    {
      symbol: '＋', name: 'プラス', color: '#22c55e',
      meaning: 'できた・わかった',
      hint: '今日わかったこと、できたこと',
      keywords: ['わかった','できた','理解','上手に','身についた','覚えた','マスター']
    },
    {
      symbol: '−', name: 'マイナス', color: '#ef4444',
      meaning: 'つまずき・課題',
      hint: 'できなかったこと、難しかったこと',
      keywords: ['難しかった','できなかった','失敗','苦手','間違えた','うまくいかない','ミス']
    },
    {
      symbol: '→', name: '次は', color: '#3b82f6',
      meaning: '次への一歩',
      hint: '次の目標、やってみたいこと',
      keywords: ['次は','目標','やってみたい','挑戦','もっと','知りたい','調べたい','頑張']
    },
    {
      symbol: '！', name: '発見', color: '#f59e0b',
      meaning: '気づき・発見',
      hint: '新しく気づいたこと、発見したこと',
      keywords: ['気づいた','発見','変わった','びっくり','初めて','実は','最初は','そうか','なるほど']
    },
    {
      symbol: '？', name: 'ギモン', color: '#8b5cf6',
      meaning: '問い・なぜ',
      hint: '疑問に思ったこと、さらに調べたいこと',
      keywords: ['なぜ','どうして','疑問','不思議','調べたい','知りたい']
    },
    {
      symbol: '⭐', name: '成長', color: '#eab308',
      meaning: '自分の成長',
      hint: '前よりできるようになったこと',
      keywords: ['成長','前より','上手に','できるようになった','伸びた','自信','レベルアップ']
    },
    {
      symbol: '☀️', name: '仲間', color: '#f97316',
      meaning: '仲間・つながり',
      hint: '友達から学んだこと',
      keywords: ['友達','教えてもらった','一緒に','すごい','見習い']
    }
  ],

  /**
   * テキストから型を検出
   * @param {string} text
   * @returns {string[]} 検出された型の記号リスト
   */
  detect(text) {
    const detected = new Set();
    for (const type of this.definitions) {
      // 記号が直接含まれている
      if (text.includes(type.symbol)) {
        detected.add(type.symbol);
        continue;
      }
      // キーワードマッチング
      for (const kw of type.keywords) {
        if (text.includes(kw)) {
          detected.add(type.symbol);
          break;
        }
      }
      // ？記号チェック（全角・半角両方）
      if (type.symbol === '？' && (text.includes('?') || text.includes('？'))) {
        detected.add(type.symbol);
      }
    }
    return [...detected];
  },

  /**
   * 記号から型情報を取得
   */
  getBySymbol(symbol) {
    return this.definitions.find(d => d.symbol === symbol) || null;
  }
};
