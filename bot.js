require('dotenv').config();
const TelegramBotObj = require('node-telegram-bot-api');
const TelegramBot = TelegramBotObj.default || TelegramBotObj;

const { db, initDB } = require('./database');
const { setState, getState, updateStateData, clearState } = require('./stateManager');
const { addJob } = require('./queueManager');
const { handleAdminCommand, handleAdminState, sendAdminMenu, isAdmin } = require('./admin');

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
  
  // Format username untuk API
  const getSubLink = (val) => {
    if (!val) return null;
    let clean = val.replace(/[<>\[\]\s]/g, ''); // Hapus karakter ilegal
    if (clean.startsWith('-100')) return clean; // Private ID
    if (clean.startsWith('http') || clean.startsWith('t.me/')) {
      // Hapus query parameters seperti ?boost=1
      let urlParts = clean.split('?')[0];
      // Hapus trailing slash jika ada
      if (urlParts.endsWith('/')) urlParts = urlParts.slice(0, -1);
      return '@' + urlParts.split('/').pop().replace('+', ''); 
    }
    if (!clean.startsWith('@')) return '@' + clean;
    return clean;
  };

  const c1 = getSubLink(force1);
  const c2 = getSubLink(force2);

  if (c1) {
    try {
      const chatMember = await bot.getChatMember(c1, userId);
      if (['left', 'kicked'].includes(chatMember.status)) notJoined.push(force1);
    } catch (e) { 
      console.error(`Force sub 1 (${c1}) error:`, e.message); 
      notJoined.push(force1); // Blokir jika bot gagal cek (bot belum jadi admin)
    }
  }
  if (c2) {
    try {
      const chatMember = await bot.getChatMember(c2, userId);
      if (['left', 'kicked'].includes(chatMember.status)) notJoined.push(force2);
    } catch (e) { 
      console.error(`Force sub 2 (${c2}) error:`, e.message); 
      notJoined.push(force2); // Blokir jika bot gagal cek (bot belum jadi admin)
    }
  }

  if (notJoined.length > 0) {
    let msg = "⚠️ *Anda harus bergabung dengan channel/grup berikut untuk menggunakan bot ini:*\n\n";
    
    let inlineBtns = [];
    notJoined.forEach(c => {
      msg += `- ${c}\n`;
      let cleanC = c.replace(/[<>\[\]\s]/g, '');
      let link = cleanC.startsWith('http') || cleanC.startsWith('t.me/') ? cleanC : `https://t.me/${cleanC.replace('@', '')}`;
      if (!link.startsWith('http')) link = 'https://' + link;
      
      try {
        inlineBtns.push([{ text: `🔗 Gabung`, url: encodeURI(link) }]);
      } catch (err) {
        console.error("Invalid URL format generated:", link);
      }
    });
    
    msg += "\nJika sudah bergabung, klik tombol Cek Status di bawah ini.";
    inlineBtns.push([{ text: "🔄 Cek Status", callback_data: "check_sub" }]);

    bot.sendMessage(chatId, msg, { 
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineBtns }
    });
    return false;
  }
  return true;
}

// === Rate Limit Anti Spam ===
const userLastMessage = {};
function isSpam(userId) {
  const now = Date.now();
  if (userLastMessage[userId] && (now - userLastMessage[userId]) < 1000) {
    return true; 
  }
  userLastMessage[userId] = now;
  return false;
}

