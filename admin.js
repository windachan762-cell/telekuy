const { db } = require('./database');
const { setState, clearState } = require('./stateManager');

async function isAdmin(telegramId) {
  const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
  return adminIds.includes(telegramId.toString());
}

async function sendAdminMenu(bot, chatId) {
  const keyboard = [
    [{ text: "📢 Broadcast" }, { text: "🎁 Give Koin" }],
    [{ text: "🏢 Kelola Workspace" }, { text: "📖 Set Tutorial" }],
    [{ text: "🔒 Set Wajib Sub" }, { text: "🔓 Hapus Wajib Sub" }],
    [{ text: "📊 Kelola Log" }, { text: "📤 Backup DB" }],
    [{ text: "📥 Restore DB" }, { text: "🔙 Kembali ke Menu Utama" }]
  ];

  bot.sendMessage(chatId, "⚙️ *ADMIN PANEL*\nSilakan pilih menu di bawah ini:", {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: keyboard,
      resize_keyboard: true,
      persistent: true
    }
  });
}

// Fallback jika admin masih pakai command lama manual
async function handleAdminCommand(bot, msg, command, args) {
  const chatId = msg.chat.id;
  if (command === '/clearsub') {
    await db.deleteSetting('force_sub_1');
    await db.deleteSetting('force_sub_2');
    bot.sendMessage(chatId, "✅ Syarat subscribe dihapus.");
  }
  
  if (command === '/bc' || command === '/settutor') {
    if (!msg.reply_to_message) {
      return bot.sendMessage(chatId, `❌ Mohon reply pesan yang ingin digunakan dengan perintah ${command}`);
    }

    if (command === '/bc') {
      try {
        const users = (await db.client.execute("SELECT telegram_id FROM users")).rows;
        let success = 0, fail = 0;
        bot.sendMessage(chatId, `Mulai broadcast ke ${users.length} user...`);
        for (const user of users) {
          try {
            await bot.copyMessage(user.telegram_id, chatId, msg.reply_to_message.message_id);
            success++;
          } catch (e) { fail++; }
        }
        return bot.sendMessage(chatId, `✅ Broadcast Selesai.\nSukses: ${success}\nGagal: ${fail}`);
      } catch (err) { return bot.sendMessage(chatId, "❌ Error broadcast: " + err.message); }
    }

    if (command === '/settutor') {
      const tutorialData = {
        chat_id: chatId.toString(),
        message_id: msg.reply_to_message.message_id
      };
      await db.setSetting('tutorial_msg', JSON.stringify(tutorialData));
      return bot.sendMessage(chatId, `✅ Tutorial berhasil diatur.`);
    }
  }
}

