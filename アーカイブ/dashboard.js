// 初期設定
const DEFAULT_CHANNELS = [
  { name: "YouTube Creators", id: "UCBR8-60-B28hp2BmDPdntcQ", group: "Tech" },
];

const CORS_PROXY = "https://api.allorigins.win/raw?url=";

let channelsData = [];
let allVideosCache = [];
let watchedVideos = [];
let currentGroup = 'all';
let displayLimit = 25;

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings(); 
  initUI();
  loadVideos();
});

function initUI() {
  document.getElementById('refreshBtn').addEventListener('click', loadVideos);

  const limitSelect = document.getElementById('limitSelect');
  limitSelect.value = displayLimit;
  limitSelect.addEventListener('change', (e) => {
    displayLimit = parseInt(e.target.value, 10);
    saveSettings(); 
    renderVideos(); 
  });

  const modal = document.getElementById('settingsModal');
  document.getElementById('settingsBtn').addEventListener('click', () => {
    renderSettingsList();
    modal.classList.add('show');
  });
  modal.querySelector('.close-modal').addEventListener('click', () => {
    modal.classList.remove('show');
    createGroupButtons();
    loadVideos();
  });
  document.getElementById('addChannelBtn').addEventListener('click', addNewChannel);
}

// ▼▼▼ データ管理 ▼▼▼

async function loadSettings() {
  const savedChannels = localStorage.getItem('my_yt_channels');
  const savedLimit = localStorage.getItem('my_yt_limit');
  const savedWatched = localStorage.getItem('my_yt_watched');

  if (savedChannels) channelsData = JSON.parse(savedChannels);
  else channelsData = DEFAULT_CHANNELS;

  if (savedLimit) displayLimit = parseInt(savedLimit, 10);

  if (savedWatched) watchedVideos = JSON.parse(savedWatched);

  createGroupButtons();
}

function saveSettings() {
  localStorage.setItem('my_yt_channels', JSON.stringify(channelsData));
  localStorage.setItem('my_yt_limit', displayLimit);
}

// ★修正: 既読/未読を切り替える関数
function toggleWatched(url) {
  const index = watchedVideos.indexOf(url);
  const isNowWatched = (index === -1); // 今リストになければ、これから既読になる

  if (isNowWatched) {
    watchedVideos.push(url);
    if (watchedVideos.length > 1000) watchedVideos.shift();
  } else {
    watchedVideos.splice(index, 1); // 削除（未読に戻す）
  }
  
  localStorage.setItem('my_yt_watched', JSON.stringify(watchedVideos));
  
  // キャッシュ内のデータも更新（再描画なしで反映させるため）
  const videoInCache = allVideosCache.find(v => v.link === url);
  if (videoInCache) {
    videoInCache.isWatched = isNowWatched;
  }
  
  return isNowWatched;
}

// 動画を開いたときは強制的に「既読」にする
function markAsWatchedOnly(url) {
  if (!watchedVideos.includes(url)) {
    watchedVideos.push(url);
    if (watchedVideos.length > 1000) watchedVideos.shift();
    localStorage.setItem('my_yt_watched', JSON.stringify(watchedVideos));
    
    const videoInCache = allVideosCache.find(v => v.link === url);
    if (videoInCache) videoInCache.isWatched = true;
  }
}

// ▼▼▼ 動画取得ロジック ▼▼▼

async function loadVideos() {
  const status = document.getElementById('status');
  const grid = document.getElementById('videoGrid');
  status.textContent = '最新の動画を取得中...';
  grid.style.opacity = '0.5';

  allVideosCache = [];

  for (const channel of channelsData) {
    try {
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
      const response = await fetch(CORS_PROXY + encodeURIComponent(rssUrl));
      if (!response.ok) continue;
      
      const text = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, "text/xml");
      const entries = xml.querySelectorAll('entry');

      for (const entry of entries) {
        const title = entry.querySelector('title').textContent;
        const videoId = entry.querySelector('videoId').textContent;
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        
        if (title.toLowerCase().includes('#shorts')) continue;

        const isVisited = watchedVideos.includes(url);

        allVideosCache.push({
          title: title,
          link: url,
          published: new Date(entry.querySelector('published').textContent),
          author: entry.querySelector('author > name').textContent,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          isWatched: isVisited,
          group: channel.group,
          channelName: channel.name
        });
      }
    } catch (e) { console.error(e); }
  }

  allVideosCache.sort((a, b) => b.published - a.published);
  grid.style.opacity = '1';
  renderVideos();
}

