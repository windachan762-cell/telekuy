const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

function parseCookie(cookieStr) {
  // 1. Coba parse sebagai JSON (Format EditThisCookie / Cookie-Editor JSON)
  try {
    let jsonParsed = JSON.parse(cookieStr);
    
    // Support untuk ekstensi J2Team yang membungkus cookies di dalam object: {"url": "...", "cookies": [...]}
    if (jsonParsed && !Array.isArray(jsonParsed) && Array.isArray(jsonParsed.cookies)) {
      jsonParsed = jsonParsed.cookies;
    }

    if (Array.isArray(jsonParsed)) {
      return jsonParsed.map(c => {
        let ss = undefined;
        if (c.sameSite === 'no_restriction') ss = 'None';
        else if (c.sameSite === 'lax') ss = 'Lax';
        else if (c.sameSite === 'strict') ss = 'Strict';

        return {
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure: c.secure,
          httpOnly: c.httpOnly,
          expires: c.expirationDate || c.expires,
          sameSite: ss
        };
      }).filter(c => c.name);
    }
  } catch (e) {
    // Abaikan jika bukan JSON
  }

  // 2. Parse format Netscape HTTP Cookie File
  const cookies = [];
  const lines = cookieStr.split('\n');
  
  for (let line of lines) {
    line = line.trim();
    if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) continue;
    
    let httpOnly = false;
    if (line.startsWith('#HttpOnly_')) {
      httpOnly = true;
      line = line.substring(10);
    }
    
    const parts = line.split('\t');
    if (parts.length >= 7) {
      const expires = parseInt(parts[4], 10);
      cookies.push({
        domain: parts[0],
        path: parts[2],
        secure: parts[3] === 'TRUE',
        expires: isNaN(expires) || expires === 0 ? undefined : expires,
        name: parts[5],
        value: parts[6].replace(/\r$/, ''),
        httpOnly: httpOnly
      });
    }
  }
  
  // 3. Fallback format String Sederhana (name=value; name2=value2;)
  // Jangan jalankan fallback ini jika inputnya terlihat seperti JSON yang terpotong
  const trimmed = cookieStr.trim();
  if (cookies.length === 0 && trimmed.includes('=') && !trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    return trimmed.split(';').map(pair => {
      const [name, ...rest] = pair.trim().split('=');
      return { name, value: rest.join('='), domain: '.chatgpt.com' };
    }).filter(c => c.name);
  }
  
  return cookies;
}

async function runInviteScript(cookieString) {
  const browser = await puppeteer.launch({ 
    headless: false, // Biarkan false agar tidak dianggap bot
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  
  try {
    const cookies = parseCookie(cookieString);
    if (cookies.length > 0) {
      await page.setCookie(...cookies);
    }
    
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' });
    
    // Tunggu 5 detik agar Cloudflare challenge selesai
    await new Promise(r => setTimeout(r, 5000));
    
    const result = await page.evaluate(async () => {
      try {
        const sessionRes = await fetch("https://chatgpt.com/api/auth/session", { credentials: "include" });
        const text = await sessionRes.text();
        
        let s;
        try {
          s = JSON.parse(text);
        } catch (e) {
          return { success: false, message: "❌ Gagal auth session (Kena Cloudflare). Response body: " + text.substring(0, 100) };
        }
        
        if (!s.accessToken) { 
          return { success: false, message: "No token! Gagal mendapatkan session." }; 
        }
        
        const r = await fetch("https://chatgpt.com/backend-api/accounts/ff598c4d-ccaf-40c1-bfaa-cb94565764b1/invites/request", {
          method: "POST",
          headers: {
            "authorization": `Bearer ${s.accessToken}`,
            "content-type": "application/json"
          },
          credentials: "include"
        });
        
        const rText = await r.text();
        let d;
        try {
          d = JSON.parse(rText);
        } catch(e) {
          return { success: false, message: "❌ Gagal invite (Kena Cloudflare saat POST). Status: " + r.status + ", Body: " + rText.substring(0, 100) };
        }

        if (r.status === 200) {
          return { success: true, message: "SUCCESS! Refresh halaman (Ctrl+F5) lalu cek profile!" };
        } else {
          return { success: false, message: `Error: ${r.status} - ${JSON.stringify(d)}` };
        }
      } catch (err) {
        return { success: false, message: err.toString() };
      }
    });
    
    return result;
  } finally {
    await browser.close();
  }
}

module.exports = { runInviteScript, parseCookie };
