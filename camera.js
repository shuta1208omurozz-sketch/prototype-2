'use strict';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  CAMERA MODULE v4.6 (ULTRA-WIDE & ASPECT-RATIO INTEGRATED)
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
 *
 *  [v4.5 -> v4.6 変更点]
 *  - getUserMedia に aspectRatio 制約を追加
 *    → カメラドライバがネイティブで正しい比率を配信するため
 *       標準カメラアプリと同等の撮影範囲（画角）が得られる
 *  - video の objectFit を contain → cover に変更
 *    → プレビューが黒帯なくファインダー全面に表示される
 *  - showCropOverlay を cover モード向けに調整
 *  - 二重定義になっていた startCam の構造を修正
 * ══════════════════════════════════════════════════════════════════════════════
 */

// 二重起動防止フラグ（モジュールスコープに置く）
let isStarting = false;

/**
 * カメラを起動し、ビデオストリームを開始します。
 * 画質設定(cfg.camQuality)とアスペクト比(cfg.aspectRatio)に基づいた制約を適用します。
 * @async
 * @returns {Promise<void>}
 */
async function startCam() {
  if (isStarting) return;
  isStarting = true;

  // 1. 既存のストリームを完全に停止し、ビデオ要素を空にする
  stopCam();
  const video = $('cam-video');
  if (video) {
    video.pause();
    video.srcObject = null;
    video.load();
  }

  camActive = true;
  const ph    = $('cam-ph');
  const txt   = $('cam-ph-txt');
  const errBox = $('cam-err');

  if (ph)     ph.style.display    = 'flex';
  if (txt)    txt.textContent     = 'カメラ初期化中...';
  if (errBox) errBox.style.display = 'none';

  const qBase = CAM_QUALITY[cfg.camQuality] || CAM_QUALITY.mid;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [FIX v4.6] getUserMedia に aspectRatio を追加
  //   カメラドライバが指定比率でネイティブ配信 → 標準カメラと同じ画角になる
  //   ※ ブラウザ/デバイスが非対応の場合は無視されるが、その場合でも
  //      後段の canvas クロップで比率は保証される
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const [arW, arH] = cfg.aspectRatio.split('/').map(Number);
  const idealAspectRatio = arW / arH;

  const constraints = {
    video: {
      facingMode:   facingMode,
      width:        { ideal: qBase.width  },
      height:       { ideal: qBase.height },
      aspectRatio:  { ideal: idealAspectRatio } // ← 追加
    },
    audio: false
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    camStream = stream;

    if (video) {
      video.srcObject = stream;

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // [FIX v4.6] objectFit: contain → cover
      //   contain: 動画全体をボックス内に収める（上下/左右に黒帯が入る）
      //   cover:   ボックスを動画で隙間なく埋める（プレビューが実際の撮影範囲と一致）
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
            vf.style.overflow    = 'hidden'; // cover のためはみ出しを隠す
          }

          camTrack = stream.getVideoTracks()[0];
          initCamFeatures(camTrack);
          showCropOverlay(cfg.aspectRatio);
        } catch (playErr) {
          console.warn('[Camera] Play interrupted (Safe to ignore):', playErr);
        }
      };
    }

    if (scanning) stopScan();

  } catch (err) {
    console.error('[Camera] Start Error:', err);
    handleCamError(err);
  } finally {
    isStarting = false;
  }
}

