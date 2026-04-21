'use strict';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  UTILITY MODULE v4.5 (CORE HELPERS)
 * ══════════════════════════════════════════════════════════════════════════════
 *  このファイルはアプリケーション全体で使用される共通関数群を提供します。
 *  DOM操作の短縮形、データ変換、設定の永続化、および外部APIとの
 *  インターフェース（ファイルシステム等）を含みます。
 * ══════════════════════════════════════════════════════════════════════════════
 */

/**
 * document.getElementById のショートカット。
 * @param {string} id - 要素のID
 * @returns {HTMLElement|null}
 */
const $ = id => document.getElementById(id);

/* ════ 設定管理 ════ */

/**
 * 現在の cfg オブジェクトを localStorage に保存します。
 */
function saveCfg() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.error('[Utils] Config save failed:', e);
  }
}

/**
 * localStorage から設定を読み込み、現在の cfg オブジェクトにマージします。
 */
function loadCfg() {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // 既存のプロパティを壊さないようスプレッド演算子でマージ
      cfg = { ...cfg, ...parsed };
      console.log('[Utils] Config loaded successfully');
    } catch (e) {
      console.error('[Utils] Config parse error:', e);
    }
  }
}

/* ════ ユーザーフィードバック ════ */

/**
 * トースト通知を表示します。
 * @param {string} msg - 表示するメッセージ
 * @param {string} [type=''] - スタイルクラス ('ok', 'warn', 'err')
 * @param {number} [duration=3000] - 表示時間 (ms)
 */
function showToast(msg, type = '', duration = 3000) {
  const t = $('toast');
  if (!t) return;
  
  // 既存のタイマーがあればクリア（連続表示対応）
  if (t._timer) clearTimeout(t._timer);
  
  t.textContent = msg;
  t.className = `toast show ${type}`;
  
  t._timer = setTimeout(() => {
    t.classList.remove('show');
    t._timer = null;
  }, duration);
}

/**
 * デバイスのバイブレーションを実行します。
 * @param {number|number[]} pattern - バイブレーションパターン
 */
function vibrate(pattern) {
  if (cfg.useVibration && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // 一部のブラウザではユーザー操作なしのバイブレーションが禁止されている
    }
  }
}

/* ════ 日時フォーマット ════ */

/**
 * 数値を2桁の文字列にパディングします。
 * @param {number} n - 数値
 * @returns {string}
 */
const pad = n => String(n).padStart(2, '0');

/**
 * 標準的な日時形式に変換します。
 * @param {number} ts - タイムスタンプ
 * @returns {string} YYYY/MM/DD HH:mm:ss
 */
function fmtTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * ファイル名に適した日時形式に変換します。
 * @param {Date} d - Dateオブジェクト
 * @returns {string} YYYYMMDD_HHmmss
 */
function fmtFileDate(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * 短縮形式の日時（リスト表示用）
 * @param {number} ts - タイムスタンプ
 * @returns {string} MM/DD HH:mm
 */
function fmtShort(ts) {
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 日付のみの文字列（セクションヘッダー用）
 * @param {number} ts - タイムスタンプ
 * @returns {string} YYYY年MM月DD日
 */
function getDayString(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/* ════ データ変換 & 画像処理 ════ */

/**
 * Data URL (base64) を Blob オブジェクトに変換します。
 * @param {string} dataUrl - 変換対象のData URL
 * @returns {Blob|null}
 */
function dataUrlToBlob(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  try {
    const parts = dataUrl.split(',');
    const byteString = atob(parts[1]);
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  } catch (e) {
    console.error('[Utils] DataURL to Blob conversion failed:', e);
    return null;
  }
}

/**
 * Blob オブジェクトを Data URL (base64) に変換します。
 * @param {Blob} blob - 変換対象のBlob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(e.target.result);
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });
}

/**
 * 指定されたサイズに収まるようにサムネイルを作成します。
 * @async
 * @param {string} dataUrl - 元画像のData URL
 * @param {number} [maxSide=400] - 長辺の最大ピクセル数
 * @returns {Promise<string>} サムネイルのData URL
 */
async function createThumbnail(dataUrl, maxSide = 400) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      
      // アスペクト比を維持したリサイズ計算
      if (w > h) {
        if (w > maxSide) { h *= maxSide / w; w = maxSide; }
      } else {
        if (h > maxSide) { w *= maxSide / h; h = maxSide; }
      }
      
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      
      // 高品質なスケーリング設定
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(img, 0, 0, w, h);
      res(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = (e) => rej(new Error('Thumbnail generation failed'));
    img.src = dataUrl;
  });
}

/**
 * 画像が必要以上に大きい場合に圧縮を試みます。
 * @async
 * @param {Blob} blob - 元の画像Blob
 * @param {number} maxSize - 最大許容サイズ (bytes)
 * @returns {Promise<Blob>} 圧縮後（またはそのまま）のBlob
 */
async function compressIfNeeded(blob, maxSize) {
  if (blob.size <= maxSize) return blob;
  
  console.log(`[Utils] Compressing blob: ${Math.round(blob.size/1024)}KB > ${Math.round(maxSize/1024)}KB`);
  
  const dataUrl = await blobToDataUrl(blob);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 解像度を少し落とす (90%)
      canvas.width = img.width * 0.9;
      canvas.height = img.height * 0.9;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => res(b || blob), 'image/jpeg', 0.7);
    };
    img.src = dataUrl;
  });
}

