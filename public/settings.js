let allChannels = [];
let allGroups = [];

document.addEventListener('DOMContentLoaded', () => {
    initSettingsUI();
    loadData();
    // initTabs(); // ★削除: タブ機能廃止
});

function initSettingsUI() {
    document.getElementById('addChannelBtn').addEventListener('click', addChannel);
    document.getElementById('addGroupBtn').addEventListener('click', addGroup);
    document.getElementById('clearCacheBtn').addEventListener('click', clearVideoCache);
    document.getElementById('resetAllBtn').addEventListener('click', resetAllData);
    document.getElementById('importHistoryBtn').addEventListener('click', importHistory);
    document.getElementById('saveExcludeKeywordsBtn').addEventListener('click', saveExcludeKeywords);
    
    const saveAllBtn = document.getElementById('saveAllAssociationsBtn');
    if (saveAllBtn) {
        saveAllBtn.addEventListener('click', saveAllAssociations);
    }
}

// initTabs関数は削除

async function loadData() {
    await fetchApiStatus();
    await fetchChannels();
    await fetchGroups();
    manageAssociations();
    await loadExcludeKeywords();
}

async function loadExcludeKeywords() {
    const input = document.getElementById('excludeKeywordsInput');
    if (!input) return; 

    try {
        const res = await fetch('/api/settings/exclude-keywords');
        const data = await res.json();
        if (res.ok) {
            input.value = data.keywords || '';
        }
    } catch (e) {
        console.error("Error loading exclude keywords:", e);
    }
}

async function saveExcludeKeywords() {
    const input = document.getElementById('excludeKeywordsInput');
    const status = document.getElementById('excludeKeywordsStatus');
    const keywords = input.value.trim();

    status.textContent = '保存中...';
    status.style.color = "#888888"; 

    try {
        const res = await fetch('/api/settings/exclude-keywords', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords: keywords })
        });

        const data = await res.json();
        if (res.ok) {
            status.textContent = `✅ 除外キーワードを保存しました。`;
            status.style.color = "#1dc93a"; 
        } else {
            status.textContent = `❌ 保存エラー: ${data.error || '不明なエラー'}`;
            status.style.color = "#ff3b30"; 
        }
    } catch (e) {
        status.textContent = `❌ ネットワークエラー: ${e.message}`;
        status.style.color = "#ff3b30";
    }
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
    const saveAllBtn = document.getElementById('saveAllAssociationsBtn');
    container.innerHTML = '';

    const activeChannels = allChannels.filter(c => !c.deleted_at);

    if (activeChannels.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">登録チャンネルがありません。</p>';
        if (saveAllBtn) saveAllBtn.disabled = true;
        return;
    }

    if (allGroups.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">グループがありません。グループ追加セクションで作成してください。</p>';
        if (saveAllBtn) saveAllBtn.disabled = true;
        return;
    }
    
    // チャンネルとグループが存在する場合、ボタンを有効化
    if (saveAllBtn) saveAllBtn.disabled = false;

    const ul = document.createElement('ul');
    ul.className = 'association-list';

    activeChannels.forEach(channel => {
        const li = createAssociationListItem(channel);
        ul.appendChild(li);
    });

    container.appendChild(ul);
    status.textContent = `変更後、「全ての紐付けを一括保存」ボタンを押してください。`;
}

