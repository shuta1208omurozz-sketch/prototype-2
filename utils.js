/**
 * @file utils.js
 * 各種汎用関数、計算ロジック、UI補助機能。
 */

const utils = {
  /**
   * 指定したミリ秒間、振動（ハプティックフィードバック）を実行
   * @param {number} ms 振動時間
   */
  vibrate(ms = 50) {
    if (state.vibration && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  },

  /**
   * 現在の日時を指定のフォーマット文字列で取得
   * @returns {string} 例: "2023/10/25 14:30:05"
   */
  getFormattedDate() {
    const now = new Date();
    const Y = now.getFullYear();
    const M = String(now.getMonth() + 1).padStart(2, '0');
    const D = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${Y}/${M}/${D} ${h}:${m}:${s}`;
  },

  /**
   * バーコード履歴データを CSV 形式に変換し、ダウンロードさせる
   */
  exportToCSV() {
    if (state.bcHistory.length === 0) {
      alert("エクスポートするデータがありません。");
      return;
    }

    const headers = ["Value", "Format", "Date", "Group", "Checked"];
    const rows = state.bcHistory.map(item => [
      `"${item.value}"`,
      `"${item.format}"`,
      `"${item.date}"`,
      `"${item.group}"`,
      item.checked ? "YES" : "NO"
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `barcode_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * アスペクト比の文字列 ('16/9' など) を数値に変換
   * @param {string} ratioStr 
   * @returns {number}
   */
  parseRatio(ratioStr) {
    const parts = ratioStr.split('/');
    if (parts.length !== 2) return 1.777; // Default 16:9
    return parseFloat(parts[0]) / parseFloat(parts[1]);
  },

  /**
   * トースト通知を表示
   * @param {string} message メッセージ
   * @param {string} type タイプ (ok, err, info)
   */
  showToast(message, type = 'ok') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    // 既存のタイマーをクリアして再設定
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  },
  
  toastTimer: null,

  /**
   * キャンバス上にバーコード画像を描画
   * @param {string} elementId 描画対象のキャンバス ID
   * @param {string} value バーコード値
   * @param {string} format バーコード形式
   */
  generateBarcode(elementId, value, format) {
    try {
      JsBarcode(`#${elementId}`, value, {
        format: format === 'CODE128' ? 'CODE128' : 'EAN13',
        width: 2,
        height: 80,
        displayValue: true,
        fontSize: 14,
        background: "#ffffff",
        lineColor: "#000000",
        margin: 10
      });
    } catch (e) {
      console.error("[Utils] Barcode generation failed:", e);
    }
  }
};
