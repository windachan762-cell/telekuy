const { getLastBotMsgId, setLastBotMsgId } = require('./stateManager');

/**
 * Mengirim pesan dan secara otomatis menghapus pesan bot sebelumnya 
 * serta pesan input dari user (jika ID diberikan).
 */
async function sendCleanMessage(bot, chatId, text, options, userMsgId = null) {
  // Hapus input user
  if (userMsgId) {
    bot.deleteMessage(chatId, userMsgId).catch(() => {});
  }
  
  // Hapus pesan bot sebelumnya
  const lastId = getLastBotMsgId(chatId);
  if (lastId) {
    bot.deleteMessage(chatId, lastId).catch(() => {});
  }
  
  // Kirim pesan baru
  try {
    const sent = await bot.sendMessage(chatId, text, options);
    setLastBotMsgId(chatId, sent.message_id);
    return sent;
  } catch (err) {
    console.error("Gagal mengirim pesan bersih:", err.message);
    // Fallback jika gagal (misal tidak ada options)
    const sent = await bot.sendMessage(chatId, text);
    setLastBotMsgId(chatId, sent.message_id);
    return sent;
  }
}

module.exports = {
  sendCleanMessage
};
