document.addEventListener('DOMContentLoaded', () => {
  loadChannels();
  loadArchivedChannels();
  
  document.getElementById('addChannelBtn').addEventListener('click', addNewChannel);
  document.getElementById('bulkAddBtn').addEventListener('click', addBulkChannels);
  document.getElementById('importHistoryBtn').addEventListener('click', importHistory);
});

// アクティブチャンネル一覧
async function loadChannels() {
  const list = document.getElementById('settingsList');
  try {
    const res = await fetch('/api/channels?type=active');
    const channels = await res.json();
    list.innerHTML = '';
    
    if (channels.length === 0) {
      list.innerHTML = '<div style="padding:10px; color:#999;">チャンネルがありません</div>';
      return;
    }

    channels.forEach(c => {
      const div = document.createElement('div');
      div.className = 'channel-list-item';
      // グループ編集用のinputを表示
      div.innerHTML = `
        <div class="channel-info">
          <span class="channel-name">${c.name}</span>
          <input type="text" class="group-edit-input" value="${c.group_name}" data-id="${c.id}">
        </div>
        <div class="btn-area">
          <button class="action-btn update-btn" data-id="${c.id}">更新</button>
          <button class="action-btn delete-btn" data-id="${c.id}">削除</button>
        </div>
      `;

      // 更新ボタン
      div.querySelector('.update-btn').addEventListener('click', async () => {
        const newGroup = div.querySelector('.group-edit-input').value;
        await fetch(`/api/channels/${c.id}`, {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ group: newGroup })
        });
        alert('グループを更新しました');
      });

      // 削除（アーカイブへ）
      div.querySelector('.delete-btn').addEventListener('click', async () => {
        if(confirm(`「${c.name}」をアーカイブへ移動しますか？\n（7日後に完全削除されます）`)) {
          await fetch(`/api/channels/${c.id}`, { method: 'DELETE' });
          loadChannels();
          loadArchivedChannels();
        }
      });

      list.appendChild(div);
    });
  } catch (e) { console.error(e); }
}

// アーカイブ一覧
async function loadArchivedChannels() {
  const list = document.getElementById('archiveList');
  try {
    const res = await fetch('/api/channels?type=archived');
    const channels = await res.json();
    list.innerHTML = '';
    
    if (channels.length === 0) {
      list.innerHTML = '<div style="padding:10px; color:#999;">アーカイブはありません</div>';
      return;
    }

    channels.forEach(c => {
      const div = document.createElement('div');
      div.className = 'channel-list-item';
      const daysLeft = 7 - Math.floor((Date.now() - c.deleted_at) / (1000 * 60 * 60 * 24));
      
      div.innerHTML = `
        <div class="channel-info">
          <span class="channel-name" style="color:#888;">${c.name}</span>
          <span style="font-size:12px; color:#cc0000;">あと${daysLeft}日で削除</span>
        </div>
        <button class="action-btn restore-btn" data-id="${c.id}">復元する</button>
      `;

      // 復元
      div.querySelector('.restore-btn').addEventListener('click', async () => {
        await fetch(`/api/channels/${c.id}/restore`, { method: 'POST' });
        loadChannels();
        loadArchivedChannels();
      });

      list.appendChild(div);
    });
  } catch (e) { console.error(e); }
}

// チャンネル追加 (変更なし)
async function addNewChannel() {
  const urlInput = document.getElementById('newChannelUrl');
  const groupInput = document.getElementById('newChannelGroup');
  const statusMsg = document.getElementById('addStatus');
  const url = urlInput.value.trim();
  const group = groupInput.value.trim() || "未分類";

  if (!url) return;
  statusMsg.textContent = "処理中...";
  statusMsg.style.color = "blue";
  
  try {
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, group })
    });
    const data = await res.json();
    if (data.success) {
      statusMsg.textContent = data.restored ? `♻️ アーカイブから「${data.name}」を復元しました` : `✅ 「${data.name}」を追加しました`;
      statusMsg.style.color = "green";
      urlInput.value = '';
      loadChannels();
      loadArchivedChannels();
    } else {
      statusMsg.textContent = "❌ " + data.error;
      statusMsg.style.color = "red";
    }
  } catch(e) { statusMsg.textContent = "エラー"; }
}

// 一括追加
async function addBulkChannels() {
  const input = document.getElementById('bulkChannelInput');
  const status = document.getElementById('bulkStatus');
  const lines = input.value.split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return;

  status.textContent = "処理中...";
  let s=0, f=0;

  for (let line of lines) {
    let parts = line.split(',').map(s=>s.trim());
    let url = parts[0];
    // グループが複数ある場合 (ID, Group1, Group2) -> Group1, Group2 を結合
    let group = parts.slice(1).join(', ') || "未分類";

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, group })
      });
      const d = await res.json();
      d.success ? s++ : f++;
    } catch(e) { f++; }
    status.textContent = `${s+f}/${lines.length} 完了`;
  }
  loadChannels();
  loadArchivedChannels();
  input.value = '';
}

// 履歴インポート
async function importHistory() {
  const fileInput = document.getElementById('historyFile');
  const status = document.getElementById('importStatus');
  if (!fileInput.files[0]) return;
  status.textContent = "読み込み中...";
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const json = JSON.parse(e.target.result);
      status.textContent = `送信中 (${json.length}件)...`;
      const res = await fetch('/api/import-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: e.target.result
      });
      const d = await res.json();
      status.textContent = d.success ? `✅ ${d.count}件インポート完了` : "❌ エラー";
    } catch (err) { status.textContent = "ファイル形式エラー"; }
  };
  reader.readAsText(fileInput.files[0]);
}