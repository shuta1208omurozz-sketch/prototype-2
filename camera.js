'use strict';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  CAMERA MODULE v4.5 (ULTRA-WIDE & ASPECT-RATIO INTEGRATED)
 * ══════════════════════════════════════════════════════════════════════════════
 *  このモジュールは、デバイスのカメラデバイスへのアクセス、プレビュー表示、
 *  および静止画のキャプチャを管理します。
 * 
 *  [主な機能]
 *  - 複数画質設定 (low, mid, high, max)
 *  - 動的アスペクト比切り替え (4:3, 16:9, 21:9)
 *  - ズーム制御 (デジタルズーム)
 *  - トーチ（フラッシュライト）制御
 *  - クロップ撮影 (プレビュー比率に合わせた正確な切り抜き)
 *  - Android File System Access API を利用した外部保存
 * ══════════════════════════════════════════════════════════════════════════════
 */

/**
 * カメラを起動し、ビデオストリームを開始します。
 * 画質設定(cfg.camQuality)とアスペクト比(cfg.aspectRatio)に基づいた制約を適用します。
 * @async
 * @returns {Promise<void>}
 */
async function startCam() {
  // 既存のストリームがあればクリーンアップ
  stopCam();
  
  // UI状態の更新
  camActive = true;
  const ph = $('cam-ph');
  const txt = $('cam-ph-txt');
  const errBox = $('cam-err');
  
  if (ph) ph.style.display = 'flex';
  if (txt) txt.textContent = 'カメラ初期化中...';
  if (errBox) errBox.style.display = 'none';

  // 指定された画質のベース解像度を取得
  const qBase = CAM_QUALITY[cfg.camQuality] || CAM_QUALITY.mid;

  /** @type {MediaStreamConstraints} */
  const constraints = {
    video: {
      facingMode: facingMode,
      width: { ideal: qBase.width },
      height: { ideal: qBase.height },
      // 【修正】aspectRatioを削除。これによりブラウザの勝手な切り抜きを防ぎ、
      // レンズが捉えている最大範囲（端っこまで）を取得します。
    },
    audio: false
  };

  console.log('[Camera] Starting with full lens view constraints');

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    camStream = stream;
    
    const video = $('cam-video');
    if (video) {
      video.srcObject = stream;
      
      // 【追加】レンズの端まで全て表示し、黒帯を出して全体を収める
      video.style.objectFit = 'contain';
      video.style.backgroundColor = '#000';
      
      video.onloadedmetadata = () => {
        if (ph) ph.style.display = 'none';
        
        const vf = $('cam-vf');
        if (vf) {
          vf.style.aspectRatio = cfg.aspectRatio;
          // 【追加】枠からはみ出る部分（端っこ）も見えるようにする
          vf.style.overflow = 'visible';
        }
        
        camTrack = stream.getVideoTracks()[0];
        initCamFeatures(camTrack);
        
        // 起動時にガイドを表示
        showCropOverlay(cfg.aspectRatio);
      };
    }
    
    if (scanning) stopScan();
    
  } catch (err) {
    console.error('[Camera] Start Error:', err);
    handleCamError(err);
  }
}
function stopCam() {
  if (camStream) {
    camStream.getTracks().forEach(track => {
      track.stop();
      console.log(`[Camera] Track stopped: ${track.label}`);
    });
    camStream = null;
  }
  
  const video = $('cam-video');
  if (video) {
    video.srcObject = null;
  }
  
  camActive = false;
  camTrack = null;
}

/**
 * カメラの高度な機能（ズーム、トーチ等）を初期化します。
 * @param {MediaStreamTrack} track - ビデオトラック
 */
