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

async function deleteMessageById(bot, chatId, messageId) {
  if (!messageId) return false;
  try {
    await bot.deleteMessage(chatId, messageId);
    const current = getLastMessage(chatId);
    if (current === messageId) {
      lastMessageByChat.delete(chatId);
    }
    return true;
  } catch (e) {
    return false;
  }
}

function clearLastMessage(chatId) {
  lastMessageByChat.delete(chatId);
}

module.exports = {
  setLastMessage,
  getLastMessage,
  deleteLastMessage,
  deleteMessageById,
  clearLastMessage
};


