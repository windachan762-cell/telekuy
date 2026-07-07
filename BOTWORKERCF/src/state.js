import { getDb } from './database.js';

export async function setState(env, chatId, stateStr, data = {}) {
  const db = getDb(env);
  const dataStr = JSON.stringify(data);
  
  // Karena Turso (SQLite) mendukung UPSERT (ON CONFLICT)
  // Tapi kita perlu memastikan chat_id tersimpan
  await db.execute({
    sql: `INSERT INTO bot_states (chat_id, state, data) 
          VALUES (?, ?, ?) 
          ON CONFLICT(chat_id) DO UPDATE SET state=excluded.state, data=excluded.data`,
    args: [chatId.toString(), stateStr, dataStr]
  });
}

export async function getState(env, chatId) {
  const db = getDb(env);
  const result = await db.execute({
    sql: `SELECT state, data FROM bot_states WHERE chat_id = ?`,
    args: [chatId.toString()]
  });
  
  if (result.rows.length > 0) {
    const row = result.rows[0];
    return {
      state: row.state,
      data: row.data ? JSON.parse(row.data) : {}
    };
  }
  return { state: null, data: {} };
}

export async function updateStateData(env, chatId, key, value) {
  const currentState = await getState(env, chatId);
  if (currentState.state) {
    currentState.data[key] = value;
    await setState(env, chatId, currentState.state, currentState.data);
  }
}

export async function clearState(env, chatId) {
  const db = getDb(env);
  // Hapus state dan data, tapi biarkan baris tetap ada untuk last_bot_msg_id
  await db.execute({
    sql: `UPDATE bot_states SET state = NULL, data = NULL WHERE chat_id = ?`,
    args: [chatId.toString()]
  });
}

export async function setLastBotMsgId(env, chatId, msgId) {
  const db = getDb(env);
  await db.execute({
    sql: `INSERT INTO bot_states (chat_id, last_bot_msg_id) 
          VALUES (?, ?) 
          ON CONFLICT(chat_id) DO UPDATE SET last_bot_msg_id=excluded.last_bot_msg_id`,
    args: [chatId.toString(), msgId]
  });
}

export async function getLastBotMsgId(env, chatId) {
  const db = getDb(env);
  const result = await db.execute({
    sql: `SELECT last_bot_msg_id FROM bot_states WHERE chat_id = ?`,
    args: [chatId.toString()]
  });
  if (result.rows.length > 0) {
    return result.rows[0].last_bot_msg_id;
  }
  return null;
}
