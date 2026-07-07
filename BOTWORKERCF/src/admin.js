import { Keyboard } from "grammy";
import { getDb } from "./database.js";
import { setState, clearState, getState } from "./state.js";

export async function isAdmin(env, userId) {
  const adminIds = env.ADMIN_IDS ? env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
  if (adminIds.includes(userId.toString())) return true;
  
  try {
    const db = getDb(env);
    const res = await db.execute("SELECT value FROM settings WHERE key = 'additional_admins'");
    if (res.rows.length > 0) {
      const dbAdmins = JSON.parse(res.rows[0].value);
      if (Array.isArray(dbAdmins) && dbAdmins.includes(userId.toString())) return true;
    }
  } catch(e) {}
  return false;
}

async function sendAdminMenu(ctx) {
  const kb = new Keyboard()
    .text("📢 Broadcast").text("🎁 Give Koin").row()
    .text("🏢 Kelola Workspace").text("📖 Set Tutorial").row()
    .text("🔒 Set Wajib Sub").text("🔓 Hapus Wajib Sub").row()
    .text("📊 Kelola Log").text("👥 Kelola Admin").row()
    .text("📤 Backup DB").text("📥 Restore DB").row()
    .text("🔙 Kembali ke Menu Utama").resized();
    
  await ctx.reply("⚙️ *ADMIN PANEL*\nSilakan pilih menu di bawah ini:", {
    parse_mode: 'Markdown',
    reply_markup: kb
  });
}

async function handleWorkspaceMenu(ctx, env) {
  const db = getDb(env);
  const workspaces = (await db.execute("SELECT * FROM workspace_ids")).rows;
  let wsText = "🏢 *Daftar Workspace ID:*\n\n";
  if (workspaces.length === 0) wsText += "_Belum ada data._\n";
  for (const w of workspaces) {
    wsText += `- \`${w.workspace_id}\` ${w.is_active ? '✅ (Aktif)' : ''}\n`;
  }
  
  const kb = new Keyboard()
    .text("➕ Tambah WS").text("❌ Hapus WS").text("👉 Set Aktif WS").row()
    .text("⚙️ Admin Panel").resized();
    
  await ctx.reply(wsText, { parse_mode: 'Markdown', reply_markup: kb });
}

