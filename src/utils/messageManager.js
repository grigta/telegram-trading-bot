const lastMessageByChat = new Map();
const messageQueue = new Map();
const editQueue = new Map();
const messageHistory = new Map();

function setLastMessage(chatId, messageId) {
  lastMessageByChat.set(chatId, messageId);

  if (!messageHistory.has(chatId)) {
    messageHistory.set(chatId, []);
  }

  const history = messageHistory.get(chatId);
  history.push({
    messageId,
    timestamp: Date.now()
  });

  // Keep only last 5 messages per chat
  if (history.length > 5) {
    history.shift();
  }
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

async function editMessageText(bot, chatId, messageId, newText, options = {}) {
  if (!messageId || !newText) return false;

  try {
    await bot.editMessageText(newText, {
      chat_id: chatId,
      message_id: messageId,
      ...options
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function editMessageReplyMarkup(bot, chatId, messageId, replyMarkup) {
  if (!messageId) return false;

  try {
    await bot.editMessageReplyMarkup(replyMarkup, {
      chat_id: chatId,
      message_id: messageId
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function sendMessage(bot, chatId, text, options = {}) {
  try {
    // Clean old messages before sending new one
    await cleanOldMessages(bot, chatId);

    const message = await bot.sendMessage(chatId, text, options);
    setLastMessage(chatId, message.message_id);
    return message;
  } catch (e) {
    return null;
  }
}

async function cleanOldMessages(bot, chatId, keepLast = 3) {
  const history = messageHistory.get(chatId);
  if (!history || history.length <= keepLast) return;

  const messagesToDelete = history.slice(0, -keepLast);

  for (const msgData of messagesToDelete) {
    try {
      await bot.deleteMessage(chatId, msgData.messageId);
    } catch (e) {
      // Ignore errors when deleting messages (might be already deleted or too old)
    }
  }

  // Update history
  messageHistory.set(chatId, history.slice(-keepLast));
}

async function deleteMultipleMessages(bot, chatId, messageIds) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) return false;

  const results = [];
  for (const messageId of messageIds) {
    try {
      await bot.deleteMessage(chatId, messageId);
      results.push(true);
    } catch (e) {
      results.push(false);
    }
  }

  return results;
}

function queueMessage(chatId, messageData) {
  if (!messageQueue.has(chatId)) {
    messageQueue.set(chatId, []);
  }
  messageQueue.get(chatId).push(messageData);
}

function getQueuedMessages(chatId) {
  return messageQueue.get(chatId) || [];
}

function clearMessageQueue(chatId) {
  messageQueue.delete(chatId);
}

function queueEdit(chatId, editData) {
  if (!editQueue.has(chatId)) {
    editQueue.set(chatId, []);
  }
  editQueue.get(chatId).push(editData);
}

function getQueuedEdits(chatId) {
  return editQueue.get(chatId) || [];
}

function clearEditQueue(chatId) {
  editQueue.delete(chatId);
}

async function processMessageQueue(bot, chatId) {
  const messages = getQueuedMessages(chatId);
  if (messages.length === 0) return [];

  const results = [];
  for (const msgData of messages) {
    try {
      const result = await sendMessage(bot, chatId, msgData.text, msgData.options);
      results.push(result);
    } catch (e) {
      results.push(null);
    }
  }

  clearMessageQueue(chatId);
  return results;
}

async function processEditQueue(bot, chatId) {
  const edits = getQueuedEdits(chatId);
  if (edits.length === 0) return [];

  const results = [];
  for (const editData of edits) {
    try {
      const result = await editMessageText(bot, chatId, editData.messageId, editData.text, editData.options);
      results.push(result);
    } catch (e) {
      results.push(false);
    }
  }

  clearEditQueue(chatId);
  return results;
}

function clearLastMessage(chatId) {
  lastMessageByChat.delete(chatId);
}

function clearAll(chatId) {
  clearLastMessage(chatId);
  clearMessageQueue(chatId);
  clearEditQueue(chatId);
  messageHistory.delete(chatId);
}

module.exports = {
  setLastMessage,
  getLastMessage,
  deleteLastMessage,
  deleteMessageById,
  editMessageText,
  editMessageReplyMarkup,
  sendMessage,
  deleteMultipleMessages,
  queueMessage,
  getQueuedMessages,
  clearMessageQueue,
  queueEdit,
  getQueuedEdits,
  clearEditQueue,
  processMessageQueue,
  processEditQueue,
  clearLastMessage,
  clearAll,
  cleanOldMessages
};

