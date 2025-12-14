let allChannels = [];
let allGroups = [];

document.addEventListener('DOMContentLoaded', () => {
    initSettingsUI();
    loadData();
});

// 各種ボタンにイベントリスナーを設定
function initSettingsUI() {
    document.getElementById('addChannelBtn').addEventListener('click', addChannel);
    document.getElementById('addGroupBtn').addEventListener('click', addGroup);
    document.getElementById('clearCacheBtn').addEventListener('click', clearVideoCache);
    document.getElementById('resetAllBtn').addEventListener('click', resetAllData);
    // ★追加: 履歴インポートボタンのリスナー
    document.getElementById('importHistoryBtn').addEventListener('click', importHistory);
}

// データの読み込み
async function loadData() {
    await fetchApiStatus();
    await fetchChannels();
    await fetchGroups();
    // 紐付け管理セクションをレンダリング
    manageAssociations();
}

// APIキーの状態を取得 (省略 - 変更なし)
async function fetchApiStatus() {
    const statusDiv = document.getElementById('apiStatus');
    statusDiv.textContent = 'APIキーの状態: 確認中...';
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.youtube_api_available) {
            statusDiv.innerHTML = 'APIキーの状態: <span style="color:#007aff; font-weight:600;">有効</span>';
        } else {
            statusDiv.innerHTML = 'APIキーの状態: <span style="color:#ff3b30; font-weight:600;">無効/未設定</span> (`.env`を確認してください)';
        }
    } catch (e) {
        statusDiv.innerHTML = 'APIキーの状態: <span style="color:#ff3b30; font-weight:600;">確認エラー</span>';
        console.error("API Status Error:", e);
    }
}

// 登録チャンネルの取得と表示 (省略 - 変更なし)
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

// チャンネルリストアイテムの生成 (省略 - 変更なし)
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

// チャンネルの追加 (省略 - 変更なし)
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
            await loadData(); // チャンネルとグループ両方再読み込み
        } else {
            status.textContent = `❌ 追加エラー: ${data.error || '不明なエラー'}`;
        }
    } catch (e) {
        status.textContent = `❌ ネットワークエラー: ${e.message}`;
    }
}

// チャンネルの削除 (省略 - 変更なし)
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

// チャンネルの復元 (省略 - 変更なし)
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

// チャンネルIDの抽出ヘルパー (省略 - 変更なし)
function extractChannelId(input) {
    const urlPattern = /(?:youtube\.com\/(?:@|c\/|channel\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)?([a-zA-Z0-9_-]{16,})/;
    const match = input.match(urlPattern);
    return match ? match[1] : input.length > 16 && !input.includes('/') ? input : null;
}

// グループの取得と表示 (省略 - 変更なし)
async function fetchGroups() {
    const list = document.getElementById('groupList');
    const status = document.getElementById('groupStatus');
    list.innerHTML = '';
    status.textContent = 'カテゴリデータ取得中...';

    try {
        const res = await fetch('/api/groups');
        if (!res.ok) throw new Error('Failed to fetch groups');

        allGroups = await res.json();

        if (allGroups.length === 0) {
            list.innerHTML = '<li class="empty-list-item">登録されているカテゴリはありません。</li>';
            status.textContent = '';
        } else {
            allGroups.forEach(group => {
                list.appendChild(createGroupListItem(group));
            });
            status.textContent = `現在 ${allGroups.length} カテゴリが登録されています。`;
        }

    } catch (e) {
        status.textContent = `カテゴリ取得エラー: ${e.message}`;
        console.error("Group Fetch Error:", e);
    }
}

// グループリストアイテムの生成 (省略 - 変更なし)
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

// グループの追加 (省略 - 変更なし)
async function addGroup() {
    const nameInput = document.getElementById('groupNameInput');
    const status = document.getElementById('groupStatus');
    const name = nameInput.value.trim();

    if (!name) {
        status.textContent = 'カテゴリ名を入力してください。';
        return;
    }

    status.textContent = 'カテゴリ保存中...';

    try {
        const res = await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_name: name, channel_ids: '' })
        });

        const data = await res.json();
        if (res.ok) {
            status.textContent = `✅ カテゴリ '${name}' を保存しました。`;
            nameInput.value = '';
            await loadData(); // 全データ再読み込み
        } else {
            status.textContent = `❌ 保存エラー: ${data.error || '不明なエラー'}`;
        }
    } catch (e) {
        status.textContent = `❌ ネットワークエラー: ${e.message}`;
    }
}

