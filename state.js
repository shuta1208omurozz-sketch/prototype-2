'use strict';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  SCANNER + CAMERA SYSTEM v4.5 (ULTRA-WIDE INTEGRATED)
 * ══════════════════════════════════════════════════════════════════════════════
 *  このファイルはアプリケーションの全状態（State）を一括管理します。
 *  UIのリアクティブな更新、設定の永続化、および各モジュール間での
 *  データ共有を支える基盤レイヤーです。
 * 
 *  [主な管理項目]
 *  - ユーザー設定 (cfg)
 *  - カメラ・スキャン状態 (scanning, camActive, etc.)
 *  - メディアストリーム (scanStream, camStream)
 *  - 履歴データ (bcHistory, photos)
 *  - UI表示状態 (activeTab, currentDetail, etc.)
 *  - アスペクト比設定 (aspectRatio) - [NEW]
 * ══════════════════════════════════════════════════════════════════════════════
 */

/* ════ ローカルストレージ キー設定 ════ */
/** @constant {string} アプリケーション設定保存用キー */
const SETTINGS_KEY = 'sc-settings-v1';
/** @constant {string} バーコード履歴保存用キー */
const BC_KEY = 'sc-bc-v3';

/* ════ システム定数 ════ */
/** @type {number} 最大保存写真枚数のデフォルト値 */
let MAX_PH = 200;

/**
 * アプリケーション設定オブジェクト
 * localStorageに保存され、起動時に読み込まれます。
 * @type {Object}
 */
let cfg = {
  /** @type {boolean} 起動時にスキャンを自動開始するか */
  autoStartScan: true,
  /** @type {string} デフォルトのスキャンフォーマット */
  scanFormat: 'ean13',
  /** @type {string} カメラの画質設定 ('low', 'mid', 'high', 'max') */
  camQuality: 'mid',
  /** @type {number} 保存可能な最大写真枚数 */
  maxPhotos: 200,
  /** @type {number} サムネイル表示サイズ (px) */
  photoSize: 80, 
  /** @type {boolean} バーコード履歴のコンパクト表示モード */
  bcCompactMode: false, 
  /** @type {boolean} バイブレーション通知の使用 */
  useVibration: true,
  /** @type {boolean} 連続スキャンモード（停止せずに次を読み取る） */
  continuousScan: false,
  /** @type {boolean} グループ管理機能の使用 */
  useGroup: false,
  /** @type {string[]} 定義済みグループリスト */
  groups: ['未分類', '食品', '機械', '文具'],
  /** @type {string} 現在選択されているグループ */
  currentGroup: '未分類',
  /** @type {string} 現在選択されているアスペクト比 ('4/3', '16/9', '21/9') */
  aspectRatio: '16/9'
};

/* ════ 実行時データ保持用変数 ════ */
/** @type {Array<Object>} バーコードスキャン履歴の配列 */
let bcHistory = [];
/** @type {Array<Object>} 撮影された写真オブジェクトの配列 */
let photos = [];

/* ════ カメラ・スキャン制御状態 ════ */
/** @type {boolean} 現在スキャン中かどうか */
let scanning = false;
/** @type {string} 現在のスキャンモード */
let scanMode = 'ean13';
/** @type {boolean} カメラプレビューがアクティブかどうか */
let camActive = false;
/** @type {string} 現在適用されているカメラ画質 */
let camQuality = 'mid';

/* ════ メディア・ストリーム関連 ════ */
/** @type {MediaStream|null} スキャナー用メディアストリーム */
let scanStream = null;
/** @type {MediaStream|null} カメラ用メディアストリーム */
let camStream = null;
/** @type {BarcodeDetector|null} Web Barcode Detection API インスタンス */
let detector = null;
/** @type {number|null} requestAnimationFrame のID */
let raf = null;
/** @type {string|null} 最後に検出されたバーコード値 */
let lastCode = null;
/** @type {number} 最後に検出された時刻（タイムスタンプ） */
let lastCodeTime = 0;
/** @type {MediaStreamTrack|null} 現在使用中のビデオトラック */
let camTrack = null;

/** @type {string} 最新のバーコード値（写真保存時に紐付ける用） */
let lastScannedValue = "";

/* ════ UI表示・ナビゲーション状態 ════ */
/** @type {string} 現在アクティブなタブID ('scan', 'camera', 'photos', 'settings') */
let activeTab = 'scan';
/** @type {Object|null} 現在詳細表示中のアイテム */
let currentDetail = null;
/** @type {Object|null} 現在ライトボックス表示中の画像情報 */
let currentLightbox = null;
/** @type {string} 履歴表示のフィルタリング条件 ('all' または グループ名) */
let histFilter = 'all';
/** @type {boolean} サムネイルストリップ（カメラ画面下部）の表示状態 */
let thumbStripVisible = localStorage.getItem('sc-thumb-vis') !== '0';

/* ════ 編集・選択モード状態 ════ */
/** @type {boolean} バーコード履歴の結合モードが有効か */
let mergeMode = false;
/** @type {Array<string>} 結合対象として選択されたIDの配列 */
let mergeSelected = [];

/** @type {boolean} 写真の複数選択モードが有効か */
let multiSelModePh = false;
/** @type {Array<number>} 選択された写真IDの配列 */
let multiSelectedPh = []; 

/** @type {boolean} バーコードの複数選択モードが有効か */
let multiSelModeBc = false;
/** @type {Array<string>} 選択されたバーコードIDの配列 */
let multiSelectedBc = [];

/* ════ 並び替え・詳細設定 ════ */
/** @type {string} バーコード履歴のソート順 ('asc', 'desc') */
let sortOrderBc = 'desc'; 
/** @type {string} 写真履歴のソート順 ('asc', 'desc') */
let sortOrderPh = 'desc';
/** @type {string} 使用するカメラの向き ('user', 'environment') */
let facingMode = 'environment'; 
/** @type {string} グループ移動の対象 ('ph', 'bc') */
let groupMoveTarget = 'ph';

/* ════ 定数マッピング ════ */

/**
 * 画質設定ごとの制約条件
 * @constant {Object}
 */
const CAM_QUALITY = {
  low: { width: { ideal: 640 }, height: { ideal: 480 } },
  mid: { width: { ideal: 1280 }, height: { ideal: 720 } },
  high: { width: { ideal: 1920 }, height: { ideal: 1080 } },
  max: { width: { ideal: 3840 }, height: { ideal: 2160 } }
};

/**
 * アスペクト比の数値マッピング
 * @constant {Object}
 */
const ASPECT_RATIOS = {
  '4/3': 4/3,
  '16/9': 16/9,
  '21/9': 21/9
};

/**
 * バーコードスキャナーのフォーマット表示名
 * @constant {Object}
 */
const JS_FMT = {
  ean_13: 'EAN13', ean_8: 'EAN8', code_128: 'CODE128',
  code_39: 'CODE39', code_93: 'CODE93', upc_a: 'UPC',
  upc_e: 'UPC', itf: 'ITF14'
};

/**
 * サポートされている全スキャンフォーマット
 * @constant {string[]}
 */
const ALL_FMTS = [
  'qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39',
  'code_93', 'itf', 'upc_a', 'upc_e', 'aztec',
  'data_matrix', 'pdf417'
];

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * [MEMO]
 * 今後の拡張予定:
 * - クラウド同期フラグの追加
 * - カスタムカラーテーマの保持
 * - センサー感度の調整パラメータ
 * ══════════════════════════════════════════════════════════════════════════════
 */
