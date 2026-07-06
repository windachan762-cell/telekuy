require('dotenv').config();
const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDB() {
  console.log("Mengkoneksikan ke Turso Database...");

  try {
    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE NOT NULL,
        username TEXT,
        full_name TEXT,
        coins INTEGER DEFAULT 2,
        referrer_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS invited_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workspace_ids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT UNIQUE NOT NULL,
        is_active INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    
    console.log("✅ Tabel berhasil diinisialisasi di Turso.");
  } catch (error) {
    console.error("❌ Gagal inisialisasi database:", error.message);
  }
}

// Fungsi CRUD dasar
const db = {
  // --- USERS ---
  async getUser(telegramId) {
    const res = await client.execute({
      sql: "SELECT * FROM users WHERE telegram_id = ?",
      args: [telegramId]
    });
    return res.rows[0];
  },
  
  async createUser(telegramId, username, fullName, referrerId = null) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO users (telegram_id, username, full_name, referrer_id, coins) VALUES (?, ?, ?, ?, 2)",
      args: [telegramId, username, fullName, referrerId]
    });
  },

  async updateCoins(telegramId, amount) {
    // amount bisa negatif atau positif
    await client.execute({
      sql: "UPDATE users SET coins = coins + ? WHERE telegram_id = ?",
      args: [amount, telegramId]
    });
  },
  
  async getLeaderboard() {
    const res = await client.execute("SELECT telegram_id, username, full_name, coins FROM users ORDER BY coins DESC LIMIT 10");
    return res.rows;
  },

  // --- INVITE HISTORY ---
  async addInviteHistory(telegramId, email, status) {
    await client.execute({
      sql: "INSERT INTO invited_history (user_id, email, status) VALUES (?, ?, ?)",
      args: [telegramId, email, status]
    });
  },

  async getInvitedEmails(telegramId) {
    const res = await client.execute({
      sql: "SELECT email, status, timestamp FROM invited_history WHERE user_id = ? AND status = 'SUCCESS' ORDER BY timestamp DESC",
      args: [telegramId]
    });
    return res.rows;
  },

  // --- WORKSPACE IDS ---
  async getWorkspaces() {
    const res = await client.execute("SELECT * FROM workspace_ids");
    return res.rows;
  },

  async addWorkspace(workspaceId) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO workspace_ids (workspace_id, is_active) VALUES (?, 0)",
      args: [workspaceId]
    });
  },

  async deleteWorkspace(workspaceId) {
    await client.execute({
      sql: "DELETE FROM workspace_ids WHERE workspace_id = ?",
      args: [workspaceId]
    });
  },

  async getActiveWorkspace() {
    const res = await client.execute("SELECT workspace_id FROM workspace_ids WHERE is_active = 1 LIMIT 1");
    if (res.rows.length > 0) return res.rows[0].workspace_id;
    // Jika tidak ada yg aktif, ambil yg pertama
    const fallback = await client.execute("SELECT workspace_id FROM workspace_ids LIMIT 1");
    return fallback.rows.length > 0 ? fallback.rows[0].workspace_id : null;
  },

  async setActiveWorkspace(workspaceId) {
    await client.execute("UPDATE workspace_ids SET is_active = 0");
    await client.execute({
      sql: "UPDATE workspace_ids SET is_active = 1 WHERE workspace_id = ?",
      args: [workspaceId]
    });
  },

  // --- SETTINGS ---
  async getSetting(key) {
    const res = await client.execute({
      sql: "SELECT value FROM settings WHERE key = ?",
      args: [key]
    });
    return res.rows.length > 0 ? res.rows[0].value : null;
  },

  async setSetting(key, value) {
    await client.execute({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [key, value]
    });
  },
  
  async deleteSetting(key) {
    await client.execute({
      sql: "DELETE FROM settings WHERE key = ?",
      args: [key]
    });
  }
};

module.exports = { client, initDB, db };
