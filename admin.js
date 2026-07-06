const { db } = require('./database');

async function isAdmin(telegramId) {
  const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
  return adminIds.includes(telegramId.toString());
}

async function handleAdminCommand(bot, msg, command, args) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  if (!(await isAdmin(telegramId))) {
    return bot.sendMessage(chatId, "❌ Akses ditolak. Anda bukan admin.");
  }

  switch (command) {
    case '/bc':
      if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, "Gunakan perintah /bc dengan me-reply pesan yang ingin dibroadcast.");
      }
      
      try {
        const users = (await db.client.execute("SELECT telegram_id FROM users")).rows;
        let success = 0, fail = 0;
        
        bot.sendMessage(chatId, `Mulai broadcast ke ${users.length} user...`);
        
        for (const user of users) {
          try {
            await bot.copyMessage(user.telegram_id, chatId, msg.reply_to_message.message_id);
            success++;
          } catch (e) {
            fail++;
          }
        }
        bot.sendMessage(chatId, `✅ Broadcast Selesai.\nSukses: ${success}\nGagal: ${fail}`);
      } catch (err) {
        bot.sendMessage(chatId, "❌ Error broadcast: " + err.message);
      }
      break;

    case '/give':
      if (args.length < 2) {
        return bot.sendMessage(chatId, "Format: /give <telegram_id> <jumlah_koin>");
      }
      const targetId = args[0];
      const amount = parseInt(args[1]);
      
      if (isNaN(amount)) return bot.sendMessage(chatId, "Jumlah koin tidak valid.");
      
      try {
        const targetUser = await db.getUser(targetId);
        if (!targetUser) return bot.sendMessage(chatId, "User tidak ditemukan di database.");
        
        await db.updateCoins(targetId, amount);
        bot.sendMessage(chatId, `✅ Berhasil menambahkan ${amount} koin ke ID ${targetId}.`);
        bot.sendMessage(targetId, `🎁 Selamat! Anda mendapatkan ${amount} koin dari Admin.`);
      } catch (err) {
        bot.sendMessage(chatId, "❌ Gagal give koin: " + err.message);
      }
      break;

    case '/setch':
      if (args.length < 1) return bot.sendMessage(chatId, "Format: /setch <channel_id_atau_username>");
      await db.setSetting('log_channel_id', args[0]);
      bot.sendMessage(chatId, `✅ Channel log diatur ke ${args[0]}`);
      break;

    case '/settutorial':
      if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, "Gunakan perintah /settutorial dengan me-reply pesan yang ingin dijadikan tutorial.");
      }
      // Kita simpan message_id dari pesan yang di-reply, dan chatId tempat pesan itu berada
      const tutorialData = {
        chat_id: chatId.toString(),
        message_id: msg.reply_to_message.message_id
      };
      await db.setSetting('tutorial_msg', JSON.stringify(tutorialData));
      bot.sendMessage(chatId, `✅ Tutorial berhasil diatur berdasarkan pesan yang Anda reply.`);
      break;

    case '/setsub':
      // bisa menerima 1 atau 2 channel. contoh: /setsub @channel1 @channel2
      if (args.length < 1) return bot.sendMessage(chatId, "Format: /setsub <channel1> [channel2]\nContoh: /setsub @grupku");
      if (args.length > 2) return bot.sendMessage(chatId, "Maksimal 2 channel/grup.");
      
      await db.setSetting('force_sub_1', args[0]);
      if (args.length === 2) {
        await db.setSetting('force_sub_2', args[1]);
      } else {
        await db.deleteSetting('force_sub_2');
      }
      bot.sendMessage(chatId, `✅ Channel wajib subscribe diatur ke:\n1. ${args[0]}\n2. ${args[1] || '(Tidak ada)'}`);
      break;
      
    case '/clearsub':
      await db.deleteSetting('force_sub_1');
      await db.deleteSetting('force_sub_2');
      bot.sendMessage(chatId, "✅ Syarat subscribe dihapus.");
      break;

    case '/id':
      const workspaces = await db.getWorkspaces();
      if (args.length > 0 && args[0] === 'add') {
        if (!args[1]) return bot.sendMessage(chatId, "Format: /id add <workspace_id>");
        await db.addWorkspace(args[1]);
        if (workspaces.length === 0) await db.setActiveWorkspace(args[1]); // Set active if it's the first one
        return bot.sendMessage(chatId, `✅ Workspace ID ${args[1]} ditambahkan.`);
      }
      
      if (args.length > 0 && args[0] === 'del') {
        if (!args[1]) return bot.sendMessage(chatId, "Format: /id del <workspace_id>");
        await db.deleteWorkspace(args[1]);
        return bot.sendMessage(chatId, `✅ Workspace ID ${args[1]} dihapus.`);
      }

      if (args.length > 0 && args[0] === 'set') {
        if (!args[1]) return bot.sendMessage(chatId, "Format: /id set <workspace_id>");
        await db.setActiveWorkspace(args[1]);
        return bot.sendMessage(chatId, `✅ Workspace aktif diubah ke ${args[1]}.`);
      }

      let wsText = "🏢 *Daftar Workspace ID:*\n\n";
      for (const w of workspaces) {
        wsText += `- \`${w.workspace_id}\` ${w.is_active ? '✅ (Aktif)' : ''}\n`;
      }
      wsText += "\n*Cara Mengelola:*\n";
      wsText += "➕ Tambah: `/id add <id_workspace>`\n";
      wsText += "❌ Hapus: `/id del <id_workspace>`\n";
      wsText += "👉 Set Aktif: `/id set <id_workspace>`";
      
      bot.sendMessage(chatId, wsText, { parse_mode: 'Markdown' });
      break;

    default:
      bot.sendMessage(chatId, "Perintah admin tidak dikenali.");
  }
}

module.exports = { handleAdminCommand, isAdmin };
