/**
 * @file storage.js
 * ブラウザの LocalStorage を使用したデータの保存・読み込み・同期。
 */

const storage = {
  /** LocalStorage で使用する一意のキー名 */
  STORAGE_KEY: 'scanner_camera_ultimate_v41_data',

  /**
   * 現在のステートを LocalStorage に保存する
   * @returns {boolean} 保存が成功したかどうか
   */
  save() {
    try {
      const dataToSave = {
        bcHistory: state.bcHistory,
        photos: state.photos,
        groups: state.groups,
        activeGroup: state.activeGroup,
        aspectRatio: state.aspectRatio,
        vibration: state.vibration,
        maxPhotos: state.maxPhotos,
        continuousScan: state.continuousScan,
        scanFormat: state.scanFormat,
        photoSortOrder: state.photoSortOrder,
        bcDisplayMode: state.bcDisplayMode
      };

      const serializedData = JSON.stringify(dataToSave);
      localStorage.setItem(this.STORAGE_KEY, serializedData);
      return true;
    } catch (error) {
      console.error("[Storage] Save failed:", error);
      // 容量オーバー時の処理
      if (error.name === 'QuotaExceededError') {
        alert("ストレージ容量がいっぱいです。古い写真を削除してください。");
      }
      return false;
    }
  },

  /**
   * LocalStorage からデータを読み込み、ステートに反映する
   */
  load() {
    try {
      const rawData = localStorage.getItem(this.STORAGE_KEY);
      if (!rawData) {
        console.log("[Storage] No saved data found. Using defaults.");
        return;
      }

      const parsedData = JSON.parse(rawData);
      
      // データのマッピング（安全にプロパティを上書き）
      if (parsedData.bcHistory) state.bcHistory = parsedData.bcHistory;
      if (parsedData.photos) state.photos = parsedData.photos;
      if (parsedData.groups) state.groups = parsedData.groups;
      if (parsedData.activeGroup) state.activeGroup = parsedData.activeGroup;
      if (parsedData.aspectRatio) state.aspectRatio = parsedData.aspectRatio;
      if (parsedData.vibration !== undefined) state.vibration = parsedData.vibration;
      if (parsedData.maxPhotos) state.maxPhotos = parsedData.maxPhotos;
      if (parsedData.continuousScan !== undefined) state.continuousScan = parsedData.continuousScan;
      if (parsedData.scanFormat) state.scanFormat = parsedData.scanFormat;
      if (parsedData.photoSortOrder) state.photoSortOrder = parsedData.photoSortOrder;
      if (parsedData.bcDisplayMode) state.bcDisplayMode = parsedData.bcDisplayMode;

      console.log("[Storage] Data loaded successfully.");
    } catch (error) {
      console.error("[Storage] Load failed:", error);
    }
  },

  /**
   * アプリケーションの全てのデータを初期化する
   */
  clearAll() {
    if (confirm("全ての写真と履歴データを完全に削除してもよろしいですか？")) {
      localStorage.removeItem(this.STORAGE_KEY);
      location.reload();
    }
  }
};
