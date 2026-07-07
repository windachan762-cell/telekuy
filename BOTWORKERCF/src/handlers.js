import { Keyboard, InlineKeyboard } from "grammy";
import { getDb } from "./database.js";
import { getState, setState, clearState, setLastBotMsgId, getLastBotMsgId, updateStateData } from "./state.js";
import { triggerGithubAction } from "./github.js";
import { setupAdminHandlers, handleAdminState, isAdmin } from "./admin.js";

// Helper: Hapus pesan bot lama & pesan user
async function sendCleanMessage(ctx, text, options = {}) {
  const chatId = ctx.chat.id;
  
  // Hapus pesan ketukan/command user saat ini
  if (ctx.message && ctx.message.message_id) {
    try { await ctx.api.deleteMessage(chatId, ctx.message.message_id); } catch(e) {}
  }
  
  // Hapus pesan bot sebelumnya
  const lastId = await getLastBotMsgId(ctx.env, chatId);
  if (lastId) {
    try { await ctx.api.deleteMessage(chatId, lastId); } catch(e) {}
  }
  
  // Kirim pesan baru
  const sent = await ctx.reply(text, options);
  await setLastBotMsgId(ctx.env, chatId, sent.message_id);
  return sent;
}

// Helper: Ambil Keyboard Utama
async function getMainMenuKeyboard(env, chatId) {
  const kb = new Keyboard()
    .text("🔄 Rubah Akun").row()
    .text("👤 Profil").text("🏆 Leaderboard").row()
    .text("📖 Tutorial");
  
  if (await isAdmin(env, chatId)) {
    kb.row().text("⚙️ Admin Panel");
  }
  return kb.resized().persistent();
}

async function sendMainMenu(ctx) {
  const chatId = ctx.chat.id;
  const kb = await getMainMenuKeyboard(ctx.env, chatId);
  
  // Ambil user dari DB
  const db = getDb(ctx.env);
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE telegram_id = ?",
    args: [chatId.toString()]
  });
  
  let userCoins = 2;
  let fullName = ctx.from.first_name || "Pengguna";
  
  if (result.rows.length > 0) {
    userCoins = result.rows[0].coins;
    fullName = result.rows[0].full_name || fullName;
  }
  
  const botInfo = await ctx.api.getMe();
  const botName = botInfo.first_name || "Telekuy Bot";
  
  const welcomeText = `👋 Halo, *${fullName}*!\nSelamat datang di *${botName}* 🤖\n\n━━━━━━━━━━━━━━━━━━\n👤 *INFORMASI AKUN*\n🆔 ID Anda : \`${chatId}\`\n🪙 Koin    : *${userCoins} Koin*\n━━━━━━━━━━━━━━━━━━\n\nSilakan pilih menu di bawah ini untuk memulai layanan kami 👇`;

  return sendCleanMessage(ctx, welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: kb
  });
}

