'use strict';

/* ════ UIへの設定適用とグループ管理UI ════ */
function updateGroupUI() {
  const gOn = cfg.useGroup;
  $('scan-group-bar').style.display = gOn ? 'flex' : 'none';
  $('cam-group-bar').style.display = gOn ? 'flex' : 'none';
  $('hist-bc-group-sel').style.display = gOn ? 'flex' : 'none';
  $('hist-ph-group-sel').style.display = gOn ? 'flex' : 'none';
  $('group-mgr-area').style.display = gOn ? 'block' : 'none';

  $('btn-bc-select-mode').style.display = bcHistory.length ? '' : 'none';
  $('btn-ph-select-mode').style.display = photos.length ? '' : 'none';

  if (!cfg.groups.includes(cfg.currentGroup)) {
    cfg.currentGroup = cfg.groups.length ? cfg.groups[0] : '';
  }

  const opts = cfg.groups.map(g => `<option value="${g}">${g}</option>`).join('');
  const addOpts = `<option value="all">全グループ</option>` + opts;
  const noneOpt = `<option value="">未分類 (空白)</option>`;

  const ss = $('scan-group-select'); 
  if(ss) { ss.innerHTML = opts; ss.value = cfg.currentGroup; }
  
  const cs = $('cam-group-select');  
  if(cs) { cs.innerHTML = opts; cs.value = cfg.currentGroup; }
  
  const hbs = $('hist-bc-group-select'); 
  if(hbs) { const v = hbs.value; hbs.innerHTML = addOpts; hbs.value = v || 'all'; }
  
  const hps = $('hist-ph-group-select'); 
  if(hps) { const v = hps.value; hps.innerHTML = addOpts; hps.value = v || 'all'; }

  const ms = $('group-move-select'); 
  if(ms) ms.innerHTML = noneOpt + opts;

  renderSettingsGroupList();
}

function renderSettingsGroupList() {
  const list = $('grp-list-el'); 
  list.innerHTML = '';
  cfg.groups.forEach((g, i) => {
    const item = document.createElement('div');
    item.className = 'grp-item';
    item.innerHTML = `<span>${g}</span> <button class="btn-del" data-idx="${i}">削除</button>`;
    list.appendChild(item);
  });
  list.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = e.target.dataset.idx;
      if (cfg.groups.length <= 1) { 
        showToast('[E030] 最低1つのグループが必要です', 'warn'); 
        return; 
      }
      cfg.groups.splice(idx, 1);
      saveCfg(); 
      updateGroupUI();
    });
  });
}

function applyCfgToUI() {
  const as = $('set-auto-scan'); 
  if(as) as.checked = cfg.autoStartScan;
  
  $('set-cont-scan').checked = cfg.continuousScan;
  $('set-vibration').checked = cfg.useVibration;
  $('set-use-group').checked = cfg.useGroup;

  document.querySelectorAll('[data-sf]').forEach(b => b.classList.toggle('on', b.dataset.sf === cfg.scanFormat));
  document.querySelectorAll('[data-cq]').forEach(b => b.classList.toggle('on', b.dataset.cq === cfg.camQuality));
  document.querySelectorAll('.quality-btn').forEach(b => b.classList.toggle('on', b.dataset.q === cfg.camQuality));
  document.querySelectorAll('[data-mp]').forEach(b => b.classList.toggle('on', b.dataset.mp === String(cfg.maxPhotos)));
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('on', b.dataset.mode === cfg.scanFormat));
  
  // アスペクト比ボタンの状態を更新 [INTEGRATED]
  document.querySelectorAll('.ratio-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.r === cfg.aspectRatio);
  });
  
  scanMode = cfg.scanFormat;
  camQuality = cfg.camQuality;

  const ps = $('set-photo-size');
  if(ps) {
    ps.value = cfg.photoSize || 80;
    $('val-photo-size').textContent = (cfg.photoSize || 80) + 'px';
    document.documentElement.style.setProperty('--photo-size', (cfg.photoSize || 80) + 'px');
  }

  const bcCompactBtn = $('btn-bc-compact');
  if(bcCompactBtn) {
    if(cfg.bcCompactMode) bcCompactBtn.classList.add('on');
    else bcCompactBtn.classList.remove('on');
  }

  updateGroupUI();
}

