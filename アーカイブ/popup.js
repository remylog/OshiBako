// ▼▼▼ 設定エリア：ここでグループとチャンネルを定義します ▼▼▼
const CHANNELS = [
  // 【書き方】 { name: "表示名", id: "チャンネルID", group: "グループ名" },
  
  // 例: Techグループ
  { name: "鬼ノめる", id: "UC2BJwSA_iewqrMHX9rrO59g", group: "すぺしゃりて" },
  { name: "Google Japan",     id: "UCp_eRD0Kz2i2Z0_u-z34bVw", group: "Tech" },

  // 例: Musicグループ
  { name: "The First Take",   id: "UC9zY_E8mcAo_Oq772LEZq8Q", group: "Music" },
  
  // 例: Gameグループ（好きなIDを入れてください）
  // { name: "好きな実況者",   id: "UCxxxxxxxxxxxx",           group: "Game" },
];
// ▲▲▲ 設定エリアここまで ▲▲▲


let allVideosCache = []; // 取得した動画を一時保存しておく場所

document.addEventListener('DOMContentLoaded', () => {
  setupGroupFilter(); // グループメニューを作る
  loadVideos();       // 動画を読み込む

  // 更新ボタン
  document.getElementById('refreshBtn').addEventListener('click', loadVideos);
  
  // プルダウンを変更したときの処理
  document.getElementById('groupFilter').addEventListener('change', (e) => {
    renderVideos(e.target.value); // 選ばれたグループで再表示
  });
});

// 1. グループ選択メニューを自動生成する関数
function setupGroupFilter() {
  const select = document.getElementById('groupFilter');
  // CHANNELSから重複しないグループ名だけを抜き出す
  const groups = [...new Set(CHANNELS.map(c => c.group))];
  
  groups.forEach(groupName => {
    if(groupName) { // グループ名がある場合のみ
      const option = document.createElement('option');
      option.value = groupName;
      option.textContent = groupName;
      select.appendChild(option);
    }
  });
}

// 2. 動画を読み込む関数
async function loadVideos() {
  const status = document.getElementById('status');
  status.textContent = '読み込み中...';
  
  allVideosCache = []; // キャッシュをリセット

  for (const channel of CHANNELS) {
    try {
      const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`);
      if (!response.ok) continue;
      
      const text = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, "text/xml");
      const entries = xml.querySelectorAll('entry');

      for (const entry of entries) {
        const title = entry.querySelector('title').textContent;
        const videoId = entry.querySelector('videoId').textContent;
        
        // --- ショート動画除外 ---
        const mediaGroup = entry.querySelector('group');
        let description = "";
        if (mediaGroup) {
            const descTag = mediaGroup.querySelector('description');
            if (descTag) description = descTag.textContent;
        }
        if (title.toLowerCase().includes('#shorts') || description.toLowerCase().includes('#shorts')) {
            continue; 
        }

        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const isVisited = await checkIfVisited(url);

        allVideosCache.push({
          title: title,
          link: url,
          published: new Date(entry.querySelector('published').textContent),
          author: entry.querySelector('author > name').textContent,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          isWatched: isVisited,
          group: channel.group, // ★グループ情報も一緒に保存
          channelName: channel.name
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  // 日付順に並べ替え
  allVideosCache.sort((a, b) => b.published - a.published);

  // 現在選択されているグループで表示
  const currentGroup = document.getElementById('groupFilter').value;
  renderVideos(currentGroup);
}

// 3. 動画リストを画面に描画する関数（フィルター機能付き）
function renderVideos(filterGroup) {
  const list = document.getElementById('videoList');
  const status = document.getElementById('status');
  list.innerHTML = '';

  // フィルタリング処理
  let displayVideos = allVideosCache;
  if (filterGroup !== 'all') {
    displayVideos = allVideosCache.filter(video => video.group === filterGroup);
  }

  if (displayVideos.length === 0) {
    status.textContent = '動画なし';
    return;
  }

  displayVideos.forEach(video => {
    const div = document.createElement('div');
    div.className = `video-item ${video.isWatched ? 'watched' : ''}`;
    
    const dateStr = `${video.published.getMonth() + 1}/${video.published.getDate()}`;

    div.innerHTML = `
      <a href="${video.link}" target="_blank">
        <img src="${video.thumbnail}">
      </a>
      <div class="content">
        <h3><a href="${video.link}" target="_blank">${video.title}</a></h3>
        <div class="meta">
          <span>${video.author} • ${dateStr}</span>
          <span class="group-tag">${video.group}</span>
        </div>
      </div>
    `;
    list.appendChild(div);
  });
  
  status.textContent = `完了 (${displayVideos.length}件)`;
}

function checkIfVisited(url) {
  return new Promise((resolve) => {
    chrome.history.getVisits({ url: url }, (visits) => {
      resolve(visits.length > 0);
    });
  });
}