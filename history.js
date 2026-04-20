/**
 * @file history.js
 * バーコード履歴の高度な管理ロジック。
 * 検索、フィルタリング、ソート、一括選択、表示モードの切り替えを担当します。
 */

const history = {
  /**
   * 履歴リストのレンダリング
   */
  render() {
    console.log("[History] Rendering barcode history...");
    const listEl = document.getElementById('bc-list');
    const emptyEl = document.getElementById('bc-empty');
    
    if (state.bcHistory.length === 0) {
      listEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    listEl.style.display = 'flex';

    // 検索とフィルタの適用
    let displayData = this.applyFilters([...state.bcHistory]);

    // ソートの適用
    displayData = this.applySort(displayData);

    // リストの生成
    listEl.innerHTML = displayData.map(item => this.createCardHTML(item)).join('');

    // 各カードへのイベント付与
    this.attachCardEvents(listEl);
  },

  /**
   * カードの HTML 生成（通常モード / コンパクトモード）
   */
  createCardHTML(item) {
    const isChecked = item.checked;
    const isSelected = state.selectedBcItems.includes(item.id);
    const compactClass = state.bcDisplayMode === 'compact' ? 'compact' : '';

    return `
      <div class="bc-card ${compactClass} ${isChecked ? 'checked' : ''} ${isSelected ? 'multi-selected' : ''}" data-id="${item.id}">
        <div class="bc-info">
          <div class="bc-val-large">${item.value}</div>
          <div class="bc-meta-info">
            <span class="card-fmt">${item.format}</span>
            <span class="card-time">${item.date}</span>
            <span class="card-group-badge">${item.group}</span>
          </div>
        </div>
        <div class="bc-actions">
          <button class="card-check" title="チェック">${isChecked ? '✓' : '○'}</button>
          <button class="btn-x" title="削除">×</button>
        </div>
      </div>
    `;
  },

  /**
   * 検索・フィルタリングロジック
   */
  applyFilters(data) {
    const searchVal = document.getElementById('search-box').value.toLowerCase();
    
    // 1. 検索ワードでフィルタ
    if (searchVal) {
      data = data.filter(item => item.value.toLowerCase().includes(searchVal));
    }

    // 2. タブによるフィルタ（全て/済み/未確認）
    const activeFilter = document.querySelector('.flt-btn.on').dataset.filter;
    if (activeFilter === 'checked') {
      data = data.filter(item => item.checked);
    } else if (activeFilter === 'unchecked') {
      data = data.filter(item => !item.checked);
    }

    return data;
  },

  /**
   * ソートロジック
   */
  applySort(data) {
    // 現在のソート順（新しい順/古い順/値順など）
    const btn = document.getElementById('btn-bc-sort');
    const order = btn.dataset.order || 'new';

    if (order === 'new') {
      return data.sort((a, b) => b.id - a.id);
    } else if (order === 'old') {
      return data.sort((a, b) => a.id - b.id);
    } else {
      return data.sort((a, b) => a.value.localeCompare(b.value));
    }
  },

  /**
   * イベントリスナーの付与
   */
  attachCardEvents(parent) {
    parent.querySelectorAll('.bc-card').forEach(card => {
      const id = Number(card.dataset.id);

      // チェックボタン
      card.querySelector('.card-check').onclick = (e) => {
        e.stopPropagation();
        this.toggleCheck(id);
      };

      // 削除ボタン
      card.querySelector('.btn-x').onclick = (e) => {
        e.stopPropagation();
        this.deleteItem(id);
      };

      // カード本体（複数選択モード用）
      card.onclick = () => {
        if (state.bcMultiSelectMode) {
          this.toggleSelectItem(id);
        } else {
          // 詳細表示（将来的な拡張用）
          console.log("Detail view for:", id);
        }
      };
    });
  },

  /**
   * チェック状態の反転
   */
  toggleCheck(id) {
    const item = state.bcHistory.find(i => i.id === id);
    if (item) {
      item.checked = !item.checked;
      storage.save();
      this.render();
      utils.vibrate(20);
    }
  },

  /**
   * 削除
   */
  deleteItem(id) {
    state.bcHistory = state.bcHistory.filter(i => i.id !== id);
    storage.save();
    this.render();
    ui.updateCounts();
  }
};
