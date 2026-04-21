'use strict';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  CAMERA MODULE v4.6 (ULTRA-WIDE & ASPECT-RATIO INTEGRATED) - FULL STABLE
 * ══════════════════════════════════════════════════════════════════════════════
 *  [主要機能]
 *  - 複数画質設定 (low, mid, high, max)
 *  - 動的アスペクト比切り替え (4:3, 16:9, 21:9)
 *  - ズーム制御 (デジタルズーム、超広角0.5x対応)
 *  - トーチ（フラッシュライト）制御
 *  - クロップ撮影 (プレビュー比率に合わせた正確な中央切り抜き)
 *  - Android File System Access API を利用した外部フォルダ保存
 *  - IndexedDB を利用した内部高速保存
 * 
 *  [修正点]
 *  - stopCam の完全な定義を追加（クラッシュ防止）
 *  - startCam の二重起動防止と finally によるフリーズ回避
 *  - 制約オブジェクトの参照エラーを修正
 * ══════════════════════════════════════════════════════════════════════════════
 */

// 二重起動防止フラグ
let isStarting = false;

/**
 * カメラを完全に停止し、メモリとハードウェアリソースを解放します。
 * タブ切り替え時やエラー発生時に呼び出されます。
 * @returns {void}
 */
function stopCam() {
  console.log('[Camera] Stopping all camera resources...');
  
  if (camStream) {
    camStream.getTracks().forEach(track => {
      console.log(`[Camera] Stopping track: ${track.label}`);
      track.stop();
    });
    camStream = null;
  }

  camTrack = null;
  camActive = false;

  const video = $('cam-video');
  if (video) {
    video.pause();
    video.srcObject = null;
    try {
      video.load(); 
    } catch (e) {
      console.warn('[Camera] Video load reset error:', e);
    }
  }

  const ph = $('cam-ph');
  if (ph) ph.style.display = 'flex';
  
  console.log('[Camera] Stopped successfully.');
}

/**
 * カメラを起動し、ビデオストリームを開始します。
 * 画質設定(cfg.camQuality)とアスペクト比(cfg.aspectRatio)に基づいた制約を適用します。
 * @async
 * @returns {Promise<void>}
 */
async function startCam() {
  if (isStarting) {
    console.warn('[Camera] Start already in progress...');
    return;
  }
  isStarting = true;

  // 1. 既存のカメラとスキャナーを停止
  stopCam();
  if (typeof stopScan === 'function') {
    stopScan();
  }

  const video  = $('cam-video');
  const ph     = $('cam-ph');
  const txt    = $('cam-ph-txt');
  const errBox = $('cam-err');

  if (ph)     ph.style.display     = 'flex';
  if (txt)    txt.textContent      = 'カメラ初期化中...';
  if (errBox) errBox.style.display = 'none';

  // 2. 制約の構築
  const qBase = CAM_QUALITY[cfg.camQuality] || CAM_QUALITY.mid;
  const [arW, arH] = (cfg.aspectRatio || '16/9').split('/').map(Number);
  const idealAspectRatio = arW / arH;

  const constraints = {
    video: {
      facingMode:   facingMode,
      // state.jsの構造(width: {ideal: 1280})に直接合わせる
      width:        qBase.width,
      height:       qBase.height,
      aspectRatio:  { ideal: idealAspectRatio }
    },
    audio: false
  };

  try {
    console.log('[Camera] Requesting MediaDevices with:', constraints);
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    camStream = stream;

    if (video) {
      video.srcObject = stream;
      video.style.objectFit       = 'cover';
      video.style.width           = '100%';
      video.style.height          = '100%';
      video.style.backgroundColor = '#000';

      video.onloadedmetadata = async () => {
        try {
          await video.play();
          if (ph) ph.style.display = 'none';

          const vf = $('cam-vf');
          if (vf) {
            vf.style.aspectRatio = cfg.aspectRatio;
            vf.style.overflow    = 'hidden';
          }

          camTrack = stream.getVideoTracks()[0];
          camActive = true;
          
          initCamFeatures(camTrack);
          showCropOverlay(cfg.aspectRatio);
          
          console.log('[Camera] Stream started at:', video.videoWidth, 'x', video.videoHeight);
        } catch (playErr) {
          console.warn('[Camera] Play interrupted (Safe to ignore):', playErr);
        }
      };
    }
  } catch (err) {
    console.error('[Camera] Start Error:', err);
    handleCamError(err);
  } finally {
    isStarting = false;
  }
}

