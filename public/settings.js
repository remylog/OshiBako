let allChannels = [];
let allGroups = [];

document.addEventListener('DOMContentLoaded', () => {
    initSettingsUI();
    loadData();
    initTabs(); 
});

function initSettingsUI() {
    document.getElementById('addChannelBtn').addEventListener('click', addChannel);
    document.getElementById('addGroupBtn').addEventListener('click', addGroup);
    document.getElementById('clearCacheBtn').addEventListener('click', clearVideoCache);
    document.getElementById('resetAllBtn').addEventListener('click', resetAllData);
    document.getElementById('importHistoryBtn').addEventListener('click', importHistory);
}

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    const switchTab = (targetTabId) => {
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === targetTabId) {
                btn.classList.add('active');
            }
        });

        tabPanes.forEach(pane => {
            if (pane.id === targetTabId) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });
        
        const container = document.getElementById('settings-container');
        if (container) {
            container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    if (tabButtons.length > 0) {
        switchTab(tabButtons[0].dataset.tab);
    }
}

async function loadData() {
    await fetchApiStatus();
    await fetchChannels();
    await fetchGroups();
    manageAssociations();
}

async function fetchApiStatus() {
    const statusDiv = document.getElementById('apiStatus');
    statusDiv.textContent = 'APIキーの状態: 確認中...';
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        if (data.youtube_api_available) {
            statusDiv.innerHTML = 'APIキーの状態: <span style="color:#007aff; font-weight:600;">有効</span>';
        } else {
            let reason = data.reason || '不明なエラー';
            
            if (reason.includes("Key not configured")) {
                 statusDiv.innerHTML = 'APIキーの状態: <span style="color:#ff3b30; font-weight:600;">無効/未設定</span> (`.env`を確認してください)';
            } else if (reason.includes("Invalid")) {
                 statusDiv.innerHTML = 'APIキーの状態: <span style="color:#ff3b30; font-weight:600;">無効なキー</span> (`.env`を確認してください)';
            } else {
                 statusDiv.innerHTML = `APIキーの状態: <span style="color:#ff3b30; font-weight:600;">認証エラー</span> (${reason})`;
            }
        }
    } catch (e) {
        statusDiv.innerHTML = 'APIキーの状態: <span style="color:#ff3b30; font-weight:600;">確認エラー</span> (サーバーとの通信失敗)';
        console.error("API Status Error:", e);
    }
}

async function fetchChannels() {
    const list = document.getElementById('channelList');
    const status = document.getElementById('channelStatus');
    list.innerHTML = '';
    status.textContent = 'チャンネルデータ取得中...';

    try {
        const res = await fetch('/api/channels');
        if (!res.ok) throw new Error('Failed to fetch channels');

        allChannels = await res.json();

        const activeChannels = allChannels.filter(c => !c.deleted_at);
        const deletedChannels = allChannels.filter(c => c.deleted_at);

        if (activeChannels.length === 0) {
            list.innerHTML = '<li class="empty-list-item">登録されているチャンネルはありません。</li>';
            status.textContent = '';
        } else {
            activeChannels.forEach(channel => {
                list.appendChild(createChannelListItem(channel));
            });
            status.textContent = `現在 ${activeChannels.length} チャンネルが登録されています。`;
        }

        if (deletedChannels.length > 0) {
            const deletedHeader = document.createElement('li');
            deletedHeader.className = 'deleted-channels-header';
            deletedHeader.textContent = `--- 削除済みチャンネル (${deletedChannels.length}) ---`;
            list.appendChild(deletedHeader);

            deletedChannels.forEach(channel => {
                list.appendChild(createChannelListItem(channel, true));
            });
        }

    } catch (e) {
        status.textContent = `チャンネル取得エラー: ${e.message}`;
        console.error("Channel Fetch Error:", e);
    }
}

