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
 *  - stopCam の完全な定義を追加
 *  - startCam の二重起動防止と finally によるフリーズ回避
 *  - 詳細なエラーハンドリングの復元
 * ══════════════════════════════════════════════════════════════════════════════
 */

// 動作フラグとストリーム管理
let isStarting = false;

/**
 * カメラを完全に停止し、メモリとハードウェアリソースを解放します。
 * タブ切り替え時やエラー発生時に呼び出されます。
 * @returns {void}
 */
function stopCam() {
  console.log('[Camera] Stopping all camera resources...');
  
  // 1. ストリームの全トラックを停止
  if (camStream) {
    camStream.getTracks().forEach(track => {
      console.log(`[Camera] Stopping track: ${track.label}`);
      track.stop();
    });
    camStream = null;
  }

  // 2. ビデオトラック参照を破棄
  camTrack = null;
  camActive = false;

  // 3. ビデオ要素のクリーンアップ
  const video = $('cam-video');
  if (video) {
    video.pause();
    video.srcObject = null;
    try {
      video.load(); // リソース解放の徹底
    } catch (e) {
      console.warn('[Camera] Video load reset error:', e);
    }
  }

  // 4. プレビュー用プレースホルダーを表示
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

  // 既存のストリームを完全に停止し、ビデオ要素を空にする
  stopCam();

  // スキャナーが動いている場合は競合を避けるために停止
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

  const qBase = CAM_QUALITY[cfg.camQuality] || CAM_QUALITY.mid;

  // [v4.6] getUserMedia に aspectRatio を追加
  // カメラドライバが指定比率でネイティブ配信することで標準カメラと同じ画角を得る
  const [arW, arH] = cfg.aspectRatio.split('/').map(Number);
  const idealAspectRatio = arW / arH;

  const constraints = {
    video: {
      facingMode:   facingMode,
      width:        { ideal: qBase.width.ideal  || 1280 },
      height:       { ideal: qBase.height.ideal || 720 },
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

      // [v4.6] objectFit: cover
      // プレビューが実際の撮影範囲と一致するようにファインダーを埋める
      video.style.objectFit       = 'cover';
      video.style.width           = '100%';
      video.style.height          = '100%';
      video.style.backgroundColor = '#000';

      // メタデータロード後に再生開始
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          if (ph) ph.style.display = 'none';

          const vf = $('cam-vf');
          if (vf) {
            vf.style.aspectRatio = cfg.aspectRatio;
            vf.style.overflow    = 'hidden'; // はみ出しを隠す
          }

          camTrack = stream.getVideoTracks()[0];
          camActive = true;
          
          // カメラ機能（ズーム・ライト）の初期化
          initCamFeatures(camTrack);
          // クロップガイドの表示
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
    // 成功・失敗に関わらずロックを解除
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
    console.log('[Camera] Device Capabilities:', caps);

    // 1. ズーム制御
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

      // 0.5x（超広角）対応ラベル
      const uwLabel = $('uw-label');
      if (uwLabel) uwLabel.style.display = deviceMin < 1 ? 'inline-block' : 'none';
      
      // 保存されたズーム値の復元適用
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
        torchBtn.title         = 'このデバイスはフラッシュライト非対応';
        torchBtn.style.opacity = '0.35';
      } else {
        torchBtn.disabled      = false;
        torchBtn.title         = 'フラッシュライト';
        torchBtn.style.opacity = '';
      }
    }

    // 画質設定UIの更新
    if (typeof applyCfgToUI === 'function') {
      applyCfgToUI();
    }

  } catch (e) {
    console.warn('[Camera] Feature init failed:', e);
  }
}

/**
 * デジタルズームをビデオトラックに適用します。
 * @param {number} val - ズーム倍率
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
    console.log('[Camera] Torch state changed to:', newState);
  } catch (e) {
    console.error('[Camera] Torch toggle error:', e);
  }
}

/**
 * 現在のプレビューを静止画としてキャプチャします。
 * アスペクト比に応じた正確な中央クロップを行い、IndexedDBおよびフォルダへ保存します。
 * @async
 */