// === Tampilan Main Menu ===
async function sendMainMenu(chatId, userId) {
  clearState(chatId);
  const user = await db.getUser(userId);
  
  const keyboard = [
    [{ text: "🔄 Rubah Akun" }],
    [{ text: "👤 Profil" }, { text: "🏆 Leaderboard" }],
    [{ text: "📖 Tutorial" }]
  ];

  if (await isAdmin(userId)) {
    keyboard.push([{ text: "⚙️ Admin Panel" }]);
  }

  bot.sendMessage(chatId, `🤖 *Selamat Datang di Bot Auto-Invite ChatGPT Workspace!*\n\nKoin Anda saat ini: 💰 *${user.coins}*\n\nSilakan pilih menu di bawah ini:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: keyboard,
      resize_keyboard: true,
      persistent: true
    }
  });
}

// === Perintah /start ===
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (isSpam(userId)) return;

  const referrerId = match[1] || null;

  const existingUser = await db.getUser(userId);
  if (!existingUser) {
    await db.createUser(userId, msg.from.username, `${msg.from.first_name} ${msg.from.last_name || ''}`.trim(), referrerId);
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

// === Penanganan Callback Khusus Force Sub ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  
  if (query.data === "check_sub") {
    bot.answerCallbackQuery(query.id);
    if (await checkForceSub(chatId, userId)) {
      bot.sendMessage(chatId, "✅ Terimakasih telah bergabung!");
      sendMainMenu(chatId, userId);
    } else {
      bot.sendMessage(chatId, "❌ Anda belum bergabung di semua channel yang diwajibkan.");
    }
  }
});

// === Penanganan Input Text dan File (State Machine) ===
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) {
    // Tangani admin commands jika masih diakses manual (contoh: /bc)
    const args = msg.text.split(' ');
    const cmd = args.shift();
    if (['/clearsub', '/bc', '/settutor'].includes(cmd)) {
      if (await isAdmin(msg.from.id)) {
        return handleAdminCommand(bot, msg, cmd, args);
      }
    }
    // Command menu lain akan diarahkan via tombol. Abaikan saja.
    if(cmd === '/start') return;
  }

  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (isSpam(userId)) return;

  // Tangani Cek Menu Bawah
  const text = msg.text;
  if (text === "🔙 Kembali ke Menu Utama" || text === "🔙 Batal") {
    return sendMainMenu(chatId, userId);
  }

  if (!(await checkForceSub(chatId, userId))) return;

  if (text === "👤 Profil") {
    const user = await db.getUser(userId);
    const botInfo = await bot.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=${userId}`;
    const invitedEmails = await db.getInvitedEmails(userId);
    
    let profileTxt = `👤 *PROFIL AKUN*\n\n`;
    profileTxt += `Nama: ${user.full_name}\n`;
    profileTxt += `ID: \`${userId}\`\n`;
    profileTxt += `Koin: 💰 ${user.coins}\n\n`;
    profileTxt += `🔗 *Link Referral:*\n\`${refLink}\`\n_(Undang 1 teman = 1 Koin gratis)_\n\n`;
    
    profileTxt += `📧 *Riwayat Invite Sukses (${invitedEmails.length}):*\n`;
    if (invitedEmails.length === 0) profileTxt += "- Belum ada\n";
    else invitedEmails.slice(0, 10).forEach(e => profileTxt += `- ${e.email}\n`); 
    return bot.sendMessage(chatId, profileTxt, { parse_mode: 'Markdown' });
  }

  if (text === "🏆 Leaderboard") {
    const tops = await db.getLeaderboard();
    let leadTxt = `🏆 *TOP 10 SULTAN KOIN*\n\n`;
    tops.forEach((t, i) => {
      leadTxt += `${i+1}. ${t.full_name || t.username} (\`${t.telegram_id}\`) - 💰 ${t.coins}\n`;
    });
    return bot.sendMessage(chatId, leadTxt, { parse_mode: 'Markdown' });
  }

  if (text === "📖 Tutorial") {
    const tutData = await db.getSetting('tutorial_msg');
    if (tutData) {
      try {
        const { chat_id, message_id } = JSON.parse(tutData);
        return bot.copyMessage(chatId, chat_id, message_id);
      } catch(e) {
        return bot.sendMessage(chatId, "❌ Tutorial belum di-set dengan benar.");
      }
    }
    return bot.sendMessage(chatId, "Belum ada tutorial yang di-set oleh Admin.");
  }

  if (text === "⚙️ Admin Panel") {
    if (!(await isAdmin(userId))) return bot.sendMessage(chatId, "❌ Akses Ditolak!");
    return sendAdminMenu(bot, chatId);
  }

  if (text === "🔄 Rubah Akun") {
    const user = await db.getUser(userId);
    if (user.coins < 1) {
      return bot.sendMessage(chatId, "❌ Koin Anda tidak cukup. Undang teman menggunakan link referral Anda untuk mendapatkan koin.");
    }
    const wsId = await db.getActiveWorkspace();
    if (!wsId) return bot.sendMessage(chatId, "❌ Sistem sedang pemeliharaan. Tidak ada Workspace ID yang aktif.");

    setState(chatId, 'WAITING_FOR_EMAIL', { wsId: wsId });
    return bot.sendMessage(chatId, "⚠️ *Peringatan:* Gunakan Gmail cadangan, JANGAN gunakan akun utama Anda!\n\nSilakan kirimkan *ALAMAT EMAIL* Anda (cukup emailnya saja, tanpa password).", { 
      parse_mode: 'Markdown',
      reply_markup: { keyboard: [[{ text: "🔙 Batal" }]], resize_keyboard: true }
    });
  }

  const stateObj = getState(chatId);

  // Jika sedang berada di State Admin ATAU menekan tombol Admin Menu
  const adminMenus = [
    "📢 Broadcast", "🎁 Give Koin", "🏢 Kelola Workspace",
    "📖 Set Tutorial", "🔒 Set Wajib Sub", "🔓 Hapus Wajib Sub",
    "➕ Tambah WS", "❌ Hapus WS", "👉 Set Aktif WS"
  ];

  if ((stateObj.state && stateObj.state.startsWith('ADMIN_')) || adminMenus.includes(text)) {
    if (await isAdmin(userId)) {
      return handleAdminState(bot, msg, stateObj);
    }
  }

  if (stateObj.state === 'WAITING_FOR_EMAIL') {
    if (!msg.text) return bot.sendMessage(chatId, "Kirimkan teks berupa alamat email Anda.");
    
    updateStateData(chatId, { email: msg.text.trim() });
    setState(chatId, 'WAITING_FOR_COOKIE', stateObj.data);
    
    return bot.sendMessage(chatId, "✅ Email diterima. Sekarang, silakan kirimkan *file cookie (.txt)* Anda.", { parse_mode: 'Markdown' });
  
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
    
    addJob(bot, {
      chatId: chatId,
      telegramId: userId,
      email: email,
      cookieText: cookieText,
      workspaceId: wsId
    });
    
    // Kembalikan ke menu utama setelah sukses queue
    return sendMainMenu(chatId, userId);
  }
});

console.log("Bot local berjalan dengan UI baru...");
