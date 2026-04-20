'use strict';

/* ════ スキャン制御 ════ */
function setScanUI(active) {
  $('scan-line').style.display = (!active || scanMode !== 'all') ? 'none' : '';
  $('ean-guide').style.display = (active && scanMode === 'ean13') ? '' : 'none';
  $('scan-ov').style.display = active ? '' : 'none';
  $('scan-ph').style.display = active ? 'none' : '';
  $('scan-ov').className = 'finder-ov' + (scanMode === 'ean13' ? ' ean' : '');
  $('scan-ov').textContent = scanMode === 'ean13' ? 'EAN-13 MODE' : 'SCANNING...';
}

function setStatus(dot, txt) {
  $('sdot').className = 'sdot' + (dot === 'go' ? ' go' + (scanMode === 'ean13' ? ' ean' : '') : dot === 'ok' ? ' ok' : dot === 'err' ? ' err' : '');
  $('stxt').textContent = txt;
}

function stopScan() {
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  const v = $('scan-video');
  if (v) v.srcObject = null;
  scanning = false;
  setScanUI(false);
  setStatus('', '待機中');
  $('btn-scan').textContent = '▶ スキャン開始';
  $('btn-scan').classList.remove('stop');
}

async function startScan() {
  if (scanning) return;
  if (!('BarcodeDetector' in window)) {
    setStatus('err', '[E001] BarcodeDetector 非対応 (Chrome等が必要)');
    return;
  }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('scan-video');
    v.srcObject = scanStream;
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    await v.play();
    
    detector = new BarcodeDetector({ formats: scanMode === 'ean13' ? ['ean_13'] : ALL_FMTS });
    scanning = true;
    setScanUI(true);
    setStatus('go', scanMode === 'ean13' ? 'EAN-13 スキャン中...' : 'スキャン中...');
    $('btn-scan').textContent = '■ スキャン停止';
    $('btn-scan').classList.add('stop');
    detect();
  } catch (e) {
    const code = e.name === 'NotAllowedError' ? 'E002' : 'E005';
    setStatus('err', `[${code}] ` + (e.name === 'NotAllowedError' ? 'カメラの許可が必要です' : 'カメラエラー: ' + e.message));
  }
}

async function detect() {
  const v = $('scan-video');
  if (!v || !scanning || v.readyState < 2) {
    raf = requestAnimationFrame(detect);
    return;
  }
  try {
    const codes = await detector.detect(v);
    if (codes.length) {
      const c = codes[0], now = Date.now();
      if (c.rawValue.length !== 13) {
        // EAN-13以外の場合はスルー
      } else {
        const waitTime = cfg.continuousScan ? 500 : 3000;
        if (c.rawValue !== lastCode || now - lastCodeTime > waitTime) {
          lastCode = c.rawValue;
          lastCodeTime = now;
          onDetected(c.rawValue, c.format);
        }
      }
    }
  } catch (e) {}
  if (scanning) raf = requestAnimationFrame(detect);
}

let flashTimer = null;
function flashFinder() {
  const fl = $('finder-flash');
  fl.classList.add('show');
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => fl.classList.remove('show'), 220);
}

function showLargeBarcode(value, format, isDup) {
  $('scan-bc-placeholder').style.display = 'none';
  $('scan-bc-display').style.display = '';
  $('scan-bc-val').textContent = value;
  $('scan-bc-meta').textContent = (format || '').toUpperCase().replace('_', ' ');
  $('scan-bc-dup').className = 'scan-bc-dup' + (isDup ? ' show' : '');
  const cv = $('scan-bc-canvas');
  const jf = JS_FMT[format];
  if (jf && window.JsBarcode) {
    try {
      const wrap = $('scan-bc-canvas-wrap');
      const maxW = Math.min(wrap.clientWidth || window.innerWidth - 20, 600);
      JsBarcode(cv, value, { 
        format: jf, 
        width: Math.max(2, Math.floor(maxW / 80)), 
        height: 110, 
        displayValue: true, 
        fontSize: 18, 
        background: '#ffffff', 
        lineColor: '#111111', 
        margin: 10 
      });
    } catch (e) { cv.width = 0; }
  }
}

