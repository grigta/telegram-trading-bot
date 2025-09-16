class AdminHandler {
  constructor(bot, database, logger) {
    this.bot = bot;
    this.db = database;
    this.logger = logger;
    this.adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];
  }

  isAdmin(userId) {
    return this.adminIds.includes(userId);
  }

  async handleAdmin(msg) {
    const userId = msg.from.id;

    if (!this.isAdmin(userId)) {
      await this.bot.sendMessage(msg.chat.id, '❌ У вас нет доступа к админ-панели');
      this.logger.warn(`Unauthorized admin access attempt: ${userId}`);
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
        [{ text: '👥 Пользователи', callback_data: 'admin_users' }],
        [{ text: '📢 Рассылка', callback_data: 'admin_broadcast' }],
        [{ text: '📝 Логи', callback_data: 'admin_logs' }],
        [{ text: '⚙️ Настройки', callback_data: 'admin_settings' }]
      ]
    };

    await this.bot.sendMessage(msg.chat.id,
      '🛠 *Админ-панель*\n\nВыберите действие:',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );

    await this.db.logUserAction(userId, 'admin_panel_accessed');
    this.logger.info(`Admin panel accessed by: ${userId}`);
  }

  async handleCallback(query) {
    const userId = query.from.id;
    const data = query.callback_data || query.data;

    if (!this.isAdmin(userId)) {
      await this.bot.answerCallbackQuery(query.id, { text: 'Доступ запрещен' });
      return;
    }

    if (!data) {
      this.logger.warn(`Admin callback data is undefined for user: ${userId}`);
      this.logger.warn(`Admin query.callback_data: ${query.callback_data}`);
      this.logger.warn(`Admin query.data: ${query.data}`);
      await this.bot.answerCallbackQuery(query.id, { text: 'Ошибка: данные не получены' });
      return;
    }

    try {
      switch (data) {
      case 'admin_stats':
        await this.showStats(query);
        break;
      case 'admin_users':
        await this.showUsers(query, 1);
        break;
      case 'admin_broadcast':
        await this.handleBroadcast(query);
        break;
      case 'admin_logs':
        await this.showLogs(query, 1);
        break;
      case 'admin_settings':
        await this.showSettings(query);
        break;
      case 'admin_menu':
        await this.showAdminMenu(query);
        break;
      default:
        if (data.startsWith('admin_users_')) {
          const page = parseInt(data.split('_')[2]) || 1;
          await this.showUsers(query, page);
        } else if (data.startsWith('admin_logs_')) {
          const page = parseInt(data.split('_')[2]) || 1;
          await this.showLogs(query, page);
        } else if (data.startsWith('broadcast_')) {
          const type = data.replace('broadcast_', '');
          await this.startBroadcast(query, type);
        } else if (data === 'broadcast_cancel') {
          await this.cancelBroadcast(query);
        } else if (data === 'broadcast_confirm') {
          await this.confirmBroadcast(query);
        }
        break;
      }
    } catch (error) {
      this.logger.error('Error in admin callback', { userId, data: data || 'undefined', error: error.message });
      await this.bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка' });
    }
  }

  async showAdminMenu(query) {
    const keyboard = {
      inline_keyboard: [
        [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
        [{ text: '👥 Пользователи', callback_data: 'admin_users' }],
        [{ text: '📢 Рассылка', callback_data: 'admin_broadcast' }],
        [{ text: '📝 Логи', callback_data: 'admin_logs' }],
        [{ text: '⚙️ Настройки', callback_data: 'admin_settings' }]
      ]
    };

    await this.bot.editMessageText('🛠 *Админ-панель*\n\nВыберите действие:', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async showStats(query) {
    try {
      const stats = await this.db.getStats();

      const message = `
📊 *Статистика бота*

👥 Всего пользователей: ${stats.total_users}
📱 С номером телефона: ${stats.users_with_phone}
✅ Подписанных: ${stats.subscribed_users}
💰 Зарегистрированных: ${stats.registered_users}  
🏦 С депозитом: ${stats.users_with_deposit}
👑 VIP пользователей: ${stats.vip_users}

📈 Сегодня:
• Новых пользователей: ${stats.today_new_users}
• Регистраций: ${stats.today_registrations}
• Депозитов: ${stats.today_deposits}

💹 Конверсии:
• Подписка → Регистрация: ${stats.subscription_to_registration}%
• Регистрация → Депозит: ${stats.registration_to_deposit}%
      `;

      const keyboard = {
        inline_keyboard: [
          [{ text: '🔄 Обновить', callback_data: 'admin_stats' }],
          [{ text: '← Назад', callback_data: 'admin_menu' }]
        ]
      };

      await this.bot.editMessageText(message, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      this.logger.error('Error showing admin stats', error);
      throw error;
    }
  }

  async showUsers(query, page = 1) {
    try {
      const limit = 10;
      const offset = (page - 1) * limit;
      const users = await this.db.getUsers(limit, offset);
      const total = await this.db.getTotalUsers();
      const totalPages = Math.ceil(total / limit);

      let message = `👥 *Пользователи (стр. ${page}/${totalPages})*\n\n`;

      users.forEach(user => {
        const status = user.vip_access ? '👑' : user.has_deposit ? '💰' : user.is_registered ? '📝' : '👤';
        message += `${status} ${user.first_name || 'N/A'} (@${user.username || 'N/A'})\n`;
        message += `   ID: ${user.telegram_id}\n`;
        message += `   📱: ${user.phone || 'Нет'}\n`;
        message += `   📅: ${new Date(user.registration_date).toLocaleDateString()}\n\n`;
      });

      const keyboard = {
        inline_keyboard: [
          [
            { text: '⬅️', callback_data: `admin_users_${Math.max(1, page - 1)}` },
            { text: `${page}/${totalPages}`, callback_data: 'noop' },
            { text: '➡️', callback_data: `admin_users_${Math.min(totalPages, page + 1)}` }
          ],
          [{ text: '← Назад в админ', callback_data: 'admin_menu' }]
        ]
      };

      await this.bot.editMessageText(message, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      this.logger.error('Error showing users', error);
      throw error;
    }
  }

  async handleBroadcast(query) {
    const message = `📢 *Система рассылки*

Выберите аудиторию для рассылки:`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '👥 Всем пользователям', callback_data: 'broadcast_all' }],
        [{ text: '📱 С номером телефона', callback_data: 'broadcast_phone' }],
        [{ text: '✅ Подписанным', callback_data: 'broadcast_subscribed' }],
        [{ text: '📝 Зарегистрированным', callback_data: 'broadcast_registered' }],
        [{ text: '💰 С депозитом', callback_data: 'broadcast_deposit' }],
        [{ text: '👑 VIP пользователям', callback_data: 'broadcast_vip' }],
        [{ text: '← Назад', callback_data: 'admin_menu' }]
      ]
    };

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async showLogs(query, page = 1) {
    try {
      const limit = 20;
      const offset = (page - 1) * limit;
      const logs = await this.db.getRecentLogs(limit, offset);
      const total = await this.db.getTotalLogs();
      const totalPages = Math.ceil(total / limit);

      let message = `📝 *Логи активности (стр. ${page}/${totalPages})*\n\n`;

      logs.slice(0, 10).forEach(log => {  // Limit to 10 for readability
        const time = new Date(log.timestamp).toLocaleString('ru-RU');
        message += `🕒 ${time}\n`;
        message += `👤 ID: ${log.telegram_id}\n`;
        message += `⚡️ ${log.action}\n\n`;
      });

      const keyboard = {
        inline_keyboard: [
          [
            { text: '⬅️', callback_data: `admin_logs_${Math.max(1, page - 1)}` },
            { text: `${page}/${totalPages}`, callback_data: 'noop' },
            { text: '➡️', callback_data: `admin_logs_${Math.min(totalPages, page + 1)}` }
          ],
          [{ text: '🔄 Обновить', callback_data: 'admin_logs' }],
          [{ text: '← Назад', callback_data: 'admin_menu' }]
        ]
      };

      await this.bot.editMessageText(message, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      this.logger.error('Error showing logs', error);
      throw error;
    }
  }

  async showSettings(query) {
    const message = `
⚙️ *Настройки бота*

📢 Канал: ${process.env.CHANNEL_USERNAME}
👑 VIP канал: ${process.env.VIP_CHANNEL_ID ? 'Настроен' : 'Не настроен'}
🔗 Партнерка PO: ${process.env.POCKET_OPTION_LINK ? 'Настроена' : 'Не настроена'}
👨‍💼 Админов: ${this.adminIds.length}

🚀 Версия бота: 1.0.0
🔧 Окружение: ${process.env.NODE_ENV || 'development'}
    `;

    const keyboard = {
      inline_keyboard: [
        [{ text: '← Назад', callback_data: 'admin_menu' }]
      ]
    };

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async startBroadcast(query, type) {
    try {
      // Get user count for selected type
      const userCount = await this.getBroadcastUserCount(type);

      if (userCount === 0) {
        await this.bot.editMessageText(
          `❌ Нет пользователей для рассылки типа "${this.getBroadcastTypeName(type)}"`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            reply_markup: {
              inline_keyboard: [
                [{ text: '← Назад к рассылке', callback_data: 'admin_broadcast' }]
              ]
            }
          }
        );
        return;
      }

      // Store broadcast context
      const adminId = query.from.id;
      await this.db.setSetting(`broadcast_context_${adminId}`, JSON.stringify({
        type: type,
        messageId: query.message.message_id,
        chatId: query.message.chat.id
      }));

      const message = `📝 *Создание рассылки*

📊 Аудитория: ${this.getBroadcastTypeName(type)}
👥 Количество пользователей: ${userCount}

Теперь отправьте сообщение для рассылки:
• Текст с Markdown разметкой
• Фото/видео/документ с подписью
• Сообщения с inline кнопками

🔘 *Кнопки:* Если отправите сообщение с кнопками, они будут сохранены и добавлены ко всем сообщениям рассылки.

⚠️ *Внимание:* Сообщение будет отправлено ${userCount} пользователям!`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '❌ Отменить рассылку', callback_data: 'broadcast_cancel' }]
        ]
      };

      await this.bot.editMessageText(message, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      // Set user state to waiting for broadcast text
      const UserStates = require('../utils/userStates');
      if (!this.userStates) {
        this.userStates = new UserStates();
      }
      this.userStates.setState(adminId, 'waiting_broadcast_text');

    } catch (error) {
      this.logger.error('Error starting broadcast', error);
      throw error;
    }
  }

  async getBroadcastUserCount(type) {
    let sql = 'SELECT COUNT(*) as count FROM users WHERE 1=1';

    switch (type) {
    case 'phone':
      sql += ' AND phone IS NOT NULL';
      break;
    case 'subscribed':
      sql += ' AND is_subscribed = 1';
      break;
    case 'registered':
      sql += ' AND partner_status = "registered"';
      break;
    case 'deposit':
      sql += ' AND first_deposit_amount > 0';
      break;
    case 'vip':
      sql += ' AND vip_status = 1';
      break;
    case 'all':
    default:
      // No additional condition for 'all'
      break;
    }

    const result = await this.db.get(sql);
    return result.count;
  }

  getBroadcastTypeName(type) {
    const names = {
      all: 'Все пользователи',
      phone: 'С номером телефона',
      subscribed: 'Подписанные',
      registered: 'Зарегистрированные',
      deposit: 'С депозитом',
      vip: 'VIP пользователи'
    };
    return names[type] || 'Неизвестный тип';
  }

  async handleBroadcastText(msg) {
    try {
      const adminId = msg.from.id;

      // Get broadcast context
      const contextStr = await this.db.getSetting(`broadcast_context_${adminId}`);
      if (!contextStr) {
        await this.bot.sendMessage(msg.chat.id, '❌ Контекст рассылки не найден. Начните заново.');
        return;
      }

      const context = JSON.parse(contextStr);
      const userCount = await this.getBroadcastUserCount(context.type);

      // Store the broadcast message
      await this.db.setSetting(`broadcast_message_${adminId}`, JSON.stringify({
        text: msg.text,
        photo: msg.photo ? msg.photo[msg.photo.length - 1].file_id : null,
        video: msg.video ? msg.video.file_id : null,
        document: msg.document ? msg.document.file_id : null,
        caption: msg.caption || null,
        reply_markup: msg.reply_markup || null
      }));

      // Show confirmation
      let messagePreview = '';
      if (msg.text) {
        messagePreview = msg.text.length > 100 ? msg.text.substring(0, 100) + '...' : msg.text;
      } else if (msg.caption) {
        messagePreview = msg.caption.length > 100 ? msg.caption.substring(0, 100) + '...' : msg.caption;
      } else if (msg.photo) {
        messagePreview = '[Фото без подписи]';
      } else if (msg.video) {
        messagePreview = '[Видео без подписи]';
      } else if (msg.document) {
        messagePreview = '[Документ без подписи]';
      }

      // Add buttons info if present
      if (msg.reply_markup && msg.reply_markup.inline_keyboard) {
        const buttonCount = msg.reply_markup.inline_keyboard.flat().length;
        messagePreview += `\n\n🔘 Кнопок: ${buttonCount}`;
      }

      const confirmMessage = `✅ *Подтверждение рассылки*

📊 Аудитория: ${this.getBroadcastTypeName(context.type)}
👥 Получат сообщение: ${userCount} пользователей

📝 Предварительный просмотр:
${messagePreview}

⚠️ **Внимание!** После подтверждения рассылка начнется немедленно и не может быть остановлена.`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Подтвердить отправку', callback_data: 'broadcast_confirm' },
            { text: '❌ Отменить', callback_data: 'broadcast_cancel' }
          ]
        ]
      };

      await this.bot.editMessageText(confirmMessage, {
        chat_id: context.chatId,
        message_id: context.messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      // Clear user state
      if (this.userStates) {
        this.userStates.clearState(adminId);
      }

    } catch (error) {
      this.logger.error('Error handling broadcast text', error);
      await this.bot.sendMessage(msg.chat.id, '❌ Ошибка при обработке сообщения для рассылки.');
    }
  }

  async confirmBroadcast(query) {
    try {
      const adminId = query.from.id;

      // Get context and message
      const contextStr = await this.db.getSetting(`broadcast_context_${adminId}`);
      const messageStr = await this.db.getSetting(`broadcast_message_${adminId}`);

      if (!contextStr || !messageStr) {
        await this.bot.answerCallbackQuery(query.id, { text: '❌ Данные рассылки не найдены' });
        return;
      }

      const context = JSON.parse(contextStr);
      const broadcastMessage = JSON.parse(messageStr);

      // Get target users
      const users = await this.getBroadcastUsers(context.type);

      await this.bot.editMessageText(
        `🚀 **Рассылка запущена!**\n\n📊 Отправляется ${users.length} пользователям...\n\n⏳ Примерное время выполнения: ${Math.ceil(users.length / 20)} минут`,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'Markdown'
        }
      );

      // Start broadcast in background
      this.executeBroadcast(users, broadcastMessage, query.message.chat.id, adminId);

      // Clean up settings
      await this.db.setSetting(`broadcast_context_${adminId}`, null);
      await this.db.setSetting(`broadcast_message_${adminId}`, null);

    } catch (error) {
      this.logger.error('Error confirming broadcast', error);
      await this.bot.answerCallbackQuery(query.id, { text: '❌ Ошибка при подтверждении рассылки' });
    }
  }

  async cancelBroadcast(query) {
    try {
      const adminId = query.from.id;

      // Clean up settings
      await this.db.setSetting(`broadcast_context_${adminId}`, null);
      await this.db.setSetting(`broadcast_message_${adminId}`, null);

      // Clear user state
      if (this.userStates) {
        this.userStates.clearState(adminId);
      }

      await this.bot.editMessageText(
        '❌ **Рассылка отменена**\n\nВы можете создать новую рассылку в любое время.',
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '← Назад в админ', callback_data: 'admin_menu' }]
            ]
          }
        }
      );

    } catch (error) {
      this.logger.error('Error canceling broadcast', error);
      await this.bot.answerCallbackQuery(query.id, { text: '❌ Ошибка при отмене рассылки' });
    }
  }

  async getBroadcastUsers(type) {
    let sql = 'SELECT telegram_id FROM users WHERE 1=1';

    switch (type) {
    case 'phone':
      sql += ' AND phone IS NOT NULL';
      break;
    case 'subscribed':
      sql += ' AND is_subscribed = 1';
      break;
    case 'registered':
      sql += ' AND partner_status = "registered"';
      break;
    case 'deposit':
      sql += ' AND first_deposit_amount > 0';
      break;
    case 'vip':
      sql += ' AND vip_status = 1';
      break;
    case 'all':
    default:
      // No additional condition for 'all'
      break;
    }

    return await this.db.query(sql);
  }

  async executeBroadcast(users, broadcastMessage, adminChatId, adminId) {
    let sentCount = 0;
    let errorCount = 0;
    const startTime = Date.now();

    this.logger.info(`Starting broadcast to ${users.length} users`, { adminId, type: 'broadcast_start' });

    for (const user of users) {
      try {
        // Rate limiting: max 20 messages per second
        if (sentCount > 0 && sentCount % 20 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await this.sendBroadcastMessage(user.telegram_id, broadcastMessage);
        sentCount++;

        // Update progress every 50 messages
        if (sentCount % 50 === 0) {
          const progress = Math.round((sentCount / users.length) * 100);
          try {
            await this.bot.sendMessage(adminChatId,
              `📊 Прогресс рассылки: ${progress}% (${sentCount}/${users.length})`
            );
          } catch (e) {
            // Ignore errors in progress updates
          }
        }

      } catch (error) {
        errorCount++;
        this.logger.warn('Error sending broadcast message', {
          userId: user.telegram_id,
          error: error.message
        });
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const resultMessage = `✅ **Рассылка завершена!**

📊 Результаты:
• Отправлено: ${sentCount}/${users.length}
• Ошибок: ${errorCount}
• Время выполнения: ${duration} сек

${errorCount > 0 ? '⚠️ Некоторые сообщения не были доставлены (пользователи заблокировали бота)' : ''}`;

    try {
      await this.bot.sendMessage(adminChatId, resultMessage, { parse_mode: 'Markdown' });
    } catch (e) {
      this.logger.error('Error sending broadcast completion message', e);
    }

    // Log broadcast completion
    await this.db.logUserAction(adminId, 'broadcast_completed', {
      target_users: users.length,
      sent_count: sentCount,
      error_count: errorCount,
      duration_seconds: duration
    });

    this.logger.info('Broadcast completed', {
      adminId,
      sentCount,
      errorCount,
      duration,
      totalUsers: users.length
    });
  }

  async sendBroadcastMessage(userId, broadcastMessage) {
    const options = {
      parse_mode: 'Markdown'
    };

    // Add buttons if present
    if (broadcastMessage.reply_markup) {
      options.reply_markup = broadcastMessage.reply_markup;
    }

    if (broadcastMessage.photo) {
      options.caption = broadcastMessage.caption;
      await this.bot.sendPhoto(userId, broadcastMessage.photo, options);
    } else if (broadcastMessage.video) {
      options.caption = broadcastMessage.caption;
      await this.bot.sendVideo(userId, broadcastMessage.video, options);
    } else if (broadcastMessage.document) {
      options.caption = broadcastMessage.caption;
      await this.bot.sendDocument(userId, broadcastMessage.document, options);
    } else {
      await this.bot.sendMessage(userId, broadcastMessage.text, options);
    }
  }
}

module.exports = AdminHandler;
