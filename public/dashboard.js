let allVideos = [];
let allChannels = [];
let currentFilterType = 'channel';
let currentFilterId = 'all';
let displayLimit = 25;

console.log("🚀 Dashboard Script Loaded");

document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM fully loaded");
  initUI();
  loadVideos();
});

function initUI() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadVideos);

  const limitSelect = document.getElementById('limitSelect');
  if (limitSelect) {
    limitSelect.addEventListener('change', (e) => {
      displayLimit = parseInt(e.target.value, 10);
      renderVideos();
    });
  }
}

async function loadVideos() {
  const status = document.getElementById('status');
  if (status) status.textContent = 'データ取得中...';

  const grid = document.getElementById('videoGrid');
  if (grid) grid.style.opacity = '0.5';

  console.log("Fetching data from API...");

  try {
    const videoRes = await fetch('/api/videos');
    if (!videoRes.ok) throw new Error(`Video network response was not ok: ${videoRes.status}`);

    allVideos = await videoRes.json();
    console.log(`✅ Video data received: ${allVideos.length} videos`);

    // ★追加: チャンネルデータを取得
    allChannels = await getChannels();

    createChannelList(); // チャンネルアイコンリストを生成
    createCategoryButtons(); // カテゴリリストを生成
    renderVideos();

    if (grid) grid.style.opacity = '1';
  } catch (e) {
    console.error("❌ loadVideos Error:", e);
    if (status) status.textContent = 'エラーが発生しました: ' + e.message;
  }
}

// 登録されている全チャンネルデータ取得 (server.jsの/api/channelsを叩く)
async function getChannels() {
  try {
    const res = await fetch('/api/channels');
    if (!res.ok) throw new Error('Failed to fetch channels');
    // 削除済みではないチャンネルのみを返す
    return (await res.json()).filter(c => !c.deleted_at);
  } catch (e) {
    console.error('Error fetching channels:', e);
    return [];
  }
}


