/**
 * @file state.js - Scanner + Camera Ultimate
 * アプリケーションのグローバルステート管理。
 * 全てのリアクティブなデータ、設定値、UIのフラグをこのオブジェクトで一元管理します。
 */

const state = {
  /** 現在表示中のタブ ID (scan, history, camera, photos, settings) */
  currentTab: 'scan',

  /** バーコード読み取り履歴データの配列 */
  bcHistory: [],

  /** 撮影・保存された写真データの配列 */
  photos: [],

  /** ユーザー定義のグループ名リスト */
  groups: ['General', 'Stock', 'Shipping', 'Personal'],

  /** 現在選択されているアクティブグループ */
  activeGroup: 'General',

  /** カメラのアスペクト比設定 ('4/3', '16/9', '21/9') */
  aspectRatio: '16/9',

  /** カメラのズームレベル (デフォルト1.0) */
  zoom: 1.0,

  /** カメラの使用方向 ('user' または 'environment') */
  facingMode: 'environment',

  /** スキャン実行中フラグ */
  isScanning: false,

  /** スキャンのデフォルトフォーマット設定 ('ean13' または 'all') */
  scanFormat: 'ean13',

  /** ハプティック（振動）設定の有効・無効 */
  vibration: true,

  /** 写真の最大保存枚数 */
  maxPhotos: 100,

  /** 連続スキャンモードの有効・無効 */
  continuousScan: false,

  /** 写真一覧での複数選択モードフラグ */
  multiSelectMode: false,

  /** 現在選択されている写真の ID 配列 */
  selectedPhotos: [],

  /** バーコード履歴での複数選択モードフラグ */
  bcMultiSelectMode: false,

  /** 現在選択されているバーコード項目の ID 配列 */
  selectedBcItems: [],

  /** 画像結合（マージ）モードの有効・無効 */
  mergeMode: false,

  /** 写真一覧のソート順 ('new' または 'old') */
  photoSortOrder: 'new',

  /** バーコード履歴の表示モード ('normal' または 'compact') */
  bcDisplayMode: 'normal',

  /**
   * ステートの初期化
   */
  init() {
    console.log("[State] Initializing application state...");
  }
};

// 初期化実行
state.init();