function createChannelListItem(channel, isDeleted = false) {
    const li = document.createElement('li');
    li.className = `list-item ${isDeleted ? 'deleted' : ''}`;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'item-info';
    infoDiv.innerHTML = `
        <span class="channel-name">${channel.name || 'チャンネル名不明'}</span>
        <span class="channel-id">${channel.id}</span>
    `;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'item-actions';

    if (isDeleted) {
        const restoreBtn = document.createElement('button');
        restoreBtn.textContent = '復元';
        restoreBtn.className = 'restore-btn';
        restoreBtn.addEventListener('click', () => restoreChannel(channel.id));
        actionsDiv.appendChild(restoreBtn);
    } else {
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '削除';
        deleteBtn.className = 'delete-btn';
        deleteBtn.addEventListener('click', () => deleteChannel(channel.id));
        actionsDiv.appendChild(deleteBtn);
    }

    li.appendChild(infoDiv);
    li.appendChild(actionsDiv);
    return li;
}

async function addChannel() {
    const input = document.getElementById('channelIdInput');
    const channelId = input.value.trim();
    const status = document.getElementById('channelStatus');
    status.textContent = 'チャンネル情報取得中...';

    if (!channelId) {
        status.textContent = 'チャンネルIDまたはURLを入力してください。';
        return;
    }

    const id = extractChannelId(channelId);
    if (!id) {
        status.textContent = '無効なチャンネルIDまたはURLです。';
        return;
    }

    try {
        const res = await fetch('/api/channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: channelId, group: '未分類' })
        });

        const data = await res.json();
        if (res.ok) {
            status.textContent = `✅ チャンネル '${data.name}' を追加しました。`;
            input.value = '';
            await loadData(); 
        } else {
            status.textContent = `❌ 追加エラー: ${data.error || '不明なエラー'}`;
        }
    } catch (e) {
        status.textContent = `❌ ネットワークエラー: ${e.message}`;
    }
}

async function deleteChannel(id) {
    if (!confirm(`チャンネルID ${id} を削除しますか？\n（動画データはそのまま残ります）`)) return;
    const status = document.getElementById('channelStatus');
    status.textContent = '削除中...';

    try {
        const res = await fetch(`/api/channels/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            status.textContent = `✅ チャンネルID ${id} を削除しました。`;
            await loadData();
        } else {
            status.textContent = `❌ 削除エラー: ${data.error || '不明なエラー'}`;
        }
    } catch (e) {
        status.textContent = `❌ ネットワークエラー: ${e.message}`;
    }
}

async function restoreChannel(id) {
    const status = document.getElementById('channelStatus');
    status.textContent = '復元中...';

    try {
        const res = await fetch(`/api/channels/${id}/restore`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            status.textContent = `✅ チャンネルID ${id} を復元しました。`;
            await loadData();
        } else {
            status.textContent = `❌ 復元エラー: ${data.error || '不明なエラー'}`;
        }
    } catch (e) {
        status.textContent = `❌ ネットワークエラー: ${e.message}`;
    }
}

function extractChannelId(input) {
    const urlPattern = /(?:youtube\.com\/(?:@|c\/|channel\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)?([a-zA-Z0-9_-]{16,})/;
    const match = input.match(urlPattern);
    return match ? match[1] : input.length > 16 && !input.includes('/') ? input : null;
}

async function fetchGroups() {
    const list = document.getElementById('groupList');
    const status = document.getElementById('groupStatus');
    list.innerHTML = '';
    status.textContent = 'グループデータ取得中...';

    try {
        const res = await fetch('/api/groups');
        if (!res.ok) throw new Error('Failed to fetch groups');

        allGroups = await res.json();

        if (allGroups.length === 0) {
            list.innerHTML = '<li class="empty-list-item">登録されているグループはありません。</li>';
            status.textContent = '';
        } else {
            allGroups.forEach(group => {
                list.appendChild(createGroupListItem(group));
            });
            status.textContent = `現在 ${allGroups.length} グループが登録されています。`;
        }

    } catch (e) {
        status.textContent = `グループ取得エラー: ${e.message}`;
        console.error("Group Fetch Error:", e);
    }
}

function createGroupListItem(group) {
    const li = document.createElement('li');
    li.className = 'list-item group-item';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'item-info';
    infoDiv.innerHTML = `<span class="group-name">${group.group_name}</span>`;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'item-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '削除';
    deleteBtn.className = 'delete-btn';
    deleteBtn.addEventListener('click', () => deleteGroup(group.group_name));
    actionsDiv.appendChild(deleteBtn);

    li.appendChild(infoDiv);
    li.appendChild(actionsDiv);

    return li;
}

async function addGroup() {
    const nameInput = document.getElementById('groupNameInput');
    const status = document.getElementById('groupStatus');
    const name = nameInput.value.trim();

    if (!name) {
        status.textContent = 'グループ名を入力してください。';
        return;
    }

    status.textContent = 'グループ保存中...';

    try {
        const res = await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_name: name, channel_ids: '' })
        });

        const data = await res.json();
        if (res.ok) {
            status.textContent = `✅ グループ '${name}' を保存しました。`;
            nameInput.value = '';
            await loadData(); 
        } else {
            status.textContent = `❌ 保存エラー: ${data.error || '不明なエラー'}`;
        }
    } catch (e) {
        status.textContent = `❌ ネットワークエラー: ${e.message}`;
    }
}

async function deleteGroup(name) {
    if (!confirm(`グループ '${name}' を削除しますか？\n（動画のグループ情報は消去されません）`)) return;
    const status = document.getElementById('groupStatus');
    status.textContent = '削除中...';

    try {
        const res = await fetch(`/api/groups/${name}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            status.textContent = `✅ グループ '${name}' を削除しました。`;
            await loadData();
        } else {
            status.textContent = `❌ 削除エラー: ${data.error || '不明なエラー'}`;
        }
    } catch (e) {
        status.textContent = `❌ ネットワークエラー: ${e.message}`;
    }
}