export function setupHandlers(bot) {
  // === GLOBAL MIDDLEWARE: FORCE SUB ===
  bot.use(async (ctx, next) => {
    if (!ctx.message && !ctx.callbackQuery) return next();
    if (ctx.message?.text?.startsWith('/start')) return next(); // Biarkan start jalan
    
    // Cek jika user adalah admin, bypass force sub
    if (await isAdmin(ctx.env, ctx.from.id)) return next();
    
    const userId = ctx.from.id.toString();
    const db = getDb(ctx.env);
    
    const res1 = await db.execute("SELECT value FROM settings WHERE key = 'force_sub_1'");
    const res2 = await db.execute("SELECT value FROM settings WHERE key = 'force_sub_2'");
    
    const force1 = res1.rows.length > 0 ? res1.rows[0].value : null;
    const force2 = res2.rows.length > 0 ? res2.rows[0].value : null;
    
    if (!force1 && !force2) return next();
    
    const getSubLink = (val) => {
      let clean = val.replace(/[<>\[\]\s]/g, '');
      if (clean.startsWith('-100')) return clean;
      if (clean.startsWith('http') || clean.startsWith('t.me/')) {
        let urlParts = clean.split('?')[0];
        if (urlParts.endsWith('/')) urlParts = urlParts.slice(0, -1);
        return '@' + urlParts.split('/').pop().replace('+', ''); 
      }
      if (!clean.startsWith('@')) return '@' + clean;
      return clean;
    };

    let notJoined = [];
    const checkJoin = async (link) => {
       if (!link) return;
       const username = getSubLink(link);
       try {
         const member = await ctx.api.getChatMember(username, userId);
         if (['left', 'kicked'].includes(member.status)) notJoined.push(link);
       } catch (e) { 
         console.error("Force Sub Error:", e.message);
         // Jika API melempar error (bot bukan admin atau link private salah format)
         notJoined.push({ link, error: true }); 
       }
    };
    
    await checkJoin(force1);
    await checkJoin(force2);
    
    if (notJoined.length > 0) {
       // Cek apakah ada error API (bot bukan admin)
       const hasError = notJoined.some(item => typeof item === 'object' && item.error);
       
       const kb = new InlineKeyboard();
       const f1Url = force1 ? (force1.startsWith('http') ? force1 : `https://t.me/${force1.replace('@', '')}`) : '';
       const f2Url = force2 ? (force2.startsWith('http') ? force2 : `https://t.me/${force2.replace('@', '')}`) : '';
       
       if (force1) kb.url("📢 Channel 1", f1Url);
       if (force2) kb.row().url("📢 Channel 2", f2Url);
       kb.row().url("🔄 Cek Status", `https://t.me/${ctx.me.username}?start=check`);
       
       if (ctx.message && ctx.message.message_id) {
         try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch(e) {}
       }
       
       if (hasError) {
         return ctx.reply("❌ *SISTEM ERROR!*\nBot gagal mengecek status keanggotaan Anda.\n\n*Penyebab yang mungkin:*\n1. Bot belum diangkat menjadi *Admin* di channel tersebut.\n2. Link yang dimasukkan Admin adalah link private (Gunakan Username @ atau ID -100).\n\nSilakan hubungi Admin bot ini.", {
            parse_mode: 'Markdown',
            reply_markup: kb
         });
       }
       
       return ctx.reply("❌ *Anda belum bergabung!*\nSilakan bergabung ke channel/grup di bawah ini terlebih dahulu:", {
          parse_mode: 'Markdown',
          reply_markup: kb
       });
    }
    
    await next();
  });

  bot.command("start", async (ctx) => {
    const userId = ctx.from.id.toString();
    const db = getDb(ctx.env);
    
    // Cek user terdaftar
    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE telegram_id = ?",
      args: [userId]
    });
    
    if (existing.rows.length === 0) {
      await db.execute({
        sql: "INSERT INTO users (telegram_id, username, full_name, coins) VALUES (?, ?, ?, ?)",
        args: [userId, ctx.from.username || null, ctx.from.first_name || "", 2]
      });
    }
    
    await sendMainMenu(ctx);
  });

  bot.hears("🔙 Kembali ke Menu Utama", async (ctx) => {
    await clearState(ctx.env, ctx.chat.id);
    await sendMainMenu(ctx);
  });

  bot.hears("👤 Profil", async (ctx) => {
    const db = getDb(ctx.env);
    const result = await db.execute({
      sql: "SELECT * FROM users WHERE telegram_id = ?",
      args: [ctx.from.id.toString()]
    });
    if(result.rows.length === 0) return ctx.reply("User tidak ditemukan");
    
    const user = result.rows[0];
    const botInfo = await ctx.api.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=${user.telegram_id}`;
    
    const txt = `👤 *PROFIL AKUN*\n\nNama: ${user.full_name}\nID: \`${user.telegram_id}\`\nKoin: 💰 ${user.coins}\n\n🔗 *Link Referral:*\n\`${refLink}\``;
    await sendCleanMessage(ctx, txt, {
      parse_mode: 'Markdown',
      reply_markup: await getMainMenuKeyboard(ctx.env, ctx.chat.id)
    });
  });

  bot.hears("🔄 Rubah Akun", async (ctx) => {
    const db = getDb(ctx.env);
    const userId = ctx.from.id.toString();
    const user = await db.execute({ sql: "SELECT coins FROM users WHERE telegram_id = ?", args: [userId] });
    
    if(user.rows.length === 0 || user.rows[0].coins < 1) {
      return sendCleanMessage(ctx, "❌ Koin Anda tidak cukup.");
    }
    
    const ws = await db.execute("SELECT workspace_id FROM workspace_ids WHERE is_active = 1 LIMIT 1");
    if(ws.rows.length === 0) return sendCleanMessage(ctx, "❌ Sistem sedang pemeliharaan.");
    
    await setState(ctx.env, ctx.chat.id, "WAITING_FOR_EMAIL", { wsId: ws.rows[0].workspace_id });
    
    const kb = new Keyboard().text("🔙 Batal").resized().persistent();
    await sendCleanMessage(ctx, "⚠️ *Peringatan:* Gunakan Gmail cadangan, JANGAN gunakan akun utama Anda!\n\nSilakan kirimkan *ALAMAT EMAIL* Anda.", { 
      parse_mode: 'Markdown',
      reply_markup: kb
    });
  });

  bot.hears("🏆 Leaderboard", async (ctx) => {
    const db = getDb(ctx.env);
    const result = await db.execute("SELECT full_name, coins FROM users ORDER BY coins DESC LIMIT 10");
    let txt = "🏆 *Top 10 Leaderboard:*\n\n";
    if (result.rows.length === 0) {
      txt += "_Belum ada data._";
    } else {
      result.rows.forEach((u, i) => {
        txt += `${i + 1}. ${u.full_name || 'Tanpa Nama'} - 💰 ${u.coins}\n`;
      });
    }
    await sendCleanMessage(ctx, txt, { parse_mode: 'Markdown', reply_markup: await getMainMenuKeyboard(ctx.env, ctx.chat.id) });
  });

  bot.hears("📖 Tutorial", async (ctx) => {
    const db = getDb(ctx.env);
    let tut = "Tutorial belum diatur oleh admin.";
    try {
      const res = await db.execute("SELECT value FROM settings WHERE key = 'tutorial'");
      if (res.rows.length > 0) tut = res.rows[0].value;
    } catch(e) {}
    
    await sendCleanMessage(ctx, `📖 *TUTORIAL*\n\n${tut}`, { parse_mode: 'Markdown', reply_markup: await getMainMenuKeyboard(ctx.env, ctx.chat.id) });
  });
}