// グループの削除 (省略 - 変更なし)
async function deleteGroup(name) {
    if (!confirm(`カテゴリ '${name}' を削除しますか？\n（動画のカテゴリ情報は消去されません）`)) return;
    const status = document.getElementById('groupStatus');
    status.textContent = '削除中...';

    try {
        const res = await fetch(`/api/groups/${name}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            status.textContent = `✅ カテゴリ '${name}' を削除しました。`;
            await loadData();
        } else {
            status.textContent = `❌ 削除エラー: ${data.error || '不明なエラー'}`;
        }
    } catch (e) {
        status.textContent = `❌ ネットワークエラー: ${e.message}`;
    }
}

// チャンネルとカテゴリの紐付け管理のメイン関数 (省略 - 変更なし)
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
        container.innerHTML = '<p style="text-align:center; padding: 20px;">カテゴリがありません。カテゴリ追加セクションで作成してください。</p>';
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

// ★修正: 紐付けリストアイテムの生成 (チェックボックスタグ形式に戻す)
function createAssociationListItem(channel) {
    const li = document.createElement('li');
    li.className = 'list-item association-item';
    li.dataset.channelId = channel.id;

    // 現在紐づいているカテゴリ (channel.group_nameはカンマ区切り文字列)
    const currentGroups = channel.group_name ? channel.group_name.split(',').map(g => g.trim()).filter(g => g) : [];

    // 1. チャンネル情報 (名前と現在の紐付け)
    const infoDiv = document.createElement('div');
    infoDiv.className = 'association-channel-info';

    // 現在の紐付け状態を表示
    const currentGroupsDisplay = document.createElement('span');
    currentGroupsDisplay.className = 'current-groups-display';
    currentGroupsDisplay.textContent = currentGroups.length > 0 ? currentGroups.join(', ') : '紐付けなし';

    infoDiv.innerHTML = `<span class="channel-name">${channel.name}</span>`;
    infoDiv.appendChild(currentGroupsDisplay);


    // 2. カテゴリ選択チェックボックスリスト
    const categorySelector = document.createElement('div');
    categorySelector.className = 'category-selector'; // CSSで最大高さを設定

    allGroups.forEach(group => {
        const groupName = group.group_name;
        const checkboxId = `cb-${channel.id}-${groupName}`;

        const label = document.createElement('label');
        label.className = 'category-checkbox-label';
        label.htmlFor = checkboxId;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.value = groupName;
        checkbox.checked = currentGroups.includes(groupName);

        label.appendChild(checkbox);
        // ラベルのテキストを span で囲み、CSSで装飾しやすくする
        const labelText = document.createElement('span');
        labelText.textContent = groupName;
        label.appendChild(labelText);

        categorySelector.appendChild(label);
    });

    // 3. 保存ボタン
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '保存';
    saveBtn.className = 'save-association-btn';
    // select 要素の代わりにチェックボックスの変更を監視し、選択肢を渡す
    saveBtn.addEventListener('click', () => saveChannelAssociation(channel.id, li));

    li.appendChild(infoDiv);
    li.appendChild(categorySelector);
    li.appendChild(saveBtn);
    return li;
}

// ★修正: 紐付けの保存処理 (チェックボックスタグ対応)
async function saveChannelAssociation(channelId, listItem) {
    // 選択された全てのチェックボックスの値をカンマ区切りで取得
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
            body: JSON.stringify({ group: selectedGroups }) // group_nameとしてカンマ区切り文字列をPUT
        });

        const data = await res.json();
        if (res.ok) {
            status.textContent = `✅ チャンネルの紐付けを保存しました。`;
            listItem.querySelector('.save-association-btn').textContent = '保存済み';
            listItem.classList.add('saved-success');

            // 1秒後に元の状態に戻し、データを再読み込みして最新の紐付け状態を反映
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


// 動画キャッシュクリア (省略 - 変更なし)
async function clearVideoCache() {
    if (!confirm('全ての動画キャッシュ（動画一覧）をクリアしますか？\n（チャンネル設定やカテゴリ設定は残り、次回アクセス時に動画は再取得されます）')) return;

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

// 全データリセット (省略 - 変更なし)
async function resetAllData() {
    if (!confirm('警告: チャンネル、カテゴリ、動画を含む**全てのデータ**をリセットしますか？\nこの操作は元に戻せません。')) return;

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
        // リセット後、画面を再読み込み
        window.location.reload();
    }
}

// ★追加: 履歴インポート
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
                body: e.target.result // Send raw text content
            });
            const d = await res.json();
            if (d.success) {
                status.textContent = `✅ ${d.count}件インポート完了`;
                status.style.color = "#1dc93a"; // Green
            } else {
                status.textContent = `❌ エラー: ${d.error || '不明なエラー'}`;
                status.style.color = "#ff3b30"; // Red
            }
        } catch (err) {
            status.textContent = "❌ ファイル形式エラー (JSON形式を確認してください)";
            status.style.color = "#ff3b30";
        }
    };
    reader.readAsText(fileInput.files[0]);
}