function manageAssociations() {
    const container = document.getElementById('channelAssociationList');
    const status = document.getElementById('associationStatus');
    container.innerHTML = '';

    const activeChannels = allChannels.filter(c => !c.deleted_at);

    if (activeChannels.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">登録チャンネルがありません。</p>';
        return;
    }

    if (allGroups.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">グループがありません。グループ追加セクションで作成してください。</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'association-list';

    activeChannels.forEach(channel => {
        const li = createAssociationListItem(channel);
        ul.appendChild(li);
    });

    container.appendChild(ul);
    status.textContent = `選択後、チャンネル名の下の「保存」ボタンを押してください。`;
}

function createAssociationListItem(channel) {
    const li = document.createElement('li');
    li.className = 'list-item association-item';
    li.dataset.channelId = channel.id;

    const currentGroups = channel.group_name ? channel.group_name.split(',').map(g => g.trim()).filter(g => g) : [];

    const infoDiv = document.createElement('div');
    infoDiv.className = 'association-channel-info';

    const currentGroupsDisplay = document.createElement('span');
    currentGroupsDisplay.className = 'current-groups-display';
    currentGroupsDisplay.textContent = currentGroups.length > 0 ? currentGroups.join(', ') : '紐付けなし';

    infoDiv.innerHTML = `<span class="channel-name">${channel.name}</span>`;
    infoDiv.appendChild(currentGroupsDisplay);


    const groupSelector = document.createElement('div');
    groupSelector.className = 'group-selector'; 

    allGroups.forEach(group => {
        const groupName = group.group_name;
        const checkboxId = `cb-${channel.id}-${groupName}`;

        const label = document.createElement('label');
        label.className = 'group-checkbox-label';
        label.htmlFor = checkboxId;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.value = groupName;
        checkbox.checked = currentGroups.includes(groupName);

        label.appendChild(checkbox);
        const labelText = document.createElement('span');
        labelText.textContent = groupName;
        label.appendChild(labelText);

        groupSelector.appendChild(label);
    });

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '保存';
    saveBtn.className = 'save-association-btn';
    saveBtn.addEventListener('click', () => saveChannelAssociation(channel.id, li));

    li.appendChild(infoDiv);
    li.appendChild(groupSelector);
    li.appendChild(saveBtn);
    return li;
}

async function saveChannelAssociation(channelId, listItem) {
    const selectedGroups = Array.from(listItem.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => cb.value)
        .join(',');

    const status = document.getElementById('associationStatus');
    const originalText = listItem.querySelector('.save-association-btn').textContent;

    listItem.classList.add('saving');
    listItem.querySelector('.save-association-btn').textContent = '保存中...';

    try {
        const res = await fetch(`/api/channels/${channelId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: selectedGroups }) 
        });

        const data = await res.json();
        if (res.ok) {
            status.textContent = `✅ チャンネルの紐付けを保存しました。`;
            listItem.querySelector('.save-association-btn').textContent = '保存済み';
            listItem.classList.add('saved-success');

            setTimeout(() => {
                listItem.classList.remove('saved-success');
                listItem.querySelector('.save-association-btn').textContent = originalText;
                loadData();
            }, 1000);

        } else {
            status.textContent = `❌ 保存エラー: ${data.error || '不明なエラー'}`;
            listItem.querySelector('.save-association-btn').textContent = 'エラー';
        }
    } catch (e) {
        status.textContent = `❌ ネットワークエラー: ${e.message}`;
        listItem.querySelector('.save-association-btn').textContent = 'エラー';
    } finally {
        listItem.classList.remove('saving');
    }
}


async function clearVideoCache() {
    if (!confirm('全ての動画キャッシュ（動画一覧）をクリアしますか？\n（チャンネル設定やグループ設定は残り、次回アクセス時に動画は再取得されます）')) return;

    const btn = document.getElementById('clearCacheBtn');
    btn.textContent = 'クリア中...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/videos', { method: 'DELETE' });
        const data = await res.json();

        if (res.ok) {
            alert(`✅ ${data.message || '動画キャッシュをクリアしました。'}`);
        } else {
            alert(`❌ クリアエラー: ${data.error || '不明なエラー'}`);
        }
    } catch (e) {
        alert(`❌ ネットワークエラー: ${e.message}`);
    } finally {
        btn.textContent = '動画キャッシュをクリア';
        btn.disabled = false;
        loadData();
    }
}

async function resetAllData() {
    if (!confirm('警告: チャンネル、グループ、動画を含む**全てのデータ**をリセットしますか？\nこの操作は元に戻せません。')) return;

    const btn = document.getElementById('resetAllBtn');
    btn.textContent = 'リセット中...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/reset', { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            alert(`✅ ${data.message || '全てのデータをリセットしました。'}`);
        } else {
            alert(`❌ リセットエラー: ${data.error || '不明なエラー'}`);
        }
    } catch (e) {
        alert(`❌ ネットワークエラー: ${e.message}`);
    } finally {
        btn.textContent = '全ての設定とデータをリセット';
        btn.disabled = false;
        window.location.reload();
    }
}

async function importHistory() {
    const fileInput = document.getElementById('historyFile');
    const status = document.getElementById('importStatus');
    if (!fileInput.files[0]) return;
    status.textContent = "読み込み中...";
    status.style.color = "#888888";

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
            if (d.success) {
                status.textContent = `✅ ${d.count}件インポート完了`;
                status.style.color = "#1dc93a"; 
            } else {
                status.textContent = `❌ エラー: ${d.error || '不明なエラー'}`;
                status.style.color = "#ff3b30"; 
            }
        } catch (err) {
            status.textContent = "❌ ファイル形式エラー (JSON形式を確認してください)";
            status.style.color = "#ff3b30";
        }
    };
    reader.readAsText(fileInput.files[0]);
}