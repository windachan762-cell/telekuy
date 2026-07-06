/**
 * PASTE KODE INI DI: https://script.google.com/
 * 
 * CARA DEPLOY:
 * 1. Buka script.google.com, buat project baru, paste kode ini.
 * 2. Ganti nilai GITHUB_TOKEN, GITHUB_REPO, dan TELEGRAM_TOKEN.
 * 3. Klik "Deploy" -> "New Deployment".
 * 4. Pilih type "Web app".
 * 5. Execute as "Me", Who has access "Anyone".
 * 6. Copy "Web app URL".
 * 7. Set Webhook Telegram bot Anda ke URL tersebut.
 *    (Buka di browser: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEB_APP_URL>)
 */

const GITHUB_TOKEN = "GANTI_DENGAN_GITHUB_PERSONAL_ACCESS_TOKEN";
const GITHUB_REPO = "username/nama-repo"; // contoh: budi/telekuy
const TELEGRAM_TOKEN = "GANTI_DENGAN_TOKEN_BOT_TELEGRAM";

// Dummy antrean (karena Apps Script stateless, angka ini hanya mockup. Untuk antrean asli butuh PropertiesService)
function getQueueNumber() {
  const props = PropertiesService.getScriptProperties();
  let q = parseInt(props.getProperty('queue') || '0');
  q++;
  props.setProperty('queue', q.toString());
  return q;
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Hanya tangani pesan teks
    if (!data.message || !data.message.text) return ContentService.createTextOutput("OK");
    
    const chatId = data.message.chat.id;
    const text = data.message.text;

    // Abaikan command start
    if (text.startsWith('/')) {
       sendMessage(chatId, "Kirimkan cookie Anda untuk masuk antrean.");
       return ContentService.createTextOutput("OK");
    }

    const queueNum = getQueueNumber();
    
    // 1. Balas ke user (Urutan antrean)
    sendMessage(chatId, `Cookie diterima. Anda berada di urutan antrean ke-${queueNum}. Mohon tunggu sebentar...`);
    
    // 2. Trigger GitHub Actions
    triggerGitHubAction(chatId, text);

    return ContentService.createTextOutput("OK");
  } catch (err) {
    return ContentService.createTextOutput("Error");
  }
}

function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: "post",
    payload: {
      chat_id: chatId,
      text: text
    }
  });
}

function triggerGitHubAction(chatId, cookieString) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/invite.yml/dispatches`;
  
  UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28"
    },
    payload: JSON.stringify({
      ref: "main",
      inputs: {
        chat_id: String(chatId),
        cookie_string: cookieString
      }
    }),
    muteHttpExceptions: true
  });
}
