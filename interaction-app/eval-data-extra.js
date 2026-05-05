'use strict';
/* ==========================================================================
 * eval-data-extra.js — 学年別評価データの追加 + ヘルパー
 *
 * 既存 eval-data.js は5年生専用。これを学年別に拡張。
 * 2年生用データ（光村図書・啓林館算数）を追加。
 * 他学年は今後追加予定（subjects/units を grade フィールドで管理）
 * ========================================================================== */

(function() {
  if (!window.EVAL_DATA) return;

  // 既存 units すべてに grade=5 を付与（後方互換）
  if (Array.isArray(window.EVAL_DATA.units)) {
    window.EVAL_DATA.units.forEach(u => {
      if (typeof u.grade === 'undefined') u.grade = 5;
    });
  }

  // ===== 学年別 subjects =====
  // 2年生は理科・社会なし、生活科あり
  const SUBJECTS_BY_GRADE = {
    1: [
      { id: 'kokugo',  label: '国語', color: '#e74c3c' },
      { id: 'sansu',   label: '算数', color: '#4a90e2' },
      { id: 'seikatsu',label: '生活', color: '#27ae60' },
      { id: 'ongaku',  label: '音楽', color: '#9b59b6' },
      { id: 'zukou',   label: '図工', color: '#e67e22' },
      { id: 'taiiku',  label: '体育', color: '#1abc9c' },
      { id: 'doutoku', label: '道徳', color: '#16a085' }
    ],
    2: [
      { id: 'kokugo',  label: '国語', color: '#e74c3c' },
      { id: 'sansu',   label: '算数', color: '#4a90e2' },
      { id: 'seikatsu',label: '生活', color: '#27ae60' },
      { id: 'ongaku',  label: '音楽', color: '#9b59b6' },
      { id: 'zukou',   label: '図工', color: '#e67e22' },
      { id: 'taiiku',  label: '体育', color: '#1abc9c' },
      { id: 'doutoku', label: '道徳', color: '#16a085' }
    ],
    3: [
      { id: 'kokugo',  label: '国語', color: '#e74c3c' },
      { id: 'sansu',   label: '算数', color: '#4a90e2' },
      { id: 'rika',    label: '理科', color: '#27ae60' },
      { id: 'shakai',  label: '社会', color: '#f39c12' },
      { id: 'ongaku',  label: '音楽', color: '#9b59b6' },
      { id: 'zukou',   label: '図工', color: '#e67e22' },
      { id: 'taiiku',  label: '体育', color: '#1abc9c' },
      { id: 'doutoku', label: '道徳', color: '#16a085' },
      { id: 'gaikoku', label: '外国語活動', color: '#e91e63' }
    ],
    4: [
      { id: 'kokugo',  label: '国語', color: '#e74c3c' },
      { id: 'sansu',   label: '算数', color: '#4a90e2' },
      { id: 'rika',    label: '理科', color: '#27ae60' },
      { id: 'shakai',  label: '社会', color: '#f39c12' },
      { id: 'ongaku',  label: '音楽', color: '#9b59b6' },
      { id: 'zukou',   label: '図工', color: '#e67e22' },
      { id: 'taiiku',  label: '体育', color: '#1abc9c' },
      { id: 'doutoku', label: '道徳', color: '#16a085' },
      { id: 'gaikoku', label: '外国語活動', color: '#e91e63' }
    ],
    5: window.EVAL_DATA.subjects, // 既存（理科・社会・体育・図工・道徳）に加え、外国語・家庭は今後
    6: window.EVAL_DATA.subjects
  };

  // ===== 2年生用 単元データ（最低限の主要単元） =====
  const UNITS_GRADE_2 = [
    // 国語（光村図書2年）
    { id: 'u2-kokugo-001', subject: 'kokugo', grade: 2, name: 'ふきのとう', sequence: 1, period: '4月', source: '光村図書2年上「たんぽぽ」物語文',
      criteria: {
        knowledge: '物語の登場人物や場面の様子を表す言葉を理解している。',
        thinking: '会話文や情景描写から登場人物の様子を想像し、音読で表現している。',
        attitude: '進んで音読を聞き合い、感想を伝え合おうとしている。'
      }, archived: false },
    { id: 'u2-kokugo-002', subject: 'kokugo', grade: 2, name: 'たんぽぽのちえ', sequence: 2, period: '4〜5月', source: '光村図書2年上 説明文',
      criteria: {
        knowledge: '時間的な順序を表す言葉を見つけ、文の繋がりを理解している。',
        thinking: 'たんぽぽの様子の変化を順序立てて説明している。',
        attitude: '身近な植物への興味をもち、進んで観察したり調べたりしようとしている。'
      }, archived: false },
    { id: 'u2-kokugo-003', subject: 'kokugo', grade: 2, name: 'スイミー', sequence: 3, period: '6月', source: '光村図書2年上 物語文（レオ・レオニ）',
      criteria: {
        knowledge: '物語の場面の様子や登場人物の気持ちを表す言葉を理解している。',
        thinking: '場面の移り変わりに沿って、スイミーの気持ちの変化を読み取っている。',
        attitude: 'スイミーの行動について感想を持ち、進んで友達と伝え合おうとしている。'
      }, archived: false },
    { id: 'u2-kokugo-004', subject: 'kokugo', grade: 2, name: 'お手紙', sequence: 4, period: '10〜11月', source: '光村図書2年下 物語文（アーノルド・ローベル）',
      criteria: {
        knowledge: '会話や行動を表す言葉から、登場人物の気持ちを読み取っている。',
        thinking: 'がまくんとかえるくんの気持ちの変化を、場面ごとに読み取り音読で表している。',
        attitude: '友達と感想を交流し、自分の読み方を広げようとしている。'
      }, archived: false },
    { id: 'u2-kokugo-005', subject: 'kokugo', grade: 2, name: 'わたしはおねえさん', sequence: 5, period: '1月', source: '光村図書2年下 物語文',
      criteria: {
        knowledge: 'すみれちゃんの気持ちを表す言葉や行動を理解している。',
        thinking: 'おねえさんとしてのすみれちゃんの気持ちの変化を読み取っている。',
        attitude: '自分の生活と重ねて、進んで感想を述べようとしている。'
      }, archived: false },
    { id: 'u2-kokugo-006', subject: 'kokugo', grade: 2, name: 'スーホの白い馬', sequence: 6, period: '2〜3月', source: '光村図書2年下 物語文（モンゴル民話）',
      criteria: {
        knowledge: '長い物語の登場人物や場面を整理し、表す言葉を理解している。',
        thinking: 'スーホと白い馬の関係を場面の描写から想像して読み取っている。',
        attitude: '感想を進んで書き、友達と交流しようとしている。'
      }, archived: false },
    { id: 'u2-kokugo-007', subject: 'kokugo', grade: 2, name: '漢字の読み書き（前期）', sequence: 7, period: '通年', source: '2年配当漢字160字',
      criteria: {
        knowledge: '2年生で学ぶ漢字を正しく読み書きできる。',
        thinking: '文の中で漢字を適切に使い分けている。',
        attitude: '日常の読み書きで漢字を進んで使おうとしている。'
      }, archived: false },

    // 算数（啓林館2年）
    { id: 'u2-sansu-001', subject: 'sansu', grade: 2, name: 'ひょうとグラフ', sequence: 1, period: '4月', source: '啓林館 わくわく算数2',
      criteria: {
        knowledge: '簡単な表やグラフの読み方・書き方を理解している。',
        thinking: '表やグラフを使ってデータを整理し、特徴を読み取っている。',
        attitude: '身の回りのことを表やグラフに表そうとしている。'
      }, archived: false },
    { id: 'u2-sansu-002', subject: 'sansu', grade: 2, name: 'たし算とひき算（2桁）', sequence: 2, period: '4〜5月', source: '啓林館2年',
      criteria: {
        knowledge: '2桁の数の足し算・引き算の筆算を理解し、計算できる。',
        thinking: '位取りに着目して計算の仕方を考え、説明している。',
        attitude: '計算の仕方を進んで考え、確かめようとしている。'
      }, archived: false },
    { id: 'u2-sansu-003', subject: 'sansu', grade: 2, name: '長さ（cm・mm）', sequence: 3, period: '5〜6月', source: '啓林館2年',
      criteria: {
        knowledge: 'cm・mmの単位を理解し、ものさしを使って長さを測ることができる。',
        thinking: '身の回りのものの長さを目分量で予想し、測って確かめている。',
        attitude: '長さを測ることに興味をもち、進んで取り組もうとしている。'
      }, archived: false },
    { id: 'u2-sansu-004', subject: 'sansu', grade: 2, name: '3桁の数', sequence: 4, period: '6月', source: '啓林館2年',
      criteria: {
        knowledge: '3桁の数の表し方や仕組みを理解している。',
        thinking: '位取りに基づいて3桁の数を比べたり、計算したりしている。',
        attitude: '大きな数に興味をもち、進んで使おうとしている。'
      }, archived: false },
    { id: 'u2-sansu-005', subject: 'sansu', grade: 2, name: '水のかさ（L・dL・mL）', sequence: 5, period: '6〜7月', source: '啓林館2年',
      criteria: {
        knowledge: 'L・dL・mLの関係を理解し、水のかさを測ることができる。',
        thinking: '水のかさを表す適切な単位を選んでいる。',
        attitude: '水のかさに関心をもち、進んで測ろうとしている。'
      }, archived: false },
    { id: 'u2-sansu-006', subject: 'sansu', grade: 2, name: '時こくと時間', sequence: 6, period: '7月', source: '啓林館2年',
      criteria: {
        knowledge: '日・時・分の関係を理解し、時刻と時間の違いを区別できる。',
        thinking: '日常の場面で時刻と時間を求めている。',
        attitude: '時計に関心をもち、進んで時間を意識しようとしている。'
      }, archived: false },
    { id: 'u2-sansu-007', subject: 'sansu', grade: 2, name: '三角形と四角形', sequence: 7, period: '9月', source: '啓林館2年',
      criteria: {
        knowledge: '三角形・四角形の性質、長方形・正方形・直角三角形を理解している。',
        thinking: '辺や角に着目して図形を分類し、説明している。',
        attitude: '身の回りの図形に関心をもち、進んで観察しようとしている。'
      }, archived: false },
    { id: 'u2-sansu-008', subject: 'sansu', grade: 2, name: 'かけ算（1〜5の段）', sequence: 8, period: '10月', source: '啓林館2年',
      criteria: {
        knowledge: 'かけ算の意味を理解し、1〜5の段の九九を唱えられる。',
        thinking: '同じ数を何回も足す場面を、かけ算の式で表している。',
        attitude: '九九を進んで覚えようとしている。'
      }, archived: false },
    { id: 'u2-sansu-009', subject: 'sansu', grade: 2, name: 'かけ算（6〜9の段）', sequence: 9, period: '11月', source: '啓林館2年',
      criteria: {
        knowledge: '6〜9の段、1の段の九九を唱えられる。',
        thinking: 'かけ算九九のきまりを使って、答えを工夫して求めている。',
        attitude: '九九を進んで唱え、確実に覚えようとしている。'
      }, archived: false },
    { id: 'u2-sansu-010', subject: 'sansu', grade: 2, name: '九九の表ときまり', sequence: 10, period: '11〜12月', source: '啓林館2年',
      criteria: {
        knowledge: '九九の表のきまりを理解している。',
        thinking: '九九の表からきまりを見つけて説明している。',
        attitude: 'きまりに関心をもち、進んで調べようとしている。'
      }, archived: false },
    { id: 'u2-sansu-011', subject: 'sansu', grade: 2, name: '4桁の数', sequence: 11, period: '1月', source: '啓林館2年',
      criteria: {
        knowledge: '10000までの数の表し方や仕組みを理解している。',
        thinking: '位取りに基づいて大きな数を比べたり計算したりしている。',
        attitude: '大きな数に関心をもち、生活の中で使おうとしている。'
      }, archived: false },
    { id: 'u2-sansu-012', subject: 'sansu', grade: 2, name: '長いものの長さ（m）', sequence: 12, period: '2月', source: '啓林館2年',
      criteria: {
        knowledge: 'mの単位を理解し、cm・mを使い分けて長さを測ることができる。',
        thinking: '長さに合わせて適切な単位を選んでいる。',
        attitude: '身近なものの長さに関心をもち、進んで測ろうとしている。'
      }, archived: false },
    { id: 'u2-sansu-013', subject: 'sansu', grade: 2, name: '分数（1/2・1/4）', sequence: 13, period: '2〜3月', source: '啓林館2年',
      criteria: {
        knowledge: '1/2、1/4の意味を理解し、図に表すことができる。',
        thinking: 'ものを等分する場面を分数で表している。',
        attitude: '分数に関心をもち、生活の中で使おうとしている。'
      }, archived: false },
    { id: 'u2-sansu-014', subject: 'sansu', grade: 2, name: 'はこの形', sequence: 14, period: '3月', source: '啓林館2年',
      criteria: {
        knowledge: 'はこの形の面・辺・頂点の数を理解している。',
        thinking: '面の形に着目してはこを構成している。',
        attitude: '身近なはこに関心をもち、進んで観察しようとしている。'
      }, archived: false },

    // 生活科（東京書籍 あたらしいせいかつ2年）
    { id: 'u2-seikatsu-001', subject: 'seikatsu', grade: 2, name: '春をさがそう', sequence: 1, period: '4月', source: '東書2年上',
      criteria: {
        knowledge: '春の自然や生き物の特徴を理解している。',
        thinking: '春の様子の変化を見つけて記録している。',
        attitude: '春の自然や生き物に親しもうとしている。'
      }, archived: false },
    { id: 'u2-seikatsu-002', subject: 'seikatsu', grade: 2, name: '野菜をそだてよう', sequence: 2, period: '5〜10月', source: '東書2年',
      criteria: {
        knowledge: '野菜の育ち方や世話の仕方を理解している。',
        thinking: '野菜の成長を観察し、記録している。',
        attitude: '世話を続けて育てようとしている。'
      }, archived: false },
    { id: 'u2-seikatsu-003', subject: 'seikatsu', grade: 2, name: '町たんけん', sequence: 3, period: '6〜7月', source: '東書2年',
      criteria: {
        knowledge: '町にある場所や働く人の様子を理解している。',
        thinking: '町の様子を調べ、気付いたことを伝えている。',
        attitude: '町の人や場所に関心をもち、関わろうとしている。'
      }, archived: false },
    { id: 'u2-seikatsu-004', subject: 'seikatsu', grade: 2, name: '生きものとなかよし', sequence: 4, period: '5〜6月', source: '東書2年',
      criteria: {
        knowledge: '身近な生き物の特徴やすみかを理解している。',
        thinking: '生き物を観察し、気付きを伝えている。',
        attitude: '生き物に親しみ、大切にしようとしている。'
      }, archived: false },
    { id: 'u2-seikatsu-005', subject: 'seikatsu', grade: 2, name: 'おもちゃをつくろう', sequence: 5, period: '11〜12月', source: '東書2年下',
      criteria: {
        knowledge: '材料の特徴や仕組みを理解している。',
        thinking: '工夫しておもちゃを作り、改良している。',
        attitude: '友達と楽しみながら作ろうとしている。'
      }, archived: false },
    { id: 'u2-seikatsu-006', subject: 'seikatsu', grade: 2, name: '大きくなった自分', sequence: 6, period: '2〜3月', source: '東書2年下',
      criteria: {
        knowledge: '自分の成長や周りの人の支えを理解している。',
        thinking: '成長の過程を振り返り、伝えている。',
        attitude: '感謝の気持ちをもち、これからの自分を考えようとしている。'
      }, archived: false },

    // 体育
    { id: 'u2-taiiku-001', subject: 'taiiku', grade: 2, name: '体つくりの運動遊び', sequence: 1, period: '通年', source: '学習指導要領2年',
      criteria: {
        knowledge: '体を動かす楽しさや基本的な動き方を知っている。',
        thinking: '友達と工夫して動きを楽しんでいる。',
        attitude: '進んで体を動かし、友達と仲良く運動しようとしている。'
      }, archived: false },
    { id: 'u2-taiiku-002', subject: 'taiiku', grade: 2, name: '走・跳の運動遊び', sequence: 2, period: '5〜10月', source: '学習指導要領2年',
      criteria: {
        knowledge: '走り方や跳び方の基本を知っている。',
        thinking: '楽しい走り方や跳び方を工夫している。',
        attitude: '進んで走ったり跳んだりしようとしている。'
      }, archived: false },
    { id: 'u2-taiiku-003', subject: 'taiiku', grade: 2, name: 'ボール運動遊び', sequence: 3, period: '通年', source: '学習指導要領2年',
      criteria: {
        knowledge: '簡単なボール運動の動きを知っている。',
        thinking: 'ルールを工夫したり、作戦を考えたりしている。',
        attitude: 'みんなで楽しくボール運動をしようとしている。'
      }, archived: false },
    { id: 'u2-taiiku-004', subject: 'taiiku', grade: 2, name: '器械・器具を使った運動遊び', sequence: 4, period: '通年', source: '学習指導要領2年',
      criteria: {
        knowledge: '器械・器具の使い方や安全な動き方を知っている。',
        thinking: '色々な動きを試して、楽しみ方を広げている。',
        attitude: '安全に気を付けて運動しようとしている。'
      }, archived: false },
    { id: 'u2-taiiku-005', subject: 'taiiku', grade: 2, name: '水遊び', sequence: 5, period: '6〜7月', source: '学習指導要領2年',
      criteria: {
        knowledge: '水に親しむ動きや安全な遊び方を知っている。',
        thinking: '友達と水に関わる遊び方を工夫している。',
        attitude: '安全に気を付け、進んで水遊びをしようとしている。'
      }, archived: false },
    { id: 'u2-taiiku-006', subject: 'taiiku', grade: 2, name: '表現リズム遊び', sequence: 6, period: '通年', source: '学習指導要領2年',
      criteria: {
        knowledge: 'リズムに合わせて体を動かすことを知っている。',
        thinking: '思いついた動きで楽しく表現している。',
        attitude: '友達と楽しく表現しようとしている。'
      }, archived: false },

    // 図工
    { id: 'u2-zukou-001', subject: 'zukou', grade: 2, name: 'えのぐじま（絵）', sequence: 1, period: '4〜5月', source: '日本文教出版2年',
      criteria: {
        knowledge: '絵の具の使い方や色の混ぜ方を知っている。',
        thinking: '色の組み合わせを工夫して表している。',
        attitude: '進んで色を試しながら表そうとしている。'
      }, archived: false },
    { id: 'u2-zukou-002', subject: 'zukou', grade: 2, name: 'はさみのアート（造形遊び）', sequence: 2, period: '5〜6月', source: '日本文教出版2年',
      criteria: {
        knowledge: 'はさみの使い方や紙の切り方を知っている。',
        thinking: '切ってできた形から発想を広げている。',
        attitude: '形遊びを楽しみ、進んで表そうとしている。'
      }, archived: false },
    { id: 'u2-zukou-003', subject: 'zukou', grade: 2, name: '光のプレゼント（工作）', sequence: 3, period: '6〜7月', source: '日本文教出版2年',
      criteria: {
        knowledge: '透明な材料の特徴を理解している。',
        thinking: '光の通り方を生かして表し方を工夫している。',
        attitude: '光を楽しみながら表そうとしている。'
      }, archived: false },
    { id: 'u2-zukou-004', subject: 'zukou', grade: 2, name: 'ねん土でごちそう', sequence: 4, period: '通年', source: '日本文教出版2年',
      criteria: {
        knowledge: '粘土の扱い方を知っている。',
        thinking: '粘土の形をいろいろに変えて表している。',
        attitude: '楽しみながら進んで表そうとしている。'
      }, archived: false },
    { id: 'u2-zukou-005', subject: 'zukou', grade: 2, name: '友達と作品を見合おう（鑑賞）', sequence: 5, period: '通年', source: '日本文教出版2年',
      criteria: {
        knowledge: '作品の良さや特徴を見つけることを知っている。',
        thinking: '友達の作品を見て感じたことを伝えている。',
        attitude: '友達の作品の良さを進んで見つけようとしている。'
      }, archived: false },

    // 音楽（教育芸術社2年）
    { id: 'u2-ongaku-001', subject: 'ongaku', grade: 2, name: '歌声をとどけよう（歌唱）', sequence: 1, period: '通年', source: '教芸2年',
      criteria: {
        knowledge: '歌詞や旋律の特徴を理解している。',
        thinking: '声の出し方を工夫して歌っている。',
        attitude: '友達と楽しんで歌おうとしている。'
      }, archived: false },
    { id: 'u2-ongaku-002', subject: 'ongaku', grade: 2, name: 'リズムであそぼう', sequence: 2, period: '通年', source: '教芸2年',
      criteria: {
        knowledge: '簡単なリズムを理解している。',
        thinking: '体や楽器でリズムを表現している。',
        attitude: 'リズム遊びを楽しもうとしている。'
      }, archived: false },
    { id: 'u2-ongaku-003', subject: 'ongaku', grade: 2, name: 'けんばんハーモニカ', sequence: 3, period: '通年', source: '教芸2年',
      criteria: {
        knowledge: '指使いと吹き方を知っている。',
        thinking: '曲想に合わせて演奏を工夫している。',
        attitude: '進んで練習しようとしている。'
      }, archived: false },
    { id: 'u2-ongaku-004', subject: 'ongaku', grade: 2, name: '音楽をきこう（鑑賞）', sequence: 4, period: '通年', source: '教芸2年',
      criteria: {
        knowledge: '楽器や曲の特徴を聴き取っている。',
        thinking: '音楽の良さや感じたことを伝えている。',
        attitude: '進んで音楽を聴こうとしている。'
      }, archived: false },

    // 道徳
    { id: 'u2-doutoku-001', subject: 'doutoku', grade: 2, name: '自分のこと（節度・節制）', sequence: 1, period: '通年', source: '道徳教科書2年',
      criteria: {
        knowledge: '節度ある生活の大切さを理解している。',
        thinking: '自分の生活を振り返り、考えを深めている。',
        attitude: '自分の生活を見直そうとしている。'
      }, archived: false },
    { id: 'u2-doutoku-002', subject: 'doutoku', grade: 2, name: '友達となかよく', sequence: 2, period: '通年', source: '道徳教科書2年',
      criteria: {
        knowledge: '友達と仲良くする大切さを理解している。',
        thinking: '友達との関わりを多面的に考えている。',
        attitude: '友達と進んで関わろうとしている。'
      }, archived: false },
    { id: 'u2-doutoku-003', subject: 'doutoku', grade: 2, name: '生き物・自然', sequence: 3, period: '通年', source: '道徳教科書2年',
      criteria: {
        knowledge: '自然や生き物を大切にする態度を理解している。',
        thinking: '生命の尊さについて考えを深めている。',
        attitude: '生き物や自然を大切にしようとしている。'
      }, archived: false },
    { id: 'u2-doutoku-004', subject: 'doutoku', grade: 2, name: '家族・身近な人', sequence: 4, period: '通年', source: '道徳教科書2年',
      criteria: {
        knowledge: '家族や身の回りの人への感謝の気持ちを理解している。',
        thinking: '家族や周りの人の支えを多面的に考えている。',
        attitude: '感謝の気持ちを表そうとしている。'
      }, archived: false }
  ];

  // ===== 学年別ヘルパー =====
  window.EVAL_DATA.subjectsByGrade = SUBJECTS_BY_GRADE;
  window.EVAL_DATA.unitsByGrade = {
    2: UNITS_GRADE_2,
    5: window.EVAL_DATA.units || []
  };

  window.EVAL_DATA.getSubjectsForGrade = function(grade) {
    if (!grade) return window.EVAL_DATA.subjects || [];
    return window.EVAL_DATA.subjectsByGrade[grade] || window.EVAL_DATA.subjects || [];
  };

  window.EVAL_DATA.getUnitsForGrade = function(grade) {
    if (!grade) return window.EVAL_DATA.units || [];
    if (window.EVAL_DATA.unitsByGrade[grade]) {
      return window.EVAL_DATA.unitsByGrade[grade];
    }
    return (window.EVAL_DATA.units || []).filter(u => u.grade === grade);
  };

  console.log('[eval-data-extra] 学年別データロード完了:',
    Object.keys(SUBJECTS_BY_GRADE).map(g => `${g}年(${SUBJECTS_BY_GRADE[g].length}教科)`).join(', '));
})();
