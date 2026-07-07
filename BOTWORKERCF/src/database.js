import { createClient } from '@libsql/client/web';

// Kita tidak menggunakan objek global statis, karena di Cloudflare Worker, 
// variabel env dilempar (passed) saat fungsi fetch terpanggil.
export function getDb(env) {
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
    throw new Error("TURSO credentials missing in environment variables");
  }
  return createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
}

// Helper untuk inisialisasi tabel baru khusus Worker
export async function initWorkerDB(env) {
  const db = getDb(env);
  
  // Tabel untuk menyimpan status user (State Machine) karena RAM selalu di-reset
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bot_states (
      chat_id TEXT PRIMARY KEY,
      state TEXT,
      data TEXT,
      last_bot_msg_id INTEGER
    )
  `);

  // Tabel untuk antrian pekerjaan (Jobs Queue)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS jobs_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT,
      telegram_id TEXT,
      email TEXT,
      cookie_text TEXT,
      workspace_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