/* ════ バーコード描画 ════ */

/**
 * 指定されたCanvasにバーコードを描画します。
 * @param {HTMLCanvasElement} canvas - 描画対象のCanvas
 * @param {string} value - バーコードの値
 * @param {string} format - バーコード形式 (ean_13, code_128等)
 * @param {number} [height=60] - バーの高さ
 * @param {boolean} [displayValue=false] - 値をテキストとして表示するか
 */
function renderBC(canvas, value, format, height = 60, displayValue = false) {
  const jf = JS_FMT[format];
  if (!jf || !window.JsBarcode) {
    console.warn('[Utils] JsBarcode or Format missing:', format);
    return;
  }
  
  try {
    JsBarcode(canvas, value, {
      format: jf,
      width: 2,
      height: height,
      displayValue: displayValue,
      fontSize: 14,
      font: 'Share Tech Mono',
      background: '#ffffff',
      lineColor: '#111111',
      margin: 10
    });
  } catch (e) {
    console.error('[Utils] Barcode render error:', e);
    // 描画失敗時はCanvasをクリア
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

/* ════ UI状態更新 ════ */

/**
 * ヘッダーやタブのカウント表示を一括更新します。
 */
function updateCounts() {
  const bcCount = bcHistory.length;
  const phCount = photos.length;
  const maxPh = cfg.maxPhotos || 200;
  
  // ヘッダー表示
  const hdrCount = $('hdr-count');
  if (hdrCount) hdrCount.textContent = `${bcCount}BC / ${phCount}📷`;
  
  // タブバッジ
  const bcTabCount = $('bc-count');
  if (bcTabCount) bcTabCount.textContent = bcCount;
  
  const phTabCount = $('ph-count');
  if (phTabCount) phTabCount.textContent = phCount;
  
  // 写真ギャラリーのステータス
  const phStatusTxt = $('photo-count-txt');
  if (phStatusTxt) phStatusTxt.textContent = `${phCount} / ${maxPh} 枚`;

  // 写真数に応じてボタン表示切り替え
  const btnSel = $('btn-ph-select-mode');
  const btnMerge = $('btn-merge-mode');
  const btnClear = $('btn-photo-clear');
  if (btnSel)   btnSel.style.display   = phCount >= 1 ? '' : 'none';
  if (btnMerge) btnMerge.style.display = phCount >= 2 ? '' : 'none';
  if (btnClear) btnClear.style.display = phCount >= 1 ? '' : 'none';
}

/**
 * タブをプログラムから切り替えます。
 * @param {string} tabName - 対象のタブ名 ('scan', 'camera', etc.)
 */
function switchTab(tabName) {
  const tabBtn = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (tabBtn) {
    tabBtn.click();
  } else {
    console.error('[Utils] Tab not found:', tabName);
  }
}

/* ════ デバイス・ブラウザ判定 ════ */

/** @constant {boolean} iOSデバイスかどうか */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

/** @constant {boolean} Androidデバイスかどうか */
const isAndroid = /Android/i.test(navigator.userAgent);

/** @constant {boolean} File System Access API が使用可能か */
const hasFileSystemAccess = 'showDirectoryPicker' in window;

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * [MEMO]
 * ユーティリティ関数は副作用を最小限にし、純粋関数に近い形で維持することが
 * 望ましいです。グローバル変数へのアクセスは慎重に行う必要があります。
 * ══════════════════════════════════════════════════════════════════════════════
 */
