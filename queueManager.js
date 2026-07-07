const { db } = require('./database');

const queue = [];
let isProcessing = false;

// Fungsi untuk men-trigger Github Actions
async function triggerGithubAction(job) {
  const { chatId, email, cookieText, workspaceId, telegramId, botToken } = job;
  
  console.log(`[GH ACTIONS] Mengirim job untuk user ${telegramId} ke workspace ${workspaceId}`);
  
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;
  
  if (!owner || !repo || !token) {
    console.error("Github Actions config tidak lengkap!");
    return false;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/invite.yml/dispatches`, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `token ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          cookie: cookieText,
          email: email,
          user_id: telegramId.toString(),
          workspace_id: workspaceId,
          chat_id: chatId.toString()
        }
      })
    });
    
    if (res.status === 204) {
      console.log("✅ Github Action berhasil di-trigger!");
      return true;
    } else {
      const errorText = await res.text();
      console.error(`❌ Gagal trigger Github Action: ${res.status}`, errorText);
      return false;
    }
  } catch (error) {
    console.error("❌ Exception trigger Github Action:", error.message);
    return false;
  }
}

async function processQueue(bot) {
  if (isProcessing || queue.length === 0) return;
  
  isProcessing = true;
  const job = queue.shift();
  
  try {
    bot.sendMessage(job.chatId, "⚙️ Memulai proses invite via server cloud...");
    
    // Potong 1 koin saat diproses
    await db.updateCoins(job.telegramId, -1);
    
    // Coba trigger GH actions
    const success = await triggerGithubAction(job);
    
    if (!success) {
      // Refund koin jika gagal trigger
      await db.updateCoins(job.telegramId, 1);
      bot.sendMessage(job.chatId, "❌ Gagal menyambungkan ke server Cloud. Koin Anda dikembalikan.");
    } else {
      bot.sendMessage(job.chatId, "✅ Proses sedang berjalan di server! Anda akan menerima notifikasi jika invite sukses atau gagal (Koin akan otomatis dikembalikan jika gagal).");
    }

  } catch (error) {
    console.error("Queue process error:", error);
  } finally {
    isProcessing = false;
    
    // Jeda 5 detik sebelum memproses antrian berikutnya agar tidak spam API
    setTimeout(() => {
      processQueue(bot);
    }, 5000);
  }
}

function addJob(bot, job) {
  queue.push(job);
  const urutan = queue.length;
  bot.sendMessage(job.chatId, `⏳ Proses Anda telah dimasukkan ke antrian. Anda berada di urutan ke-${urutan}.`);
  processQueue(bot);
}

module.exports = { addJob };