export function setupAdminHandlers(bot) {
  bot.hears("⚙️ Admin Panel", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return ctx.reply("❌ Akses Ditolak!");
    await sendAdminMenu(ctx);
  });

  bot.hears("📢 Broadcast", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await setState(ctx.env, ctx.chat.id, 'ADMIN_BC_WAIT_MSG');
    await ctx.reply("Silakan ketik atau teruskan pesan yang ingin dibroadcast:", { reply_markup: new Keyboard().text("🔙 Batal").resized() });
  });

  bot.hears("🎁 Give Koin", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await setState(ctx.env, ctx.chat.id, 'ADMIN_GIVE_WAIT_ID');
    await ctx.reply("Masukkan ID Telegram pengguna yang ingin diberi koin:", { reply_markup: new Keyboard().text("🔙 Batal").resized() });
  });

  bot.hears("🏢 Kelola Workspace", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await handleWorkspaceMenu(ctx, ctx.env);
  });

  bot.hears("👥 Kelola Admin", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    const db = getDb(ctx.env);
    let admins = [];
    try {
      const res = await db.execute("SELECT value FROM settings WHERE key = 'additional_admins'");
      if (res.rows.length > 0) admins = JSON.parse(res.rows[0].value);
    } catch(e) {}
    
    let txt = "👥 *Daftar Admin Tambahan:*\n";
    if (admins.length === 0) txt += "_Belum ada admin tambahan._\n";
    else admins.forEach((id, i) => txt += `${i+1}. \`${id}\`\n`);
    
    txt += `\nTotal: ${admins.length}/5 Admin.`;
    
    const kb = new Keyboard()
      .text("➕ Tambah Admin").text("🗑️ Hapus Admin").row()
      .text("⚙️ Admin Panel").resized();
      
    await ctx.reply(txt, { parse_mode: 'Markdown', reply_markup: kb });
  });

  bot.hears("➕ Tambah Admin", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await setState(ctx.env, ctx.chat.id, 'WAITING_ADD_ADMIN');
    await ctx.reply("Masukkan *ID Telegram* yang ingin dijadikan Admin Tambahan:", { parse_mode: 'Markdown', reply_markup: new Keyboard().text("🔙 Batal").resized() });
  });

  bot.hears("🗑️ Hapus Admin", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await setState(ctx.env, ctx.chat.id, 'WAITING_REMOVE_ADMIN');
    await ctx.reply("Masukkan *ID Telegram* admin yang ingin dihapus:", { parse_mode: 'Markdown', reply_markup: new Keyboard().text("🔙 Batal").resized() });
  });

  bot.hears("📊 Kelola Log", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    const db = getDb(ctx.env);
    let logCh = "_Belum diatur_";
    try {
      const res = await db.execute("SELECT value FROM settings WHERE key = 'log_channel'");
      if (res.rows.length > 0) logCh = `\`${res.rows[0].value}\``;
    } catch(e) {}
    
    await setState(ctx.env, ctx.chat.id, 'WAITING_LOG_CHANNEL');
    await ctx.reply(`📊 *Kelola Channel Log*\nLog Channel saat ini: ${logCh}\n\nMasukkan *Username* (contoh: \`@logku\`) atau *ID Channel* (contoh: \`-100123...\`) untuk log:`, { parse_mode: 'Markdown', reply_markup: new Keyboard().text("🔙 Batal").resized() });
  });

  bot.hears("📖 Set Tutorial", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await setState(ctx.env, ctx.chat.id, 'WAITING_TUTORIAL');
    await ctx.reply("Kirimkan teks panduan (tutorial) yang baru:", { reply_markup: new Keyboard().text("🔙 Batal").resized() });
  });

  bot.hears("➕ Tambah WS", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await setState(ctx.env, ctx.chat.id, 'WAITING_ADD_WS');
    await ctx.reply("Masukkan *ID Workspace* baru:", { parse_mode: 'Markdown', reply_markup: new Keyboard().text("🔙 Batal").resized() });
  });

  bot.hears("❌ Hapus WS", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await setState(ctx.env, ctx.chat.id, 'WAITING_REMOVE_WS');
    await ctx.reply("Masukkan *ID Workspace* yang ingin dihapus:", { parse_mode: 'Markdown', reply_markup: new Keyboard().text("🔙 Batal").resized() });
  });

  bot.hears("👉 Set Aktif WS", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await setState(ctx.env, ctx.chat.id, 'WAITING_ACTIVATE_WS');
    await ctx.reply("Masukkan *ID Workspace* yang ingin diaktifkan:", { parse_mode: 'Markdown', reply_markup: new Keyboard().text("🔙 Batal").resized() });
  });

  bot.hears("🔒 Set Wajib Sub", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await setState(ctx.env, ctx.chat.id, 'WAITING_FORCE_SUB_1');
    await ctx.reply("Kirim Username Channel (contoh `@channelku`) atau ID Channel (contoh `-100123...`) untuk *Syarat Join 1*:\n(Ketik `skip` jika tidak ingin diisi)", { parse_mode: 'Markdown', reply_markup: new Keyboard().text("🔙 Batal").resized() });
  });

  bot.hears("🔓 Hapus Wajib Sub", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    const db = getDb(ctx.env);
    await db.execute("DELETE FROM settings WHERE key IN ('force_sub_1', 'force_sub_2')");
    await ctx.reply("✅ Syarat Wajib Sub telah dihapus dari sistem.");
    return sendAdminMenu(ctx);
  });

  bot.hears("📤 Backup DB", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await ctx.reply("⏳ Tunggu sebentar, menyiapkan file backup...");
    const db = getDb(ctx.env);
    let resUsers, resWs, resSett, resState;
    try { resUsers = await db.execute("SELECT * FROM users"); } catch(e) {}
    try { resWs = await db.execute("SELECT * FROM workspace_ids"); } catch(e) {}
    try { resSett = await db.execute("SELECT * FROM settings"); } catch(e) {}
    try { resState = await db.execute("SELECT * FROM states"); } catch(e) {}
    const backupData = JSON.stringify({
        users: resUsers?.rows || [],
        workspace_ids: resWs?.rows || [],
        settings: resSett?.rows || [],
        states: resState?.rows || [],
        timestamp: new Date().toISOString()
    });
    const blob = new Blob([backupData], { type: 'application/json' });
    const file = new File([blob], `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const formData = new FormData();
    formData.append('chat_id', ctx.chat.id);
    formData.append('document', file);
    formData.append('caption', '📦 Backup Manual Database Terbaru');
    await fetch(`https://api.telegram.org/bot${ctx.env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
        method: 'POST',
        body: formData
    });
  });

  bot.hears("📥 Restore DB", async (ctx) => {
    if (!(await isAdmin(ctx.env, ctx.from.id))) return;
    await ctx.reply("Fitur Restore via Bot sedang dalam tahap pengembangan (MVP). Silakan jalankan script lokal untuk restore.");
  });
}

