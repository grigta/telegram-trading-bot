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
    const data = query.callback_data;

    if (!this.isAdmin(userId)) {
      await this.bot.answerCallbackQuery(query.id, { text: 'Доступ запрещен' });
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
        }
        break;
      }
    } catch (error) {
      this.logger.error('Error in admin callback', { userId, data, error: error.message });
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
    // Placeholder for broadcast functionality
    const message = '📢 *Рассылка*\n\nФункция рассылки будет реализована в следующих версиях.';

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

  // Placeholder method for broadcast text handling
  async handleBroadcastText(msg) {
    // This will be implemented in later phases
    await this.bot.sendMessage(msg.chat.id, 'Функция рассылки будет доступна в следующих версиях.');
  }
}

module.exports = AdminHandler;