/**
 * カメラのデバイス機能（ズーム、トーチ等）を初期化します。
 * @param {MediaStreamTrack} track - アクティブなビデオトラック
 */
async function initCamFeatures(track) {
  if (!track) return;

  try {
    const caps = track.getCapabilities();
    const zoomSlider   = $('zoom-slider');
    const zoomLevel    = $('zoom-level');
    const zoomControls = document.querySelector('.zoom-controls');

    // 1. ズーム制御
    if (caps.zoom && zoomSlider) {
      const deviceMin = caps.zoom.min ?? 1;
      const deviceMax = Math.min(caps.zoom.max ?? 5, 5);
      
      zoomSlider.min  = deviceMin;
      zoomSlider.max  = deviceMax;
      zoomSlider.step = caps.zoom.step || 0.05;

      const settings     = track.getSettings();
      const currentZoom  = settings.zoom || 1;
      zoomSlider.value   = currentZoom;

      if (zoomLevel) {
        zoomLevel.textContent = `${parseFloat(currentZoom).toFixed(2)}x`;
        zoomLevel.style.color = currentZoom < 1 ? '#ffaa44' : 'var(--accent)';
      }

      const initPct = ((currentZoom - deviceMin) / (deviceMax - deviceMin)) * 100;
      zoomSlider.style.setProperty('--zoom-progress', initPct.toFixed(1) + '%');
      
      if (zoomControls) zoomControls.style.display = 'flex';

      const uwLabel = $('uw-label');
      if (uwLabel) uwLabel.style.display = deviceMin < 1 ? 'inline-block' : 'none';
      
      if (cfg.zoom && cfg.zoom !== currentZoom) {
        applyZoom(cfg.zoom);
      }
    } else if (zoomControls) {
      zoomControls.style.display = 'none';
    }

    // 2. トーチ（ライト）制御
    const torchBtn = $('btn-torch');
    if (torchBtn) {
      torchBtn.style.display = 'block';
      if (!caps.torch) {
        torchBtn.disabled      = true;
        torchBtn.style.opacity = '0.35';
      } else {
        torchBtn.disabled      = false;
        torchBtn.style.opacity = '';
      }
    }

    if (typeof applyCfgToUI === 'function') {
      applyCfgToUI();
    }

  } catch (e) {
    console.warn('[Camera] Feature init failed:', e);
  }
}

/**
 * デジタルズームをビデオトラックに適用します。
 */
async function applyZoom(val) {
  if (!camTrack) return;
  try {
    await camTrack.applyConstraints({ advanced: [{ zoom: val }] });
    const lbl = $('zoom-level');
    if (lbl) {
      lbl.textContent = `${val.toFixed(2)}x`;
      lbl.style.color = val < 1 ? '#ffaa44' : 'var(--accent)';
    }
  } catch (e) {
    console.error('[Camera] Zoom application error:', e);
  }
}

/**
 * トーチ（フラッシュライト）のオン/オフを切り替えます。
 */
async function toggleTorch() {
  if (!camTrack) return;
  try {
    const settings  = camTrack.getSettings();
    const newState  = !settings.torch;
    await camTrack.applyConstraints({ advanced: [{ torch: newState }] });

    const btn = $('btn-torch');
    if (btn) {
      btn.classList.toggle('on', newState);
      btn.style.color = newState ? 'var(--accent)' : '';
    }
  } catch (e) {
    console.error('[Camera] Torch toggle error:', e);
  }
}

/**
 * 現在のプレビューを静止画としてキャプチャします。
 * @async
 */
