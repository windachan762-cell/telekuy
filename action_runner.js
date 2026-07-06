const { runInviteScript } = require('./puppeteer_core');
const TelegramBotObj = require('node-telegram-bot-api');
const TelegramBot = TelegramBotObj.default || TelegramBotObj;

// Baca dari environment variable yang diinject GitHub Actions
const chatId = process.env.CHAT_ID;
const cookieString = process.env.COOKIE_STRING;
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!chatId || !cookieString || !token) {
  console.error("Missing environment variables!");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

(async () => {
  try {
    console.log(`Menjalankan Puppeteer untuk Chat ID: ${chatId}...`);
    bot.sendMessage(chatId, "⚙️ Memproses undangan di GitHub Actions...");
    
    const result = await runInviteScript(cookieString);
    
    // Kirim pesan akhir ke user
    if (result.success) {
      await bot.sendMessage(chatId, `✅ Sukses: ${result.message}`);
    } else {
      await bot.sendMessage(chatId, `❌ Gagal: ${result.message}`);
    }
    
    console.log("Selesai!");
  } catch (error) {
    console.error(error);
    await bot.sendMessage(chatId, `❌ Terjadi kesalahan internal: ${error.message}`);
  } finally {
    process.exit(0);
  }
})();
