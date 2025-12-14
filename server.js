const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

if (!YOUTUBE_API_KEY) {
  console.error("❌ エラー: YOUTUBE_API_KEY が設定されていません。");
  process.exit(1); 
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const dbPath = path.resolve(__dirname, 'data', 'youtube.db');
const db = new sqlite3.Database(dbPath);

// ▼ DB初期化 ▼
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT,
    group_name TEXT,
    uploads_id TEXT,
    next_page_token TEXT,
    is_fully_loaded INTEGER DEFAULT 0,
    deleted_at INTEGER DEFAULT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS videos (
    video_id TEXT PRIMARY KEY,
    channel_id TEXT,
    title TEXT,
    link TEXT,
    thumbnail TEXT,
    author TEXT,
    published INTEGER,
    created_at INTEGER,
    is_pinned INTEGER DEFAULT 0,
    description TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS groups (
    group_name TEXT PRIMARY KEY,
    channel_ids TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS watched (
    video_id TEXT PRIMARY KEY
  )`);
  
  // ★NEW: settingsテーブルの追加 (除外キーワード等の設定保存用)
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  db.run("ALTER TABLE channels ADD COLUMN deleted_at INTEGER DEFAULT NULL", () => { });
  db.run("ALTER TABLE videos ADD COLUMN is_pinned INTEGER DEFAULT 0", () => { });
  db.run("ALTER TABLE videos ADD COLUMN description TEXT", () => { });
});

// ▼ 定期実行 (毎日 AM 03:00) ▼
cron.schedule('0 3 * * *', async () => {
  console.log('🕒 定期処理開始...');
  await backfillPastVideos();

  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  db.run("DELETE FROM channels WHERE deleted_at IS NOT NULL AND deleted_at < ?", [sevenDaysAgo], function (err) {
    if (!err && this.changes > 0) {
      console.log(`🗑️ 保存期間を過ぎた ${this.changes}件のチャンネルを完全削除しました`);
      db.run("DELETE FROM videos WHERE channel_id NOT IN (SELECT id FROM channels)");
    }
  });
  console.log('✅ 定期処理終了');
});

async function backfillPastVideos() {
  return new Promise((resolve) => {
    db.all("SELECT * FROM channels WHERE is_fully_loaded = 0 AND deleted_at IS NULL", async (err, channels) => {
      if (err || !channels) return resolve();

      for (const channel of channels) {
        if (!channel.uploads_id) continue;

        try {
          let apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${channel.uploads_id}&maxResults=20&key=${YOUTUBE_API_KEY}`;
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

          const stmt = db.prepare(`INSERT OR IGNORE INTO videos (video_id, channel_id, title, link, thumbnail, author, published, created_at, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

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
            const description = snippet.description || "";

            stmt.run(videoId, channel.id, title, link, thumbnail, author, published, now, description);
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

// APIキーの有効性をチェックするエンドポイント
app.get('/api/status', async (req, res) => {
  if (!YOUTUBE_API_KEY) {
    return res.json({ youtube_api_available: false, reason: "Key not configured" });
  }

  const testChannelId = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';
  const testUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&id=${testChannelId}&key=${YOUTUBE_API_KEY}`;

  try {
    const testRes = await axios.get(testUrl);
    
    if (testRes.status === 200 && testRes.data && testRes.data.items && testRes.data.items.length > 0) {
        return res.json({ youtube_api_available: true });
    }
    
    return res.json({ youtube_api_available: false, reason: "Empty response" });

  } catch (error) {
    if (error.response && (error.response.status === 400 || error.response.status === 403)) {
      return res.json({ youtube_api_available: false, reason: "API Key Invalid or Quota Exceeded" });
    }
    
    return res.json({ youtube_api_available: false, reason: "Network or unknown error" });
  }
});


// ★NEW: 除外キーワード設定の取得
app.get('/api/settings/exclude-keywords', (req, res) => {
    db.get("SELECT value FROM settings WHERE key = 'exclude_keywords'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ keywords: row ? row.value : '' });
    });
});

// ★NEW: 除外キーワード設定の保存
app.put('/api/settings/exclude-keywords', (req, res) => {
    const { keywords } = req.body;
    db.run(
        `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
        ['exclude_keywords', keywords || ''],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: "除外キーワードを保存しました" });
        }
    );
});


app.get('/api/groups', (req, res) => {
  db.all('SELECT group_name, channel_ids FROM groups', [], (err, rows) => {
    if (err) {
      console.error('Database Error (GET /api/groups):', err.message);
      res.status(500).json({ "error": err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/groups', (req, res) => {
  const { group_name, channel_ids } = req.body;

  if (!group_name) {
    return res.status(400).json({ "error": "グループ名が必要です。" });
  }

  db.run(
    `INSERT INTO groups (group_name, channel_ids) 
         VALUES (?, ?)
         ON CONFLICT(group_name) DO UPDATE SET channel_ids = excluded.channel_ids`,
    [group_name, channel_ids || ''],
    function (err) {
      if (err) {
        console.error('Database Error (POST /api/groups):', err.message);
        return res.status(500).json({ "error": err.message });
      }
      res.json({ message: "グループを保存しました。", id: this.lastID });
    }
  );
});

app.delete('/api/groups/:group_name', (req, res) => {
  const group_name = req.params.group_name;

  db.run(`DELETE FROM groups WHERE group_name = ?`, group_name, function (err) {
    if (err) {
      console.error('Database Error (DELETE /api/groups):', err.message);
      return res.status(500).json({ "error": err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ "error": "指定されたグループが見つかりませんでした。" });
    }
    res.json({ message: "グループを削除しました。" });
  });
});

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
      return res.status(400).json({ error: "有効なチャンネルID(UC...) または チャンネルURLを入力してください" });
    }

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

app.put('/api/channels/:id', (req, res) => {
  const { group } = req.body;
  db.run("UPDATE channels SET group_name = ? WHERE id = ?", [group, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/channels/:id', (req, res) => {
  const now = Date.now();
  db.run("UPDATE channels SET deleted_at = ? WHERE id = ?", [now, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/channels/:id/restore', (req, res) => {
  db.run("UPDATE channels SET deleted_at = NULL WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

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
              const description = "";

              db.run(`INSERT OR IGNORE INTO videos (video_id, channel_id, title, link, thumbnail, author, published, created_at, description) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [videoId, channel.id, title, link, thumbnail, author, published, now, description]
              );
            }
          }
        } catch (e) { }
      }
    }

    db.all("SELECT video_id FROM watched", [], (err, watchedRows) => {
      const watchedIds = new Set(watchedRows ? watchedRows.map(r => r.video_id) : []);

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
  db.run("UPDATE videos SET is_pinned = ? WHERE video_id = ?", [val, videoId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/watched', (req, res) => {
  const { videoId, isWatched } = req.body;
  if (isWatched) {
    db.run("INSERT OR IGNORE INTO watched (video_id) VALUES (?)", [videoId], () => res.json({ success: true }));
  } else {
    db.run("DELETE FROM watched WHERE video_id = ?", [videoId], () => res.json({ success: true }));
  }
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