export async function handleAdminState(ctx, env, currentState) {
  const chatId = ctx.chat.id;
  const state = currentState.state;
  const db = getDb(env);
  const text = ctx.message?.text || "";

  if (text === "🔙 Batal") {
    await clearState(env, chatId);
    return sendAdminMenu(ctx);
  }

  if (state === 'ADMIN_BC_WAIT_MSG') {
    const payload = {
      adminChatId: chatId,
      msgId: ctx.message.message_id,
      offset: 0,
      successCount: 0
    };
    
    await ctx.reply("⏳ Memulai broadcast skala besar secara berantai (estafet)... Anda akan menerima notifikasi jika sudah selesai semuanya.");
    
    // Tembak worker sendiri (mulai estafet)
    fetch(ctx.workerOrigin + '/internal/broadcast', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Internal-Token': env.TELEGRAM_BOT_TOKEN 
      },
      body: JSON.stringify(payload)
    }).catch(e => console.error(e));
    
    await clearState(env, chatId);
    return sendAdminMenu(ctx);
  }

  if (state === 'ADMIN_GIVE_WAIT_ID') {
    await setState(env, chatId, 'ADMIN_GIVE_WAIT_AMOUNT', { targetId: text });
    return ctx.reply("Masukkan *jumlah koin*:", { parse_mode: 'Markdown' });
  }

  if (state === 'ADMIN_GIVE_WAIT_AMOUNT') {
    const amount = parseInt(text);
    if (isNaN(amount)) return ctx.reply("Harus angka.");
    const targetId = currentState.data.targetId;
    await db.execute({ sql: "UPDATE users SET coins = coins + ? WHERE telegram_id = ?", args: [amount, targetId] });
    await ctx.reply(`✅ Berhasil menambahkan ${amount} koin ke ID ${targetId}.`);
    try { await ctx.api.sendMessage(targetId, `🎁 Selamat! Anda mendapatkan ${amount} koin dari Admin.`); } catch (e) {}
    await clearState(env, chatId);
    return sendAdminMenu(ctx);
  }

  if (state === 'WAITING_ADD_ADMIN') {
    const newId = text.trim();
    if (!/^\d+$/.test(newId)) return ctx.reply("❌ ID harus berupa angka.");
    let admins = [];
    try {
      const res = await db.execute("SELECT value FROM settings WHERE key = 'additional_admins'");
      if (res.rows.length > 0) admins = JSON.parse(res.rows[0].value);
    } catch(e) {}
    
    if (admins.length >= 5) {
      await clearState(env, chatId);
      return ctx.reply("❌ Gagal! Maksimal hanya boleh 5 admin tambahan.");
    }
    if (admins.includes(newId)) return ctx.reply("❌ ID ini sudah menjadi admin.");
    
    admins.push(newId);
    await db.execute({ sql: "INSERT INTO settings (key, value) VALUES ('additional_admins', ?) ON CONFLICT(key) DO UPDATE SET value = ?", args: [JSON.stringify(admins), JSON.stringify(admins)] });
    await clearState(env, chatId);
    await ctx.reply(`✅ ID \`${newId}\` berhasil ditambahkan sebagai Admin!`, { parse_mode: 'Markdown' });
    return sendAdminMenu(ctx);
  }

  if (state === 'WAITING_REMOVE_ADMIN') {
    const removeId = text.trim();
    let admins = [];
    try {
      const res = await db.execute("SELECT value FROM settings WHERE key = 'additional_admins'");
      if (res.rows.length > 0) admins = JSON.parse(res.rows[0].value);
    } catch(e) {}
    
    if (!admins.includes(removeId)) return ctx.reply("❌ ID ini bukan admin tambahan.");
    
    admins = admins.filter(id => id !== removeId);
    await db.execute({ sql: "UPDATE settings SET value = ? WHERE key = 'additional_admins'", args: [JSON.stringify(admins)] });
    await clearState(env, chatId);
    await ctx.reply(`✅ ID \`${removeId}\` berhasil dihapus dari daftar Admin!`, { parse_mode: 'Markdown' });
    return sendAdminMenu(ctx);
  }

  if (state === 'WAITING_LOG_CHANNEL') {
    const channelId = text.trim();
    await db.execute({ sql: "INSERT INTO settings (key, value) VALUES ('log_channel', ?) ON CONFLICT(key) DO UPDATE SET value = ?", args: [channelId, channelId] });
    await clearState(env, chatId);
    await ctx.reply(`✅ Channel log berhasil disetel ke: \`${channelId}\``, { parse_mode: 'Markdown' });
    return sendAdminMenu(ctx);
  }

  if (state === 'WAITING_TUTORIAL') {
    await db.execute({ sql: "INSERT INTO settings (key, value) VALUES ('tutorial', ?) ON CONFLICT(key) DO UPDATE SET value = ?", args: [text, text] });
    await clearState(env, chatId);
    await ctx.reply(`✅ Tutorial berhasil diperbarui!`, { parse_mode: 'Markdown' });
    return sendAdminMenu(ctx);
  }

  if (state === 'WAITING_ADD_WS') {
    const wsId = text.trim();
    await db.execute({ sql: "INSERT INTO workspace_ids (workspace_id, is_active) VALUES (?, 0) ON CONFLICT(workspace_id) DO NOTHING", args: [wsId] });
    await clearState(env, chatId);
    await ctx.reply(`✅ Workspace \`${wsId}\` berhasil ditambahkan.`, { parse_mode: 'Markdown' });
    return sendAdminMenu(ctx);
  }

  if (state === 'WAITING_REMOVE_WS') {
    const wsId = text.trim();
    await db.execute({ sql: "DELETE FROM workspace_ids WHERE workspace_id = ?", args: [wsId] });
    await clearState(env, chatId);
    await ctx.reply(`✅ Workspace \`${wsId}\` berhasil dihapus (jika ada).`, { parse_mode: 'Markdown' });
    return sendAdminMenu(ctx);
  }

  if (state === 'WAITING_ACTIVATE_WS') {
    const wsId = text.trim();
    await db.execute("UPDATE workspace_ids SET is_active = 0");
    await db.execute({ sql: "UPDATE workspace_ids SET is_active = 1 WHERE workspace_id = ?", args: [wsId] });
    await clearState(env, chatId);
    await ctx.reply(`✅ Workspace \`${wsId}\` sekarang aktif.`, { parse_mode: 'Markdown' });
    return sendAdminMenu(ctx);
  }

  if (state === 'WAITING_FORCE_SUB_1') {
    const channelId = text.trim();
    if (channelId.toLowerCase() !== 'skip') {
      await db.execute({ sql: "INSERT INTO settings (key, value) VALUES ('force_sub_1', ?) ON CONFLICT(key) DO UPDATE SET value = ?", args: [channelId, channelId] });
    }
    await setState(env, chatId, 'WAITING_FORCE_SUB_2');
    return ctx.reply("Lanjut! Kirim Username Channel (contoh `@channelku`) atau ID Channel (contoh `-100123...`) untuk *Syarat Join 2*:\n(Ketik `skip` jika tidak ingin diisi)", { parse_mode: 'Markdown', reply_markup: new Keyboard().text("🔙 Batal").resized() });
  }

  if (state === 'WAITING_FORCE_SUB_2') {
    const channelId = text.trim();
    if (channelId.toLowerCase() !== 'skip') {
      await db.execute({ sql: "INSERT INTO settings (key, value) VALUES ('force_sub_2', ?) ON CONFLICT(key) DO UPDATE SET value = ?", args: [channelId, channelId] });
    }
    await clearState(env, chatId);
    await ctx.reply("✅ Syarat Wajib Sub berhasil disimpan!", { parse_mode: 'Markdown' });
    return sendAdminMenu(ctx);
  }
  
  return false;
}

