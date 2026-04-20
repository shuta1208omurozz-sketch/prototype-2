'use strict';

/* ════ 写真リストとUI更新 ════ */
function getFilteredPh() {
  let filtered = photos.slice(); 
  if (cfg.useGroup) {
    const g = $('hist-ph-group-select').value;
    if (g !== 'all') filtered = filtered.filter(x => x.group === g);
  }
  if (sortOrderPh === 'asc') filtered.reverse();
  return filtered;
}

function renderPhotoGrid() {
  const grid = $('photo-grid'), empty = $('photo-empty');
  if (!photos.length) { grid.style.display = 'none'; empty.style.display = ''; return; }
  empty.style.display = 'none';
  grid.style.display = '';
  grid.className = 'photo-list' + (mergeMode ? ' merge-mode' : multiSelModePh ? ' multi-mode-ph' : '');
  grid.innerHTML = '';
  
  const filtered = getFilteredPh();
  let lastDayStr = '';

  filtered.forEach(p => {
    const dayStr = getDayString(p.timestamp);
    if (dayStr !== lastDayStr) {
      const header = document.createElement('div');
      header.className = 'photo-section-header';
      header.textContent = dayStr;
      grid.appendChild(header);
      lastDayStr = dayStr;
    }

    const item = document.createElement('div');
    const isSel = (mergeMode && mergeSelected.includes(p.id)) || (multiSelModePh && multiSelectedPh.includes(p.id));
    item.className = 'photo-card photo-item' + (isSel ? ' selected' : '');
    
    const imgWrap = document.createElement('div');
    imgWrap.className = 'photo-card-img';
    
    if (cfg.useGroup && p.group) {
      const gb = document.createElement('div');
      gb.className = 'card-group-badge';
      gb.textContent = p.group;
      imgWrap.appendChild(gb);
    }

    const img = document.createElement('img');
    img.src = p.thumbDataUrl || p.dataUrl; 
    img.loading = 'lazy';
    imgWrap.appendChild(img);

    const selOv = document.createElement('div');
    selOv.className = 'photo-select-overlay';
    const chk = document.createElement('div');
    chk.className = 'photo-select-check';
    chk.textContent = '✓';
    selOv.appendChild(chk);
    imgWrap.appendChild(selOv);

    item.appendChild(imgWrap);

    item.addEventListener('click', (e) => {
      if (mergeMode) toggleMergeSelect(p.id, item);
      else if (multiSelModePh) toggleMultiSelectPh(p.id, item);
      else openLightbox(p);
    });
    grid.appendChild(item);
  });
}

