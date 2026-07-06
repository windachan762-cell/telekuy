// CLOUDFLARE WORKER SCRIPT: Auto Backup Database Turso ke Telegram
// 
// Cara Penggunaan:
// 1. Buat Worker baru di Cloudflare Dashboard.
// 2. Paste seluruh kode ini ke dalam file worker.js.
// 3. Masuk ke tab Settings -> Variables -> Environment Variables, tambahkan:
//    - TURSO_URL : URL database Anda (ganti libsql:// menjadi https://)
//                  Contoh: https://botgpt-windachan762-cell.aws-ap-northeast-1.turso.io
//    - TURSO_TOKEN : Token auth Turso Anda
//    - TELEGRAM_TOKEN : Token Bot Telegram Anda
// 4. Masuk ke tab Triggers -> Cron Triggers, tambahkan jadwal 12 jam sekali:
//    - Cron expression: 0 */12 * * *
// 5. Deploy!

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(this.runBackup(env));
  },
  
  // Memungkinkan trigger manual via browser untuk testing
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/backup-now') {
      await this.runBackup(env);
      return new Response("Backup triggered!", { status: 200 });
    }
    return new Response("OK", { status: 200 });
  },

  async runBackup(env) {
    const { TURSO_URL, TURSO_TOKEN, TELEGRAM_TOKEN } = env;
    if (!TURSO_URL || !TURSO_TOKEN || !TELEGRAM_TOKEN) {
      console.error("Missing env vars!");
      return;
    }

    // Mengambil data dari Turso menggunakan HTTP API
    const reqBody = {
      requests: [
        { type: "execute", stmt: { sql: "SELECT * FROM users" } },
        { type: "execute", stmt: { sql: "SELECT * FROM invited_history" } },
        { type: "execute", stmt: { sql: "SELECT * FROM workspace_ids" } },
        { type: "execute", stmt: { sql: "SELECT * FROM settings" } }
      ]
    };

    const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TURSO_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(reqBody)
    });

    if (!res.ok) {
      console.error("Gagal koneksi ke Turso:", await res.text());
      return;
    }

    const jsonRes = await res.json();
    
    // Helper function to format Turso response to standard JSON object
    const formatRows = (result) => {
      if (!result || !result.response || !result.response.result) return [];
      const cols = result.response.result.cols.map(c => c.name);
      return result.response.result.rows.map(row => {
        let obj = {};
        row.forEach((val, i) => {
          obj[cols[i]] = val.value || val.base64;
        });
        return obj;
      });
    };

    const data = {
      users: formatRows(jsonRes.results[0]),
      invited_history: formatRows(jsonRes.results[1]),
      workspace_ids: formatRows(jsonRes.results[2]),
      settings: formatRows(jsonRes.results[3])
    };

    // Cari log channel
    const logSetting = data.settings.find(s => s.key === 'log_channel');
    if (!logSetting || !logSetting.value) {
      console.log("Log channel belum diset di database. Skip pengiriman Telegram.");
      return;
    }
    const logChannel = logSetting.value;

    const backupJsonStr = JSON.stringify(data, null, 2);
    
    // Generate filename
    const date = new Date();
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    const filename = `backup_${d}_${m}_${y}.json`;

    // Kirim ke Telegram API
    const formData = new FormData();
    formData.append("chat_id", logChannel);
    formData.append("caption", "📦 *AUTO-BACKUP* (Via Cloudflare Worker)\nSeluruh data berhasil dicadangkan.");
    formData.append("parse_mode", "Markdown");
    
    // File blob
    const fileBlob = new Blob([backupJsonStr], { type: 'application/json' });
    formData.append("document", fileBlob, filename);

    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
      method: "POST",
      body: formData
    });

    if (!tgRes.ok) {
      console.error("Gagal mengirim ke Telegram:", await tgRes.text());
    } else {
      console.log("Sukses auto backup!");
    }
  }
};