async function initCamFeatures(track) {
  if (!track) return;
  
  try {
    const caps = track.getCapabilities();
    console.log('[Camera] Capabilities:', caps);

    // 1. ズーム制御の有効化（zoom-controls内のスライダーを使用）
    const zoomSlider = $('zoom-slider');
    const zoomLevel = $('zoom-level');
    const zoomControls = document.querySelector('.zoom-controls');

    if (caps.zoom && zoomSlider) {
      // デバイス最小値をそのまま使用（<1.0 の場合は超広角対応）
      const deviceMin = caps.zoom.min ?? 1;
      // 最大は実装上限5xにキャップ
      const deviceMax = Math.min(caps.zoom.max ?? 5, 5);
      zoomSlider.min = deviceMin;
      zoomSlider.max = deviceMax;
      zoomSlider.step = caps.zoom.step || 0.05;

      // 現在のズーム値をUIに反映
      const settings = track.getSettings();
      const currentZoom = settings.zoom || 1;
      zoomSlider.value = currentZoom;
      if (zoomLevel) {
        zoomLevel.textContent = `${parseFloat(currentZoom).toFixed(2)}x`;
        zoomLevel.style.color = currentZoom < 1 ? '#ffaa44' : 'var(--accent)';
      }
      // スライダー塗りつぶし初期化
      const initPct = ((currentZoom - deviceMin) / (deviceMax - deviceMin)) * 100;
      zoomSlider.style.setProperty('--zoom-progress', initPct.toFixed(1) + '%');
      if (zoomControls) zoomControls.style.display = 'flex';

      // 超広角インジケーター表示
      const uwLabel = $('uw-label');
      if (uwLabel) uwLabel.style.display = deviceMin < 1 ? 'inline-block' : 'none';
    } else if (zoomControls) {
      zoomControls.style.display = 'none';
    }

    // 2. トーチ（ライト）ボタンの表示制御
    const torchBtn = $('btn-torch');
    if (torchBtn) {
      // 常に表示。端末がトーチ非対応の場合はグレーアウトして無効化
      torchBtn.style.display = 'block';
      if (!caps.torch) {
        torchBtn.disabled = true;
        torchBtn.title = 'このデバイスはフラッシュライト非対応';
        torchBtn.style.opacity = '0.35';
      } else {
        torchBtn.disabled = false;
        torchBtn.title = 'フラッシュライト';
        torchBtn.style.opacity = '';
      }
    }

    // 3. 画質設定UIの更新
    applyCfgToUI();

  } catch (e) {
    console.warn('[Camera] Feature init failed:', e);
  }
}

/**
 * デジタルズームを適用します。
 * @param {number} val - ズーム倍率
 */
async function applyZoom(val) {
  if (!camTrack) return;
  try {
    await camTrack.applyConstraints({ advanced: [{ zoom: val }] });
    const lbl = $('zoom-level');
    if (lbl) lbl.textContent = `${val.toFixed(1)}x`;
  } catch (e) {
    console.error('[Camera] Zoom error:', e);
  }
}

/**
 * トーチ（ライト）のオン/オフを切り替えます。
 */
async function toggleTorch() {
  if (!camTrack) return;
  try {
    const settings = camTrack.getSettings();
    const newState = !settings.torch;
    await camTrack.applyConstraints({ advanced: [{ torch: newState }] });
    
    const btn = $('btn-torch');
    if (btn) {
      btn.classList.toggle('on', newState);
      btn.style.color = newState ? 'var(--accent)' : '';
    }
  } catch (e) {
    console.error('[Camera] Torch error:', e);
  }
}

/**
 * 現在のプレビュー内容を静止画としてキャプチャします。
 * アスペクト比に応じた正確なクロップ処理を行います。
 * @async
 */