/* ════ イベントリスナー登録 (全体・設定・一括操作等) ════ */
function bindEvents() {
  // --- タブ切り替え ---
  document.querySelectorAll('.tab').forEach(btn => {
    btn.onclick = () => {
      const t = btn.dataset.tab;
      if (t === activeTab) return;
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('on'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
      btn.classList.add('on');
      $('pg-' + t).classList.add('on');
      activeTab = t;
      
      if (t !== 'scan') stopScan();
      if (t !== 'camera') stopCam();
      if (t === 'scan' && cfg.autoStartScan) setTimeout(startScan, 100);
      if (t === 'camera') setTimeout(startCam, 80);
      if (t === 'history') { exitMultiSelModeBc(); renderBcList(); }
      if (t === 'photos') { exitMergeMode(); exitMultiSelModePh(); renderPhotoGrid(); }
    };
  });

  // --- タブ間ワープボタン ---
  // btn-goto-cam, btn-goto-scan, btn-warp-cam は各モジュールで定義済み

  // --- カメラ切替 ---
  $('btn-cam-switch')?.addEventListener('click', () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    if (camActive) { startCam(); }
  });

  // --- 設定UI (UI設定) ---
  $('set-photo-size').addEventListener('input', e => {
    const v = e.target.value; 
    $('val-photo-size').textContent = v + 'px'; 
    document.documentElement.style.setProperty('--photo-size', v + 'px');
  });
  $('set-photo-size').addEventListener('change', e => { cfg.photoSize = parseInt(e.target.value, 10); saveCfg(); });

  // --- 設定UI (スキャン設定) ---
  $('set-cont-scan').addEventListener('change', e => {
    cfg.continuousScan = e.target.checked;
    saveCfg();
    showToast('連続スキャン: ' + (cfg.continuousScan ? 'ON' : 'OFF'), cfg.continuousScan ? 'ok' : '');
  });
  $('set-auto-scan').addEventListener('change', e => { cfg.autoStartScan = e.target.checked; saveCfg(); });

  document.querySelectorAll('[data-sf]').forEach(btn => btn.addEventListener('click', () => {
    cfg.scanFormat = btn.dataset.sf;
    saveCfg();
    applyCfgToUI();
    if (scanning) { stopScan(); setTimeout(startScan, 200); }
    showToast('フォーマット: ' + (cfg.scanFormat === 'ean13' ? 'EAN-13' : '全て'), 'ok');
  }));

  // --- 設定UI (カメラ設定) ---
  document.querySelectorAll('[data-cq]').forEach(btn => btn.addEventListener('click', () => {
    cfg.camQuality = btn.dataset.cq;
    saveCfg();
    applyCfgToUI();
    showToast('デフォルト画質: ' + ({ low: '低', mid: '標準', high: '高', max: '最高' })[cfg.camQuality], 'ok');
  }));

  // --- グループ機能 ---
  $('set-use-group').addEventListener('change', e => {
    cfg.useGroup = e.target.checked;
    saveCfg();
    updateGroupUI();
    renderBcList();
    renderPhotoGrid();
  });
  
  $('scan-group-select').addEventListener('change', e => { cfg.currentGroup = e.target.value; saveCfg(); const c = $('cam-group-select'); if (c) c.value = cfg.currentGroup; });
  $('cam-group-select').addEventListener('change', e => { cfg.currentGroup = e.target.value; saveCfg(); const s = $('scan-group-select'); if (s) s.value = cfg.currentGroup; });
  $('hist-bc-group-select').addEventListener('change', renderBcList);
  $('hist-ph-group-select').addEventListener('change', renderPhotoGrid);

  $('grp-add-btn').addEventListener('click', () => {
    const val = $('grp-add-input').value.trim(); 
    if (!val) return;
    if (cfg.groups.includes(val)) { showToast('[E031] 既に存在します', 'warn'); return; }
    cfg.groups.push(val); 
    $('grp-add-input').value = ''; 
    saveCfg(); 
    updateGroupUI();
  });

  // --- システム・保存設定 ---
  $('set-vibration').addEventListener('change', e => {
    cfg.useVibration = e.target.checked;
    saveCfg();
    if (cfg.useVibration) vibrate([50]);
  });

  document.querySelectorAll('[data-mp]').forEach(btn => btn.addEventListener('click', () => {
    MAX_PH = parseInt(btn.dataset.mp);
    cfg.maxPhotos = MAX_PH;
    saveCfg();
    applyCfgToUI();
    updateCounts();
    showToast('最大保存枚数: ' + MAX_PH + '枚', 'ok');
  }));

  // --- データ管理 ---
  $('set-export-csv').addEventListener('click', exportCSV);
  $('set-clear-bc').addEventListener('click', () => {
    if (confirm('全てのバーコード履歴を完全に削除しますか？')) {
      bcHistory = [];
      localStorage.setItem(BC_KEY, '[]');
      updateCounts();
      renderBcList();
      showToast('BC履歴を削除しました');
    }
  });

  $('set-clear-photos').addEventListener('click', () => {
    if (confirm('保存されている全ての写真を完全に削除しますか？')) {
      dbClear().then(() => {
        photos = [];
        updateCounts();
        renderPhotoGrid();
        updateThumbStrip();
        showToast('写真を全削除しました');
      });
    }
  });

  // --- 写真関連のイベント ---
  $('btn-ph-sort').addEventListener('click', e => {
    sortOrderPh = sortOrderPh === 'desc' ? 'asc' : 'desc';
    e.target.textContent = sortOrderPh === 'desc' ? '↓ 新しい順' : '↑ 古い順';
    renderPhotoGrid();
  });

  $('btn-multi-all').addEventListener('click', () => {
    const filtered = getFilteredPh();
    if (multiSelectedPh.length === filtered.length && filtered.length > 0) {
      multiSelectedPh = []; 
    } else {
      multiSelectedPh = filtered.map(x => x.id); 
    }
    updateMultiSelTxtPh();
    renderPhotoGrid();
  });

  $('btn-multi-cancel').addEventListener('click', exitMultiSelModePh);
  $('btn-multi-del').addEventListener('click', () => {
    if (multiSelectedPh.length === 0) { showToast('[E023] 項目が選択されていません', 'warn'); return; }
    if (!confirm(multiSelectedPh.length + '枚の写真を削除しますか？')) return;
    const promises = multiSelectedPh.map(id => dbDel(id));
    Promise.all(promises).then(async () => {
      photos = photos.filter(p => !multiSelectedPh.includes(p.id));
      updateCounts(); 
      updateThumbStrip(); 
      exitMultiSelModePh();
      showToast('削除しました');
    });
  });

  $('btn-multi-move').addEventListener('click', () => {
    if (multiSelectedPh.length === 0) { showToast('[E024] 項目が選択されていません', 'warn'); return; }
    groupMoveTarget = 'ph';
    $('group-move-popup').style.display = '';
  });

  $('btn-multi-dl').addEventListener('click', async () => {
    if (multiSelectedPh.length === 0) { showToast('[E025] 項目が選択されていません', 'warn'); return; }
    showToast('準備中...', '', 2000);
    const selPhotos = multiSelectedPh.map(id => photos.find(p => p.id === id)).filter(Boolean);
    
    if (navigator.share && navigator.canShare) {
      try {
        const files = [];
        for (const p of selPhotos) {
          const blob = dataUrlToBlob(p.dataUrl);
          if (blob) {
            const ts = fmtTime(p.timestamp).replace(/[/:\s]/g, '-');
            const prefix = p.scannedCode ? p.scannedCode.slice(-5) : 'photo';
            files.push(new File([blob], `${prefix}_${ts}.jpg`, { type: 'image/jpeg' }));
          }
        }
        if (navigator.canShare({ files })) {
          await navigator.share({ files, title: '写真を保存' });
          exitMultiSelModePh();
          return;
        }
      } catch(e) { 
        if (e.name !== 'AbortError') console.error(e); 
      }
    }
    showToast('連続ダウンロードを開始します');
    for (let i = 0; i < selPhotos.length; i++) {
      const p = selPhotos[i];
      const ts = fmtTime(p.timestamp).replace(/[/:\s]/g, '-');
      const prefix = p.scannedCode ? p.scannedCode.slice(-5) : 'photo';
      fallbackDownload(p.dataUrl, `${prefix}_${ts}.jpg`);
      await new Promise(r => setTimeout(r, 600)); 
    }
    exitMultiSelModePh();
  });

  $('lb-close').addEventListener('click', closeLightbox);
  $('lb-rotate').addEventListener('click', rotateLightboxPhoto);
  $('lb-dl').addEventListener('click', () => { if (currentLightbox) savePhotoToDevice(currentLightbox); });
  $('lb-del').addEventListener('click', () => { if (currentLightbox) deletePhoto(currentLightbox.id); });
  $('btn-photo-clear').addEventListener('click', () => {
    if (confirm('保存されている全ての写真を削除しますか？')) {
      dbClear().then(() => {
        photos = [];
        updateCounts();
        renderPhotoGrid();
        updateThumbStrip();
        showToast('写真を全て削除しました');
      });
    }
  });

  $('btn-merge-mode').addEventListener('click', () => {
    if (mergeMode) exitMergeMode();
    else {
      if (photos.length < 2) { showToast('[E026] 2枚以上の写真が必要です', 'warn'); return; }
      enterMergeMode();
    }
  });
  $('btn-merge-cancel').addEventListener('click', exitMergeMode);
  $('btn-merge-exec').addEventListener('click', () => { if (mergeSelected.length >= 2) $('merge-modal').style.display = ''; });
  $('merge-modal-cancel').addEventListener('click', () => { $('merge-modal').style.display = 'none'; });

  document.querySelectorAll('.merge-layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('merge-modal').style.display = 'none';
      const layout = btn.dataset.layout;
      const sel = mergeSelected.map(id => photos.find(p => p.id === id)).filter(Boolean);
      mergeImages(sel, layout);
    });
  });

  // --- iOS ポップアップ関連 ---
  $('ios-popup-close').addEventListener('click', () => { $('ios-popup').style.display = 'none'; });
  $('ios-popup').addEventListener('click', e => { if (e.target === $('ios-popup')) $('ios-popup').style.display = 'none'; });
  
  // --- グループ移動処理 ---
  $('group-move-cancel').addEventListener('click', () => { $('group-move-popup').style.display = 'none'; });
  $('group-move-exec').addEventListener('click', async () => {
    const g = $('group-move-select').value;
    $('group-move-popup').style.display = 'none';

    if (groupMoveTarget === 'ph') {
      if (multiSelectedPh.length === 0) return;
      const promises = multiSelectedPh.map(id => {
        const p = photos.find(x => x.id === id);
        if (p) { p.group = g; return dbPut(p); }
      });
      await Promise.all(promises);
      photos = (await dbAll()).reverse();
      exitMultiSelModePh();
      showToast('✓ グループを移動しました', 'ok');
    } 
    else if (groupMoveTarget === 'bc') {
      if (multiSelectedBc.length === 0) return;
      multiSelectedBc.forEach(id => {
        const b = bcHistory.find(x => x.id === id);
        if (b) b.group = g;
      });
      localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
      exitMultiSelModeBc();
      showToast('✓ グループを移動しました', 'ok');
    }
  });
}

/* ════ 初期化処理 ════ */
async function init() {
  loadCfg();
  MAX_PH = cfg.maxPhotos || 200;
  
  try { 
    bcHistory = JSON.parse(localStorage.getItem(BC_KEY) || '[]'); 
  } catch(e) { bcHistory = []; }
  bcHistory = bcHistory.map(x => ({ checked: false, ...x }));
  
  try { 
    photos = (await dbAll()).reverse(); 
  } catch(e) { photos = []; }
  
  applyCfgToUI();
  setThumbVisible(thumbStripVisible);
  updateCounts();
  restoreFolderHandle();
  
  bindEvents();
  initLightboxTouch();
  
  if (cfg.autoStartScan) setTimeout(startScan, 400);
}

// 読み込み完了後に初期化
document.addEventListener('DOMContentLoaded', init);