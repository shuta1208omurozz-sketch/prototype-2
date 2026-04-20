/**
 * @file scanner.js
 * バーコードスキャンロジック。
 * 映像解析ループ、バーコード検出、および検出後の処理を管理します。
 */

const scanner = {
  /** 解析ループ用の RequestAnimationFrame ID */
  renderLoopId: null,
  /** 解析用のオフスクリーンキャンバス */
  canvas: null,
  /** キャンバスコンテキスト */
  ctx: null,
  /** 最後に読み取ったバーコード値 (重複防止用) */
  lastResult: null,
  /** 重複防止タイマー */
  resultTimeout: null,

  /**
   * スキャナーを起動する
   */
  async start() {
    console.log("[Scanner] Starting scanner engine...");
    const video = document.getElementById('scan-video');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: false
      });
      
      video.srcObject = stream;
      state.isScanning = true;
      
      video.onloadedmetadata = () => {
        video.play();
        this.initCanvas();
        this.startDetectionLoop();
        
        document.getElementById('scan-ph').style.display = 'none';
        document.getElementById('scan-line').style.display = 'block';
        document.getElementById('stxt').textContent = "スキャン中...";
        document.getElementById('sdot').className = "sdot go";
        ui.updateScanBtn();
      };
    } catch (err) {
      console.error("[Scanner] Start failed:", err);
      utils.showToast("スキャン用カメラの起動に失敗しました", "err");
    }
  },

  /**
   * 解析用キャンバスの初期化
   */
  initCanvas() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  },

  /**
   * 検出ループの開始
   */
  startDetectionLoop() {
    const video = document.getElementById('scan-video');
    
    const loop = () => {
      if (!state.isScanning) return;
      
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        this.scanFrame(video);
      }
      this.renderLoopId = requestAnimationFrame(loop);
    };
    
    this.renderLoopId = requestAnimationFrame(loop);
  },

  /**
   * フレームの解析 (モック/ロジックのコア)
   * ※ 実際の検出には BarcodeDetector API 等を利用
   * @param {HTMLVideoElement} video 
   */
  async scanFrame(video) {
    // 実際のブラウザ実装では BarcodeDetector を使用
    if (!('BarcodeDetector' in window)) {
      // 非対応ブラウザの場合はここで代替処理（今回はインターフェース維持）
      return;
    }

    const detector = new BarcodeDetector({
      formats: state.scanFormat === 'ean13' ? ['ean_13'] : ['ean_13', 'code_128', 'qr_code']
    });

    try {
      const barcodes = await detector.detect(video);
      if (barcodes.length > 0) {
        this.onDetected(barcodes[0]);
      }
    } catch (e) {
      // 解析エラー
    }
  },

  /**
   * バーコード検出時のイベント
   * @param {Object} barcode 
   */
  onDetected(barcode) {
    const value = barcode.rawValue;
    
    // 同一値の連続読み取り防止
    if (this.lastResult === value) return;
    
    this.lastResult = value;
    clearTimeout(this.resultTimeout);
    this.resultTimeout = setTimeout(() => { this.lastResult = null; }, 3000);

    // 検出成功
    utils.vibrate(100);
    this.processResult(value, barcode.format);
  },

  /**
   * スキャン結果を処理し、履歴に追加
   */
  processResult(value, format) {
    const formatLabel = format.toUpperCase();
    
    const entry = {
      id: Date.now(),
      value: value,
      format: formatLabel,
      date: utils.getFormattedDate(),
      group: state.activeGroup,
      checked: false
    };

    // 重複チェック
    const isDup = state.bcHistory.some(item => item.value === value);
    
    if (!isDup) {
      state.bcHistory.unshift(entry);
      storage.save();
      ui.updateCounts();
      utils.showToast("スキャン成功", "ok");
    } else {
      utils.showToast("既に登録済みです", "warn");
    }

    this.showResultUI(entry, isDup);
  },

  /**
   * 読み取り結果を画面下部に表示
   */
  showResultUI(item, isDup) {
    const display = document.getElementById('scan-bc-display');
    const placeholder = document.getElementById('scan-bc-placeholder');
    const valEl = document.getElementById('scan-bc-val');
    const dupEl = document.getElementById('scan-bc-dup');
    
    placeholder.style.display = 'none';
    display.style.display = 'flex';
    valEl.textContent = item.value;
    
    if (isDup) {
      dupEl.classList.add('show');
    } else {
      dupEl.classList.remove('show');
    }

    // バーコード描画
    utils.generateBarcode('scan-bc-canvas', item.value, item.format);
  },

  /**
   * スキャナーを停止
   */
  stop() {
    state.isScanning = false;
    if (this.renderLoopId) cancelAnimationFrame(this.renderLoopId);
    
    const video = document.getElementById('scan-video');
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }

    document.getElementById('scan-ph').style.display = 'flex';
    document.getElementById('scan-line').style.display = 'none';
    document.getElementById('stxt').textContent = "待機中";
    document.getElementById('sdot').className = "sdot";
    ui.updateScanBtn();
  }
};
