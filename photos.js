/**
 * @file photos.js
 * フォトギャラリーの管理、複数選択、削除、
 * および複数の写真を1枚にまとめる「画像結合（マージ）」機能を担当します。
 */

const photos = {
  /**
   * 写真グリッドの再描画
   */
  renderGrid() {
    console.log("[Photos] Rendering photo grid...");
    const grid = document.getElementById('photo-grid');
    const emptyMsg = document.getElementById('photo-empty');
    
    if (state.photos.length === 0) {
      grid.style.display = 'none';
      if (emptyMsg) emptyMsg.style.display = 'flex';
      this.updateCountsUI();
      return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';
    grid.style.display = 'grid';

    // 表示順の適用
    const displayList = [...state.photos];
    if (state.photoSortOrder === 'old') {
      displayList.reverse();
    }

    grid.innerHTML = displayList.map(photo => {
      const isSelected = state.selectedPhotos.includes(photo.id);
      return `
        <div class="photo-item ${isSelected ? 'selected' : ''}" data-id="${photo.id}">
          <img src="${photo.src}" loading="lazy" alt="photo">
          ${(state.multiSelectMode || state.mergeMode) ? '<div class="photo-select-overlay"></div>' : ''}
        </div>
      `;
    }).join('');

    // イベントリスナーの付与
    grid.querySelectorAll('.photo-item').forEach(item => {
      item.onclick = () => this.handleItemClick(Number(item.dataset.id));
    });

    this.updateCountsUI();
  },

  /**
   * 写真クリック時の挙動制御
   * @param {number} id 
   */
  handleItemClick(id) {
    if (state.multiSelectMode || state.mergeMode) {
      // 選択モード中：選択状態の反転
      const index = state.selectedPhotos.indexOf(id);
      if (index > -1) {
        state.selectedPhotos.splice(index, 1);
      } else {
        state.selectedPhotos.push(id);
      }
      this.renderGrid();
      this.updateMultiSelectUI();
    } else {
      // 通常モード：拡大表示
      this.openLightbox(id);
    }
  },

  /**
   * 複数選択UIの状態更新
   */
  updateMultiSelectUI() {
    const count = state.selectedPhotos.length;
    const multiBar = document.getElementById('multi-sel-bar');
    const mergeBar = document.getElementById('merge-bar');
    const multiTxt = document.getElementById('multi-sel-txt');
    const mergeBtn = document.getElementById('btn-merge-exec');

    if (state.mergeMode) {
      if (mergeBar) mergeBar.classList.add('on');
      if (mergeBtn) mergeBtn.disabled = count < 2;
    } else if (state.multiSelectMode) {
      if (multiBar) multiBar.classList.add('on');
      if (multiTxt) multiTxt.textContent = `${count}枚 選択中`;
    } else {
      if (multiBar) multiBar.classList.remove('on');
      if (mergeBar) mergeBar.classList.remove('on');
    }
  },

  /**
   * 選択モードの切り替え
   */
  toggleSelectMode() {
    state.multiSelectMode = !state.multiSelectMode;
    state.mergeMode = false;
    state.selectedPhotos = [];
    this.renderGrid();
    this.updateMultiSelectUI();
  },

  /**
   * 結合モードの切り替え
   */
  toggleMergeMode() {
    state.mergeMode = !state.mergeMode;
    state.multiSelectMode = false;
    state.selectedPhotos = [];
    this.renderGrid();
    this.updateMultiSelectUI();
    if (state.mergeMode) {
      utils.showToast("結合する写真を2枚以上選んでください", "info");
    }
  },

  /**
   * 画像の結合（マージ）実行プロセッサ
   * @param {string} layout - 'h' (横), 'v' (縦), 'grid' (グリッド)
   */
  async executeMerge(layout) {
    if (state.selectedPhotos.length < 2) return;

    utils.showToast("画像を生成中...", "info");
    
    // 選択された写真オブジェクトを取得
    const selectedData = state.photos.filter(p => state.selectedPhotos.includes(p.id));
    
    // 画像エレメントの生成
    const images = await Promise.all(selectedData.map(data => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = data.src;
      });
    }));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    let totalW = 0, totalH = 0;

    // レイアウト計算
    if (layout === 'h') {
      // 横並び：高さは最大値に合わせ、幅は合計
      totalH = Math.max(...images.map(i => i.height));
      totalW = images.reduce((sum, i) => sum + i.width, 0);
      canvas.width = totalW;
      canvas.height = totalH;
      let x = 0;
      images.forEach(img => {
        ctx.drawImage(img, x, 0);
        x += img.width;
      });
    } else if (layout === 'v') {
      // 縦並び：幅は最大値に合わせ、高さは合計
      totalW = Math.max(...images.map(i => i.width));
      totalH = images.reduce((sum, i) => sum + i.height, 0);
      canvas.width = totalW;
      canvas.height = totalH;
      let y = 0;
      images.forEach(img => {
        ctx.drawImage(img, 0, y);
        y += img.height;
      });
    } else if (layout === 'grid') {
      // グリッド並び：2カラム固定
      const cols = 2;
      const rows = Math.ceil(images.length / cols);
      const cellW = Math.max(...images.map(i => i.width));
      const cellH = Math.max(...images.map(i => i.height));
      canvas.width = cellW * cols;
      canvas.height = cellH * rows;
      images.forEach((img, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        ctx.drawImage(img, c * cellW, r * cellH, cellW, cellH);
      });
    }

    // 保存処理
    const mergedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const newEntry = {
      id: Date.now(),
      src: mergedDataUrl,
      date: utils.getFormattedDate(),
      group: state.activeGroup,
      ratio: "Merged",
      timestamp: Date.now()
    };

    state.photos.unshift(newEntry);
    state.selectedPhotos = [];
    state.mergeMode = false;
    storage.save();
    
    this.renderGrid();
    this.updateMultiSelectUI();
    ui.updateCounts();
    utils.showToast("画像を結合して保存しました", "ok");
  },

  /**
   * ライトボックス表示
   */
  openLightbox(id) {
    const photo = state.photos.find(p => p.id === id);
    if (!photo) return;

    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lb-img');
    const lbTtl = document.getElementById('lb-ttl');
    
    lbImg.src = photo.src;
    lbTtl.textContent = `${photo.date} (${photo.group})`;
    lb.style.display = 'flex';

    // 削除ボタンイベント
    document.getElementById('lb-del').onclick = () => {
      if (confirm("この写真を削除しますか？")) {
        this.deletePhoto(id);
        lb.style.display = 'none';
      }
    };
  },

  /**
   * 単一写真の削除
   */
  deletePhoto(id) {
    state.photos = state.photos.filter(p => p.id !== id);
    storage.save();
    this.renderGrid();
    ui.updateCounts();
    utils.showToast("削除しました");
  },

  /**
   * 全写真の削除
   */
  clearAll() {
    if (confirm("全ての写真を削除してもよろしいですか？")) {
      state.photos = [];
      state.selectedPhotos = [];
      storage.save();
      this.renderGrid();
      ui.updateCounts();
      utils.showToast("全削除完了");
    }
  },

  /**
   * UI上のカウント表示更新
   */
  updateCountsUI() {
    const txt = document.getElementById('photo-count-txt');
    if (txt) txt.textContent = `${state.photos.length} / ${state.maxPhotos} 枚`;
    const phTabCount = document.getElementById('ph-count');
    if (phTabCount) phTabCount.textContent = state.photos.length;
  }
};