export function setupStateRouter(bot) {
  // Penanganan State Machine untuk input teks/file
  bot.on(":text", async (ctx, next) => {
    const chatId = ctx.chat.id;
    const currentState = await getState(ctx.env, chatId);
    
    if (!currentState) return next();
    
    // Handle Tombol Batal secara terpusat untuk user biasa
    if (ctx.message.text === "🔙 Batal") {
      const adminHandled = await handleAdminState(ctx, ctx.env, currentState);
      if (adminHandled) return; // Jika ini state admin, admin.js yang akan urus batalnya.
      
      await clearState(ctx.env, chatId);
      return sendMainMenu(ctx);
    }

    if (currentState.state === "WAITING_FOR_EMAIL") {
      const email = ctx.message.text.trim();
      
      // Validasi Gmail
      if (!email.toLowerCase().endsWith("@gmail.com")) {
        const kb = new Keyboard().text("🔙 Batal").resized().persistent();
        return sendCleanMessage(ctx, "❌ *Email tidak valid!*\nHarap masukkan email yang berakhiran `@gmail.com` saja.", { parse_mode: 'Markdown', reply_markup: kb });
      }
      
      currentState.data.email = email;
      await setState(ctx.env, chatId, "WAITING_FOR_COOKIE", currentState.data);
      
      const kb = new Keyboard().text("🔙 Batal").resized().persistent();
      await sendCleanMessage(ctx, "✅ Email diterima.\n\nSekarang, kirimkan *teks Cookie* Anda secara langsung ATAU unggah file cookie (berformat `.txt` atau `.json`).", { parse_mode: 'Markdown', reply_markup: kb });
    }
    else if (currentState.state === "WAITING_FOR_COOKIE") {
      const cookieText = ctx.message.text.trim();
      const { email, wsId } = currentState.data;
      
      await ctx.reply("⏳ Mengirimkan antrian ke server cloud...", { reply_markup: await getMainMenuKeyboard(ctx.env, chatId) });
      
      // Trigger Github
      const result = await triggerGithubAction(ctx.env, {
        chatId: chatId,
        telegramId: ctx.from.id.toString(),
        email: email,
        cookieText: cookieText,
        workspaceId: wsId
      });
      
      if (result.success) {
        // Kurangi koin langsung di DB
        const db = getDb(ctx.env);
        await db.execute({
          sql: "UPDATE users SET coins = coins - 1 WHERE telegram_id = ?",
          args: [ctx.from.id.toString()]
        });
        await ctx.reply("✅ Antrian berhasil dikirim ke server cloud! Silakan cek notifikasi bot sebentar lagi.");
      } else {
        await ctx.reply(`❌ Gagal mengirim ke server cloud. \nDetail: ${result.error || 'Unknown'}\nSilakan coba lagi nanti.`);
      }
      
      await clearState(ctx.env, chatId);
      return;
    }

    // Jika bukan state user, lempar ke state admin
    const adminHandled = await handleAdminState(ctx, ctx.env, currentState);
    if (adminHandled) return;
  });

  bot.on("message:document", async (ctx, next) => {
    const chatId = ctx.chat.id;
    const currentState = await getState(ctx.env, chatId);
    
    if (!currentState) return next();
    
    if (currentState.state === "WAITING_FOR_COOKIE") {
      const doc = ctx.message.document;
      const fileName = doc.file_name?.toLowerCase() || "";
      
      if (!fileName.endsWith('.txt') && !fileName.endsWith('.json')) {
        return ctx.reply("❌ File tidak didukung. Harap kirimkan file berformat `.txt` atau `.json`.", { parse_mode: 'Markdown' });
      }

      await ctx.reply("⏳ Mengunduh file cookie Anda...", { reply_markup: await getMainMenuKeyboard(ctx.env, chatId) });

      try {
        const fileInfo = await ctx.api.getFile(doc.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${ctx.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
        const response = await fetch(fileUrl);
        const cookieText = await response.text();

        const { email, wsId } = currentState.data;
        
        await ctx.reply("⏳ Mengirimkan antrian ke server cloud...");
        
        // Trigger Github
        const result = await triggerGithubAction(ctx.env, {
          chatId: chatId,
          telegramId: ctx.from.id.toString(),
          email: email,
          cookieText: cookieText.trim(),
          workspaceId: wsId
        });
        
        if (result.success) {
          const db = getDb(ctx.env);
          await db.execute({
            sql: "UPDATE users SET coins = coins - 1 WHERE telegram_id = ?",
            args: [ctx.from.id.toString()]
          });
          await ctx.reply("✅ Antrian berhasil dikirim ke server cloud! Silakan cek notifikasi bot sebentar lagi.");
        } else {
          await ctx.reply(`❌ Gagal mengirim ke server cloud.\nDetail: ${result.error || 'Unknown'}\nSilakan coba lagi nanti.`);
        }
        
        await clearState(ctx.env, chatId);
        return;
      } catch (err) {
        console.error("Gagal membaca file cookie:", err);
        return ctx.reply("❌ Gagal membaca file dari Telegram. Pastikan ukuran file tidak terlalu besar.");
      }
    }
    
    return next();
  });
}
