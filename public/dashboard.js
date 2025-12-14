let allVideos = [];
let allChannels = []; 
let currentFilterType = 'channel'; 
let currentFilterId = 'all'; 
let displayLimit = 25;

document.addEventListener('DOMContentLoaded', () => {
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
  if(status) status.textContent = 'データ取得中...';
  
  const grid = document.getElementById('videoGrid');
  if(grid) grid.style.opacity = '0.5';

  try {
    const videoRes = await fetch('/api/videos');
    if (!videoRes.ok) throw new Error(`Video network response was not ok: ${videoRes.status}`);
    
    allVideos = await videoRes.json();
    allChannels = await getChannels();

    createChannelList(); 
    createGroupButtons(); 
    renderVideos();
    
    if(grid) grid.style.opacity = '1';
  } catch (e) {
    console.error("❌ loadVideos Error:", e);
    if(status) status.textContent = 'エラーが発生しました: ' + e.message;
  }
}

async function getChannels() {
    try {
        const res = await fetch('/api/channels');
        if (!res.ok) throw new Error('Failed to fetch channels');
        return (await res.json()).filter(c => !c.deleted_at); 
    } catch (e) {
        console.error('Error fetching channels:', e);
        return [];
    }
}

function renderVideos() {
  const grid = document.getElementById('videoGrid');
  const status = document.getElementById('status');
  if (!grid) return;
  
  grid.innerHTML = '';

  let filtered = allVideos;
  
  if (currentFilterType === 'channel' && currentFilterId !== 'all') {
    filtered = allVideos.filter(v => v.channel_id === currentFilterId);
  } 
  else if (currentFilterType === 'group' && currentFilterId !== 'all') { 
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

  let currentFilterName = currentFilterId === 'all' ? 'すべて' : currentFilterId;
  if (currentFilterType === 'channel' && currentFilterId !== 'all') {
      const channel = allChannels.find(c => c.id === currentFilterId);
      currentFilterName = channel ? channel.name : 'チャンネル';
  }
  else if (currentFilterType === 'group') {
      currentFilterName = currentFilterId; 
  }
  
  if(status) status.innerHTML = `<strong>${currentFilterName}</strong> の動画: ${display.length}件を表示中 (全${total}件)`;

  display.forEach(video => {
    const card = document.createElement('div');
    let cardClass = `video-card ${video.isWatched ? 'watched' : ''}`;
    if (video.isPinned) cardClass += ' pinned-card';
    card.className = cardClass;
    
    const date = new Date(video.published);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    const btnText = video.isWatched ? '既読解除' : '閲覧済みにする';

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
    if(watchBtn) {
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

function createChannelList() {
    const wrapper = document.getElementById('channelListWrapper');
    if (!wrapper) return;
    
    wrapper.innerHTML = '';

    const listContainer = document.createElement('div');
    listContainer.id = 'channel-icon-list'; 

    const allButton = createChannelItem({
        id: 'all', 
        name: 'すべて', 
    }, true);
    listContainer.appendChild(allButton);

    allChannels.sort((a, b) => a.name.localeCompare(b.name)).forEach(channel => {
        const item = createChannelItem(channel, false);
        listContainer.appendChild(item);
    });

    wrapper.appendChild(listContainer);
}

function createChannelItem(channel, isAllButton) {
    const item = document.createElement('button'); 
    item.className = 'channel-list-button'; 
    item.dataset.channelId = channel.id;
    
    item.textContent = isAllButton ? channel.name : channel.name;

    item.addEventListener('click', () => {
        document.querySelectorAll('.group-btn-list').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.channel-list-button').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        currentFilterType = 'channel';
        currentFilterId = channel.id;
        renderVideos();

        const mainContainer = document.getElementById('main');
        if (mainContainer) {
            mainContainer.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    });

    if (currentFilterType === 'channel' && currentFilterId === channel.id) {
        item.classList.add('active');
    } else if (isAllButton && currentFilterId === 'all') {
        item.classList.add('active');
    }

    return item;
}

async function createGroupButtons() {
    const groupButtonsContainer = document.getElementById('group-buttons');
    if (!groupButtonsContainer) return;

    const groupSet = new Set();
    allVideos.forEach(v => {
        const gName = v.group_name || "";
        gName.split(',').forEach(g => {
            const trimmed = g.trim();
            if (trimmed) groupSet.add(trimmed);
        });
    });
    
    let groups = [...groupSet].sort().map(name => ({
        name: name,
        icon: getGroupIcon(name),
        id: name 
    }));
    
    groupButtonsContainer.innerHTML = ''; 
    
    const groupButtonWrapper = document.createElement('div');
    groupButtonWrapper.id = 'group-button-wrapper-vertical'; 
    
    groups.forEach(group => {
        const btn = document.createElement('button');
        btn.className = 'group-btn-list'; 
        btn.innerHTML = `${group.icon} ${group.name}`;
        btn.dataset.groupId = group.id;
        
        let isActive = currentFilterId === group.id && currentFilterType === 'group';
        if (isActive) {
            btn.classList.add('active');
        }

        btn.addEventListener('click', async (e) => {
            document.querySelectorAll('.channel-list-button').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.group-btn-list').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            currentFilterType = 'group';
            currentFilterId = group.id;
            
            renderVideos(); 
            
            const mainContainer = document.getElementById('main');
            if (mainContainer) {
                mainContainer.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        });
        groupButtonWrapper.appendChild(btn);
    });

    groupButtonsContainer.appendChild(groupButtonWrapper); 
    
    const allActive = document.querySelector('.channel-list-button[data-channel-id="all"]')?.classList.contains('active');
    
    if (currentFilterType === 'group') {
        const initialActiveBtn = document.querySelector(`.group-btn-list[data-group-id="${currentFilterId}"]`);
        if(initialActiveBtn) {
            initialActiveBtn.classList.add('active');
        } 
        else if (groups.length > 0) {
            currentFilterId = 'all';
            currentFilterType = 'channel';
            document.querySelector('.channel-list-button[data-channel-id="all"]')?.classList.add('active');
        }
    } else if (allActive) {
        // PC版はグループ選択なし
    }
}

function getGroupIcon(name) {
    if (!name) return '📁';
    const lower = name.toLowerCase();
    
    if (lower.includes('ゲーム')) return '🎮';
    if (lower.includes('ライブ')) return '🔴';
    if (lower.includes('音楽')) return '🎵';
    if (lower.includes('ニュース')) return '📰';
    if (lower.includes('スポーツ')) return '⚽';
    if (lower.includes('未分類')) return '🗂️';
    
    return '📺';
}