// ▼ 動画のレンダリング（フィルタリングロジックを変更）
function renderVideos() {
  const grid = document.getElementById('videoGrid');
  const status = document.getElementById('status');
  if (!grid) return;

  grid.innerHTML = '';

  let filtered = allVideos;

  // フィルタリングロジック
  if (currentFilterType === 'channel' && currentFilterId !== 'all') {
    filtered = allVideos.filter(v => v.channel_id === currentFilterId);
  } else if (currentFilterId !== 'all') {
    // カテゴリフィルタリング
    filtered = allVideos.filter(v => {
      const gName = v.group_name || "";
      const groups = gName.split(',').map(g => g.trim());
      return groups.includes(currentFilterId);
    });
  }

  filtered.sort((a, b) => {
    if (!!a.isPinned === !!b.isPinned) {
      return new Date(b.published) - new Date(a.published);
    }
    return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
  });

  const total = filtered.length;
  const display = filtered.slice(0, displayLimit === 9999 ? total : displayLimit);

  // 現在のフィルタ名を表示
  let currentFilterName = currentFilterId === 'all' ? 'すべて' : currentFilterId;
  if (currentFilterType === 'channel' && currentFilterId !== 'all') {
    const channel = allChannels.find(c => c.id === currentFilterId);
    currentFilterName = channel ? channel.name : 'チャンネル';
  }

  if (status) status.innerHTML = `<strong>${currentFilterName}</strong> の動画: ${display.length}件を表示中 (全${total}件)`;

  display.forEach(video => {
    const card = document.createElement('div');
    let cardClass = `video-card ${video.isWatched ? 'watched' : ''}`;
    if (video.isPinned) cardClass += ' pinned-card';
    card.className = cardClass;

    const date = new Date(video.published);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const btnText = video.isWatched ? '既読解除' : '閲覧済みにする';

    // カード上部のカテゴリ表示
    const gName = video.group_name || "";
    const groupBadges = gName.split(',').map(g =>
      `<span class="group-badge">${g.trim()}</span>`
    ).join(' ');


    const pinBtnClass = video.isPinned ? 'pin-btn active' : 'pin-btn';

    card.innerHTML = `
      <div class="card-header">
        <a href="${video.link}" class="thumb-link" target="_blank">
          <img src="${video.thumbnail}" loading="lazy">
        </a>
      </div>
      <div class="card-content">
        <div class="card-category-display">
          ${groupBadges}
        </div>
        <a href="${video.link}" class="video-title" target="_blank">${video.title}</a>
        <div class="video-meta">
          <div style="flex:1;">
            <div class="channel-name">${video.author}</div>
            <div>${dateStr}</div>
          </div>
          <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:5px;">
            <div style="display:flex; gap:5px; align-items:center; margin-top:5px;">
              <button class="${pinBtnClass}" title="あとで見る（ピン留め）">📌</button>
              <button class="mark-watched-btn">${btnText}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const pinBtn = card.querySelector('.pin-btn');
    pinBtn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const newPinnedStatus = !pinBtn.classList.contains('active');
      if (newPinnedStatus) {
        pinBtn.classList.add('active'); card.classList.add('pinned-card');
      } else {
        pinBtn.classList.remove('active'); card.classList.remove('pinned-card');
      }
      await fetch('/api/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.video_id, isPinned: newPinnedStatus })
      });
      video.isPinned = newPinnedStatus;
    });

    const toggleWatched = async (forceStatus = null) => {
      const currentStatus = card.classList.contains('watched');
      const newStatus = (forceStatus !== null) ? forceStatus : !currentStatus;
      if (currentStatus === newStatus) return;

      await fetch('/api/watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.video_id, isWatched: newStatus })
      });

      if (newStatus) {
        card.classList.add('watched');
        card.querySelector('.mark-watched-btn').textContent = '既読解除';
        video.isWatched = true;
      } else {
        card.classList.remove('watched');
        card.querySelector('.mark-watched-btn').textContent = '閲覧済みにする';
        video.isWatched = false;
      }
    };

    const watchBtn = card.querySelector('.mark-watched-btn');
    if (watchBtn) {
      watchBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        toggleWatched();
      });
    }

    card.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        if (!card.classList.contains('watched')) toggleWatched(true);
      });
    });

    grid.appendChild(card);
  });
}

// ▼ チャンネルアイコンリストの生成 (メインエリア上部)
function createChannelList() {
  const wrapper = document.getElementById('channelListWrapper');
  if (!wrapper) return;

  wrapper.innerHTML = '';

  const listContainer = document.createElement('div');
  listContainer.id = 'channel-icon-list'; // CSSクラスはそのまま流用 (スタイルはCSSで変更)

  // 1. 「すべて」ボタンを先頭に追加
  const allButton = createChannelItem({
    id: 'all',
    name: 'すべて',
  }, true);
  listContainer.appendChild(allButton);

  // 2. 登録チャンネルを名前でソート
  allChannels.sort((a, b) => a.name.localeCompare(b.name)).forEach(channel => {
    const item = createChannelItem(channel, false);
    listContainer.appendChild(item);
  });

  wrapper.appendChild(listContainer);
}

// チャンネルアイコン（丸）と名前の要素を生成
function createChannelItem(channel, isAllButton) {
  const item = document.createElement('button');
  item.className = 'channel-list-button';
  item.dataset.channelId = channel.id;

  // アイコンを削除し、チャンネル名のみをコンテンツとする
  item.textContent = isAllButton ? channel.name : channel.name;

  // クリックイベント
  item.addEventListener('click', () => {
    // カテゴリボタンのアクティブ状態を解除
    document.querySelectorAll('.category-btn-list').forEach(b => b.classList.remove('active'));

    // チャンネルリストのアクティブ状態を切り替え
    document.querySelectorAll('.channel-list-button').forEach(i => i.classList.remove('active'));
    item.classList.add('active');

    currentFilterType = 'channel';
    currentFilterId = channel.id;
    renderVideos();

    // ★修正: ボタンクリック後、メインコンテンツのトップまでスクロール
    const mainContainer = document.getElementById('main');
    if (mainContainer) {
      mainContainer.scrollTo({
        top: 0,
        behavior: 'smooth' // スムーズスクロールを適用
      });
    }
  });

  // 初期アクティブ状態の設定
  if (currentFilterType === 'channel' && currentFilterId === channel.id) {
    item.classList.add('active');
  } else if (isAllButton && currentFilterId === 'all') {
    item.classList.add('active');
  }

  return item;
}


// ▼ カテゴリボタンの生成 (サイドバー用 - 縦リスト)
async function createCategoryButtons() {
  const groupButtonsContainer = document.getElementById('group-buttons');
  if (!groupButtonsContainer) return;

  // 1. 全動画データから存在するすべてのカテゴリ名（group_name）を抽出
  const groupSet = new Set();
  allVideos.forEach(v => {
    const gName = v.group_name || "";
    gName.split(',').forEach(g => {
      const trimmed = g.trim();
      if (trimmed) groupSet.add(trimmed);
    });
  });

  // 存在するカテゴリをソート
  let categories = [...groupSet].sort().map(name => ({
    name: name,
    icon: getCategoryIcon(name),
    id: name // カテゴリIDはカテゴリ名と同じ
  }));

  groupButtonsContainer.innerHTML = ''; // コンテナをクリア

  // 2. カテゴリボタンを格納するラッパーを定義
  const categoryButtonWrapper = document.createElement('div');
  categoryButtonWrapper.id = 'category-button-wrapper-vertical'; // 縦リスト用のID

  // 3. カテゴリボタンを生成
  categories.forEach(category => {
    const btn = document.createElement('button');
    btn.className = 'category-btn-list'; // 縦リスト用のクラス
    btn.innerHTML = `${category.icon} ${category.name}`;
    btn.dataset.categoryId = category.id;

    // アクティブ状態の判定
    let isActive = currentFilterId === category.id && currentFilterType === 'category';
    if (isActive) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', async (e) => {
      // チャンネルアイコンのアクティブ状態を解除
      document.querySelectorAll('.channel-list-button').forEach(i => i.classList.remove('active'));

      // カテゴリボタンのアクティブ状態を切り替え
      document.querySelectorAll('.category-btn-list').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');

      currentFilterType = 'category';
      currentFilterId = category.id;

      renderVideos();

      // ★修正: ボタンクリック後、メインコンテンツのトップまでスクロール
      const mainContainer = document.getElementById('main');
      if (mainContainer) {
        mainContainer.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    });
    categoryButtonWrapper.appendChild(btn);
  });

  groupButtonsContainer.appendChild(categoryButtonWrapper);

  // 初期状態のコントロール: 「すべて」がアクティブでない場合、初期カテゴリをアクティブにする
  const allActive = document.querySelector('.channel-list-button[data-channel-id="all"]')?.classList.contains('active');

  if (currentFilterType === 'category') {
    const initialActiveBtn = document.querySelector(`.category-btn-list[data-category-id="${currentFilterId}"]`);
    if (initialActiveBtn) {
      initialActiveBtn.classList.add('active');
    } else if (categories.length > 0) {
      // フィルタ状態が不明な場合は「すべて」をアクティブに
      currentFilterId = 'all';
      currentFilterType = 'channel';
      document.querySelector('.channel-list-button[data-channel-id="all"]')?.classList.add('active');
    }
  } else if (allActive) {
    // チャンネル「すべて」がアクティブな場合は、カテゴリも「すべて」をアクティブにする
    // PC版ではカテゴリに「すべて」がないため、この処理は不要（PC版はカテゴリは絞り込み専用）
  }
}

function getCategoryIcon(name) {
  if (!name) return '📁';
  const lower = name.toLowerCase();

  if (lower.includes('ゲーム')) return '🎮';
  if (lower.includes('ライブ')) return '🔴';
  if (lower.includes('音楽')) return '🎵';
  if (lower.includes('ニュース')) return '📰';
  if (lower.includes('スポーツ')) return '⚽';
  if (lower.includes('未分類')) return '🗂️';

  // その他一般
  return '📺';
}