function onDetected(value, format) {
  lastScannedValue = value; // state.jsの変数に保存
  lastScannedValue = value; // 写真のファイル名自動変更用に保持
  const now = Date.now();
  const isDup = bcHistory.some(x => x.value === value);
  flashFinder();
  vibrate([50]); 
  showLargeBarcode(value, format, isDup);

  const wait = cfg.continuousScan ? 300 : 1500;

  if (isDup) {
    showToast('⊘ 登録済み: ' + value, 'dup', 1800);
    setStatus('ok', '登録済み: ' + value.slice(0, 20));
    setTimeout(() => { if (scanning) setStatus('go', scanMode === 'ean13' ? 'EAN-13 スキャン中...' : 'スキャン中...'); }, wait);
    return;
  }

  const grp = cfg.useGroup ? cfg.currentGroup : '';
  const entry = { id: now + Math.random(), value, format, timestamp: now, checked: false, group: grp };
  bcHistory = [entry, ...bcHistory];
  localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
  
  if (typeof updateCounts === 'function') updateCounts();
  
  setStatus('ok', '検出！ ' + value.slice(0, 22));
  setTimeout(() => { if (scanning) setStatus('go', scanMode === 'ean13' ? 'EAN-13 スキャン中...' : 'スキャン中...'); }, wait);
}

/* ════ バーコード履歴UI ════ */
function toggleBcChecked(id) {
  const item = bcHistory.find(x => x.id === id);
  if (!item) return;
  item.checked = !item.checked;
  localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
  renderBcList();
}

function getFilteredBc() {
  const q = $('search-box').value.toLowerCase();
  let filtered = bcHistory.slice();
  if (q) filtered = filtered.filter(x => x.value.toLowerCase().includes(q));
  if (histFilter === 'checked') filtered = filtered.filter(x => x.checked);
  else if (histFilter === 'unchecked') filtered = filtered.filter(x => !x.checked);
  if (cfg.useGroup) {
    const g = $('hist-bc-group-select').value;
    if (g !== 'all') filtered = filtered.filter(x => x.group === g);
  }
  if (sortOrderBc === 'asc') filtered.reverse();
  return filtered;
}

function renderBcList() {
  const filtered = getFilteredBc();
  const list = $('bc-list'), empty = $('bc-empty');
  if (!filtered.length) { list.style.display = 'none'; empty.style.display = ''; return; }
  
  empty.style.display = 'none';
  list.style.display = '';
  list.innerHTML = '';

  if (cfg.bcCompactMode) list.classList.add('compact-mode');
  else list.classList.remove('compact-mode');

  if (multiSelModeBc) list.classList.add('multi-mode-bc');
  else list.classList.remove('multi-mode-bc');

  filtered.forEach((item, i) => {
    const card = document.createElement('div');
    const isSel = multiSelModeBc && multiSelectedBc.includes(item.id);
    card.className = 'bc-card' + (item.format === 'ean_13' ? ' ean' : '') + (item.checked ? ' checked' : '') + (isSel ? ' multi-selected' : '');

    const selChk = document.createElement('div');
    selChk.className = 'bc-sel-chk';
    selChk.textContent = '✓';
    card.appendChild(selChk);

    if (cfg.useGroup && item.group) {
      const gb = document.createElement('div');
      gb.className = 'card-group-badge';
      gb.textContent = item.group;
      card.appendChild(gb);
    }

    const thumb = document.createElement('div');
    thumb.className = 'bc-thumb';
    const cv = document.createElement('canvas');
    thumb.appendChild(cv);
    card.appendChild(thumb);

    const valEl = document.createElement('div');
    valEl.className = 'bc-val-large';
    valEl.textContent = item.value;
    
    const metaRow = document.createElement('div');
    metaRow.className = 'bc-meta-row';

    const checkBtn = document.createElement('button');
    checkBtn.className = 'card-check';
    checkBtn.textContent = '✓';
    checkBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!multiSelModeBc) toggleBcChecked(item.id);
    });

    const dispNum = sortOrderBc === 'desc' ? (filtered.length - i) : (i + 1);

    const metaInfo = document.createElement('div');
    metaInfo.className = 'bc-meta-info';
    metaInfo.innerHTML =
      `<span class="card-fmt ${item.format === 'ean_13' ? 'ean' : ''}">${(item.format || '').replace('_', ' ')}</span>` +
      `<span class="card-time">${fmtTime(item.timestamp)}</span>` +
      `<span class="card-num">#${String(dispNum).padStart(3, '0')}</span>` +
      (item.checked ? '<span class="card-chk-lbl">✓ 確認済</span>' : '');

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-x';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!multiSelModeBc) deleteBc(item.id);
    });

    metaRow.appendChild(checkBtn);
    metaRow.appendChild(metaInfo);
    metaRow.appendChild(delBtn);
    
    if (cfg.bcCompactMode) {
      card.appendChild(checkBtn);
      card.appendChild(valEl);
      const timeSpan = document.createElement('span');
      timeSpan.className = 'card-time';
      timeSpan.textContent = fmtShort(item.timestamp);
      card.appendChild(timeSpan);
      card.appendChild(delBtn);
    } else {
      card.appendChild(valEl);
      card.appendChild(metaRow);
    }

    card.addEventListener('click', () => {
      if (multiSelModeBc) toggleMultiSelectBc(item.id, card);
      else openBcModal(item);
    });

    list.appendChild(card);

    if (!cfg.bcCompactMode) {
      requestAnimationFrame(() => {
        const jf = JS_FMT[item.format];
        if (!jf || !window.JsBarcode) {
          cv.replaceWith(Object.assign(document.createElement('div'), { className: 'bc-thumb-txt', textContent: item.value }));
          return;
        }
        const containerW = Math.max(thumb.clientWidth || window.innerWidth - 20, 200);
        const barW = Math.max(2, Math.floor(containerW / 105));
        try {
          JsBarcode(cv, item.value, { format: jf, width: barW, height: 60, displayValue: false, background: '#ffffff', lineColor: '#111111', margin: 6 });
        } catch (e) {
          cv.replaceWith(Object.assign(document.createElement('div'), { className: 'bc-thumb-txt', textContent: item.value }));
        }
      });
    }
  });
}

