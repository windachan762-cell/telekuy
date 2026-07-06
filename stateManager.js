const states = {};

// states = { [chatId]: { state: 'WAITING_FOR_EMAIL', data: {} } }

function setState(chatId, state, data = {}) {
  states[chatId] = { state, data };
}

function getState(chatId) {
  return states[chatId] || { state: null, data: {} };
}

function updateStateData(chatId, newData) {
  if (states[chatId]) {
    states[chatId].data = { ...states[chatId].data, ...newData };
  }
}

function clearState(chatId) {
  delete states[chatId];
}

module.exports = { setState, getState, updateStateData, clearState };
