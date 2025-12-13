let allVideos = [];
let currentGroup = 'all';
let displayLimit = 25;

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  loadVideos();
});

function initUI() {
  document.getElementById('refreshBtn').addEventListener('click', loadVideos);
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
  status.textContent = 'データ取得中...';
  document.getElementById('videoGrid').style.opacity = '0.5';

  try {
    const res = await fetch('/api/videos');
    if (!res.ok) throw new Error('Network response was not ok');
    allVideos = await res.json();
    
    createGroupButtons();
    renderVideos();
    document.getElementById('videoGrid').style.opacity = '1';
  } catch (e) {
    console.error(e);
    status.textContent = 'エラーが発生しました';
  }
}

filtered.sort((a, b) => {
    if (!!a.isPinned === !!b.isPinned) { // 両方ピンあり、または両方なしなら日付順
      return new Date(b.published) - new Date(a.published); 
    }
    return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0); // ピン留め優先
  });

function renderVideos() {
  const grid = document.getElementById('videoGrid');
  const status = document.getElementById('status');
  grid.innerHTML = '';

  let filtered = allVideos;
  
  // ★変更点: 複数グループ対応のフィルタリング
  if (currentGroup !== 'all') {
    filtered = allVideos.filter(v => {
      // "Game, Tech" -> ["Game", "Tech"] に分割してチェック
      const groups = v.group_name.split(',').map(g => g.trim());
      return groups.includes(currentGroup);
    });
  }

  const total = filtered.length;
  const display = filtered.slice(0, displayLimit === 9999 ? total : displayLimit);

  status.textContent = `${display.length}件を表示中 (全${total}件)`;

  display.forEach(video => {
    const card = document.createElement('div');
    card.className = `video-card ${video.isWatched ? 'watched' : ''}`;
    
    const date = new Date(video.published);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    const btnText = video.isWatched ? '既読解除' : '閲覧済みにする';

    // バッジをカンマ区切りできれいに表示
    const pinBtnClass = video.isPinned ? 'pin-btn active' : 'pin-btn';
    if (video.isPinned) card.classList.add('pinned-card');

    card.innerHTML = `
      <div class="card-header">
        <a href="${video.link}" class="thumb-link" target="_blank">
          <img src="${video.thumbnail}" loading="lazy">
        </a>
        <button class="${pinBtnClass}" title="あとで見る（ピン留め）">📌</button>
      </div>
      <div class="card-content">
        <a href="${video.link}" class="video-title" target="_blank">${video.title}</a>
        <div class="video-meta">
          <div style="flex:1;">
            <div class="channel-name">${video.author}</div>
            <div>${dateStr}</div>
          </div>
          <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:5px;">
            <div style="display:flex; gap:3px; flex-wrap:wrap; justify-content:flex-end;">
              ${groupBadges}
            </div>
            <button class="mark-watched-btn">${btnText}</button>
          </div>
        </div>
      </div>
    `;

    // ▼ ピン留めボタンの処理 ▼
    const pinBtn = card.querySelector('.pin-btn');
    pinBtn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const newPinnedStatus = !pinBtn.classList.contains('active');
      
      // UI即時反映
      if (newPinnedStatus) {
        pinBtn.classList.add('active');
        card.classList.add('pinned-card');
      } else {
        pinBtn.classList.remove('active');
        card.classList.remove('pinned-card');
      }

      // サーバー送信
      await fetch('/api/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.video_id, isPinned: newPinnedStatus })
      });
      video.isPinned = newPinnedStatus; // データ更新
    });
    
    const toggleFunc = async (e) => {
      e.preventDefault(); e.stopPropagation();
      const newStatus = !card.classList.contains('watched');
      await fetch('/api/watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.video_id, isWatched: newStatus })
      });
      if (newStatus) {
        card.classList.add('watched');
        card.querySelector('.mark-watched-btn').textContent = '既読解除';
      } else {
        card.classList.remove('watched');
        card.querySelector('.mark-watched-btn').textContent = '閲覧済みにする';
      }
    };

    card.querySelector('.mark-watched-btn').addEventListener('click', toggleFunc);
    card.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      if(!card.classList.contains('watched')) toggleFunc({ preventDefault:()=>{}, stopPropagation:()=>{} });
    }));

    grid.appendChild(card);
  });
}

function createGroupButtons() {
  const container = document.getElementById('group-buttons');
  container.innerHTML = '<button class="group-btn active" data-group="all">すべて表示</button>';
  
  // ★変更点: 全動画のグループ名を分解してユニークなリストを作成
  const groupSet = new Set();
  allVideos.forEach(v => {
    v.group_name.split(',').forEach(g => {
      const trimmed = g.trim();
      if(trimmed) groupSet.add(trimmed);
    });
  });
  
  const groups = [...groupSet].sort();
  
  groups.forEach(group => {
    const btn = document.createElement('button');
    btn.className = 'group-btn';
    btn.textContent = group;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentGroup = group;
      renderVideos();
    });
    container.appendChild(btn);
  });
  
  container.querySelector('[data-group="all"]').addEventListener('click', (e) => {
    document.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentGroup = 'all';
    renderVideos();
  });
}