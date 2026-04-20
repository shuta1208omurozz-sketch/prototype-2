/**
 * @file camera.js
 * 高度なカメラ制御ロジック。
 * アスペクト比の動的変更、ズーム、トーチ制御、
 * およびプレビューと一致する中央クロップ撮影機能を実装します。
 */

const camera = {
  /** 実行中の MediaStream オブジェクト */
  stream: null,
  /** 映像を表示する HTMLVideoElement */
  videoEl: null,
  /** 使用中の映像トラックの Capabilities (ズーム、トーチ等の利用可否) */
  capabilities: null,

  /**
   * カメラを初期化し、ストリームを開始する
   * @param {string} forcedRatio - 強制的に適用する比率 (オプション)
   */
  async start(forcedRatio = null) {
    console.log("[Camera] Starting camera engine...");
    this.stop();

    this.videoEl = document.getElementById('cam-video');
    const ratioToUse = forcedRatio || state.aspectRatio;
    const numericRatio = utils.parseRatio(ratioToUse);

    // デバイスの向きに応じて解像度を選択
    const isPortrait = window.innerHeight > window.innerWidth;
    
    /** @type {MediaStreamConstraints} */
    const constraints = {
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: isPortrait ? 1080 : 1920 },
        height: { ideal: isPortrait ? 1920 : 1080 },
        aspectRatio: { ideal: numericRatio }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoEl.srcObject = this.stream;

      // 読み込み完了後の処理
      this.videoEl.onloadedmetadata = () => {
        console.log(`[Camera] Stream established: ${this.videoEl.videoWidth}x${this.videoEl.videoHeight}`);
        this.videoEl.play();
        this.updateCapabilities();
        document.getElementById('cam-ph').style.display = 'none';
        utils.showToast("カメラ準備完了", "info");
      };
    } catch (error) {
      this.handleError(error);
    }
  },

  /**
   * 現在のカメラトラックから利用可能な機能を抽出する
   */
  updateCapabilities() {
    if (!this.stream) return;
    const track = this.stream.getVideoTracks()[0];
    
    if (track.getCapabilities) {
      this.capabilities = track.getCapabilities();
      console.log("[Camera] Device Capabilities:", this.capabilities);
      this.initZoomSlider();
      this.updateTorchUI();
    } else {
      console.warn("[Camera] getCapabilities is not supported in this browser.");
      document.getElementById('zoom-row').style.display = 'none';
    }
  },

  /**
   * ズームスライダーの初期化と反映
   */
  initZoomSlider() {
    const row = document.getElementById('zoom-row');
    const slider = document.getElementById('zoom-slider');
    const label = document.getElementById('zoom-lbl');

    if (this.capabilities && this.capabilities.zoom) {
      row.style.display = 'flex';
      slider.min = this.capabilities.zoom.min;
      slider.max = this.capabilities.zoom.max;
      slider.step = 0.1;
      slider.value = state.zoom;
      label.textContent = `${parseFloat(state.zoom).toFixed(1)}×`;
    } else {
      row.style.display = 'none';
    }
  },

  /**
   * ズーム値をカメラに適用
   * @param {number} value - ズーム倍率
   */
  async setZoom(value) {
    if (!this.stream) return;
    const track = this.stream.getVideoTracks()[0];
    
    try {
      await track.applyConstraints({
        advanced: [{ zoom: value }]
      });
      state.zoom = value;
      document.getElementById('zoom-lbl').textContent = `${parseFloat(value).toFixed(1)}×`;
    } catch (e) {
      console.error("[Camera] Zoom application failed:", e);
    }
  },

  /**
   * トーチ（フラッシュライト）のON/OFF
   */
  async toggleTorch() {
    if (!this.stream || !this.capabilities || !this.capabilities.torch) {
      utils.showToast("このデバイスではライトを使用できません", "err");
      return;
    }

    const track = this.stream.getVideoTracks()[0];
    const currentTorch = track.getSettings().torch || false;
    
    try {
      await track.applyConstraints({
        advanced: [{ torch: !currentTorch }]
      });
      utils.vibrate(30);
      utils.showToast(!currentTorch ? "LIGHT ON" : "LIGHT OFF", "info");
    } catch (e) {
      console.error("[Camera] Torch toggle failed:", e);
    }
  },

  /**
   * 写真撮影を実行。
   * 指定されたアスペクト比に基づいて中央をクロップし、プレビュー画面と一致する画像を生成します。
   */
  async takePhoto() {
    if (!this.stream || !this.videoEl) return;

    utils.vibrate(60);
    this.playFlashEffect();

    const video = this.videoEl;
    const canvas = document.createElement('canvas');
    
    // 1. 比率の計算
    const [targetW, targetH] = state.aspectRatio.split('/').map(Number);
    const targetRatio = targetW / targetH;

    // 2. ソース映像のサイズ
    const sW = video.videoWidth;
    const sH = video.videoHeight;
    const sRatio = sW / sH;

    // 3. 中央クロップ座標の計算
    let drawW, drawH, offsetX, offsetY;

    if (sRatio > targetRatio) {
      // ソースがターゲットより横長の場合 -> 左右を削る
      drawH = sH;
      drawW = sH * targetRatio;
      offsetX = (sW - drawW) / 2;
      offsetY = 0;
    } else {
      // ソースがターゲットより縦長（または一致）の場合 -> 上下を削る
      drawW = sW;
      drawH = sW / targetRatio;
      offsetX = 0;
      offsetY = (sH - drawH) / 2;
    }

    // 4. 出力キャンバスサイズの決定 (高画質維持のため短辺を1080px以上に設定)
    const exportWidth = 1920; 
    const exportHeight = exportWidth / targetRatio;
    
    canvas.width = exportWidth;
    canvas.height = exportHeight;

    const ctx = canvas.getContext('2d');
    
    // 高品質なスケーリング設定
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 描画実行
    ctx.drawImage(video, offsetX, offsetY, drawW, drawH, 0, 0, exportWidth, exportHeight);

    // 5. データ化と保存
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    const photoEntry = {
      id: Date.now(),
      src: dataUrl,
      date: utils.getFormattedDate(),
      group: state.activeGroup,
      ratio: state.aspectRatio,
      timestamp: Date.now()
    };

    // 保存とUI更新
    state.photos.unshift(photoEntry);
    
    // 最大保存枚数チェック
    if (state.photos.length > state.maxPhotos) {
      state.photos = state.photos.slice(0, state.maxPhotos);
    }

    storage.save();
    
    if (typeof photos !== 'undefined' && photos.renderGrid) {
      photos.renderGrid();
    }
    
    ui.updateCounts();
    utils.showToast("CAPTURED", "ok");
  },

  /**
   * 撮影時の視覚効果（フラッシュ）
   */
  playFlashEffect() {
    const flashEl = document.getElementById('flash');
    flashEl.style.opacity = '1';
    setTimeout(() => {
      flashEl.style.opacity = '0';
    }, 150);
  },

  /**
   * カメラの停止
   */
  stop() {
    if (this.stream) {
      console.log("[Camera] Stopping stream...");
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  },

  /**
   * エラーハンドリング
   * @param {Error} err 
   */
  handleError(err) {
    console.error("[Camera] Error:", err.name, err.message);
    const errBody = document.getElementById('cam-err-body');
    const errBox = document.getElementById('cam-err');
    
    let msg = "カメラの起動に失敗しました。";
    if (err.name === 'NotAllowedError') msg = "カメラへのアクセスが拒否されました。設定を確認してください。";
    if (err.name === 'NotFoundError') msg = "カメラが見つかりません。";
    
    if (errBody) errBody.textContent = msg;
    if (errBox) errBox.style.display = 'block';
    
    utils.showToast("カメラエラー", "err");
  }
};
