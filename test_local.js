const fs = require('fs');
const { runInviteScript } = require('./puppeteer_core');

(async () => {
  try {
    // Membaca file cookie.txt dari folder yang sama
    const cookieStr = fs.readFileSync('./cookie.txt', 'utf8');
    
    console.log("Membaca cookie dari cookie.txt dan menjalankan browser...");
    const result = await runInviteScript(cookieStr);
    
    console.log("\n--- HASIL ---");
    console.log(result);
  } catch (err) {
    console.error("Gagal menjalankan test:", err.message);
    console.log("Pastikan Anda sudah membuat file 'cookie.txt' di dalam folder ini.");
  }
})();
