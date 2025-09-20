class AdminHandler {
  constructor(bot, database, logger, userStates) {
    this.bot = bot;
    this.db = database;
    this.logger = logger;
    this.userStates = userStates;
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

    this.logger.info(`ADMIN HANDLER: Callback received from user ${userId}`);
    this.logger.debug(`ADMIN HANDLER: Raw query.callback_data: "${query.callback_data}"`);
    this.logger.debug(`ADMIN HANDLER: Raw query.data: "${query.data}"`);
    this.logger.debug(`ADMIN HANDLER: Processed data: "${data}"`);
    this.logger.debug(`ADMIN HANDLER: Query ID: ${query.id}`);

    if (!this.isAdmin(userId)) {
      this.logger.warn(`ADMIN HANDLER: Non-admin user ${userId} attempted to access admin functions`);
      await this.bot.answerCallbackQuery(query.id, { text: 'Доступ запрещен' });
      return;
    }

    if (!data) {
      this.logger.error(`ADMIN: Callback data is undefined for user: ${userId}`);
      this.logger.error(`ADMIN: query.callback_data: "${query.callback_data}"`);
      this.logger.error(`ADMIN: query.data: "${query.data}"`);
      this.logger.error(`ADMIN: query.id: "${query.id}"`);
      this.logger.error(`ADMIN: Available query keys: ${Object.keys(query).join(', ')}`);

      // Log the full query object for debugging
      this.logger.error(`ADMIN: Full query object:`, JSON.stringify(query, null, 2));

      await this.bot.answerCallbackQuery(query.id, { text: 'Ошибка: данные администратора не получены' });

      // Try to redirect back to admin menu
      try {
        await this.showAdminMenu(query);
      } catch (e) {
        this.logger.error('Failed to show admin menu after callback data error', e);
      }
      return;
    }

    try {
      switch (data) {
      case 'admin_stats':
        await this.bot.answerCallbackQuery(query.id);
        await this.showStats(query);
        break;
      case 'admin_users':
        await this.bot.answerCallbackQuery(query.id);
        await this.showUsers(query, 1);
        break;
      case 'admin_broadcast':
        await this.bot.answerCallbackQuery(query.id);
        await this.handleBroadcast(query);
        break;
      case 'admin_logs':
        await this.bot.answerCallbackQuery(query.id);
        await this.showLogs(query, 1);
        break;
      case 'admin_settings':
        await this.bot.answerCallbackQuery(query.id);
        await this.showSettings(query);
        break;
      case 'admin_menu':
        await this.bot.answerCallbackQuery(query.id);
        await this.showAdminMenu(query);
        break;
      default:
        if (data.startsWith('admin_users_')) {
          await this.bot.answerCallbackQuery(query.id);
          const page = parseInt(data.split('_')[2]) || 1;
          await this.showUsers(query, page);
        } else if (data.startsWith('admin_logs_')) {
          await this.bot.answerCallbackQuery(query.id);
          const page = parseInt(data.split('_')[2]) || 1;
          await this.showLogs(query, page);
        } else if (data.startsWith('broadcast_')) {
          await this.bot.answerCallbackQuery(query.id);
          const type = data.replace('broadcast_', '');
          await this.startBroadcast(query, type);
        } else if (data === 'broadcast_cancel') {
          await this.bot.answerCallbackQuery(query.id);
          await this.cancelBroadcast(query);
        } else if (data === 'broadcast_confirm') {
          // Note: confirmBroadcast handles its own answerCallbackQuery
          await this.confirmBroadcast(query);
        } else {
          this.logger.warn(`Unknown admin callback data: ${data}`);
          await this.bot.answerCallbackQuery(query.id, { text: 'Неизвестная команда' });
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
        const action = this.escapeMarkdown(log.action || 'unknown');
        message += `🕒 ${time}\n`;
        message += `👤 ID: ${log.telegram_id}\n`;
        message += `⚡️ ${action}\n\n`;
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
      sql += ' AND is_registered = 1';
      break;
    case 'deposit':
      sql += ' AND has_deposit = 1';
      break;
    case 'vip':
      sql += ' AND vip_access = 1';
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

    this.logger.debug(`getBroadcastTypeName called with type: "${type}"`);
    const result = names[type] || 'Неизвестный тип';
    this.logger.debug(`getBroadcastTypeName returning: "${result}"`);

    return result;
  }

  async handleBroadcastText(msg) {
    try {
      const adminId = msg.from.id;

      this.logger.info(`=== HANDLE BROADCAST TEXT START === Admin: ${adminId}, Message: "${msg.text}"`);

      // Get broadcast context
      this.logger.debug(`Step 1: Getting broadcast context for admin ${adminId}`);
      const contextStr = await this.db.getSetting(`broadcast_context_${adminId}`);
      this.logger.debug(`Step 1 Complete: Context string length: ${contextStr ? contextStr.length : 'null'}`);

      if (!contextStr) {
        this.logger.error(`No broadcast context found for admin ${adminId}`);
        await this.bot.sendMessage(msg.chat.id, '❌ Контекст рассылки не найден. Начните заново.');
        return;
      }

      this.logger.debug(`Step 2: Parsing broadcast context: ${contextStr}`);
      const context = JSON.parse(contextStr);
      this.logger.debug(`Step 2 Complete: Context type: ${context.type}`);

      this.logger.debug(`Step 3: Getting user count for type: ${context.type}`);
      const userCount = await this.getBroadcastUserCount(context.type);
      this.logger.debug(`Step 3 Complete: User count result: ${userCount}`);

      // Store the broadcast message
      this.logger.debug(`Step 4: Storing broadcast message for admin ${adminId}`);
      const messageData = {
        text: msg.text,
        photo: msg.photo ? msg.photo[msg.photo.length - 1].file_id : null,
        video: msg.video ? msg.video.file_id : null,
        document: msg.document ? msg.document.file_id : null,
        caption: msg.caption || null,
        reply_markup: msg.reply_markup || null
      };
      this.logger.debug(`Message data to store:`, messageData);

      await this.db.setSetting(`broadcast_message_${adminId}`, JSON.stringify(messageData));
      this.logger.debug(`Step 4 Complete: Message data stored`);

      // Show confirmation
      this.logger.debug(`Step 5: Creating message preview`);
      let messagePreview = '';
      if (msg.text) {
        this.logger.debug(`Processing text message: "${msg.text}"`);
        const rawText = msg.text.length > 100 ? msg.text.substring(0, 100) + '...' : msg.text;
        this.logger.debug(`Raw text (truncated): "${rawText}"`);
        messagePreview = this.escapeMarkdown(rawText);
        this.logger.debug(`Escaped text: "${messagePreview}"`);
      } else if (msg.caption) {
        const rawCaption = msg.caption.length > 100 ? msg.caption.substring(0, 100) + '...' : msg.caption;
        messagePreview = this.escapeMarkdown(rawCaption);
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

      this.logger.debug(`Step 5 Complete: Message preview: "${messagePreview}"`);

      const confirmMessage = `✅ *Подтверждение рассылки*

📊 Аудитория: ${this.getBroadcastTypeName(context.type)}
👥 Получат сообщение: ${userCount} пользователей

📝 Предварительный просмотр:
${messagePreview}

⚠️ *Внимание!* После подтверждения рассылка начнется немедленно и не может быть остановлена.`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Подтвердить отправку', callback_data: 'broadcast_confirm' },
            { text: '❌ Отменить', callback_data: 'broadcast_cancel' }
          ]
        ]
      };

      this.logger.info(`Creating broadcast confirmation keyboard for admin ${adminId}`);
      this.logger.debug(`Keyboard structure:`, JSON.stringify(keyboard, null, 2));
      this.logger.debug(`Context: chatId=${context.chatId}, messageId=${context.messageId}`);
      this.logger.debug(`Confirmation message length: ${confirmMessage.length} chars`);

      try {
        this.logger.debug(`About to call bot.editMessageText...`);
        this.logger.debug(`Final confirmation message:`, confirmMessage);

        const editParams = {
          chat_id: context.chatId,
          message_id: context.messageId,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        };

        this.logger.debug(`Edit parameters:`, JSON.stringify(editParams, null, 2));

        const editResult = await this.bot.editMessageText(confirmMessage, editParams);

        this.logger.info(`Successfully created broadcast confirmation message for admin ${adminId}`);
        this.logger.debug(`Edit result:`, editResult);
      } catch (error) {
        this.logger.error(`Failed to create broadcast confirmation message for admin ${adminId}`, {
          error: error.message,
          errorCode: error.code,
          errorResponse: error.response?.body,
          chatId: context.chatId,
          messageId: context.messageId
        });
        throw error;
      }

    } catch (error) {
      this.logger.error('Error handling broadcast text', error);
      await this.bot.sendMessage(msg.chat.id, '❌ Ошибка при обработке сообщения для рассылки.');
    }
  }

  async confirmBroadcast(query) {
    try {
      const adminId = query.from.id;

      this.logger.info(`BROADCAST CONFIRM: Method called for admin ${adminId}`);
      this.logger.debug(`BROADCAST CONFIRM: Query ID: ${query.id}`);
      this.logger.debug(`BROADCAST CONFIRM: Query callback_data: "${query.callback_data}"`);

      // Answer callback query immediately
      await this.bot.answerCallbackQuery(query.id, { text: 'Обрабатываем рассылку...' });

      // Get context and message
      const contextStr = await this.db.getSetting(`broadcast_context_${adminId}`);
      const messageStr = await this.db.getSetting(`broadcast_message_${adminId}`);

      this.logger.debug(`BROADCAST CONFIRM: Context found: ${!!contextStr}`);
      this.logger.debug(`BROADCAST CONFIRM: Message found: ${!!messageStr}`);

      if (!contextStr || !messageStr) {
        this.logger.error(`BROADCAST CONFIRM: Missing data - context: ${!!contextStr}, message: ${!!messageStr}`);
        return;
      }

      const context = JSON.parse(contextStr);
      const broadcastMessage = JSON.parse(messageStr);

      // Get target users
      const users = await this.getBroadcastUsers(context.type);
      this.logger.info(`Broadcast confirmation: type=${context.type}, users found=${users.length}`, { adminId });

      if (users.length === 0) {
        await this.bot.editMessageText(
          `❌ **Рассылка отменена**\n\nНе найдено пользователей для рассылки типа "${this.getBroadcastTypeName(context.type)}"`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '← Назад к рассылке', callback_data: 'admin_broadcast' }]
              ]
            }
          }
        );
        return;
      }

      // Validate sample of users before starting broadcast
      await this.validateActiveUsers(users);

      await this.bot.editMessageText(
        `🚀 **Рассылка запущена!**\n\n📊 Отправляется ${users.length} пользователям...\n\n⏳ Примерное время выполнения: ${Math.ceil(users.length / 20)} минут`,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'Markdown'
        }
      );

      // Start broadcast in background
      this.logger.info(`Starting executeBroadcast for ${users.length} users`, { adminId });
      // Execute broadcast without await to avoid blocking the callback response
      this.executeBroadcast(users, broadcastMessage, query.message.chat.id, adminId).catch(error => {
        this.logger.error('Error in background broadcast execution', error);
      });

      // Clean up settings
      await this.db.setSetting(`broadcast_context_${adminId}`, null);
      await this.db.setSetting(`broadcast_message_${adminId}`, null);

      // Clear user state
      if (this.userStates) {
        this.userStates.clearState(adminId);
      }

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
      sql += ' AND is_registered = 1';
      break;
    case 'deposit':
      sql += ' AND has_deposit = 1';
      break;
    case 'vip':
      sql += ' AND vip_access = 1';
      break;
    case 'all':
    default:
      // No additional condition for 'all'
      break;
    }

    // Add validation for valid telegram IDs
    sql += ' AND telegram_id IS NOT NULL AND telegram_id > 0';

    this.logger.info(`getBroadcastUsers: type=${type}, executing SQL: ${sql}`);

    const users = await this.db.query(sql);

    // Validate user IDs and log details
    const validUsers = users.filter(user => {
      const isValid = user.telegram_id &&
                     typeof user.telegram_id === 'number' &&
                     user.telegram_id > 0 &&
                     user.telegram_id < 10000000000; // Max valid Telegram ID range

      if (!isValid) {
        this.logger.warn(`Invalid user ID filtered out: ${user.telegram_id}`);
      }
      return isValid;
    });

    this.logger.info(`getBroadcastUsers: type=${type}, total found=${users.length}, valid=${validUsers.length} users`);

    // Log first few user IDs for debugging
    const sampleIds = validUsers.slice(0, 5).map(u => u.telegram_id);
    this.logger.info(`Sample user IDs: ${sampleIds.join(', ')}`);

    return validUsers;
  }

  async validateActiveUsers(users) {
    this.logger.info(`Validating ${users.length} users for broadcast...`);
    const activeUsers = [];
    const inactiveUsers = [];

    // Sample validation on first 5 users to check for major issues
    const sampleSize = Math.min(5, users.length);
    for (let i = 0; i < sampleSize; i++) {
      const user = users[i];
      try {
        // Try to get chat info - this will fail if user blocked bot or deleted account
        await this.bot.getChat(user.telegram_id);
        this.logger.debug(`User ${user.telegram_id} is active`);
      } catch (error) {
        if (error.code === 403) {
          this.logger.debug(`User ${user.telegram_id} has blocked the bot or deleted account`);
          inactiveUsers.push(user.telegram_id);
        } else if (error.code === 400) {
          this.logger.debug(`User ${user.telegram_id} chat not found`);
          inactiveUsers.push(user.telegram_id);
        } else {
          this.logger.warn(`Unexpected error checking user ${user.telegram_id}:`, error.message);
        }
      }
    }

    // If more than 50% of sample users are inactive, warn about it
    if (inactiveUsers.length > sampleSize * 0.5) {
      this.logger.warn(`High inactive user rate detected: ${inactiveUsers.length}/${sampleSize} users inactive`);
    }

    this.logger.info(`User validation complete. Proceeding with all ${users.length} users (sample check: ${sampleSize - inactiveUsers.length}/${sampleSize} active)`);
    return users; // Return all users, but we've logged the sample validation
  }

  async executeBroadcast(users, broadcastMessage, adminChatId, adminId) {
    let sentCount = 0;
    let errorCount = 0;
    let blockedCount = 0;
    let invalidCount = 0;
    const startTime = Date.now();

    this.logger.info(`Starting broadcast to ${users.length} users`, {
      adminId,
      type: 'broadcast_start',
      messageType: broadcastMessage.photo ? 'photo' : broadcastMessage.video ? 'video' : broadcastMessage.document ? 'document' : 'text'
    });

    // Log broadcast message details
    if (broadcastMessage.text) {
      this.logger.info(`Broadcast text: ${broadcastMessage.text.substring(0, 100)}${broadcastMessage.text.length > 100 ? '...' : ''}`);
    }

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      try {
        // Rate limiting: max 20 messages per second
        if (sentCount > 0 && sentCount % 20 === 0) {
          this.logger.debug(`Rate limiting: pausing for 1 second after ${sentCount} messages`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Additional validation before sending
        if (!user || !user.telegram_id) {
          this.logger.warn(`Skipping invalid user object at index ${i}:`, user);
          invalidCount++;
          continue;
        }

        this.logger.debug(`Sending broadcast message to user ${user.telegram_id} (${i + 1}/${users.length})`);
        await this.sendBroadcastMessage(user.telegram_id, broadcastMessage);
        sentCount++;
        this.logger.debug(`Successfully sent to user ${user.telegram_id}, total sent: ${sentCount}`);

        // Update progress every 50 messages
        if (sentCount % 50 === 0) {
          const progress = Math.round((sentCount / users.length) * 100);
          try {
            await this.bot.sendMessage(adminChatId,
              `📊 Прогресс рассылки: ${progress}% (${sentCount}/${users.length})\n❌ Ошибок: ${errorCount}${blockedCount > 0 ? `\n🚫 Заблокировали: ${blockedCount}` : ''}`
            );
          } catch (e) {
            this.logger.warn('Failed to send progress update', e.message);
          }
        }

      } catch (error) {
        errorCount++;

        // Categorize errors for better debugging
        if (error.message.includes('blocked') || error.message.includes('bot was blocked') ||
            error.code === 403 || error.response?.body?.error_code === 403) {
          blockedCount++;
          this.logger.debug(`User ${user.telegram_id} has blocked the bot`);
        } else if (error.message.includes('chat not found') || error.code === 400) {
          this.logger.warn(`Chat not found for user ${user.telegram_id}`, error.message);
        } else {
          this.logger.error(`Unexpected error sending to user ${user.telegram_id}`, {
            userId: user.telegram_id,
            error: error.message,
            errorCode: error.code,
            responseBody: error.response?.body
          });
        }
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const resultMessage = `✅ **Рассылка завершена!**

📊 Результаты:
• Отправлено: ${sentCount}/${users.length}
• Ошибок: ${errorCount}
${blockedCount > 0 ? `• Заблокировали бота: ${blockedCount}` : ''}
${invalidCount > 0 ? `• Некорректных ID: ${invalidCount}` : ''}
• Время выполнения: ${duration} сек

${errorCount > 0 ? '⚠️ Некоторые сообщения не были доставлены' : '🎉 Все сообщения доставлены успешно!'}`;

    try {
      await this.bot.sendMessage(adminChatId, resultMessage, { parse_mode: 'Markdown' });
    } catch (e) {
      this.logger.error('Error sending broadcast completion message', e);
    }

    // Log broadcast completion with detailed statistics
    await this.db.logUserAction(adminId, 'broadcast_completed', {
      target_users: users.length,
      sent_count: sentCount,
      error_count: errorCount,
      blocked_count: blockedCount,
      invalid_count: invalidCount,
      duration_seconds: duration
    });

    this.logger.info('Broadcast completed', {
      adminId,
      sentCount,
      errorCount,
      blockedCount,
      invalidCount,
      duration,
      totalUsers: users.length,
      successRate: users.length > 0 ? Math.round((sentCount / users.length) * 100) : 0
    });
  }

  async sendBroadcastMessage(userId, broadcastMessage) {
    this.logger.debug(`Attempting to send broadcast message to user ${userId}`);

    // Validate user ID before sending
    if (!userId || typeof userId !== 'number' || userId <= 0) {
      throw new Error(`Invalid user ID: ${userId}`);
    }

    // Additional validation: ensure this is a valid Telegram user ID
    if (userId < 0) {
      throw new Error(`Negative user ID detected (likely a group/channel): ${userId}`);
    }

    // Check if this looks like a group/channel ID (usually negative or very large)
    if (userId.toString().startsWith('-') || userId > 9999999999) {
      this.logger.warn(`Suspicious user ID that might be a group/channel: ${userId}`);
      throw new Error(`Suspicious user ID detected: ${userId}`);
    }

    const options = {
      parse_mode: 'Markdown'
    };

    // Add buttons if present
    if (broadcastMessage.reply_markup) {
      options.reply_markup = broadcastMessage.reply_markup;
    }

    try {
      if (broadcastMessage.photo) {
        options.caption = broadcastMessage.caption;
        this.logger.debug(`Sending photo to user ${userId}`);
        await this.bot.sendPhoto(userId, broadcastMessage.photo, options);
      } else if (broadcastMessage.video) {
        options.caption = broadcastMessage.caption;
        this.logger.debug(`Sending video to user ${userId}`);
        await this.bot.sendVideo(userId, broadcastMessage.video, options);
      } else if (broadcastMessage.document) {
        options.caption = broadcastMessage.caption;
        this.logger.debug(`Sending document to user ${userId}`);
        await this.bot.sendDocument(userId, broadcastMessage.document, options);
      } else {
        this.logger.debug(`Sending text message to user ${userId}: ${broadcastMessage.text?.substring(0, 50)}...`);
        await this.bot.sendMessage(userId, broadcastMessage.text, options);
      }
      this.logger.debug(`Successfully sent broadcast message to user ${userId}`);
    } catch (error) {
      // Enhanced error logging
      this.logger.error(`Failed to send broadcast message to user ${userId}`, {
        error: error.message,
        errorCode: error.code,
        response: error.response?.body || 'No response body',
        userId: userId,
        messageType: broadcastMessage.photo ? 'photo' : broadcastMessage.video ? 'video' : broadcastMessage.document ? 'document' : 'text'
      });
      throw error; // Re-throw to be handled by calling function
    }
  }

  escapeMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/[*_`[\]()~>#+=|{}.!-]/g, '\\$&')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&/g, '&amp;');
  }
}

module.exports = AdminHandler;