function deleteBc(id) {
  if (!confirm('このバーコードを削除しますか？')) return;
  bcHistory = bcHistory.filter(x => x.id !== id);
  localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
  if (typeof updateCounts === 'function') updateCounts();
  renderBcList();
}

/* ════ BC 一括選択モード ════ */
function enterMultiSelModeBc() {
  multiSelModeBc = true;
  multiSelectedBc = [];
  $('btn-bc-select-mode').classList.add('on');
  $('multi-sel-bar-bc').classList.add('on');
  updateMultiSelTxtBc();
  renderBcList();
}

function exitMultiSelModeBc() {
  multiSelModeBc = false;
  multiSelectedBc = [];
  $('btn-bc-select-mode').classList.remove('on');
  $('multi-sel-bar-bc').classList.remove('on');
  renderBcList();
}

function toggleMultiSelectBc(id, itemEl) {
  const idx = multiSelectedBc.indexOf(id);
  if (idx >= 0) { 
    multiSelectedBc.splice(idx, 1); 
    itemEl.classList.remove('multi-selected'); 
  } else { 
    multiSelectedBc.push(id); 
    itemEl.classList.add('multi-selected'); 
  }
  updateMultiSelTxtBc();
}

function updateMultiSelTxtBc() {
  $('multi-sel-txt-bc').textContent = multiSelectedBc.length + '件 選択中';
}

/* ════ BC モーダル表示 ════ */
function openBcModal(item) {
  currentDetail = item;
  $('modal-val').textContent = item.value;
  $('modal-meta').textContent = (item.format || '').toUpperCase().replace('_', ' ') + ' · ' + fmtTime(item.timestamp);
  $('copied-msg').style.display = 'none';
  const hasFmt = !!JS_FMT[item.format];
  
  $('modal-bc').style.display = hasFmt ? '' : 'none';
  $('modal-2d').style.display = hasFmt ? 'none' : '';
  $('btn-png').style.display = hasFmt ? '' : 'none';
  
  if (hasFmt) setTimeout(() => renderBC($('modal-canvas'), item.value, item.format, 68, true), 10);
  $('bc-modal').style.display = '';
}

function closeBcModal() {
  $('bc-modal').style.display = 'none';
  currentDetail = null;
}

