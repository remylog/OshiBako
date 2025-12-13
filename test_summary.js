// test_summary.js
require('dotenv').config(); // .envからAPIキーを読み込む
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");

// ▼ 設定: テストしたいYouTube動画ID（引数がない場合のデフォルト）
const DEFAULT_VIDEO_ID = "dU7MMsi8Fqg"; // さっきのまごもさんの動画

// APIキー確認
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("❌ エラー: .envファイルに GEMINI_API_KEY が設定されていません。");
  process.exit(1);
}

// 初期化
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// 音声ダウンロード関数
function downloadAudio(videoId) {
  return new Promise((resolve, reject) => {
    // dataフォルダではなく、カレントディレクトリに一時保存
    const outputFilename = path.resolve(__dirname, `test_${videoId}.m4a`);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log(`\n💿 音声ダウンロード開始: ${videoUrl}`);
    
    // yt-dlpコマンド (Docker内ならパスが通っているはず。ローカルならインストールが必要)
    // ※もしDocker外で動かす場合は yt-dlp のインストールが必要です
    const command = `yt-dlp -f "bestaudio[ext=m4a]" -S "res,ext:m4a:m4a" --output "${outputFilename}" "${videoUrl}"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ ダウンロード失敗: ${stderr}`);
        reject(error);
      } else {
        console.log(`✅ ダウンロード完了: ${outputFilename}`);
        resolve(outputFilename);
      }
    });
  });
}

// メイン処理
async function main() {
  // コマンドライン引数から動画IDを取得 (例: node test_summary.js VIDEO_ID)
  const videoId = process.argv[2] || DEFAULT_VIDEO_ID;
  let audioPath = null;
  let uploadResult = null;

  try {
    // 1. ダウンロード
    audioPath = await downloadAudio(videoId);

    // 2. Geminiへアップロード
    console.log(`📤 Geminiへアップロード中...`);
    uploadResult = await fileManager.uploadFile(audioPath, {
      mimeType: "audio/mp4",
      displayName: `Test Audio ${videoId}`,
    });
    console.log(`   File URI: ${uploadResult.file.uri}`);

    // 3. 処理待ち (Activeになるまで待機)
    process.stdout.write("⏳ サーバー処理待ち");
    let fileState = await fileManager.getFile(uploadResult.file.name);
    while (fileState.state === "PROCESSING") {
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 2000));
      fileState = await fileManager.getFile(uploadResult.file.name);
    }
    console.log(`\n✅ 準備完了 (State: ${fileState.state})`);

    if (fileState.state === "FAILED") {
      throw new Error("Gemini側で音声処理に失敗しました。");
    }

    // 4. 要約生成
    console.log(`🧠 AIが音声を聴いて要約中...`);
    
    const prompt = `
      この音声の内容を要約してください。
      以下のフォーマットでJSON形式で出力してください。
      
      {
        "summary_short": "3行まとめ",
        "summary_long": ["詳細1", "詳細2", "詳細3"],
        "timestamps": { "mm:ss": "出来事" }
      }
    `;

    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResult.file.mimeType,
          fileUri: uploadResult.file.uri,
        },
      },
      { text: prompt },
    ]);

    const response = await result.response;
    const text = response.text();

    console.log("\n====== 🎉 生成結果 ======");
    console.log(text);
    console.log("=========================\n");

  } catch (error) {
    console.error("\n❌ エラーが発生しました:", error.message);
  } finally {
    // 5. お掃除
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      console.log(`🗑️ ローカルファイルを削除しました: ${path.basename(audioPath)}`);
    }
    if (uploadResult) {
      try {
        await fileManager.deleteFile(uploadResult.file.name);
        console.log(`🗑️ Gemini上のファイルを削除しました`);
      } catch (e) {
        console.error("Geminiファイル削除エラー:", e.message);
      }
    }
  }
}

main();