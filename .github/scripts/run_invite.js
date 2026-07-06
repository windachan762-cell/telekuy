require('dotenv').config();
const { runInviteScript } = require('../../puppeteer_core');
const { db, initDB } = require('../../database');
const TelegramBotObj = require('node-telegram-bot-api');
const TelegramBot = TelegramBotObj.default || TelegramBotObj;

(async () => {
  const cookieStr = process.env.COOKIE;
  const email = process.env.EMAIL;
  const userId = process.env.USER_ID;
  const workspaceId = process.env.WORKSPACE_ID; // Meskipun puppeteer_core saat ini hardcoded, di masa depan bisa dipassing
  const chatId = process.env.CHAT_ID;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!cookieStr || !email || !userId || !chatId || !botToken) {
    console.error("Missing required environment variables.");
    process.exit(1);
  }

  const bot = new TelegramBot(botToken, { polling: false });

  try {
    console.log(`Menjalankan invite untuk email: ${email}, user: ${userId}, workspace: ${workspaceId}`);
    
    // Pastikan database siap
    await initDB();

    const result = await runInviteScript(cookieStr);
    const logChannel = await db.getSetting('log_channel');

    if (result.success) {
      console.log("✅ Invite sukses!");
      await db.addInviteHistory(userId, email, 'SUCCESS');
      await bot.sendMessage(chatId, `✅ *SUCCESS!* Invite ke workspace berhasil dikirim ke email: \`${email}\`\n\nSilakan cek inbox/spam email Anda.`, { parse_mode: 'Markdown' });
      
      if (logChannel) {
        await bot.sendMessage(logChannel, `✅ [BERHASIL] User \`${userId}\` berhasil invite Email: ${email}`, { parse_mode: 'Markdown' }).catch(()=>{});
      }
    } else {
      console.error("❌ Invite gagal:", result.message);
      
      // Kembalikan koin (Refund)
      await db.updateCoins(userId, 1);
      
      let errMsg = `❌ *Gagal mengirim invite!*\n\nAlasan: ${result.message}\n\nKoin Anda (1) telah dikembalikan.`;
      await bot.sendMessage(chatId, errMsg, { parse_mode: 'Markdown' });

      if (logChannel) {
        await bot.sendMessage(logChannel, `❌ [GAGAL] User \`${userId}\` gagal invite Email: ${email}.\nAlasan: ${result.message}\nKoin telah dikembalikan.`, { parse_mode: 'Markdown' }).catch(()=>{});
      }
    }
  } catch (error) {
    console.error("❌ Fatal error during run_invite:", error);
    try {
      await db.updateCoins(userId, 1); // Refund
      await bot.sendMessage(chatId, `❌ *Terjadi kesalahan sistem yang tidak terduga.*\n\nKoin Anda telah dikembalikan.`);
    } catch(e) {}
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
