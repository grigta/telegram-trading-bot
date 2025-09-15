const translator = require('../localization/translations');

class SubscriptionChecker {
  constructor(bot, database, logger) {
    this.bot = bot;
    this.db = database;
    this.logger = logger;
    this.channelUsername = process.env.CHANNEL_USERNAME || '@your_channel';
  }

  async checkSubscription(userId, retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    try {
      const chatMember = await this.bot.getChatMember(this.channelUsername, userId);
      const validStatuses = ['member', 'administrator', 'creator'];
      const isSubscribed = validStatuses.includes(chatMember.status);

      this.logger.info(`Subscription check for ${userId}: ${isSubscribed ? 'subscribed' : 'not subscribed'}`, {
        userId,
        status: chatMember.status,
        channel: this.channelUsername
      });

      return isSubscribed;
    } catch (error) {
      this.logger.error('Subscription check error', {
        userId,
        channel: this.channelUsername,
        error: error.message,
        code: error.code,
        retry: retryCount
      });

      // Handle specific Telegram API errors
      if (error.code === 'ETELEGRAM') {
        const response = error.response;

        // Bot was blocked by user
        if (response && response.error_code === 403 && response.description.includes('bot was blocked')) {
          this.logger.warn(`Bot was blocked by user ${userId}`);
          return false;
        }

        // User not found in chat (likely not subscribed)
        if (response && response.error_code === 400 && response.description.includes('user not found')) {
          this.logger.info(`User ${userId} not found in channel (not subscribed)`);
          return false;
        }

        // Rate limit - retry after delay
        if (response && response.error_code === 429) {
          const retryAfter = response.parameters?.retry_after || 1;
          if (retryCount < maxRetries) {
            this.logger.warn(`Rate limited, retrying after ${retryAfter}s`, { userId, retryCount });
            await this.sleep(retryAfter * 1000);
            return await this.checkSubscription(userId, retryCount + 1);
          }
        }

        // Chat not found (wrong channel username)
        if (response && response.error_code === 400 && response.description.includes('chat not found')) {
          this.logger.error(`Channel not found: ${this.channelUsername}. Check CHANNEL_USERNAME in .env`);
          return false;
        }
      }

      // Retry on network errors
      if ((error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') && retryCount < maxRetries) {
        this.logger.warn(`Network error, retrying in ${retryDelay}ms`, { userId, retryCount });
        await this.sleep(retryDelay * Math.pow(2, retryCount)); // Exponential backoff
        return await this.checkSubscription(userId, retryCount + 1);
      }

      // Default: assume not subscribed on persistent errors
      return false;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async handleSubscriptionCheck(msg, lang = null) {
    const userId = msg.from.id;
    if (!lang) {
      lang = await this.db.getUserLanguage(userId);
    }

    try {
      const isSubscribed = await this.checkSubscription(userId);

      if (isSubscribed) {
        await this.db.updateUser(userId, { is_subscribed: true });
        await this.db.logUserAction(userId, 'subscription_confirmed');

        this.logger.info(`User subscription confirmed: ${userId}`);
        await this.requestContact(msg, lang);
      } else {
        await this.showSubscriptionPrompt(msg, lang);
      }
    } catch (error) {
      this.logger.error('Error in handleSubscriptionCheck', { userId, error: error.message });
      throw error;
    }
  }

  async handleSubscriptionCallback(query) {
    const userId = query.from.id;
    const data = query.callback_data;

    try {
      if (data === 'check_subscription') {
        await this.handleCheckSubscription(query);
      } else if (data === 'subscription_help') {
        await this.showSubscriptionHelp(query);
      }
    } catch (error) {
      this.logger.error('Error in handleSubscriptionCallback', { userId, data, error: error.message });
      await this.bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка' });
    }
  }

  async handleCheckSubscription(query) {
    const userId = query.from.id;

    try {
      // Show loading message
      const lang = await this.db.getUserLanguage(userId);
      await this.bot.answerCallbackQuery(query.id, {
        text: lang === 'en' ? '🔄 Checking subscription...' : '🔄 Проверяем подписку...'
      });

      const isSubscribed = await this.checkSubscription(userId);

      if (isSubscribed) {
        await this.db.updateUser(userId, { is_subscribed: true });
        await this.db.logUserAction(userId, 'subscription_confirmed');

        this.logger.info(`User subscription confirmed via callback: ${userId}`);

        // Show success message
        const successMsg = lang === 'en'
          ? '✅ *Great! Subscription confirmed!*\n\nNow share your phone number to receive personalized notifications.'
          : '✅ *Отлично! Подписка подтверждена!*\n\nТеперь поделитесь номером телефона для получения персональных уведомлений.';

        await this.bot.editMessageText(successMsg, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'Markdown'
        });

        // Request contact after short delay
        setTimeout(async () => {
          await this.requestContact({ from: query.from, chat: query.message.chat });
        }, 1500);

      } else {
        const errorMsg = lang === 'en'
          ? '❌ Subscription not found. Make sure you subscribed to the channel and try again in a few seconds.'
          : '❌ Подписка не найдена. Убедитесь, что вы подписались на канал, и попробуйте снова через несколько секунд.';

        await this.bot.answerCallbackQuery(query.id, {
          text: errorMsg,
          show_alert: true
        });

        // Update button text to show retry
        const keyboard = {
          inline_keyboard: [
            [{
              text: lang === 'en' ? '📢 Subscribe to channel' : '📢 Подписаться на канал',
              url: `https://t.me/${this.channelUsername.substring(1)}`
            }],
            [{
              text: lang === 'en' ? '🔄 Check again' : '🔄 Проверить еще раз',
              callback_data: 'check_subscription'
            }],
            [{
              text: lang === 'en' ? '❓ Help with subscription' : '❓ Помощь с подпиской',
              callback_data: 'subscription_help'
            }]
          ]
        };

        await this.bot.editMessageReplyMarkup(keyboard, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id
        });
      }
    } catch (error) {
      this.logger.error('Error checking subscription', { userId, error: error.message });
      await this.bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка при проверке подписки' });
    }
  }

  async showSubscriptionHelp(query) {
    const userId = query.from.id;
    const lang = await this.db.getUserLanguage(userId);

    const helpMessage = lang === 'en' ? `
❓ *Help with subscription*

If you're having trouble subscribing:

1️⃣ *Make sure you clicked "Subscribe"* in the channel
2️⃣ *Wait 3-5 seconds* after subscribing
3️⃣ *Try clicking "Check again"*

🔧 *If the problem persists:*
• Leave the channel and subscribe again
• Restart the bot with /start
• Contact support: @${process.env.SUPPORT_USERNAME}

💡 *Important:* The bot can only verify subscription if the channel is public and the bot has admin rights.
    ` : `
❓ *Помощь с подпиской*

Если у вас возникли проблемы с подпиской:

1️⃣ *Убедитесь, что вы нажали "Подписаться"* в канале
2️⃣ *Подождите 3-5 секунд* после подписки
3️⃣ *Попробуйте нажать "Проверить еще раз"*

🔧 *Если проблема не решилась:*
• Выйдите из канала и подпишитесь заново
• Перезапустите бота командой /start
• Обратитесь в поддержку: @${process.env.SUPPORT_USERNAME}

💡 *Важно:* Бот может проверить подписку только если канал публичный и у бота есть права администратора в канале.
    `;

    await this.bot.sendMessage(query.message.chat.id, helpMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: lang === 'en' ? '🔄 Try again' : '🔄 Попробовать снова', callback_data: 'check_subscription' }],
          [{ text: lang === 'en' ? '💬 Contact support' : '💬 Связаться с поддержкой', url: `https://t.me/${process.env.SUPPORT_USERNAME}` }]
        ]
      }
    });

    await this.bot.answerCallbackQuery(query.id);
    await this.db.logUserAction(query.from.id, 'subscription_help_requested');
  }

  async showSubscriptionPrompt(msg, lang = 'ru') {
    const channelLink = `https://t.me/${this.channelUsername.substring(1)}`;

    const keyboard = {
      inline_keyboard: [
        [{
          text: lang === 'en' ? '📢 Subscribe to the channel' : '📢 Подписаться на канал',
          url: channelLink
        }],
        [{
          text: lang === 'en' ? "✅ I've subscribed!" : '✅ Я подписался!',
          callback_data: 'check_subscription'
        }],
        [{
          text: lang === 'en' ? '❓ Help with subscription' : '❓ Помощь с подпиской',
          callback_data: 'subscription_help'
        }]
      ]
    };

    const message = lang === 'en' ? `
*Before we start, subscribe to my channel with key trading content:*

• News-based trading signals
• Free strategies and guides
• Real results and case studies

*This step is required to access the bot.*

*How to subscribe:*
1. Click "📢 Subscribe to the channel"
2. Click "Subscribe" in the channel
3. Return here and click "✅ I've subscribed!"
    ` : `
*Прежде чем начать, подпишитесь на мой канал с ключевым торговым контентом:*

• Торговые сигналы на основе новостей
• Бесплатные стратегии и гайды
• Реальные результаты и кейсы

*Этот шаг необходим для доступа к боту.*

*Как подписаться:*
1. Нажмите кнопку "📢 Подписаться на канал"
2. В открывшемся канале нажмите "Подписаться"
3. Вернитесь сюда и нажмите "✅ Я подписался!"
    `;

    await this.bot.sendMessage(msg.chat.id, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    await this.db.logUserAction(msg.from.id, 'subscription_prompt_shown', {
      channel: this.channelUsername,
      link: channelLink
    });

    this.logger.info(`Subscription prompt shown to user: ${msg.from.id}`);
  }

  async requestContact(msg, lang = 'ru') {
    // Check if user already has phone
    const existingUser = await this.db.getUserByTelegramId(msg.from.id);
    if (existingUser && existingUser.phone) {
      this.logger.info(`User ${msg.from.id} already has phone: ${existingUser.phone}`);
      // Skip contact request, go directly to main menu
      const MenuHandler = require('./menuHandler');
      const menuHandler = new MenuHandler(this.bot, this.db, this.logger);
      await menuHandler.showMainMenu(msg.chat.id, msg.from.id);
      return;
    }

    const keyboard = {
      keyboard: [
        [{ text: lang === 'en' ? '📱 Share phone number' : '📱 Поделиться номером телефона', request_contact: true }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };

    const message = lang === 'en' ? `
📱 *Share your phone number*

🎯 This is necessary for:
• 🔔 Personal trading signal notifications
• 🎁 Exclusive bonuses and promotions
• 🆘 Quick support communication
• 💰 Notifications about new earning opportunities

🔐 *Privacy guaranteed:*
• Your number is used only for notifications
• We don't share data with third parties
• You can unsubscribe anytime

👇 Press the button below to continue
    ` : `
📱 *Поделитесь номером телефона*

🎯 Это необходимо для:
• 🔔 Персональных уведомлений о торговых сигналах
• 🎁 Получения эксклюзивных бонусов и акций
• 🆘 Быстрой связи с поддержкой
• 💰 Уведомлений о новых возможностях заработка

🔐 *Конфиденциальность гарантирована:*
• Ваш номер используется только для уведомлений
• Мы не передаем данные третьим лицам
• Вы можете отписаться в любой момент

👇 Нажмите кнопку ниже, чтобы продолжить
    `;

    await this.bot.sendMessage(msg.chat.id, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    await this.db.logUserAction(msg.from.id, 'contact_request_shown');
    this.logger.info(`Contact request shown to user: ${msg.from.id}`);
  }
}

module.exports = SubscriptionChecker;
