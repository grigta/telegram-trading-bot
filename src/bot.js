const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database/database');
const UserStates = require('./utils/userStates');
const MenuHandler = require('./handlers/menuHandler');
const SubscriptionChecker = require('./handlers/subscriptionChecker');
const AdminHandler = require('./handlers/adminHandler');
const PostbackHandler = require('./handlers/postbackHandler');
const AntiSpam = require('./services/antiSpam');
const Logger = require('./utils/logger');
const translator = require('./localization/translations');
const messageManager = require('./utils/messageManager');

class TradingBot {
  constructor(token) {
    this.bot = new TelegramBot(token, { polling: true });
    this.db = new Database();
    this.userStates = new UserStates();
    this.logger = new Logger();
    this.antiSpam = new AntiSpam(this.db, this.logger);

    this.menuHandler = new MenuHandler(this.bot, this.db, this.logger);
    this.subscriptionChecker = new SubscriptionChecker(this.bot, this.db, this.logger);
    this.adminHandler = new AdminHandler(this.bot, this.db, this.logger);
    this.postbackHandler = new PostbackHandler(this.bot, this.db, this.logger);

    // Set to track processed callback queries to prevent duplicates
    this.processedCallbacks = new Set();

    this.setupHandlers();
    this.setupErrorHandling();
  }

  async init() {
    try {
      await this.db.init();

      // Запускаем postback сервер
      const postbackPort = process.env.POSTBACK_PORT || 3000;
      await this.postbackHandler.startServer(postbackPort);

      this.logger.info('Bot initialized successfully');
      console.log('🤖 Trading Bot started successfully!');
    } catch (error) {
      this.logger.error('Failed to initialize bot', error);
      process.exit(1);
    }
  }

