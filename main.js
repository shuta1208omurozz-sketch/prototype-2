/**
 * @file main.js
 * アプリケーションのエントリポイント。
 * 全てのUIパーツのイベントリスナー設定と初期化フローを管理します。
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log("[Main] DOM Content Loaded. Initializing app...");

  // 1. データの読み込み
  storage.load();

  // 2. UIの初期化
  ui.init();

  // 3. イベントリスナーの設定
  ui.setupEventListeners();

  // 4. 初期タブの表示
  ui.switchTab(state.currentTab);
  
  console.log("[Main] Initialization complete.");
});

/**
 * UI管理オブジェクト
 */
const ui = {
  /**
   * 全般的なUI初期化
   */
  init() {
    this.updateCounts();
    this.renderGroupSelects();
    this.syncSettingsUI();
    
    // 写真一覧の初期レンダリング
    if (typeof photos !== 'undefined') {
      photos.renderGrid();
    }
  },

  /**
   * イベントリスナーの集中設定
   */
  setupEventListeners() {
    // タブ切り替え
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });

    // --- カメラ操作 ---
    const shutter = document.getElementById('btn-shutter');
    if (shutter) shutter.onclick = () => camera.takePhoto();

    const switchCam = document.getElementById('btn-cam-switch');
    if (switchCam) switchCam.onclick = () => {
      state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
      camera.start();
    };

    const torchBtn = document.getElementById('btn-torch');
    if (torchBtn) torchBtn.onclick = () => camera.toggleTorch();

    const zoomSlider = document.getElementById('zoom-slider');
    if (zoomSlider) zoomSlider.oninput = (e) => camera.setZoom(e.target.value);

    // アスペクト比ボタン
    document.querySelectorAll('.ratio-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        state.aspectRatio = btn.dataset.ratio;
        camera.start(); // 設定変更してカメラ再起動
        storage.save();
      };
    });

    // --- スキャナー操作 ---
    const scanBtn = document.getElementById('btn-scan');
    if (scanBtn) scanBtn.onclick = () => {
      state.isScanning ? scanner.stop() : scanner.start();
    };

    const warpBtn = document.getElementById('btn-warp-cam');
    if (warpBtn) warpBtn.onclick = () => this.switchTab('camera');

    const gotoScanBtn = document.getElementById('btn-goto-scan');
    if (gotoScanBtn) gotoScanBtn.onclick = () => this.switchTab('scan');

    // --- 写真管理操作 ---
    const mergeModeBtn = document.getElementById('btn-merge-mode');
    if (mergeModeBtn) mergeModeBtn.onclick = () => photos.toggleMergeMode();

    const mergeCancelBtn = document.getElementById('btn-merge-cancel');
    if (mergeCancelBtn) mergeCancelBtn.onclick = () => photos.toggleMergeMode();

    const mergeExecBtn = document.getElementById('btn-merge-exec');
    if (mergeExecBtn) mergeExecBtn.onclick = () => {
      document.getElementById('merge-modal').style.display = 'flex';
    };

    document.querySelectorAll('.merge-layout-btn').forEach(btn => {
      btn.onclick = () => {
        const layout = btn.dataset.layout;
        document.getElementById('merge-modal').style.display = 'none';
        photos.executeMerge(layout);
      };
    });

    const mergeModalCancel = document.getElementById('merge-modal-cancel');
    if (mergeModalCancel) mergeModalCancel.onclick = () => {
      document.getElementById('merge-modal').style.display = 'none';
    };

    const photoClearBtn = document.getElementById('btn-photo-clear');
    if (photoClearBtn) photoClearBtn.onclick = () => photos.clearAll();

    // --- 設定操作 ---
    const vibToggle = document.getElementById('set-vibration');
    if (vibToggle) vibToggle.onchange = (e) => {
      state.vibration = e.target.checked;
      storage.save();
    };

    // --- ライトボックス ---
    const lbClose = document.getElementById('lb-close');
    if (lbClose) lbClose.onclick = () => {
      document.getElementById('lightbox').style.display = 'none';
    };
  },

  /**
   * タブ切り替えロジック
   * @param {string} tabId 
   */
  switchTab(tabId) {
    console.log(`[UI] Switching to tab: ${tabId}`);
    state.currentTab = tabId;

    // タブボタンのスタイル更新
    document.querySelectorAll('.tab').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.tab === tabId);
    });

    // ページの表示切り替え
    document.querySelectorAll('.page').forEach(pg => {
      pg.classList.toggle('on', pg.id === `pg-${tabId}`);
    });

    // カメラ/スキャナーのライフサイクル管理
    if (tabId === 'camera') {
      camera.start();
      scanner.stop();
    } else if (tabId === 'scan') {
      scanner.start();
      camera.stop();
    } else {
      camera.stop();
      scanner.stop();
    }

    // 写真タブなら再描画
    if (tabId === 'photos') {
      photos.renderGrid();
    }
    
    utils.vibrate(20);
  },

  /**
   * ヘッダー等のカウント表示更新
   */
  updateCounts() {
    const hdrCount = document.getElementById('hdr-count');
    if (hdrCount) {
      hdrCount.textContent = `${state.bcHistory.length}BC / ${state.photos.length}📷`;
    }
    
    const bcTabCount = document.getElementById('bc-count');
    if (bcTabCount) bcTabCount.textContent = state.bcHistory.length;
    
    if (typeof photos !== 'undefined') photos.updateCountsUI();
  },

  /**
   * グループ選択プルダウンの同期
   */
  renderGroupSelects() {
    const options = state.groups.map(g => `<option value="${g}" ${g === state.activeGroup ? 'selected' : ''}>${g}</option>`).join('');
    
    ['scan-group-select', 'cam-group-select', 'hist-ph-group-select'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = options;
        el.onchange = (e) => {
          state.activeGroup = e.target.value;
          storage.save();
          this.renderGroupSelects(); // 他のプルダウンも同期
        };
      }
    });
  },

  /**
   * 設定画面の状態をステートと同期
   */
  syncSettingsUI() {
    const vib = document.getElementById('set-vibration');
    if (vib) vib.checked = state.vibration;
    
    // 比率ボタンのアクティブ状態
    document.querySelectorAll('.ratio-btn').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.ratio === state.aspectRatio);
    });
  },

  /**
   * スキャンボタンのテキスト更新
   */
  updateScanBtn() {
    const btn = document.getElementById('btn-scan');
    if (btn) {
      btn.textContent = state.isScanning ? "■ スキャン停止" : "▶ スキャン開始";
      btn.classList.toggle('stop', state.isScanning);
    }
  }
};
