/**
 * @file settings.js
 * 設定画面の動的な管理。
 * グループの追加・削除、データのインポート/エクスポート、
 * ストレージ管理機能を担当します。
 */

const settings = {
  /**
   * グループリストのUI更新
   */
  renderGroupManager() {
    const listEl = document.getElementById('grp-list-el');
    if (!listEl) return;

    listEl.innerHTML = state.groups.map(group => `
      <div class="grp-item" style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #1e2a38;">
        <span>${group}</span>
        ${group !== 'General' ? `<button class="btn-del-grp" data-name="${group}" style="color:#ff4466; background:none; border:none; cursor:pointer;">削除</button>` : '<i>(固定)</i>'}
      </div>
    `).join('');

    // 削除イベント
    listEl.querySelectorAll('.btn-del-grp').forEach(btn => {
      btn.onclick = () => this.deleteGroup(btn.dataset.name);
    });
  },

  /**
   * 新規グループの追加
   */
  addGroup() {
    const input = document.getElementById('grp-add-input');
    const name = input.value.trim();

    if (!name) return;
    if (state.groups.includes(name)) {
      utils.showToast("既に存在するグループ名です", "err");
      return;
    }

    state.groups.push(name);
    input.value = '';
    storage.save();
    this.renderGroupManager();
    ui.renderGroupSelects();
    utils.showToast("グループを追加しました");
  },

  /**
   * グループの削除
   */
  deleteGroup(name) {
    if (confirm(`グループ「${name}」を削除しますか？内のアイテムは General に移動されます。`)) {
      state.groups = state.groups.filter(g => g !== name);
      
      // アイテムの移動ロジック
      state.photos.forEach(p => { if(p.group === name) p.group = 'General'; });
      state.bcHistory.forEach(b => { if(b.group === name) b.group = 'General'; });
      
      if (state.activeGroup === name) state.activeGroup = 'General';
      
      storage.save();
      this.renderGroupManager();
      ui.renderGroupSelects();
      utils.showToast("削除しました");
    }
  }
};