  setupHandlers() {
    // Start command
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));

    // Contact sharing
    this.bot.on('contact', (msg) => this.handleContact(msg));

    // Callback queries
    this.bot.on('callback_query', (query) => this.handleCallback(query));

    // Admin commands
    this.bot.onText(/\/admin/, (msg) => this.adminHandler.handleAdmin(msg));

    // Generic message handler
    this.bot.on('message', (msg) => this.handleMessage(msg));
  }

  setupErrorHandling() {
    // Bot polling errors
    this.bot.on('polling_error', (error) => {
      this.logger.error('Polling error', error);
    });

    // Process error handlers
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at Promise', { reason, promise });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async handleStart(msg) {
    try {
      const userId = msg.from.id;
      const userData = {
        telegram_id: userId,
        username: msg.from.username || null,
        first_name: msg.from.first_name || null,
        last_name: msg.from.last_name || null
      };

      // Create or update user
      await this.db.createOrUpdateUser(userData);
      await this.db.logUserAction(userId, 'start_command');

      this.logger.info(`User started bot: ${userId}`);

      // Check if user already has language set
      const user = await this.db.getUserByTelegramId(userId);

      if (!user || !user.language || !user.language_selected) {
        // Show language selection for new users or users who haven't explicitly selected language
        await this.showLanguageSelection(msg.chat.id);
      } else {
        // User already has language, proceed with normal flow
        const lang = user.language;

        // Check subscription (if channel configured)
        if (process.env.CHANNEL_USERNAME) {
          await this.subscriptionChecker.handleSubscriptionCheck(msg, lang);
        } else {
          // Skip subscription check and go directly to contact request or main menu
          if (!user.phone) {
            await this.requestPhoneNumber(msg.chat.id, lang);
          } else {
            await this.menuHandler.showMainMenu(msg.chat.id, userId);
          }
        }
      }

    } catch (error) {
      this.logger.error('Error in handleStart', error);
      await this.sendErrorMessage(msg.chat.id);
    }
  }

  async showLanguageSelection(chatId) {
    const sent = await this.bot.sendMessage(chatId, translator.get('chooseLanguage', 'ru'), {
      reply_markup: translator.getLanguageButtons()
    });
    messageManager.setLastMessage(chatId, sent.message_id);
  }

  async requestPhoneNumber(chatId, lang) {
    await this.bot.sendMessage(chatId, translator.get('sharePhone', lang), {
      reply_markup: {
        keyboard: [
          [{
            text: translator.get('sharePhoneButton', lang),
            request_contact: true
          }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }

  async handleContact(msg) {
    try {
      if (!msg.contact) return;

      const userId = msg.from.id;
      const phone = msg.contact.phone_number;
      const lang = await this.db.getUserLanguage(userId);

      // Anti-spam check
      if (await this.antiSpam.isSpam(userId, 'contact_sharing')) {
        await this.bot.sendMessage(msg.chat.id, translator.get('tooManyAttempts', lang));
        return;
      }

      // Validate phone number
      const validation = this.antiSpam.validatePhoneNumber(phone);
      if (!validation.valid) {
        const errorMsg = lang === 'en'
          ? `❌ ${validation.error}\n\nPlease try sharing your number again.`
          : `❌ ${validation.error}\n\nПопробуйте поделиться номером еще раз.`;
        await this.bot.sendMessage(msg.chat.id, errorMsg);
        return;
      }

      const cleanPhone = validation.phone;

      // Check for duplicate phone
      if (await this.antiSpam.checkDuplicatePhone(userId, cleanPhone)) {
        const supportUsername = process.env.SUPPORT_USERNAME || 'support';
        await this.bot.sendMessage(msg.chat.id,
          translator.get('duplicatePhone', lang) + supportUsername);
        await this.db.logUserAction(userId, 'duplicate_phone_rejected', { phone: cleanPhone });
        return;
      }

      // Check for suspicious activity
      const suspiciousCheck = await this.antiSpam.checkSuspiciousActivity(userId);
      if (suspiciousCheck.suspicious) {
        this.logger.warn(`Suspicious activity detected for user ${userId}: ${suspiciousCheck.reason}`);
        await this.antiSpam.handleSpamDetection(userId, 'contact_sharing', suspiciousCheck.reason);

        // Still allow contact sharing but with extra logging
        await this.db.logUserAction(userId, 'suspicious_contact_sharing', {
          phone: cleanPhone,
          reason: suspiciousCheck.reason
        });
      }

      // Update user with phone
      await this.db.updateUser(userId, { phone: cleanPhone });
      await this.db.logUserAction(userId, 'phone_shared', { phone: cleanPhone });

      this.logger.info(`User shared phone: ${userId}, phone: ${cleanPhone}`);

      // Send confirmation message
      await this.bot.sendMessage(msg.chat.id,
        translator.get('phoneSuccess', lang),
        {
          parse_mode: 'Markdown',
          reply_markup: { remove_keyboard: true }
        }
      );

      // Show main menu after short delay
      setTimeout(async () => {
        await this.menuHandler.showMainMenu(msg.chat.id, userId);
      }, 1500);

    } catch (error) {
      this.logger.error('Error in handleContact', error);
      await this.sendErrorMessage(msg.chat.id);
    }
  }

  async handleCallback(query) {
    try {
      const userId = query.from.id;
      const callbackId = query.id;
      const data = query.callback_data || query.data;

      // Check for duplicate callback processing
      if (this.processedCallbacks.has(callbackId)) {
        this.logger.warn(`Duplicate callback query detected for user ${userId}: ${callbackId}`);
        return;
      }

      // Add callback to processed set
      this.processedCallbacks.add(callbackId);

      // Clean up old callback IDs (keep only last 1000)
      if (this.processedCallbacks.size > 1000) {
        const oldCallbacks = Array.from(this.processedCallbacks).slice(0, 500);
        oldCallbacks.forEach(id => this.processedCallbacks.delete(id));
      }

      this.logger.info(`Callback query: ${userId}, data: ${data}`);

      // Check if data is undefined or null
      if (!data) {
        this.logger.warn(`Callback data is undefined for user: ${userId}`);
        this.logger.warn(`Query keys: ${Object.keys(query)}`);
        await this.bot.answerCallbackQuery(query.id, { text: 'Ошибка: данные не получены' });
        return;
      }

      await this.db.logUserAction(userId, 'callback_query', { data });

      // Route callback to appropriate handler
      if (data.startsWith('lang_')) {
        await this.handleLanguageCallback(query);
      } else if (data.startsWith('admin_')) {
        await this.adminHandler.handleCallback(query);
      } else if (data === 'check_subscription') {
        await this.subscriptionChecker.handleSubscriptionCallback(query);
      } else {
        await this.menuHandler.handleCallback(query);
      }

      // Answer callback query
      await this.bot.answerCallbackQuery(query.id);

    } catch (error) {
      this.logger.error('Error in handleCallback', error);
      await this.bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка' });
    }
  }

  async handleLanguageCallback(query) {
    try {
      const userId = query.from.id;
      const chatId = query.message.chat.id;
      const data = query.callback_data || query.data;

      // Validate callback data exists and is a string
      if (!data || typeof data !== 'string') {
        this.logger.warn(`Invalid callback data for user ${userId}: ${data}`);
        await this.bot.answerCallbackQuery(query.id, { text: 'Error: Invalid data' });
        return;
      }

      // Validate callback data format
      if (!data.startsWith('lang_')) {
        this.logger.warn(`Unexpected callback data format for user ${userId}: ${data}`);
        await this.bot.answerCallbackQuery(query.id, { text: 'Error: Invalid language data' });
        return;
      }

      const selectedLang = data.replace('lang_', '');

      // Validate language
      if (!translator.isValidLanguage(selectedLang)) {
        await this.bot.answerCallbackQuery(query.id, { text: 'Invalid language' });
        return;
      }

      // Ensure user exists before setting language
      let user = await this.db.getUserByTelegramId(userId);
      const isNewUser = !user || !user.language_selected;
      if (!user) {
        const userData = {
          telegram_id: userId,
          username: query.from.username || null,
          first_name: query.from.first_name || null,
          last_name: query.from.last_name || null
        };
        await this.db.createOrUpdateUser(userData);
      }

      // Update user language
      await this.db.setUserLanguage(userId, selectedLang);
      await this.db.logUserAction(userId, 'language_changed', { language: selectedLang });

      // Send confirmation
      await this.bot.editMessageText(translator.get('languageChanged', selectedLang), {
        chat_id: chatId,
        message_id: query.message.message_id
      });

      // Send welcome message
      const welcomeMessage = await this.bot.sendMessage(chatId, translator.get('welcome', selectedLang), {
        parse_mode: 'Markdown'
      });

      if (isNewUser && welcomeMessage && welcomeMessage.message_id) {
        setTimeout(() => {
          this.bot.deleteMessage(chatId, welcomeMessage.message_id).catch(() => {});
        }, 3000);
      }
      messageManager.setLastMessage(chatId, welcomeMessage.message_id);

      // Continue with subscription check or phone request
      user = await this.db.getUserByTelegramId(userId);

      // Small delay to let the confirmation message show
      setTimeout(async () => {
        if (process.env.CHANNEL_USERNAME) {
          await this.subscriptionChecker.handleSubscriptionCheck(query.message, selectedLang);
        } else if (!user.phone) {
          await this.requestPhoneNumber(chatId, selectedLang);
        } else {
          await this.menuHandler.showMainMenu(chatId, userId);
        }
      }, 1000);

    } catch (error) {
      this.logger.error('Error in handleLanguageCallback', error.message, error.stack);
      await this.bot.answerCallbackQuery(query.id, { text: 'Error' });
    }
  }

  async handleMessage(msg) {
    try {
      // Skip if it's a command or contact
      if (msg.text && msg.text.startsWith('/') || msg.contact) {
        return;
      }

      const userId = msg.from.id;
      const currentState = this.userStates.getState(userId);

      this.logger.info(`Message from ${userId}, state: ${currentState}, text: ${msg.text}`);

      // Handle based on current state
      switch (currentState) {
      case 'waiting_broadcast_text':
        await this.adminHandler.handleBroadcastText(msg);
        break;
      default:
        // For unknown messages, show main menu
        const user = await this.db.getUserByTelegramId(userId);
        if (user && user.phone) {
          await this.menuHandler.showMainMenu(msg.chat.id, userId);
        } else {
          await this.subscriptionChecker.handleSubscriptionCheck(msg);
        }
        break;
      }

    } catch (error) {
      this.logger.error('Error in handleMessage', error);
      await this.sendErrorMessage(msg.chat.id);
    }
  }


  async sendErrorMessage(chatId, userId = null) {
    try {
      let lang = 'ru';
      if (userId) {
        lang = await this.db.getUserLanguage(userId);
      }
      await this.bot.sendMessage(chatId, translator.get('error', lang));
    } catch (error) {
      this.logger.error('Failed to send error message', error);
    }
  }

  async shutdown() {
    console.log('🔄 Shutting down bot gracefully...');
    try {
      await this.postbackHandler.stopServer();
      await this.db.close();
      await this.bot.stopPolling();
      console.log('✅ Bot shutdown complete');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown', error);
      process.exit(1);
    }
  }
}

module.exports = TradingBot;