async function takePhoto() {
  if (!camActive || !camStream) return;
  
  const video = $('cam-video');
  const shutter = $('btn-shutter');
  if (!video || video.readyState < 2) return;

  // 二重撮影防止
  if (shutter) shutter.disabled = true;

  // 1. キャプチャ用Canvasの作成
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  // ビデオの本来の解像度
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  
  // 指定されたアスペクト比を取得
  const ratioParts = cfg.aspectRatio.split('/');
  const targetRatio = parseFloat(ratioParts[0]) / parseFloat(ratioParts[1]);

  // クロップ領域の計算（中央を基準に切り抜き）
  let sw, sh, sx, sy;
  const videoRatio = vw / vh;

  if (videoRatio > targetRatio) {
    // ビデオの方が横長 -> 左右をカット
    sh = vh;
    sw = vh * targetRatio;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    // ビデオの方が縦長（または一致） -> 上下をカット
    sw = vw;
    sh = vw / targetRatio;
    sx = 0;
    sy = (vh - sh) / 2;
  }

  // 出力サイズの設定（画質設定に応じた最大幅を考慮しつつ比率を維持）
  const maxW = { low: 1024, mid: 1920, high: 2560, max: 4096 }[cfg.camQuality] || 1920;
  canvas.width = Math.min(sw, maxW);
  canvas.height = canvas.width / targetRatio;

  // 描画実行
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  // 2. サムネイルの作成（軽量化のため低解像度）
  const thumbC = document.createElement('canvas');
  const thumbSize = 300;
  thumbC.width = thumbSize;
  thumbC.height = thumbSize / targetRatio;
  thumbC.getContext('2d').drawImage(canvas, 0, 0, thumbC.width, thumbC.height);
  const thumbDataUrl = thumbC.toDataURL('image/jpeg', 0.6);

  // 3. 写真オブジェクトの構築
  const grp = cfg.useGroup ? cfg.currentGroup : '未分類';
  const photo = {
    id: Date.now() + Math.random(),
    dataUrl: thumbDataUrl, // 初期表示用（後で高画質に差し替え）
    thumbDataUrl: thumbDataUrl,
    timestamp: Date.now(),
    facingMode: facingMode,
    aspectRatio: cfg.aspectRatio,
    group: grp,
    scannedCode: lastScannedValue
  };

  // UIへの即時反映
  photos.unshift(photo);
  updateCounts();
  updateThumbStrip();
  if (activeTab === 'photos') renderPhotoGrid();

  // 視覚効果
  showFlashEffect();
  vibrate([50]);

  // シャッターボタン復帰
  if (shutter) shutter.disabled = false;

  // 4. 非同期での高画質保存処理
  setTimeout(async () => {
    try {
      const qualityMap = { low: 0.7, mid: 0.85, high: 0.92, max: 0.98 };
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', qualityMap[cfg.camQuality]));
      
      if (!blob) return;

      const finalDataUrl = await blobToDataUrl(blob);
      photo.dataUrl = finalDataUrl;

      // 自動保存（設定されている場合）
      autoSaveToDevice(photo, blob);

      // データベース保存 (storage.js)
      await dbPut(photo);
      await dbPrune(cfg.maxPhotos);
      
      console.log(`[Camera] Photo saved. ID: ${photo.id}, Size: ${Math.round(blob.size/1024)}KB`);
    } catch (err) {
      console.error('[Camera] Save Error:', err);
    }
  }, 50);
}

/**
 * 撮影時のフラッシュエフェクトを表示します。
 */
function showFlashEffect() {
  const fl = $('flash');
  if (fl) {
    fl.classList.remove('show');
    void fl.offsetWidth; // リフロー強制
    fl.classList.add('show');
    setTimeout(() => fl.classList.remove('show'), 150);
  }
}

/**
 * カメラエラーのハンドリングを行います。
 * @param {Error} err - 発生したエラーオブジェクト
 */
function handleCamError(err) {
  const errBox = $('cam-err');
  const errBody = $('cam-err-body');
  const errCode = $('cam-err-code');
  
  if (!errBox || !errBody) return;
  
  errBox.style.display = 'flex';
  errCode.textContent = err.name === 'NotAllowedError' ? 'AUTH_DENIED' : 'DEV_ERR';
  
  let msg = 'カメラにアクセスできません。';
  if (err.name === 'NotAllowedError') {
    msg = 'カメラの使用が許可されていません。ブラウザの設定で許可してください。';
  } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
    msg = '有効なカメラデバイスが見つかりません。';
  } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
    msg = 'カメラが他のアプリで使用されている可能性があります。';
  }
  
  errBody.textContent = msg;
  const ph = $('cam-ph');
  if (ph) ph.style.display = 'none';
}


