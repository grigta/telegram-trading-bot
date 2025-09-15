const lastMessageByChat = new Map();

function setLastMessage(chatId, messageId) {
  lastMessageByChat.set(chatId, messageId);
}

function getLastMessage(chatId) {
  return lastMessageByChat.get(chatId) || null;
}

async function deleteLastMessage(bot, chatId) {
  const lastId = getLastMessage(chatId);
  if (!lastId) return false;
  try {
    await bot.deleteMessage(chatId, lastId);
    lastMessageByChat.delete(chatId);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  setLastMessage,
  getLastMessage,
  deleteLastMessage
};