async function takePhoto() {
  if (!camActive || !camStream) return;

  const video   = $('cam-video');
  const shutter = $('btn-shutter');
  if (!video || video.readyState < 2) return;

  if (shutter) shutter.disabled = true;

  // 1. キャプチャ用メイン Canvas
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d', { alpha: false, desynchronized: true });

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const ratioParts  = (cfg.aspectRatio || '16/9').split('/');
  const targetRatio = parseFloat(ratioParts[0]) / parseFloat(ratioParts[1]);

  // クロップ領域の計算（中央基準）
  // プレビューが object-fit: cover であることを前提に計算
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

  // 設定画質に基づく最大幅の設定
  const maxW = { low: 1024, mid: 1920, high: 2560, max: 4096 }[cfg.camQuality] || 1920;
  canvas.width  = Math.min(sw, maxW);
  canvas.height = canvas.width / targetRatio;

  // 描画実行
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  // 2. サムネイル用キャンバス生成
  const thumbC    = document.createElement('canvas');
  const thumbSize = 300;
  thumbC.width    = thumbSize;
  thumbC.height   = thumbSize / targetRatio;
  thumbC.getContext('2d').drawImage(canvas, 0, 0, thumbC.width, thumbC.height);
  const thumbDataUrl = thumbC.toDataURL('image/jpeg', 0.6);

  // 3. 写真オブジェクトの構築
  const grp   = cfg.useGroup ? cfg.currentGroup : '未分類';
  const photo = {
    id:           Date.now() + Math.random(),
    dataUrl:      thumbDataUrl, // 一時的にサムネイルを格納
    thumbDataUrl: thumbDataUrl,
    timestamp:    Date.now(),
    facingMode:   facingMode,
    aspectRatio:  cfg.aspectRatio,
    group:        grp,
    scannedCode:  (typeof lastScannedValue !== 'undefined') ? lastScannedValue : ""
  };

  // メモリ内配列とUIの即時更新
  photos.unshift(photo);
  if (typeof updateCounts === 'function') updateCounts();
  if (typeof updateThumbStrip === 'function') updateThumbStrip();
  if (activeTab === 'photos' && typeof renderPhotoGrid === 'function') {
    renderPhotoGrid();
  }

  // 撮影エフェクト
  showFlashEffect();
  if (typeof vibrate === 'function') vibrate([50]);

  if (shutter) shutter.disabled = false;

  // 4. 非同期での高画質保存処理 (UIスレッドをブロックしない)
  setTimeout(async () => {
    try {
      const qualityMap = { low: 0.7, mid: 0.85, high: 0.92, max: 0.98 };
      const quality    = qualityMap[cfg.camQuality] || 0.85;
      
      const blob = await new Promise(res =>
        canvas.toBlob(res, 'image/jpeg', quality)
      );
      
      if (!blob) throw new Error('Blob generation failed');

      const finalDataUrl = await blobToDataUrl(blob);
      photo.dataUrl = finalDataUrl;

      // ストレージ保存
      if (typeof autoSaveToDevice === 'function') {
        autoSaveToDevice(photo, blob);
      }
      
      if (typeof dbPut === 'function') {
        await dbPut(photo);
        await dbPrune(cfg.maxPhotos);
      }

      console.log(`[Camera] Save Success. Size: ${Math.round(blob.size / 1024)}KB`);
    } catch (err) {
      console.error('[Camera] High-res save error:', err);
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
 * 理由に応じた適切なメッセージを表示します。
 * @param {Error} err - 発生したエラーオブジェクト
 */
function handleCamError(err) {
  const errBox  = $('cam-err');
  const errBody = $('cam-err-body');
  const errCode = $('cam-err-code');

  if (!errBox || !errBody) return;

  errBox.style.display = 'flex';
  
  // エラー名に基づく分類
  let msg = 'カメラにアクセスできません。';
  let code = 'DEV_ERR';

  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    msg = 'カメラの使用が許可されていません。ブラウザ設定を確認してください。';
    code = 'AUTH_DENIED';
  } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
    msg = '有効なカメラデバイスが見つかりません。';
    code = 'NO_DEVICE';
  } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
    msg = 'カメラが他のアプリで使用されているか、ハードウェアエラーです。';
    code = 'IN_USE';
  } else if (err.name === 'OverconstrainedError') {
    msg = '指定された画質またはアスペクト比は、このデバイスでは非対応です。';
    code = 'FMT_ERR';
  }

  errCode.textContent = code;
  errBody.textContent = msg;
  
  const ph = $('cam-ph');
  if (ph) ph.style.display = 'none';
}

/**
 * クロップ範囲を視覚的に表示します。
 * [v4.6] coverモードのため、マスク高さは0で固定されます。
 * @param {string} ratio - '4/3', '16/9', '21/9'
 */
function showCropOverlay(ratio) {
  const overlay    = $('crop-overlay');
  const label      = $('crop-ratio-label');
  const maskTop    = document.querySelector('.crop-mask-top');
  const maskBottom = document.querySelector('.crop-mask-bottom');

  if (!overlay) return;
  if (label) label.textContent = ratio.replace('/', ':');

  // cover設定のため上下マスクは不要 (映像全体が撮影範囲)
  if (maskTop)    maskTop.style.height    = '0px';
  if (maskBottom) maskBottom.style.height = '0px';

  overlay.style.display = 'flex';
  overlay.classList.add('show');
  
  // 3秒後に非表示にする場合は以下を有効化
  // clearTimeout(overlay._hideTimer);
  // overlay._hideTimer = setTimeout(() => overlay.classList.remove('show'), 3000);
}

/**
 * アスペクト比を切り替えます。設定を保存し、カメラを再起動します。
 * @param {string} ratio - 設定する比率
 */
function setAspectRatio(ratio) {
  if (cfg.aspectRatio === ratio) return;

  console.log(`[Camera] Changing Aspect Ratio to: ${ratio}`);
  cfg.aspectRatio = ratio;
  if (typeof saveCfg === 'function') saveCfg();

  // ボタンのON/OFF状態を更新
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.r === ratio);
  });

  const vf = $('cam-vf');
  if (vf) {
    vf.style.aspectRatio = ratio;
    vf.style.overflow    = 'hidden';
  }

  showCropOverlay(ratio);

  if (camActive) {
    // ストリームの設定を反映させるために再起動
    startCam();
  } else if (typeof applyCfgToUI === 'function') {
    applyCfgToUI();
  }

  if (typeof showToast === 'function') {
    showToast(`ASPECT: ${ratio}`, 'ok', 1000);
  }
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

  // アスペクト比リスト
  const RATIOS_ARRAY   = ['4/3', '16/9', '21/9'];
  let currentRatioIdx  = RATIOS_ARRAY.indexOf(cfg.aspectRatio);
  if (currentRatioIdx === -1) currentRatioIdx = 1;

  // スワイプによるアスペクト比変更 (直感的UI)
  const camControls = $('cam-controls');
  let startX        = 0;
  let isSwiping     = false;

  if (camControls) {
    camControls.addEventListener('touchstart', (e) => {
      startX    = e.touches[0].clientX;
      isSwiping = true;
    }, { passive: true });

    camControls.addEventListener('touchend', (e) => {
      if (!isSwiping) return;
      const endX            = e.changedTouches[0].clientX;
      const diffX           = startX - endX;
      const SWIPE_THRESHOLD = 60;

      if (Math.abs(diffX) > SWIPE_THRESHOLD) {
        if (diffX > 0) {
          currentRatioIdx = (currentRatioIdx + 1) % RATIOS_ARRAY.length;
        } else {
          currentRatioIdx = (currentRatioIdx - 1 + RATIOS_ARRAY.length) % RATIOS_ARRAY.length;
        }
        setAspectRatio(RATIOS_ARRAY[currentRatioIdx]);
      }
      isSwiping = false;
    }, { passive: true });
  }

  // トーチ
  const torch = $('btn-torch');
  if (torch) torch.onclick = toggleTorch;

  // 再試行
  const retry = $('cam-retry');
  if (retry) retry.onclick = startCam;

  // タブ移動
  const gotoScanBtn = $('btn-goto-scan');
  if (gotoScanBtn) {
    gotoScanBtn.onclick = () => {
      if (typeof switchTab === 'function') switchTab('scan');
    };
  }

  // アスペクト比ボタン
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.onclick = () => {
      setAspectRatio(btn.dataset.r);
      currentRatioIdx = RATIOS_ARRAY.indexOf(btn.dataset.r);
    };
  });

  // ズームスライダー
  const zoomSlider = $('zoom-slider');
  if (zoomSlider) {
    zoomSlider.oninput = async (e) => {
      const zoomValue = parseFloat(e.target.value);
      applyZoom(zoomValue);
      cfg.zoom = zoomValue;
      
      // スライダーの進捗色更新
      const min = parseFloat(e.target.min) || 1;
      const max = parseFloat(e.target.max) || 5;
      const pct = ((zoomValue - min) / (max - min)) * 100;
      e.target.style.setProperty('--zoom-progress', pct.toFixed(1) + '%');
    };
  }

  // 画質設定
  document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.onclick = () => {
      cfg.camQuality = btn.dataset.q;
      if (typeof saveCfg === 'function') saveCfg();
      if (typeof applyCfgToUI === 'function') applyCfgToUI();
      if (camActive) startCam();
    };
  });

  // フォルダ設定トグル
  const folderToggle = $('btn-folder-toggle');
  if (folderToggle) {
    folderToggle.onclick = () => {
      const row = $('save-folder-row');
      if (row) {
        const isHidden = row.style.display === 'none';
        row.style.display = isHidden ? 'block' : 'none';
      }
    };
  }
});

// end of camera.js
