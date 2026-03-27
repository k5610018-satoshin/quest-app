/**
 * 学びの冒険クエスト - GAS API通信レイヤー
 * GAS doPostとのfetch通信を管理
 *
 * GAS CORS制約:
 * - GASはOPTIONSプリフライトに対応していない
 * - "全員がアクセス可能"でデプロイすればリダイレクト経由でJSONを取得可能
 * - fetch()のmode指定に注意（リダイレクト対応が必要）
 */

const API = {
  /**
   * GAS APIにPOSTリクエストを送る
   * @param {string} action - APIアクション名
   * @param {Object} data - リクエストデータ
   * @returns {Promise<Object>} レスポンスJSON
   */
  async post(action, data = {}) {
    const url = CONFIG.gasUrl + '?action=' + encodeURIComponent(action);

    if (CONFIG.debug) {
      console.log('[API]', action, data);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      const result = await response.json();

      if (CONFIG.debug) {
        console.log('[API Response]', action, result);
      }

      return result;
    } catch (error) {
      console.error('[API Error]', action, error);
      return { success: false, error: '通信エラー: ' + error.message };
    }
  },

  // === 児童認識 ===
  async getStudentByToken(token) {
    return this.post('getStudentByToken', { token });
  },

  async getStudentByNumber(studentNumber) {
    return this.post('getStudentByNumber', { studentNumber });
  },

  async getStudentStatus(studentId) {
    return this.post('getStudentStatus', { studentId });
  },

  // === 日記 ===
  async submitDiary(studentId, content) {
    return this.post('submitDiary', { studentId, content });
  },

  async getDiaries(studentId) {
    return this.post('getDiaries', { studentId });
  },

  // === 振り返り ===
  async submitReflection(studentId, subject, period, plan, content) {
    return this.post('submitReflection', { studentId, subject, period, plan, content });
  },

  async getReflections(studentId) {
    return this.post('getReflections', { studentId });
  },

  // === マトリクス ===
  async submitMatrix(studentId, data) {
    return this.post('submitMatrix', { studentId, ...data });
  },

  async submitReflectionWithMatrix(studentId, reflectionData, matrixData) {
    return this.post('submitReflectionWithMatrix', {
      studentId,
      ...reflectionData,
      ...matrixData
    });
  },

  async getMatrixHistory(studentId) {
    return this.post('getMatrixHistory', { studentId });
  },

  // === スキルツリー・コレクション ===
  async getSkillTree(studentId) {
    return this.post('getSkillTree', { studentId });
  },

  async getCollection(studentId) {
    return this.post('getCollection', { studentId });
  },

  // === 週次振り返り ===
  async getWeeklyData(studentId) {
    return this.post('getWeeklyData', { studentId });
  },

  async submitWeeklyReview(studentId, weekStart, weekEnd, content) {
    return this.post('submitWeeklyReview', { studentId, weekStart, weekEnd, content });
  },

  // === 管理 ===
  async getUsers() {
    return this.post('getUsers', {});
  },

  async addComment(targetType, targetId, comment) {
    return this.post('addComment', { targetType, targetId, comment });
  },

  async getUnsubmittedStudents(type) {
    return this.post('getUnsubmittedStudents', { type });
  }
};