function createAssociationListItem(channel) {
    const li = document.createElement('li');
    li.className = 'list-item association-item';
    li.dataset.channelId = channel.id;

    const currentGroups = channel.group_name ? channel.group_name.split(',').map(g => g.trim()).filter(g => g) : [];

    // 1. チャンネル情報 (名前と現在の紐付け)
    const infoDiv = document.createElement('div');
    infoDiv.className = 'association-channel-info';

    const currentGroupsDisplay = document.createElement('span');
    currentGroupsDisplay.className = 'current-groups-display';
    currentGroupsDisplay.textContent = currentGroups.length > 0 ? currentGroups.join(', ') : '紐付けなし';

    infoDiv.innerHTML = `<span class="channel-name">${channel.name}</span>`;
    infoDiv.appendChild(currentGroupsDisplay);


    // 2. グループ選択チェックボックスリスト
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
        // data-original-state を追加し、変更が起こったか追跡できるようにする
        checkbox.dataset.originalState = checkbox.checked ? 'true' : 'false';

        label.appendChild(checkbox);
        const labelText = document.createElement('span');
        labelText.textContent = groupName;
        label.appendChild(labelText);

        groupSelector.appendChild(label);
    });

    li.appendChild(infoDiv);
    li.appendChild(groupSelector);
    return li;
}

async function saveAllAssociations() {
    const container = document.getElementById('channelAssociationList');
    const allStatusDiv = document.getElementById('allAssociationStatus');
    const saveAllBtn = document.getElementById('saveAllAssociationsBtn');
    
    if (container.classList.contains('saving')) return; 

    // 1. UIを保存中状態に切り替え
    container.classList.add('saving');
    saveAllBtn.disabled = true;
    allStatusDiv.innerHTML = '保存処理を開始しました...';
    allStatusDiv.style.color = "#007aff";


    const listItems = container.querySelectorAll('.association-item');
    const updatePromises = [];
    let savedCount = 0;
    let totalChanges = 0;

    listItems.forEach(li => {
        const channelId = li.dataset.channelId;
        const checkboxes = li.querySelectorAll('input[type="checkbox"]');
        
        let changed = false;
        const selectedGroups = Array.from(checkboxes)
            .map(cb => {
                // 変更があったかチェック
                const currentState = cb.checked ? 'true' : 'false';
                if (currentState !== cb.dataset.originalState) {
                    changed = true;
                }
                return cb.checked ? cb.value : null;
            })
            .filter(v => v !== null)
            .join(',');

        if (changed) {
            totalChanges++;
            // 2. 各チャンネルの更新を非同期で実行
            const promise = fetch(`/api/channels/${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group: selectedGroups }) 
            })
            .then(res => {
                if (res.ok) {
                    savedCount++;
                    // UI上のチェックボックスの状態をリセット
                    checkboxes.forEach(cb => {
                        cb.dataset.originalState = cb.checked ? 'true' : 'false';
                    });
                    // 更新されたチャンネルのグループ表示も更新
                    const currentGroupsDisplay = li.querySelector('.current-groups-display');
                    currentGroupsDisplay.textContent = selectedGroups.length > 0 ? selectedGroups.split(',').join(', ') : '紐付けなし';
                } else {
                    console.error(`Error saving channel ${channelId}`);
                }
            })
            .catch(e => {
                console.error(`Network Error saving channel ${channelId}:`, e);
            });
            
            updatePromises.push(promise);
        }
    });

    // 3. 全ての更新が完了するのを待つ
    await Promise.allSettled(updatePromises);

    // 4. UIを完了状態に戻す
    container.classList.remove('saving');
    saveAllBtn.disabled = false;

    if (totalChanges === 0) {
        allStatusDiv.innerHTML = '✅ 変更はありませんでした。';
        allStatusDiv.style.color = "#888888";
    } else if (savedCount === totalChanges) {
        allStatusDiv.innerHTML = `✅ 全ての紐付け (${savedCount}件) を正常に保存しました。`;
        allStatusDiv.style.color = "#1dc93a";
    } else {
        allStatusDiv.innerHTML = `❌ 保存エラー: ${totalChanges - savedCount}件のチャンネルの保存に失敗しました。`;
        allStatusDiv.style.color = "#ff3b30";
    }

    // 5. 5秒後にステータス表示をリセットし、データを再ロード
    setTimeout(() => {
        allStatusDiv.textContent = '';
        loadData(); // データの最新状態を再読み込み
    }, 5000);
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