import dotenv from 'dotenv';
import { initWorkerDB } from './database.js';

// Load dari file .env (jika tidak ada, coba ambil dari .dev.vars)
dotenv.config({ path: '../.env' });

const env = {
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN
};

console.log("Menghubungkan ke Turso untuk membuat tabel Cloudflare Worker...");

initWorkerDB(env)
  .then(() => {
    console.log("✅ Berhasil membuat tabel `bot_states` dan `jobs_queue` di Turso!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Gagal membuat tabel:", err.message);
    process.exit(1);
  });