function renderVideos() {
  const grid = document.getElementById('videoGrid');
  const status = document.getElementById('status');
  grid.innerHTML = '';

  let filteredVideos = allVideosCache;
  if (currentGroup !== 'all') {
    filteredVideos = allVideosCache.filter(video => video.group === currentGroup);
  }

  const totalCount = filteredVideos.length;
  const displayVideos = filteredVideos.slice(0, displayLimit);

  if (displayVideos.length === 0) {
    status.textContent = '動画が見つかりませんでした。';
    return;
  }

  status.textContent = `${displayLimit}件を表示中 (全${totalCount}件中)`;

  displayVideos.forEach(video => {
    const card = document.createElement('div');
    card.className = `video-card ${video.isWatched ? 'watched' : ''}`;
    
    const dateStr = `${video.published.getMonth() + 1}/${video.published.getDate()} ${video.published.getHours()}:${String(video.published.getMinutes()).padStart(2, '0')}`;
    const btnText = video.isWatched ? '既読解除' : '閲覧済みにする';

    // ★修正: ボタンを追加
    card.innerHTML = `
      <a href="${video.link}" class="thumb-link" target="_blank">
        <img src="${video.thumbnail}">
      </a>
      <div class="card-content">
        <a href="${video.link}" class="video-title" target="_blank">${video.title}</a>
        <div class="video-meta">
          <div style="flex:1;">
            <div class="channel-name">${video.author}</div>
            <div>${dateStr}</div>
          </div>
          <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
            <span class="group-badge">${video.group}</span>
            <button class="mark-watched-btn" data-url="${video.link}">${btnText}</button>
          </div>
        </div>
      </div>
    `;

    // サムネイル・タイトルクリック時の処理（動画を開いて既読にする）
    const links = card.querySelectorAll('a');
    links.forEach(link => {
      link.addEventListener('click', () => {
        markAsWatchedOnly(video.link);
        card.classList.add('watched');
        card.querySelector('.mark-watched-btn').textContent = '既読解除';
      });
    });

    // ★追加: 閲覧ボタンクリック時の処理（動画を開かずにトグルする）
    const watchBtn = card.querySelector('.mark-watched-btn');
    watchBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // 親要素へのクリック伝播を防ぐ
      e.preventDefault();

      const isWatchedNow = toggleWatched(video.link);
      
      if (isWatchedNow) {
        card.classList.add('watched');
        watchBtn.textContent = '既読解除';
      } else {
        card.classList.remove('watched');
        watchBtn.textContent = '閲覧済みにする';
      }
    });

    grid.appendChild(card);
  });
}

// ▼▼▼ 設定画面ロジック（変更なし） ▼▼▼

function createGroupButtons() {
  const container = document.getElementById('group-buttons');
  container.innerHTML = '<button class="group-btn active" data-group="all">すべて表示</button>';
  const groups = [...new Set(channelsData.map(c => c.group))];
  groups.forEach(groupName => {
    if(!groupName) return;
    const btn = document.createElement('button');
    btn.className = 'group-btn';
    btn.textContent = groupName;
    btn.dataset.group = groupName;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentGroup = groupName;
      renderVideos();
    });
    container.appendChild(btn);
  });
  const allBtn = document.querySelector('.group-btn[data-group="all"]');
  allBtn.addEventListener('click', () => {
    document.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
    currentGroup = 'all';
    renderVideos();
  });
}

async function addNewChannel() {
  const urlInput = document.getElementById('newChannelUrl');
  const groupInput = document.getElementById('newChannelGroup');
  const statusMsg = document.getElementById('addStatus');
  const url = urlInput.value.trim();
  const group = groupInput.value.trim() || "未分類";

  if (!url) return;
  statusMsg.textContent = "チャンネル情報を取得中...";
  statusMsg.style.color = "blue";

  try {
    const info = await fetchChannelInfo(url);
    if (channelsData.some(c => c.id === info.id)) {
      throw new Error("このチャンネルは既に登録されています。");
    }
    channelsData.push({ name: info.name, id: info.id, group: group });
    saveSettings(); 
    urlInput.value = '';
    renderSettingsList();
    statusMsg.textContent = `「${info.name}」を追加しました！`;
    statusMsg.style.color = "green";
  } catch (e) {
    statusMsg.textContent = e.message;
    statusMsg.style.color = "red";
  }
}

async function fetchChannelInfo(url) {
  try {
    let cleanUrl = url.trim();
    const idMatch = cleanUrl.match(/channel\/(UC[\w-]{21,24})/);
    if (idMatch) {
       const id = idMatch[1];
       const res = await fetch(CORS_PROXY + encodeURIComponent(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`));
       if(!res.ok) throw new Error("チャンネルが存在しません");
       const text = await res.text();
       const parser = new DOMParser();
       const title = parser.parseFromString(text, "text/xml").querySelector('title').textContent;
       return { id: id, name: title };
    }

    if (!cleanUrl.startsWith('http')) {
        cleanUrl = 'https://www.youtube.com/' + cleanUrl.replace(/^@/, ''); 
    }

    const res = await fetch(CORS_PROXY + encodeURIComponent(cleanUrl));
    if (!res.ok) throw new Error("ページにアクセスできませんでした");
    
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const metaId = doc.querySelector('meta[itemprop="channelId"]');
    if (!metaId) throw new Error("チャンネルIDが見つかりませんでした。");
    const foundId = metaId.getAttribute('content');
    
    let foundName = "Unknown Channel";
    const metaName = doc.querySelector('meta[itemprop="name"]') || doc.querySelector('title');
    if (metaName) {
        foundName = metaName.getAttribute('content') || metaName.textContent.replace(' - YouTube', '');
    }
    return { id: foundId, name: foundName };
  } catch (e) {
    console.error(e);
    throw e;
  }
}

function renderSettingsList() {
  const list = document.getElementById('settingsList');
  list.innerHTML = '';
  channelsData.forEach((channel, index) => {
    const item = document.createElement('div');
    item.className = 'channel-list-item';
    item.innerHTML = `
      <div class="channel-info">${channel.name}<span class="channel-group-label">${channel.group}</span></div>
      <button class="delete-btn" data-index="${index}">削除</button>
    `;
    list.appendChild(item);
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      channelsData.splice(e.target.dataset.index, 1);
      saveSettings();
      renderSettingsList();
    });
  });
}