// Menangani State-Driven Admin Menu
async function handleAdminState(bot, msg, stateObj) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = stateObj.state;

  // Tangani Cek Teks Tombol Admin
  if (text === "📢 Broadcast") {
    setState(chatId, 'ADMIN_BC_WAIT_MSG');
    return bot.sendMessage(chatId, "Silakan ketik atau teruskan (forward) pesan yang ingin dibroadcast ke semua user:", {
      reply_markup: { keyboard: [[{ text: "🔙 Batal" }]], resize_keyboard: true }
    });
  }
  if (text === "🎁 Give Koin") {
    setState(chatId, 'ADMIN_GIVE_WAIT_ID');
    return bot.sendMessage(chatId, "Masukkan *ID Telegram* pengguna yang ingin diberi koin:", {
      parse_mode: 'Markdown',
      reply_markup: { keyboard: [[{ text: "🔙 Batal" }]], resize_keyboard: true }
    });
  }
  if (text === "🏢 Kelola Workspace") {
    return handleWorkspaceMenu(bot, chatId);
  }
  if (text === "📖 Set Tutorial") {
    setState(chatId, 'ADMIN_TUTORIAL_WAIT_MSG');
    return bot.sendMessage(chatId, "Silakan kirim pesan (teks/gambar/file) yang akan dijadikan isi tombol Tutorial:", {
      reply_markup: { keyboard: [[{ text: "🔙 Batal" }]], resize_keyboard: true }
    });
  }
  if (text === "🔒 Set Wajib Sub") {
    const cur1 = await db.getSetting('force_sub_1');
    setState(chatId, 'ADMIN_SUB_1_WAIT');
    let msg = `*PENGATURAN WAJIB SUBSCRIBE (1/2)*\n\nSaat ini: ${cur1 || 'Belum di-set'}\n\nSilakan ketik Link atau Username untuk Grup 1:`;
    return bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: { keyboard: [[{ text: "⏭️ Lewati" }, { text: "🗑️ Hapus Sub 1" }], [{ text: "🔙 Batal" }]], resize_keyboard: true }
    });
  }
  if (text === "🔓 Hapus Wajib Sub") {
    await db.deleteSetting('force_sub_1');
    await db.deleteSetting('force_sub_2');
    return bot.sendMessage(chatId, "✅ Seluruh syarat join channel (Force Sub) berhasil dihapus.");
  }
  
  if (text === "📊 Kelola Log") {
    const curLog = await db.getSetting('log_channel');
    setState(chatId, 'ADMIN_LOG_WAIT_ID');
    let msgStr = `*PENGATURAN CHANNEL LOG*\n\nSaat ini: ${curLog || 'Belum di-set'}\n\nSilakan kirimkan ID Channel atau Username (contoh: -100123456789 atau @logku):`;
    return bot.sendMessage(chatId, msgStr, {
      parse_mode: 'Markdown',
      reply_markup: { keyboard: [[{ text: "🗑️ Hapus Log" }], [{ text: "🔙 Batal" }]], resize_keyboard: true }
    });
  }

  if (text === "📤 Backup DB") {
    bot.sendMessage(chatId, "⏳ Memproses backup...");
    try {
      const jsonData = await db.exportData();
      const date = new Date();
      const d = String(date.getDate()).padStart(2, '0');
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const y = date.getFullYear();
      const filename = `backup_${d}_${m}_${y}.json`;
      
      const fileBuffer = Buffer.from(jsonData, 'utf-8');
      await bot.sendDocument(chatId, fileBuffer, { caption: "📦 Backup Database Turso Selesai!" }, { filename: filename, contentType: 'application/json' });
      
      const logChannel = await db.getSetting('log_channel');
      if (logChannel) {
        try {
          await bot.sendDocument(logChannel, fileBuffer, { caption: "📦 Auto/Manual Backup" }, { filename: filename, contentType: 'application/json' });
        } catch(e) {}
      }
    } catch(err) {
      bot.sendMessage(chatId, "❌ Gagal backup: " + err.message);
    }
    return sendAdminMenu(bot, chatId);
  }

  if (text === "📥 Restore DB") {
    setState(chatId, 'ADMIN_RESTORE_WAIT_FILE');
    return bot.sendMessage(chatId, "⚠️ *PERINGATAN BAHAYA!*\n\nData saat ini akan DIHAPUS TOTAL dan digantikan oleh file backup.\n\nKirimkan file `backup_*.json` sekarang:", {
      parse_mode: 'Markdown',
      reply_markup: { keyboard: [[{ text: "🔙 Batal" }]], resize_keyboard: true }
    });
  }

  // Menangani input berdasarkan state
  if (state === 'ADMIN_LOG_WAIT_ID') {
    if (text === "🗑️ Hapus Log") {
      await db.deleteSetting('log_channel');
      bot.sendMessage(chatId, "✅ Channel Log berhasil dihapus.");
    } else {
      await db.setSetting('log_channel', text);
      bot.sendMessage(chatId, `✅ Channel Log diset ke: ${text}\nPastikan bot sudah dijadikan admin di channel tersebut!`);
    }
    clearState(chatId);
    return sendAdminMenu(bot, chatId);
  }

  if (state === 'ADMIN_RESTORE_WAIT_FILE') {
    if (msg.document && msg.document.file_name.endsWith('.json')) {
      bot.sendMessage(chatId, "⏳ Mengunduh file backup...");
      try {
        const fileUrl = await bot.getFileLink(msg.document.file_id);
        const res = await fetch(fileUrl);
        const jsonData = await res.text();
        
        bot.sendMessage(chatId, "🔄 Merestore database ke Turso...");
        await db.importData(jsonData);
        bot.sendMessage(chatId, "✅ Restore Database Berhasil!");
      } catch (err) {
        bot.sendMessage(chatId, `❌ Gagal restore: ${err.message}`);
      }
    } else {
      bot.sendMessage(chatId, "❌ File tidak valid, batalkan atau kirim file .json");
      return;
    }
    clearState(chatId);
    return sendAdminMenu(bot, chatId);
  }

  if (state === 'ADMIN_BC_WAIT_MSG') {
    try {
      const users = (await db.client.execute("SELECT telegram_id FROM users")).rows;
      let success = 0, fail = 0;
      bot.sendMessage(chatId, `Mulai broadcast ke ${users.length} user...`);
      for (const user of users) {
        try {
          await bot.copyMessage(user.telegram_id, chatId, msg.message_id);
          success++;
        } catch (e) { fail++; }
      }
      bot.sendMessage(chatId, `✅ Broadcast Selesai.\nSukses: ${success}\nGagal: ${fail}`);
    } catch (err) { bot.sendMessage(chatId, "❌ Error broadcast: " + err.message); }
    clearState(chatId);
    return sendAdminMenu(bot, chatId);
  }

  if (state === 'ADMIN_GIVE_WAIT_ID') {
    if (!text) return bot.sendMessage(chatId, "Masukkan ID berupa angka.");
    setState(chatId, 'ADMIN_GIVE_WAIT_AMOUNT', { targetId: text });
    return bot.sendMessage(chatId, "Masukkan *jumlah koin* yang ingin diberikan:", { parse_mode: 'Markdown' });
  }
  
  if (state === 'ADMIN_GIVE_WAIT_AMOUNT') {
    const amount = parseInt(text);
    if (isNaN(amount)) return bot.sendMessage(chatId, "Jumlah koin tidak valid. Harus angka.");
    
    const targetId = stateObj.data.targetId;
    try {
      const targetUser = await db.getUser(targetId);
      if (!targetUser) {
        bot.sendMessage(chatId, "User tidak ditemukan di database.");
      } else {
        await db.updateCoins(targetId, amount);
        bot.sendMessage(chatId, `✅ Berhasil menambahkan ${amount} koin ke ID ${targetId}.`);
        bot.sendMessage(targetId, `🎁 Selamat! Anda mendapatkan ${amount} koin dari Admin.`);
      }
    } catch (err) {}
    clearState(chatId);
    return sendAdminMenu(bot, chatId);
  }

  if (state === 'ADMIN_TUTORIAL_WAIT_MSG') {
    const tutorialData = {
      chat_id: chatId.toString(),
      message_id: msg.message_id
    };
    await db.setSetting('tutorial_msg', JSON.stringify(tutorialData));
    bot.sendMessage(chatId, `✅ Tutorial berhasil diatur.`);
    clearState(chatId);
    return sendAdminMenu(bot, chatId);
  }

  if (state === 'ADMIN_SUB_1_WAIT') {
    if (text === "🗑️ Hapus Sub 1") {
      await db.deleteSetting('force_sub_1');
      bot.sendMessage(chatId, "✅ Sub 1 berhasil dihapus.");
    } else if (text !== "⏭️ Lewati") {
      await db.setSetting('force_sub_1', text);
      bot.sendMessage(chatId, `✅ Sub 1 diset ke: ${text}`);
    }
    
    const cur2 = await db.getSetting('force_sub_2');
    setState(chatId, 'ADMIN_SUB_2_WAIT');
    let msg2 = `*PENGATURAN WAJIB SUBSCRIBE (2/2)*\n\nSaat ini: ${cur2 || 'Belum di-set'}\n\nSilakan ketik Link atau Username untuk Grup 2:`;
    return bot.sendMessage(chatId, msg2, {
      parse_mode: 'Markdown',
      reply_markup: { keyboard: [[{ text: "⏭️ Lewati" }, { text: "🗑️ Hapus Sub 2" }], [{ text: "🔙 Batal" }]], resize_keyboard: true }
    });
  }

  if (state === 'ADMIN_SUB_2_WAIT') {
    if (text === "🗑️ Hapus Sub 2") {
      await db.deleteSetting('force_sub_2');
      bot.sendMessage(chatId, "✅ Sub 2 berhasil dihapus.");
    } else if (text !== "⏭️ Lewati") {
      await db.setSetting('force_sub_2', text);
      bot.sendMessage(chatId, `✅ Sub 2 diset ke: ${text}`);
    }
    
    bot.sendMessage(chatId, "✅ Selesai mengatur Wajib Subscribe.");
    clearState(chatId);
    return sendAdminMenu(bot, chatId);
  }

  // --- Kelola Workspace States ---
  if (state === 'ADMIN_WS_ADD') {
    if (!text) return bot.sendMessage(chatId, "Kirimkan Workspace ID berupa teks.");
    await db.addWorkspace(text);
    const workspaces = await db.getWorkspaces();
    if (workspaces.length === 1) await db.setActiveWorkspace(text);
    bot.sendMessage(chatId, `✅ Workspace ID ${text} berhasil ditambahkan.`);
    clearState(chatId);
    return handleWorkspaceMenu(bot, chatId);
  }
  
  if (state === 'ADMIN_WS_DEL') {
    await db.deleteWorkspace(text);
    bot.sendMessage(chatId, `✅ Workspace ID ${text} berhasil dihapus.`);
    clearState(chatId);
    return handleWorkspaceMenu(bot, chatId);
  }
  
  if (state === 'ADMIN_WS_SET') {
    await db.setActiveWorkspace(text);
    bot.sendMessage(chatId, `✅ Workspace ID ${text} berhasil diset aktif.`);
    clearState(chatId);
    return handleWorkspaceMenu(bot, chatId);
  }

  // Jika tombol yang ditekan adalah Kelola Workspace menu
  if (text === "➕ Tambah WS") {
    setState(chatId, 'ADMIN_WS_ADD');
    return bot.sendMessage(chatId, "Masukkan Workspace ID baru:", { reply_markup: { keyboard: [[{ text: "🔙 Batal" }]], resize_keyboard: true } });
  }
  if (text === "❌ Hapus WS") {
    setState(chatId, 'ADMIN_WS_DEL');
    return bot.sendMessage(chatId, "Masukkan Workspace ID yang ingin dihapus:", { reply_markup: { keyboard: [[{ text: "🔙 Batal" }]], resize_keyboard: true } });
  }
  if (text === "👉 Set Aktif WS") {
    setState(chatId, 'ADMIN_WS_SET');
    return bot.sendMessage(chatId, "Masukkan Workspace ID yang ingin diset aktif:", { reply_markup: { keyboard: [[{ text: "🔙 Batal" }]], resize_keyboard: true } });
  }
}

async function handleWorkspaceMenu(bot, chatId) {
  const workspaces = await db.getWorkspaces();
  let wsText = "🏢 *Daftar Workspace ID:*\n\n";
  if (workspaces.length === 0) wsText += "_Belum ada data._\n";
  for (const w of workspaces) {
    wsText += `- \`${w.workspace_id}\` ${w.is_active ? '✅ (Aktif)' : ''}\n`;
  }
  
  bot.sendMessage(chatId, wsText, { 
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [
        [{ text: "➕ Tambah WS" }, { text: "❌ Hapus WS" }, { text: "👉 Set Aktif WS" }],
        [{ text: "⚙️ Admin Panel" }] // Kembali ke admin
      ],
      resize_keyboard: true
    }
  });
}

module.exports = { handleAdminCommand, handleAdminState, sendAdminMenu, isAdmin };
