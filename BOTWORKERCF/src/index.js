import process from "node:process";
globalThis.process = process;

import { Bot, webhookCallback } from "grammy";
import { setupHandlers, setupStateRouter } from "./handlers.js";
import { processBroadcastChunk, setupAdminHandlers } from "./admin.js";

export default {
  async fetch(request, env, ctx) {
    if (!env.TELEGRAM_BOT_TOKEN) {
      return new Response("Bot token tidak ditemukan di environment.", { status: 500 });
    }

    const url = new URL(request.url);

    // Trik Intercept: Jalur rahasia untuk Estafet (Chunking) Broadcast
    if (url.pathname === '/internal/broadcast' && request.method === 'POST') {
      const auth = request.headers.get("X-Internal-Token");
      if (auth !== env.TELEGRAM_BOT_TOKEN) return new Response("Unauthorized", { status: 401 });
      
      const payload = await request.json();
      // Lempar ke background agar request HTTP ini cepat selesai (mencegah timeout)
      ctx.waitUntil(processBroadcastChunk(env, payload, url.origin));
      return new Response("OK");
    }

    try {
      const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
      
      // Inject env dan origin ke context grammy
      bot.use(async (ctx, next) => {
        ctx.env = env;
        ctx.workerOrigin = url.origin;
        await next();
      });

      // Pasang semua logika respon
      setupHandlers(bot);
      setupAdminHandlers(bot);
      setupStateRouter(bot); // WAJIB DIPANGGIL PALING AKHIR KARENA MENANGKAP SEMUA TEXT

      // Arahkan request HTTP Cloudflare ke Grammy Webhook
      const cb = webhookCallback(bot, "cloudflare-mod");
      return await cb(request);
      
    } catch (error) {
      console.error("Kesalahan Webhook:", error);
      return new Response("Terjadi kesalahan pada bot.", { status: 500 });
    }
  },

  async scheduled(event, env, ctx) {
    // Pekerjaan Cron untuk Backup Database setiap 12 Jam
    const db = getDb(env);
    
    try {
      console.log("Menjalankan backup cron...");
      const logChannelRes = await db.execute("SELECT value FROM settings WHERE key = 'log_channel'");
      const logChannel = logChannelRes.rows.length > 0 ? logChannelRes.rows[0].value : null;
      
      if (!logChannel) {
        console.log("Log channel tidak diatur, membatalkan backup.");
        return;
      }
      
      const [users, workspace_ids, bot_states, jobs_queue, settings] = await Promise.all([
        db.execute("SELECT * FROM users"),
        db.execute("SELECT * FROM workspace_ids"),
        db.execute("SELECT * FROM bot_states"),
        db.execute("SELECT * FROM jobs_queue"),
        db.execute("SELECT * FROM settings")
      ]);
      
      const dump = {
        timestamp: new Date().toISOString(),
        tables: {
          users: users.rows,
          workspace_ids: workspace_ids.rows,
          bot_states: bot_states.rows,
          jobs_queue: jobs_queue.rows,
          settings: settings.rows
        }
      };
      
      const buffer = new TextEncoder().encode(JSON.stringify(dump, null, 2));
      const formData = new FormData();
      formData.append('chat_id', logChannel);
      formData.append('document', new File([buffer], `telekuy_db_backup_${Date.now()}.json`, { type: 'application/json' }));
      formData.append('caption', `📦 *Database Backup*\n🕒 Waktu: ${dump.timestamp}\n\nOtomatis di-generate setiap 12 jam dari Cloudflare Cron Worker.`);
      
      const tgUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument?parse_mode=Markdown`;
      await fetch(tgUrl, { method: 'POST', body: formData });
      console.log("Backup berhasil dikirim ke channel log.");
      
    } catch (e) {
      console.error("Gagal melakukan backup cron:", e);
    }
  }
};