// ==========================================
// BACKGROUND WORKER: RECURSIVE CHUNKING
// ==========================================
export async function processBroadcastChunk(env, payload, origin) {
  const { adminChatId, msgId, offset, successCount } = payload;
  const db = getDb(env);
  const CHUNK_SIZE = 40;

  try {
    // Ambil 40 user berdasarkan urutan
    const result = await db.execute({
      sql: `SELECT telegram_id FROM users ORDER BY id LIMIT ? OFFSET ?`,
      args: [CHUNK_SIZE, offset]
    });
    const users = result.rows;
    
    // Jika habis, lapor ke admin
    if (users.length === 0) {
      const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId,
          text: `✅ *Broadcast Selesai Total!*\nTotal Pesan Sukses Terkirim: ${successCount}`,
          parse_mode: 'Markdown'
        })
      });
      return;
    }

    let currentSuccess = 0;
    
    // Eksekusi copyMessage untuk 40 user (Batas aman < 50 subrequests)
    for (const u of users) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/copyMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: u.telegram_id,
            from_chat_id: adminChatId,
            message_id: msgId
          })
        });
        if (res.ok) currentSuccess++;
      } catch (e) {}
    }

    // Panggil diri sendiri (Estafet) untuk chunk berikutnya
    const nextPayload = {
      adminChatId,
      msgId,
      offset: offset + CHUNK_SIZE,
      successCount: successCount + currentSuccess
    };

    await fetch(origin + '/internal/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': env.TELEGRAM_BOT_TOKEN
      },
      body: JSON.stringify(nextPayload)
    });

  } catch (err) {
    console.error("Chunk Error:", err);
  }
}
