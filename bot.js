require('dotenv').config();
const TelegramBotObj = require('node-telegram-bot-api');
const TelegramBot = TelegramBotObj.default || TelegramBotObj;

const { db, initDB } = require('./database');
const { setState, getState, updateStateData, clearState } = require('./stateManager');
const { addJob } = require('./queueManager');
const { handleAdminCommand, isAdmin } = require('./admin');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN belum disetel di .env");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// === Inisialisasi Database ===
initDB();

// === Helper Force Sub ===
async function checkForceSub(chatId, userId) {
  const force1 = await db.getSetting('force_sub_1');
  const force2 = await db.getSetting('force_sub_2');
  
  let notJoined = [];
  
  if (force1) {
    try {
      const chatMember = await bot.getChatMember(force1, userId);
      if (['left', 'kicked'].includes(chatMember.status)) notJoined.push(force1);
    } catch (e) { console.error("Force sub 1 error:", e.message); }
  }
  if (force2) {
    try {
      const chatMember = await bot.getChatMember(force2, userId);
      if (['left', 'kicked'].includes(chatMember.status)) notJoined.push(force2);
    } catch (e) { console.error("Force sub 2 error:", e.message); }
  }

  if (notJoined.length > 0) {
    let msg = "⚠️ *Anda harus bergabung dengan channel/grup berikut untuk menggunakan bot ini:*\n\n";
    notJoined.forEach(c => msg += `- ${c}\n`);
    msg += "\nJika sudah bergabung, silakan tekan /start kembali.";
    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return false;
  }
  return true;
}

// === Rate Limit Anti Spam ===
const userLastMessage = {};
function isSpam(userId) {
  const now = Date.now();
  if (userLastMessage[userId] && (now - userLastMessage[userId]) < 1000) {
    return true; // Kurang dari 1 detik
  }
  userLastMessage[userId] = now;
  return false;
}

// === Tampilan Main Menu ===
async function sendMainMenu(chatId, userId) {
  clearState(chatId);
  const user = await db.getUser(userId);
  
  const keyboard = {
    inline_keyboard: [
      [{ text: "🔄 Rubah Akun (1 Koin)", callback_data: "menu_rubah" }],
      [{ text: "👤 Akun / Profil", callback_data: "menu_profil" }, { text: "🏆 Leaderboard", callback_data: "menu_leaderboard" }],
      [{ text: "📖 Tutorial", callback_data: "menu_tutorial" }]
    ]
  };

  if (await isAdmin(userId)) {
    keyboard.inline_keyboard.push([{ text: "⚙️ Admin Panel", callback_data: "menu_admin" }]);
  }

  bot.sendMessage(chatId, `🤖 *Selamat Datang di Bot Auto-Invite ChatGPT Workspace!*\n\nKoin Anda saat ini: 💰 *${user.coins}*\n\nSilakan pilih menu di bawah ini:`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

// === Perintah /start ===
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (isSpam(userId)) return;

  const referrerId = match[1] || null;

  // Cek apakah user baru
  const existingUser = await db.getUser(userId);
  if (!existingUser) {
    await db.createUser(userId, msg.from.username, `${msg.from.first_name} ${msg.from.last_name || ''}`.trim(), referrerId);
    
    // Beri koin referral jika ada
    if (referrerId && referrerId !== userId) {
      try {
        await db.updateCoins(referrerId, 1);
        bot.sendMessage(referrerId, `🎉 *Bonus Referral!* Seseorang menggunakan link Anda. Anda mendapat +1 Koin!`, { parse_mode: 'Markdown' });
      } catch(e) {}
    }
  }

  if (!(await checkForceSub(chatId, userId))) return;

  sendMainMenu(chatId, userId);
});