async function initCamFeatures(track) {
  if (!track) return;

  try {
    const caps = track.getCapabilities();
    console.log('[Camera] Capabilities:', caps);

    // 1. ズーム制御の有効化
    const zoomSlider   = $('zoom-slider');
    const zoomLevel    = $('zoom-level');
    const zoomControls = document.querySelector('.zoom-controls');

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
    } else if (zoomControls) {
      zoomControls.style.display = 'none';
    }

    // 2. トーチボタンの表示制御
    const torchBtn = $('btn-torch');
    if (torchBtn) {
      torchBtn.style.display = 'block';
      if (!caps.torch) {
        torchBtn.disabled     = true;
        torchBtn.title        = 'このデバイスはフラッシュライト非対応';
        torchBtn.style.opacity = '0.35';
      } else {
        torchBtn.disabled     = false;
        torchBtn.title        = 'フラッシュライト';
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
    const settings  = camTrack.getSettings();
    const newState  = !settings.torch;
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

  const video   = $('cam-video');
  const shutter = $('btn-shutter');
  if (!video || video.readyState < 2) return;

  if (shutter) shutter.disabled = true;

  // 1. キャプチャ用 Canvas
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d', { alpha: false, desynchronized: true });

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const ratioParts  = cfg.aspectRatio.split('/');
  const targetRatio = parseFloat(ratioParts[0]) / parseFloat(ratioParts[1]);

  // クロップ領域の計算（中央基準）
  let sw, sh, sx, sy;
  const videoRatio = vw / vh;

  if (videoRatio > targetRatio) {
    // ビデオの方が横長 → 左右をカット
    sh = vh;
    sw = vh * targetRatio;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    // ビデオの方が縦長（または一致） → 上下をカット
    sw = vw;
    sh = vw / targetRatio;
    sx = 0;
    sy = (vh - sh) / 2;
  }

  const maxW      = { low: 1024, mid: 1920, high: 2560, max: 4096 }[cfg.camQuality] || 1920;
  canvas.width    = Math.min(sw, maxW);
  canvas.height   = canvas.width / targetRatio;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  // 2. サムネイル
  const thumbC    = document.createElement('canvas');
  const thumbSize = 300;
  thumbC.width    = thumbSize;
  thumbC.height   = thumbSize / targetRatio;
  thumbC.getContext('2d').drawImage(canvas, 0, 0, thumbC.width, thumbC.height);
  const thumbDataUrl = thumbC.toDataURL('image/jpeg', 0.6);

  // 3. 写真オブジェクト構築
  const grp   = cfg.useGroup ? cfg.currentGroup : '未分類';
  const photo = {
    id:           Date.now() + Math.random(),
    dataUrl:      thumbDataUrl,
    thumbDataUrl: thumbDataUrl,
    timestamp:    Date.now(),
    facingMode:   facingMode,
    aspectRatio:  cfg.aspectRatio,
    group:        grp,
    scannedCode:  lastScannedValue
  };

  photos.unshift(photo);
  updateCounts();
  updateThumbStrip();
  if (activeTab === 'photos') renderPhotoGrid();

  showFlashEffect();
  vibrate([50]);

  if (shutter) shutter.disabled = false;

  // 4. 非同期での高画質保存
  setTimeout(async () => {
    try {
      const qualityMap  = { low: 0.7, mid: 0.85, high: 0.92, max: 0.98 };
      const blob        = await new Promise(res =>
        canvas.toBlob(res, 'image/jpeg', qualityMap[cfg.camQuality])
      );
      if (!blob) return;

      const finalDataUrl = await blobToDataUrl(blob);
      photo.dataUrl = finalDataUrl;

      autoSaveToDevice(photo, blob);
      await dbPut(photo);
      await dbPrune(cfg.maxPhotos);

      console.log(`[Camera] Photo saved. ID: ${photo.id}, Size: ${Math.round(blob.size / 1024)}KB`);
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
  errCode.textContent  = err.name === 'NotAllowedError' ? 'AUTH_DENIED' : 'DEV_ERR';

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
 *
 * [v4.6 変更]
 * objectFit が cover になったため、プレビュー映像はファインダーを
 * 隙間なく埋めており、プレビュー自体が「保存される範囲」と一致します。
 * そのため上下マスクは常に 0px（不要）になりますが、関数は残して
 * ラベル表示と比率ボタンとの連携を維持しています。
 *
 * @param {string} ratio - '4/3', '16/9', '21/9'
 */
function showCropOverlay(ratio) {
  const overlay    = $('crop-overlay');
  const label      = $('crop-ratio-label');
  const maskTop    = document.querySelector('.crop-mask-top');
  const maskBottom = document.querySelector('.crop-mask-bottom');

  if (!overlay) return;

  if (label) label.textContent = ratio.replace('/', ':');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [FIX v4.6] objectFit: cover のためマスク高さは常に 0
  //   カメラ自体が指定比率でストリームするため、ファインダー全体が
  //   実際に保存される範囲になり、上下マスクは不要です。
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (maskTop)    { maskTop.style.height    = '0px'; }
  if (maskBottom) { maskBottom.style.height = '0px'; }

  overlay.style.display = 'flex';
  overlay.classList.add('show');
  clearTimeout(overlay._hideTimer);
}

function setAspectRatio(ratio) {
  if (cfg.aspectRatio === ratio) return;

  cfg.aspectRatio = ratio;
  saveCfg();

  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.r === ratio);
  });

  const vf = $('cam-vf');
  if (vf) {
    vf.style.aspectRatio = ratio;
    vf.style.overflow    = 'hidden'; // cover に合わせてはみ出し非表示
  }

  showCropOverlay(ratio);

  if (camActive) {
    // アスペクト比が変わった場合、新しい比率で getUserMedia を呼び直す
    startCam();
  } else {
    applyCfgToUI();
  }

  console.log(`[Camera] Aspect ratio set to: ${ratio}`);
  showToast(`ASPECT: ${ratio}`, 'ok', 1000);
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  EVENT LISTENERS & INITIALIZATION
 * ══════════════════════════════════════════════════════════════════════════════
 */
document.addEventListener('DOMContentLoaded', () => {
  // シャッターボタン
  const shutter = $('btn-shutter');
  if (shutter) shutter.onclick = takePhoto;

  // アスペクト比配列
  const RATIOS_ARRAY   = ['4/3', '16/9', '21/9'];
  let currentRatioIdx  = RATIOS_ARRAY.indexOf(cfg.aspectRatio);
  if (currentRatioIdx === -1) currentRatioIdx = 1; // デフォルト 16/9

  // スワイプによるアスペクト比変更
  const camControls = $('cam-controls');
  let startX        = 0;
  let isSwiping     = false;

  if (camControls) {
    camControls.addEventListener('touchstart', (e) => {
      startX    = e.touches[0].clientX;
      isSwiping = true;
    }, { passive: true });

    camControls.addEventListener('touchmove', () => {}, { passive: true });

    camControls.addEventListener('touchend', (e) => {
      if (!isSwiping) return;
      const endX            = e.changedTouches[0].clientX;
      const diffX           = startX - endX;
      const SWIPE_THRESHOLD = 50;

      if (Math.abs(diffX) > SWIPE_THRESHOLD) {
        if (diffX > 0) {
          currentRatioIdx = (currentRatioIdx - 1 + RATIOS_ARRAY.length) % RATIOS_ARRAY.length;
        } else {
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

  // SCANタブ移動ボタン
  const gotoScanBtn = $('btn-goto-scan');
  if (gotoScanBtn) gotoScanBtn.onclick = () => switchTab('scan');

  // アスペクト比ボタン
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.onclick = () => {
      setAspectRatio(btn.dataset.r);
      currentRatioIdx = RATIOS_ARRAY.indexOf(btn.dataset.r);
    };
  });

  // ズームスライダー
  const zoomSlider       = $('zoom-slider');
  const zoomLevelDisplay = $('zoom-level');

  if (zoomSlider && zoomLevelDisplay) {
    const savedZoom         = cfg.zoom || 1.0;
    zoomSlider.value        = savedZoom;
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