async function takePhoto() {
  if (!camActive || !camStream) return;

  const video   = $('cam-video');
  const shutter = $('btn-shutter');
  if (!video || video.readyState < 2) return;

  if (shutter) shutter.disabled = true;

  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d', { alpha: false, desynchronized: true });

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const ratioParts  = (cfg.aspectRatio || '16/9').split('/');
  const targetRatio = parseFloat(ratioParts[0]) / parseFloat(ratioParts[1]);

  // クロップ計算（中央基準）
  let sw, sh, sx, sy;
  const videoRatio = vw / vh;
  if (videoRatio > targetRatio) {
    sh = vh; sw = vh * targetRatio; sx = (vw - sw) / 2; sy = 0;
  } else {
    sw = vw; sh = vw / targetRatio; sx = 0; sy = (vh - sh) / 2;
  }

  const maxW = { low: 1024, mid: 1920, high: 2560, max: 4096 }[cfg.camQuality] || 1920;
  canvas.width  = Math.min(sw, maxW);
  canvas.height = canvas.width / targetRatio;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  // サムネイル生成（別キャンバス）
  const thumbC    = document.createElement('canvas');
  const thumbSize = 300;
  thumbC.width    = thumbSize;
  thumbC.height   = thumbSize / targetRatio;
  thumbC.getContext('2d').drawImage(canvas, 0, 0, thumbC.width, thumbC.height);
  const thumbDataUrl = thumbC.toDataURL('image/jpeg', 0.6);

  const grp   = cfg.useGroup ? cfg.currentGroup : '未分類';
  const photo = {
    id:           Date.now() + Math.random(),
    dataUrl:      thumbDataUrl,
    thumbDataUrl: thumbDataUrl,
    timestamp:    Date.now(),
    facingMode:   facingMode,
    aspectRatio:  cfg.aspectRatio,
    group:        grp,
    scannedCode:  (typeof lastScannedValue !== 'undefined') ? lastScannedValue : ""
  };

  photos.unshift(photo);
  if (typeof updateCounts === 'function') updateCounts();
  if (typeof updateThumbStrip === 'function') updateThumbStrip();
  if (activeTab === 'photos' && typeof renderPhotoGrid === 'function') renderPhotoGrid();

  showFlashEffect();
  if (typeof vibrate === 'function') vibrate([50]);

  if (shutter) shutter.disabled = false;

  // 高画質保存処理
  setTimeout(async () => {
    try {
      const q = { low: 0.7, mid: 0.85, high: 0.92, max: 0.98 }[cfg.camQuality] || 0.85;
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', q));
      if (!blob) return;
      photo.dataUrl = await blobToDataUrl(blob);
      if (typeof autoSaveToDevice === 'function') autoSaveToDevice(photo, blob);
      if (typeof dbPut === 'function') {
        await dbPut(photo);
        await dbPrune(cfg.maxPhotos);
      }
    } catch (err) {
      console.error('[Camera] Save error:', err);
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
    void fl.offsetWidth; 
    fl.classList.add('show');
    setTimeout(() => fl.classList.remove('show'), 150);
  }
}

/**
 * カメラエラーのハンドリングを行います。
 * @param {Error} err - 発生したエラーオブジェクト
 */
function handleCamError(err) {
  const errBox  = $('cam-err');
  const errBody = $('cam-err-body');
  const errCode = $('cam-err-code');
  if (!errBox || !errBody) return;
  errBox.style.display = 'flex';
  
  let msg = 'カメラにアクセスできません。';
  let code = 'DEV_ERR';
  if (err.name === 'NotAllowedError') {
    msg = '権限が拒否されました。設定を確認してください。';
    code = 'AUTH_DENIED';
  } else if (err.name === 'NotFoundError') {
    msg = 'カメラが見つかりません。';
    code = 'NO_DEVICE';
  }
  errCode.textContent = code;
  errBody.textContent = msg;
  const ph = $('cam-ph');
  if (ph) ph.style.display = 'none';
}

/**
 * クロップ範囲を表示します。
 * @param {string} ratio - '4/3', '16/9', '21/9'
 */
function showCropOverlay(ratio) {
  const overlay    = $('crop-overlay');
  const label      = $('crop-ratio-label');
  const maskTop    = document.querySelector('.crop-mask-top');
  const maskBottom = document.querySelector('.crop-mask-bottom');

  if (!overlay) return;
  if (label) label.textContent = ratio.replace('/', ':');
  if (maskTop)    maskTop.style.height    = '0px';
  if (maskBottom) maskBottom.style.height = '0px';

  overlay.style.display = 'flex';
  overlay.classList.add('show');
}

/**
 * アスペクト比を切り替えます。
 * @param {string} ratio - 設定する比率
 */
function setAspectRatio(ratio) {
  if (cfg.aspectRatio === ratio) return;
  cfg.aspectRatio = ratio;
  if (typeof saveCfg === 'function') saveCfg();
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.r === ratio);
  });
  const vf = $('cam-vf');
  if (vf) vf.style.aspectRatio = ratio;
  showCropOverlay(ratio);
  if (camActive) startCam();
  else if (typeof applyCfgToUI === 'function') applyCfgToUI();
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  EVENT LISTENERS & INITIALIZATION
 * ══════════════════════════════════════════════════════════════════════════════
 */
