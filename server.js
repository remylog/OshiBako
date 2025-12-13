const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = 3000;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

if (!YOUTUBE_API_KEY) {
  console.error("❌ エラー: APIキーが設定されていません。.envファイルを確認してください。");
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const dbPath = path.resolve(__dirname, 'data', 'youtube.db');
const db = new sqlite3.Database(dbPath);

// ▼ DB初期化 ▼
db.serialize(() => {
  // チャンネル管理（deleted_at カラムを追加してアーカイブに対応）
  db.run(`CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT,
    group_name TEXT,
    uploads_id TEXT,
    next_page_token TEXT,
    is_fully_loaded INTEGER DEFAULT 0,
    deleted_at INTEGER DEFAULT NULL
  )`);

  // videos テーブルに is_pinned カラムを追加
  db.run(`CREATE TABLE IF NOT EXISTS videos (
    video_id TEXT PRIMARY KEY,
    channel_id TEXT,
    title TEXT,
    link TEXT,
    thumbnail TEXT,
    author TEXT,
    published INTEGER,
    created_at INTEGER,
    is_pinned INTEGER DEFAULT 0  -- ★追加: ピン留めフラグ (0=なし, 1=あり)
  )`);
  
  // 既存のDBに deleted_at カラムがない場合のマイグレーション（エラー無視）
  db.run("ALTER TABLE channels ADD COLUMN deleted_at INTEGER DEFAULT NULL", () => {});

  db.run(`CREATE TABLE IF NOT EXISTS videos (
    video_id TEXT PRIMARY KEY,
    channel_id TEXT,
    title TEXT,
    link TEXT,
    thumbnail TEXT,
    author TEXT,
    published INTEGER,
    created_at INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS watched (
    video_id TEXT PRIMARY KEY
  )`);
});

// ▼ 定期実行 (毎日 AM 03:00) ▼
cron.schedule('0 3 * * *', async () => {
  console.log('🕒 定期処理開始...');
  
  // 1. 過去動画取得（アーカイブされていないチャンネルのみ）
  await backfillPastVideos();
  
  // 2. 7日以上経過したアーカイブチャンネルを完全削除
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  db.run("DELETE FROM channels WHERE deleted_at IS NOT NULL AND deleted_at < ?", [sevenDaysAgo], function(err) {
    if(!err && this.changes > 0) {
      console.log(`🗑️ 保存期間を過ぎた ${this.changes}件のチャンネルを完全削除しました`);
      // 紐づく動画も削除（任意ですがDB容量節約のため）
      db.run("DELETE FROM videos WHERE channel_id NOT IN (SELECT id FROM channels)");
    }
  });

  console.log('✅ 定期処理終了');
});

async function backfillPastVideos() {
  return new Promise((resolve) => {
    // deleted_at が NULL のものだけ処理
    db.all("SELECT * FROM channels WHERE is_fully_loaded = 0 AND deleted_at IS NULL", async (err, channels) => {
      if (err || !channels) return resolve();

      for (const channel of channels) {
        if (!channel.uploads_id) continue;

        try {
          let apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${channel.uploads_id}&maxResults=20&key=${YOUTUBE_API_KEY}`;
          if (channel.next_page_token) {
            apiUrl += `&pageToken=${channel.next_page_token}`;
          }

          const res = await axios.get(apiUrl);
          const items = res.data.items;
          const nextPageToken = res.data.nextPageToken;

          if (!items || items.length === 0) {
            db.run("UPDATE channels SET is_fully_loaded = 1 WHERE id = ?", [channel.id]);
            continue;
          }

          const stmt = db.prepare(`INSERT OR IGNORE INTO videos (video_id, channel_id, title, link, thumbnail, author, published, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
          
          for (const item of items) {
            const snippet = item.snippet;
            const videoId = snippet.resourceId.videoId;
            const title = snippet.title;
            if (title.toLowerCase().includes('#shorts')) continue;

            const link = `https://www.youtube.com/watch?v=${videoId}`;
            const thumbnail = snippet.thumbnails.medium?.url || snippet.thumbnails.default?.url;
            const author = snippet.channelTitle;
            const published = new Date(snippet.publishedAt).getTime();
            const now = Date.now();

            stmt.run(videoId, channel.id, title, link, thumbnail, author, published, now);
          }
          stmt.finalize();

          if (nextPageToken) {
            db.run("UPDATE channels SET next_page_token = ? WHERE id = ?", [nextPageToken, channel.id]);
          } else {
            db.run("UPDATE channels SET is_fully_loaded = 1, next_page_token = NULL WHERE id = ?", [channel.id]);
          }

        } catch (e) {
          console.error(`Error processing ${channel.name}:`, e.message);
        }
      }
      resolve();
    });
  });
}

// ▼ APIエンドポイント ▼

app.post('/api/channels', async (req, res) => {
  const { url, group } = req.body;
  try {
    let channelId = '';
    const cleanUrl = url.trim();
    if (cleanUrl.startsWith('UC')) {
      channelId = cleanUrl;
    } else if (cleanUrl.includes('channel/')) {
      channelId = cleanUrl.split('channel/')[1].split('/')[0];
    } else {
      return res.status(400).json({ error: "チャンネルID(UC...) または チャンネルURLを入力してください" });
    }

    // 既にアーカイブにある場合は復元する
    const check = await new Promise(r => db.get("SELECT * FROM channels WHERE id = ?", [channelId], (err, row) => r(row)));
    if (check && check.deleted_at) {
      db.run("UPDATE channels SET deleted_at = NULL, group_name = ? WHERE id = ?", [group || check.group_name, channelId]);
      return res.json({ success: true, name: check.name, restored: true });
    }

    const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`;
    const apiRes = await axios.get(apiUrl);
    
    if (!apiRes.data.items || apiRes.data.items.length === 0) {
      throw new Error("チャンネルが見つかりませんでした");
    }

    const item = apiRes.data.items[0];
    const name = item.snippet.title;
    const uploadsId = item.contentDetails.relatedPlaylists.uploads;

    db.run(`INSERT OR REPLACE INTO channels (id, name, group_name, uploads_id, is_fully_loaded, deleted_at) VALUES (?, ?, ?, ?, 0, NULL)`, 
      [channelId, name, group || '未分類', uploadsId],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        backfillPastVideos();
        res.json({ success: true, name });
      }
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "登録エラー: APIキーまたはURLを確認してください" });
  }
});

// チャンネル一覧 (タイプ分け: active / archived)
app.get('/api/channels', (req, res) => {
  const type = req.query.type || 'active';
  let query = "SELECT * FROM channels WHERE deleted_at IS NULL";
  if (type === 'archived') {
    query = "SELECT * FROM channels WHERE deleted_at IS NOT NULL";
  }
  
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// グループ更新API (新規追加)
app.put('/api/channels/:id', (req, res) => {
  const { group } = req.body;
  db.run("UPDATE channels SET group_name = ? WHERE id = ?", [group, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// アーカイブへ移動 (論理削除)
app.delete('/api/channels/:id', (req, res) => {
  const now = Date.now();
  db.run("UPDATE channels SET deleted_at = ? WHERE id = ?", [now, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 復元API (新規追加)
app.post('/api/channels/:id/restore', (req, res) => {
  db.run("UPDATE channels SET deleted_at = NULL WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 動画一覧 (アクティブなチャンネルのみ)
app.get('/api/videos', (req, res) => {
  db.all("SELECT * FROM channels WHERE deleted_at IS NULL", [], async (err, channels) => {
    if (!err && channels) {
      for (const channel of channels) {
        try {
          const rssRes = await axios.get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`);
          const parser = new xml2js.Parser();
          const result = await parser.parseStringPromise(rssRes.data);
          
          if (result.feed.entry) {
            for (const entry of result.feed.entry) {
              const videoId = entry['yt:videoId'][0];
              const title = entry.title[0];
              if (title.toLowerCase().includes('#shorts')) continue;
              const published = new Date(entry.published[0]).getTime();
              const now = Date.now();
              const link = entry.link[0].$.href;
              const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
              const author = entry.author[0].name[0];

              db.run(`INSERT OR IGNORE INTO videos (video_id, channel_id, title, link, thumbnail, author, published, created_at) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [videoId, channel.id, title, link, thumbnail, author, published, now]
              );
            }
          }
        } catch (e) {}
      }
    }

    db.all("SELECT video_id FROM watched", [], (err, watchedRows) => {
      const watchedIds = new Set(watchedRows ? watchedRows.map(r => r.video_id) : []);

      // アーカイブされていないチャンネルの動画のみ取得
      const query = `
        SELECT v.*, c.group_name 
        FROM videos v 
        JOIN channels c ON v.channel_id = c.id
        WHERE c.deleted_at IS NULL
        ORDER BY v.is_pinned DESC, v.published DESC 
        LIMIT 1000
      `;
      
      db.all(query, [], (err, videos) => {
        if (err) return res.status(500).json({ error: err.message });
        const response = videos.map(v => ({
          ...v,
          isWatched: watchedIds.has(v.video_id),
          isPinned: v.is_pinned === 1
        }));
        res.json(response);
      });
    });
  });
});

app.post('/api/pin', (req, res) => {
  const { videoId, isPinned } = req.body;
  const val = isPinned ? 1 : 0;
  db.run("UPDATE videos SET is_pinned = ? WHERE video_id = ?", [val, videoId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/import-history', (req, res) => {
  const history = req.body;
  if (!Array.isArray(history)) return res.status(400).json({ error: "Invalid format" });

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    const stmt = db.prepare("INSERT OR IGNORE INTO watched (video_id) VALUES (?)");
    let count = 0;
    history.forEach(item => {
      if (item.titleUrl) {
        const match = item.titleUrl.match(/v=([^&]+)/);
        if (match && match[1]) { stmt.run(match[1]); count++; }
      }
    });
    stmt.finalize();
    db.run("COMMIT", (err) => res.json({ success: true, count }));
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});