function updateThumbStrip() {
  const wrap = $('thumb-strip-wrap');
  if (!thumbStripVisible || !photos.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  const strip = $('thumb-strip');
  strip.innerHTML = '';
  photos.slice(0, 10).forEach(p => {
    const d = document.createElement('div');
    d.className = 'mini-thumb';
    const img = document.createElement('img');
    img.src = p.thumbDataUrl || p.dataUrl;
    d.appendChild(img);
    d.onclick = () => openLightbox(p);
    strip.appendChild(d);
  });
  if (photos.length > 10) {
    const m = document.createElement('button');
    m.className = 'more-btn';
    m.textContent = '+' + (photos.length - 10);
    m.onclick = () => document.querySelector('[data-tab="photos"]').click();
    strip.appendChild(m);
  }
}

function setThumbVisible(v) {
  thumbStripVisible = v;
  localStorage.setItem('sc-thumb-vis', v ? '1' : '0');
  $('btn-thumb-toggle').classList.toggle('on', v);
  $('btn-thumb-toggle').textContent = v ? '🖼 ON' : '🖼 OFF';
  $('btn-thumb-toggle2').textContent = v ? '非表示' : '表示';
  $('btn-thumb-toggle2').classList.toggle('on', v);
  updateThumbStrip();
}

function deletePhoto(id) {
  if (!confirm('この写真を削除しますか？')) return;
  dbDel(id).then(async () => {
    photos = photos.filter(p => p.id !== id);
    if(typeof updateCounts === 'function') updateCounts();
    renderPhotoGrid();
    updateThumbStrip();
    if (currentLightbox?.id === id) closeLightbox();
  });
}

/* ════ 写真一括選択モード ════ */
function enterMultiSelModePh(initialId = null) {
  multiSelModePh = true;
  multiSelectedPh = initialId ? [initialId] : [];
  $('btn-ph-select-mode').classList.add('on');
  $('multi-sel-bar').classList.add('on');
  updateMultiSelTxtPh();
  renderPhotoGrid();
}

function exitMultiSelModePh() {
  multiSelModePh = false;
  multiSelectedPh = [];
  $('btn-ph-select-mode').classList.remove('on');
  $('multi-sel-bar').classList.remove('on');
  renderPhotoGrid();
}

function toggleMultiSelectPh(id, itemEl) {
  const idx = multiSelectedPh.indexOf(id);
  if (idx >= 0) { 
    multiSelectedPh.splice(idx, 1); 
    itemEl.classList.remove('selected'); 
  } else { 
    multiSelectedPh.push(id); 
    itemEl.classList.add('selected'); 
  }
  updateMultiSelTxtPh();
}

function updateMultiSelTxtPh() {
  $('multi-sel-txt').textContent = multiSelectedPh.length + '枚 選択中';
}

/* ════ Lightbox表示と回転・スワイプ ════ */
function openLightbox(p) {
  currentLightbox = p;
  $('lb-img').src = p.dataUrl;
  $('lb-img').style.transform = `rotate(${p.rotation || 0}deg)`;
  $('lb-ttl').textContent = fmtTime(p.timestamp) + ' · ' + (p.facingMode === 'user' ? 'フロント' : p.facingMode === 'merged' ? '結合' : 'リア');
  $('lightbox').style.display = '';
}

function closeLightbox() {
  $('lightbox').style.display = 'none';
  currentLightbox = null;
}

// Lightboxでのタッチスワイプ処理
let lbTouchStartX = 0;
let lbTouchStartY = 0;

function initLightboxTouch() {
  const lb = $('lightbox');
  lb.addEventListener('touchstart', e => {
    lbTouchStartX = e.changedTouches[0].screenX;
    lbTouchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  lb.addEventListener('touchend', e => {
    const lbTouchEndX = e.changedTouches[0].screenX;
    const lbTouchEndY = e.changedTouches[0].screenY;
    handleLightboxSwipe(lbTouchEndX, lbTouchEndY);
  }, { passive: true });
}

function handleLightboxSwipe(endX, endY) {
  if (!currentLightbox) return;
  const dx = endX - lbTouchStartX;
  const dy = endY - lbTouchStartY;

  // 下スワイプで閉じる
  if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
    closeLightbox();
    return;
  }

  // 左右スワイプで前後移動
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
    const filtered = getFilteredPh();
    const currentIndex = filtered.findIndex(p => p.id === currentLightbox.id);
    if (currentIndex === -1) return;

    if (dx < 0) {
      // 左スワイプ -> 次の写真
      if (currentIndex < filtered.length - 1) {
        openLightbox(filtered[currentIndex + 1]);
      }
    } else {
      // 右スワイプ -> 前の写真
      if (currentIndex > 0) {
        openLightbox(filtered[currentIndex - 1]);
      }
    }
  }
}

async function rotateLightboxPhoto() {
  if (!currentLightbox) return;
  const img = new Image();
  img.src = currentLightbox.dataUrl;
  await new Promise(r => { img.onload = r; });
  const c = document.createElement('canvas');
  c.width = img.height;
  c.height = img.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(90 * Math.PI / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  
  const newUrl = c.toDataURL('image/jpeg', 0.9);
  const newThumbUrl = await createThumbnail(newUrl, 400); 
  
  currentLightbox = { ...currentLightbox, dataUrl: newUrl, thumbDataUrl: newThumbUrl, rotation: 0 };
  await dbPut(currentLightbox);
  photos = (await dbAll()).reverse();
  $('lb-img').src = newUrl;
  $('lb-img').style.transform = '';
  renderPhotoGrid();
  updateThumbStrip();
  showToast('↻ 回転しました', 'ok');
}

async function savePhotoToDevice(photo) {
  const ts = fmtTime(photo.timestamp).replace(/[/:\s]/g, '-');
  const prefix = photo.scannedCode ? photo.scannedCode.slice(-5) : 'photo';
  const name = `${prefix}_${ts}.jpg`;
  if (navigator.share && navigator.canShare) {
    try {
      const blob = dataUrlToBlob(photo.dataUrl);
      if (blob) {
        const file = new File([blob], name, { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: '写真を保存' });
          return;
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  fallbackDownload(photo.dataUrl, name);
}

/* ════ 画像結合モード ════ */
function enterMergeMode() {
  exitMultiSelModePh();
  mergeMode = true;
  mergeSelected = [];
  $('btn-merge-mode').classList.add('on');
  $('merge-bar').classList.add('on');
  $('merge-bar-txt').textContent = '写真をタップして選択（2枚以上）';
  $('btn-merge-exec').disabled = true;
  renderPhotoGrid();
}

function exitMergeMode() {
  mergeMode = false;
  mergeSelected = [];
  $('btn-merge-mode').classList.remove('on');
  $('merge-bar').classList.remove('on');
  renderPhotoGrid();
}

function toggleMergeSelect(id, itemEl) {
  const idx = mergeSelected.indexOf(id);
  if (idx >= 0) {
    mergeSelected.splice(idx, 1);
    itemEl.classList.remove('selected');
  } else {
    mergeSelected.push(id);
    itemEl.classList.add('selected');
  }
  const n = mergeSelected.length;
  $('merge-bar-txt').textContent = n === 0 ? '写真をタップして選択（2枚以上）' : n + '枚 選択中';
  $('btn-merge-exec').disabled = n < 2;
}

async function mergeImages(sel, layout) {
  showToast('結合中...', '', 5000);
  try {
    const imgs = await Promise.all(sel.map(p => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = p.dataUrl;
    })));
    
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const n = imgs.length;
    
    if (layout === 'h') {
      const H = Math.max(...imgs.map(i => i.height));
      const W = imgs.reduce((s, i) => s + Math.round(i.width * (H / i.height)), 0);
      c.width = W; c.height = H;
      let x = 0;
      imgs.forEach(img => {
        const w = Math.round(img.width * (H / img.height));
        ctx.drawImage(img, x, 0, w, H);
        x += w;
      });
    } else if (layout === 'v') {
      const W = Math.max(...imgs.map(i => i.width));
      const H = imgs.reduce((s, i) => s + Math.round(i.height * (W / i.width)), 0);
      c.width = W; c.height = H;
      let y = 0;
      imgs.forEach(img => {
        const h = Math.round(img.height * (W / img.width));
        ctx.drawImage(img, 0, y, W, h);
        y += h;
      });
    } else if (layout === 'grid') {
      const cols = 2, rows = Math.ceil(n / cols);
      const cW = Math.max(...imgs.map(i => i.width));
      const cH = Math.max(...imgs.map(i => i.height));
      c.width = cW * cols; c.height = cH * rows;
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, c.width, c.height);
      imgs.forEach((img, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const sc = Math.min(cW / img.width, cH / img.height);
        const dw = img.width * sc, dh = img.height * sc;
        ctx.drawImage(img, col * cW + (cW - dw) / 2, row * cH + (cH - dh) / 2, dw, dh);
      });
    } else {
      const H = 320;
      const W = imgs.reduce((s, i) => s + Math.round(i.width * (H / i.height)), 0);
      c.width = W; c.height = H;
      let x = 0;
      imgs.forEach(img => {
        const w = Math.round(img.width * (H / img.height));
        ctx.drawImage(img, x, 0, w, H);
        x += w;
      });
    }
    
    const dataUrl = c.toDataURL('image/jpeg', 0.88);
    const thumbDataUrl = await createThumbnail(dataUrl, 400); 
    const merged = { 
      id: Date.now() + Math.random(), 
      dataUrl, 
      thumbDataUrl, 
      timestamp: Date.now(), 
      facingMode: 'merged', 
      rotation: 0, 
      merged: true, 
      group: (cfg.useGroup ? cfg.currentGroup : '') 
    };
    
    await dbPut(merged);
    await dbPrune(MAX_PH);
    photos = (await dbAll()).reverse();
    if(typeof updateCounts === 'function') updateCounts();
    exitMergeMode();
    renderPhotoGrid();
    updateThumbStrip();
    showToast('✓ ' + n + '枚を結合しました', 'ok');
    openLightbox(merged);
  } catch (e) {
    showToast('[E020] 結合失敗: ' + e.message, 'err', 4000);
  }
}
/* スワイプ操作（横で切り替え、下で閉じる）の実装 */
let touchStartX = 0;
let touchStartY = 0;

function initSwipe() {
  const lb = $('lightbox');
  if (!lb) return;
  
  lb.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  lb.addEventListener('touchend', e => {
    const diffX = e.changedTouches[0].clientX - touchStartX;
    const diffY = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      // 横スワイプ：前後写真切り替え
      diffX > 0 ? showPrevPhoto() : showNextPhoto();
    } else if (diffY > 70) {
      // 下スワイプ：閉じる
      closeLightbox();
    }
  });
}

function showNextPhoto() {
  if (!currentLightbox) return;
  const filtered = getFilteredPh();
  const idx = filtered.findIndex(p => p.id === currentLightbox.id);
  if (idx >= 0 && idx < filtered.length - 1) {
    openLightbox(filtered[idx + 1]);
  }
}

function showPrevPhoto() {
  if (!currentLightbox) return;
  const filtered = getFilteredPh();
  const idx = filtered.findIndex(p => p.id === currentLightbox.id);
  if (idx > 0) {
    openLightbox(filtered[idx - 1]);
  }
}

// 初期化時にスワイプを有効化
document.addEventListener('DOMContentLoaded', () => {
  initSwipe();
  
  const lbRotate = $('lb-rotate');
  if (lbRotate) lbRotate.onclick = rotateLightboxPhoto;
  
  const selectModeBtn = $('btn-ph-select-mode');
  if (selectModeBtn) {
    selectModeBtn.onclick = () => {
      if (multiSelModePh) exitMultiSelModePh();
      else enterMultiSelModePh();
    };
  }

  const mergeExecBtn = $('btn-merge-exec');
  if (mergeExecBtn) {
    mergeExecBtn.onclick = () => {
      if (mergeSelected.length >= 2) $('merge-modal').style.display = 'block';
    };
  }
});