document.addEventListener('DOMContentLoaded', () => {
  const shutter = $('btn-shutter');
  if (shutter) shutter.onclick = takePhoto;

  const RATIOS_ARRAY   = ['4/3', '16/9', '21/9'];
  let currentRatioIdx  = RATIOS_ARRAY.indexOf(cfg.aspectRatio);
  if (currentRatioIdx === -1) currentRatioIdx = 1;

  const camControls = $('cam-controls');
  let startX = 0, isSwiping = false;
  if (camControls) {
    camControls.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX; isSwiping = true;
    }, { passive: true });
    camControls.addEventListener('touchend', (e) => {
      if (!isSwiping) return;
      const diffX = startX - e.changedTouches[0].clientX;
      if (Math.abs(diffX) > 60) {
        if (diffX > 0) currentRatioIdx = (currentRatioIdx + 1) % RATIOS_ARRAY.length;
        else currentRatioIdx = (currentRatioIdx - 1 + RATIOS_ARRAY.length) % RATIOS_ARRAY.length;
        setAspectRatio(RATIOS_ARRAY[currentRatioIdx]);
      }
      isSwiping = false;
    }, { passive: true });
  }

  const torch = $('btn-torch');
  if (torch) torch.onclick = toggleTorch;

  const retry = $('cam-retry');
  if (retry) retry.onclick = startCam;

  const gotoScanBtn = $('btn-goto-scan');
  if (gotoScanBtn) gotoScanBtn.onclick = () => { if (typeof switchTab === 'function') switchTab('scan'); };

  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.onclick = () => {
      setAspectRatio(btn.dataset.r);
      currentRatioIdx = RATIOS_ARRAY.indexOf(btn.dataset.r);
    };
  });

  const zoomSlider = $('zoom-slider');
  if (zoomSlider) {
    zoomSlider.oninput = (e) => {
      const zoomValue = parseFloat(e.target.value);
      applyZoom(zoomValue); cfg.zoom = zoomValue;
      const min = parseFloat(e.target.min) || 1, max = parseFloat(e.target.max) || 5;
      const pct = ((zoomValue - min) / (max - min)) * 100;
      e.target.style.setProperty('--zoom-progress', pct.toFixed(1) + '%');
    };
  }

  document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.onclick = () => {
      cfg.camQuality = btn.dataset.q;
      if (typeof saveCfg === 'function') saveCfg();
      if (typeof applyCfgToUI === 'function') applyCfgToUI();
      if (camActive) startCam();
    };
  });

  const folderToggle = $('btn-folder-toggle');
  if (folderToggle) {
    folderToggle.onclick = () => {
      const row = $('save-folder-row');
      if (row) row.style.display = row.style.display === 'none' ? 'block' : 'none';
    };
  }
});