function exportCSV() {
  if (!bcHistory.length) return;
  const hasG = cfg.useGroup;
  const rows = [hasG ? '\uFEFF値,フォーマット,グループ,日時,確認済み' : '\uFEFF値,フォーマット,日時,確認済み'];
  bcHistory.forEach(x => {
    const v = `"${x.value}","${(x.format || '').replace('_', ' ')}"`;
    const g = hasG ? `,"${x.group || ''}"` : '';
    const d = `,"${fmtTime(x.timestamp)}","${x.checked ? '済' : ''}"`;
    rows.push(v + g + d);
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'barcodes_' + Date.now() + '.csv';
  a.click();
}
// イベントリスナーの登録
document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = $('btn-scan');
  if (scanBtn) {
    scanBtn.onclick = () => {
      if (scanning) stopScan();
      else startScan();
    };
  }

  const warpBtn = $('btn-warp-cam');
  if (warpBtn) {
    warpBtn.onclick = () => {
      switchTab('camera');
    };
  }

  const copyBtn = $('scan-bc-copy');
  if (copyBtn) {
    copyBtn.onclick = () => {
      if (!lastScannedValue) return;
      navigator.clipboard.writeText(lastScannedValue).then(() => {
        showToast('コピーしました', 'ok');
      });
    };
  }

  // 履歴画面のイベント
  const searchBox = $('search-box');
  if (searchBox) {
    searchBox.oninput = renderBcList;
  }

  const compactBtn = $('btn-bc-compact');
  if (compactBtn) {
    compactBtn.onclick = () => {
      cfg.bcCompactMode = !cfg.bcCompactMode;
      saveCfg();
      applyCfgToUI();
      renderBcList();
    };
  }

  const sortBtn = $('btn-bc-sort');
  if (sortBtn) {
    sortBtn.onclick = () => {
      sortOrderBc = sortOrderBc === 'desc' ? 'asc' : 'desc';
      sortBtn.textContent = sortOrderBc === 'desc' ? '↓ 新しい順' : '↑ 古い順';
      renderBcList();
    };
  }

  document.querySelectorAll('.flt-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.flt-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      histFilter = btn.dataset.filter;
      renderBcList();
    };
  });

  // モーダル関連
  const modalClose = $('modal-close');
  if (modalClose) modalClose.onclick = closeBcModal;
  
  const bcModal = $('bc-modal');
  if (bcModal) {
    bcModal.onclick = (e) => { if (e.target === bcModal) closeBcModal(); };
  }

  const modalCopy = $('btn-copy');
  if (modalCopy) {
    modalCopy.onclick = () => {
      if (!currentDetail) return;
      navigator.clipboard.writeText(currentDetail.value).then(() => {
        const msg = $('copied-msg');
        if (msg) {
          msg.style.display = 'block';
          setTimeout(() => { msg.style.display = 'none'; }, 2000);
        }
        showToast('コピーしました', 'ok');
      });
    };
  }

  const pngBtn = $('btn-png');
  if (pngBtn) {
    pngBtn.onclick = () => {
      if (!currentDetail) return;
      const cv = $('modal-canvas');
      const a = document.createElement('a');
      a.href = cv.toDataURL('image/png');
      a.download = `barcode_${currentDetail.value}.png`;
      a.click();
    };
  }

  // 一括操作
  const selModeBtn = $('btn-bc-select-mode');
  if (selModeBtn) {
    selModeBtn.onclick = () => {
      if (multiSelModeBc) exitMultiSelModeBc();
      else enterMultiSelModeBc();
    };
  }

  const multiCancel = $('btn-multi-cancel-bc');
  if (multiCancel) multiCancel.onclick = exitMultiSelModeBc;

  const multiAll = $('btn-multi-all-bc');
  if (multiAll) {
    multiAll.onclick = () => {
      const filtered = getFilteredBc();
      if (multiSelectedBc.length === filtered.length && filtered.length > 0) {
        multiSelectedBc = [];
      } else {
        multiSelectedBc = filtered.map(x => x.id);
      }
      updateMultiSelTxtBc();
      renderBcList();
    };
  }

  const multiDel = $('btn-multi-del-bc');
  if (multiDel) {
    multiDel.onclick = () => {
      if (multiSelectedBc.length === 0) return;
      if (!confirm(`${multiSelectedBc.length}件の履歴を削除しますか？`)) return;
      bcHistory = bcHistory.filter(x => !multiSelectedBc.includes(x.id));
      localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
      updateCounts();
      exitMultiSelModeBc();
      showToast('削除しました');
    };
  }

  const multiMove = $('btn-multi-move-bc');
  if (multiMove) {
    multiMove.onclick = () => {
      if (multiSelectedBc.length === 0) return;
      groupMoveTarget = 'bc';
      $('group-move-popup').style.display = 'block';
    };
  }
});