/**
 * アスペクト比切り替え時にクロップ範囲を視覚的に表示します。
 * カメラは常に全センサー領域をストリームするため、
 * 実際に保存される範囲をオーバーレイで示します。
 * @param {string} ratio - '4/3', '16/9', '21/9'
 */
function showCropOverlay(ratio) {
  const overlay = $('crop-overlay');
  const label = $('crop-ratio-label');
  const maskTop = document.querySelector('.crop-mask-top');
  const maskBottom = document.querySelector('.crop-mask-bottom');

  if (!overlay) return;

  if (label) label.textContent = ratio.replace('/', ':');

  const vf = $('cam-vf');
  if (!vf) return;
  const vfW = vf.clientWidth;
  const vfH = vf.clientHeight;

  const [rw, rh] = ratio.split('/').map(Number);
  const targetRatio = rw / rh;
  const vfRatio = vfW / vfH;

  let maskH = 0;
  if (vfRatio > targetRatio) {
    const cropH = vfW / targetRatio;
    maskH = Math.max(0, (vfH - cropH) / 2);
  }

  // 【修正】真っ黒ではなく「半透明」に。
  // これにより、横長写真として保存される範囲を教えつつ、レンズの端（外側）も見えます。
  if (maskTop) {
    maskTop.style.height = maskH + 'px';
    maskTop.style.backgroundColor = 'rgba(0,0,0,0.4)'; 
  }
  if (maskBottom) {
    maskBottom.style.height = maskH + 'px';
    maskBottom.style.backgroundColor = 'rgba(0,0,0,0.4)';
  }

  overlay.style.display = 'flex';
  overlay.classList.add('show');

  // 【修正】自動で非表示にしない（常に範囲を確認できるようにするため）
  clearTimeout(overlay._hideTimer);
  // overlay._hideTimer = setTimeout(...) <-- 削除またはコメントアウト
}
function setAspectRatio(ratio) {
  if (cfg.aspectRatio === ratio) return;
  
  cfg.aspectRatio = ratio;
  saveCfg();
  
  // UIボタンの更新
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.r === ratio);
  });

  // カメラが起動中なら再起動して制約を適用
  // プレビュー枠の見た目を更新
  const vf = $("cam-vf");
  if (vf) vf.style.aspectRatio = ratio;

  // クロップオーバーレイを表示して範囲を視覚化
  showCropOverlay(ratio);

  if (camActive) {
    startCam(); // カメラがアクティブなら再起動して制約を適用
  } else {
    // カメラが非アクティブの場合でも、設定は保存しUIは更新
    applyCfgToUI(); // main.jsの関数を呼び出し、比率ボタンの表示を更新
  }
  
  console.log(`[Camera] Aspect ratio set to: ${ratio}`);
  showToast(`ASPECT: ${ratio}`, 'ok', 1000);
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  EVENT LISTENERS & INITIALIZATION
 * ══════════════════════════════════════════════════════════════════════════════
 */
  document.addEventListener("DOMContentLoaded", () => {
  // シャッターボタン
  const shutter = $("btn-shutter");
  if (shutter) shutter.onclick = takePhoto;

  // アスペクト比切り替え用の定数
  const RATIOS_ARRAY = ['4/3', '16/9', '21/9'];
  let currentRatioIdx = RATIOS_ARRAY.indexOf(cfg.aspectRatio);
  if (currentRatioIdx === -1) currentRatioIdx = 1; // デフォルト16/9

  // シャッターボタンでのスワイプによるアスペクト比変更 [NEW FEATURE]
  const camControls = $("cam-controls"); // スワイプ検出エリア
  let startX = 0;
  let isSwiping = false;

  if (camControls) {
    camControls.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isSwiping = true;
    }, { passive: true });

    camControls.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      // スワイプ中のフィードバックなどがあればここに実装
    }, { passive: true });

    camControls.addEventListener('touchend', (e) => {
      if (!isSwiping) return;
      const endX = e.changedTouches[0].clientX;
      const diffX = startX - endX; // 正の値で左スワイプ、負の値で右スワイプ
      const SWIPE_THRESHOLD = 50; // スワイプと判定する閾値 (px)

      if (Math.abs(diffX) > SWIPE_THRESHOLD) {
        if (diffX > 0) {
          // 左スワイプ: 前の比率へ (例: 21:9 -> 16:9 -> 4:3)
          currentRatioIdx = (currentRatioIdx - 1 + RATIOS_ARRAY.length) % RATIOS_ARRAY.length;
        } else {
          // 右スワイプ: 次の比率へ (例: 4:3 -> 16:9 -> 21:9)
          currentRatioIdx = (currentRatioIdx + 1) % RATIOS_ARRAY.length;
        }
        setAspectRatio(RATIOS_ARRAY[currentRatioIdx]);
      }
      isSwiping = false;
    }, { passive: true });
  } 
  // トーチボタン
  const torch = $('btn-torch');
  if (torch) torch.onclick = toggleTorch;
  
  // 再試行ボタン
  const retry = $('cam-retry');
  if (retry) retry.onclick = startCam;

  // SCANタブへ移動ボタン
  const gotoScanBtn = $('btn-goto-scan');
  if (gotoScanBtn) gotoScanBtn.onclick = () => switchTab('scan');

  // アスペクト比ボタン
  document.querySelectorAll(".ratio-btn").forEach(btn => {
    btn.onclick = () => {
      // ボタンクリック時は直接比率を設定
      setAspectRatio(btn.dataset.r);
      // スワイプ用のインデックスも更新
      currentRatioIdx = RATIOS_ARRAY.indexOf(btn.dataset.r);
    };
  });

  // ズームスライダー [NEW FEATURE]
  const zoomSlider = $("zoom-slider");
  const zoomLevelDisplay = $("zoom-level");

  if (zoomSlider && zoomLevelDisplay) {
    // 保存済みのズーム値を反映（なければ1.0x）
    const savedZoom = cfg.zoom || 1.0;
    zoomSlider.value = savedZoom;
    zoomLevelDisplay.textContent = `${savedZoom.toFixed(2)}x`;
    zoomLevelDisplay.style.color = savedZoom < 1 ? '#ffaa44' : 'var(--accent)';

    zoomSlider.oninput = async (e) => {
      const zoomValue = parseFloat(e.target.value);
      if (camTrack) {
        try {
          await camTrack.applyConstraints({ advanced: [{ zoom: zoomValue }] });
        } catch (err) {
          console.error('Failed to apply zoom constraints:', err);
          showToast('ズーム変更失敗', 'error', 2000);
        }
      }
      // 1x未満は超広角：ラベル色をオレンジに
      zoomLevelDisplay.textContent = `${zoomValue.toFixed(2)}x`;
      zoomLevelDisplay.style.color = zoomValue < 1 ? '#ffaa44' : 'var(--accent)';
      cfg.zoom = zoomValue;
      const min = parseFloat(e.target.min) || 0.5;
      const max = parseFloat(e.target.max) || 5;
      const pct = ((zoomValue - min) / (max - min)) * 100;
      e.target.style.setProperty('--zoom-progress', pct.toFixed(1) + '%');
    };
  }

  // 画質ボタン
  document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.onclick = () => {
      cfg.camQuality = btn.dataset.q;
      saveCfg();
      applyCfgToUI();
      if (camActive) startCam();
    };
  });

  // フォルダ設定トグル
  const folderToggle = $('btn-folder-toggle');
  if (folderToggle) {
    folderToggle.onclick = () => {
      const row = $('save-folder-row');
      if (row) row.style.display = row.style.display === 'none' ? 'block' : 'none';
    };
  }
});
