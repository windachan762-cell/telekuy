const states = {};

function setState(chatId, stateStr, data = {}) {
  if (!states[chatId]) states[chatId] = {};
  states[chatId].state = stateStr;
  states[chatId].data = data;
}

function getState(chatId) {
  return states[chatId] || { state: null, data: {} };
}

function updateStateData(chatId, key, value) {
  if (states[chatId] && states[chatId].data) {
    states[chatId].data[key] = value;
  }
}

function clearState(chatId) {
  if (states[chatId]) {
    const lastBotMsgId = states[chatId].last_bot_msg_id;
    states[chatId] = { last_bot_msg_id: lastBotMsgId };
  }
}

function setLastBotMsgId(chatId, msgId) {
  if (!states[chatId]) states[chatId] = {};
  states[chatId].last_bot_msg_id = msgId;
}

function getLastBotMsgId(chatId) {
  return states[chatId] ? states[chatId].last_bot_msg_id : null;
}

module.exports = {
  setState,
  getState,
  updateStateData,
  clearState,
  setLastBotMsgId,
  getLastBotMsgId
};