// === Penanganan Callback dari Tombol ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const data = query.data;
  
  if (isSpam(userId)) return bot.answerCallbackQuery(query.id, { text: "Lambat dikit! Jangan spam tombol." });
  
  if (!(await checkForceSub(chatId, userId))) {
    return bot.answerCallbackQuery(query.id);
  }

  // Acknowledge the callback
  bot.answerCallbackQuery(query.id);

  if (data === "menu_profil") {
    const user = await db.getUser(userId);
    const botInfo = await bot.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=${userId}`;
    const invitedEmails = await db.getInvitedEmails(userId);
    
    let text = `👤 *PROFIL AKUN*\n\n`;
    text += `Nama: ${user.full_name}\n`;
    text += `ID: \`${userId}\`\n`;
    text += `Koin: 💰 ${user.coins}\n\n`;
    text += `🔗 *Link Referral:*\n\`${refLink}\`\n_(Undang 1 teman = 1 Koin gratis)_\n\n`;
    
    text += `📧 *Riwayat Invite Sukses (${invitedEmails.length}):*\n`;
    if (invitedEmails.length === 0) text += "- Belum ada\n";
    else invitedEmails.slice(0, 10).forEach(e => text += `- ${e.email}\n`); // Max tampil 10

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

  } else if (data === "menu_leaderboard") {
    const tops = await db.getLeaderboard();
    let text = `🏆 *TOP 10 SULTAN KOIN*\n\n`;
    tops.forEach((t, i) => {
      text += `${i+1}. ${t.full_name || t.username} (\`${t.telegram_id}\`) - 💰 ${t.coins}\n`;
    });
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

  } else if (data === "menu_tutorial") {
    const tutData = await db.getSetting('tutorial_msg');
    if (tutData) {
      try {
        const { chat_id, message_id } = JSON.parse(tutData);
        bot.copyMessage(chatId, chat_id, message_id);
      } catch(e) {
        bot.sendMessage(chatId, "❌ Tutorial belum di-set dengan benar.");
      }
    } else {
      bot.sendMessage(chatId, "Belum ada tutorial yang di-set oleh Admin.");
    }

  } else if (data === "menu_admin") {
    if (!(await isAdmin(userId))) return bot.sendMessage(chatId, "❌ Akses Ditolak!");
    
    let adminText = "⚙️ *ADMIN PANEL*\n\n";
    adminText += "Gunakan perintah-perintah berikut dengan mengetikkannya di chat:\n\n";
    adminText += "📢 `/bc` : Broadcast (Reply pesan yang ingin dibroadcast)\n";
    adminText += "🎁 `/give <id> <jumlah>` : Tambah koin user\n";
    adminText += "🏢 `/id` : Kelola Workspace ID (Tambah/Hapus/Aktif)\n";
    adminText += "📖 `/settutorial` : Set tutorial (Reply pesan tutorialnya)\n";
    adminText += "🔒 `/setsub <grup1> [grup2]` : Set Wajib Subscribe (Maks 2)\n";
    adminText += "🔓 `/clearsub` : Hapus Wajib Subscribe\n";
    
    bot.sendMessage(chatId, adminText, { parse_mode: 'Markdown' });

  } else if (data === "menu_rubah") {
    const user = await db.getUser(userId);
    if (user.coins < 1) {
      return bot.sendMessage(chatId, "❌ Koin Anda tidak cukup. Undang teman menggunakan link referral Anda untuk mendapatkan koin.");
    }

    const wsId = await db.getActiveWorkspace();
    if (!wsId) {
      return bot.sendMessage(chatId, "❌ Sistem sedang pemeliharaan. Tidak ada Workspace ID yang aktif.");
    }

    setState(chatId, 'WAITING_FOR_EMAIL', { wsId: wsId });
    bot.sendMessage(chatId, "⚠️ *Peringatan:* Gunakan Gmail cadangan, JANGAN gunakan akun utama Anda!\n\nSilakan kirimkan *ALAMAT EMAIL* Anda (cukup emailnya saja, tanpa password).", { parse_mode: 'Markdown' });
  }
});

// === Penanganan Input Text dan File (State Machine) ===
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) {
    // Tangani admin commands
    const args = msg.text.split(' ');
    const cmd = args.shift();
    if (['/bc', '/give', '/setch', '/settutorial', '/setsub', '/clearsub', '/id'].includes(cmd)) {
      return handleAdminCommand(bot, msg, cmd, args);
    }
    return; // Command lain diabaikan
  }

  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (isSpam(userId)) return;

  const stateObj = getState(chatId);

  if (stateObj.state === 'WAITING_FOR_EMAIL') {
    if (!msg.text) return bot.sendMessage(chatId, "Kirimkan teks berupa alamat email Anda.");
    
    updateStateData(chatId, { email: msg.text.trim() });
    setState(chatId, 'WAITING_FOR_COOKIE', stateObj.data);
    
    bot.sendMessage(chatId, "✅ Email diterima. Sekarang, silakan kirimkan *file cookie (.txt)* Anda.", { parse_mode: 'Markdown' });
  
  } else if (stateObj.state === 'WAITING_FOR_COOKIE') {
    let cookieText = '';
    
    if (msg.document && msg.document.file_name.endsWith('.txt')) {
      bot.sendMessage(chatId, "📥 Mengunduh file cookie...");
      try {
        const fileUrl = await bot.getFileLink(msg.document.file_id);
        const res = await fetch(fileUrl);
        cookieText = await res.text();
      } catch (e) {
        return bot.sendMessage(chatId, `❌ Gagal mendownload file: ${e.message}`);
      }
    } else if (msg.text) {
      cookieText = msg.text;
    } else {
      return bot.sendMessage(chatId, "❌ Kirimkan file berakhiran .txt atau teks mentah cookie.");
    }

    const { email, wsId } = stateObj.data;
    clearState(chatId);

    // Tambah ke Antrian
    addJob(bot, {
      chatId: chatId,
      telegramId: userId,
      email: email,
      cookieText: cookieText,
      workspaceId: wsId
    });
  }
});

console.log("Bot local berjalan, menunggu pesan Telegram...");
