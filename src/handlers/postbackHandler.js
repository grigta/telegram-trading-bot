const express = require('express');
const crypto = require('crypto');

class PostbackHandler {
  constructor(bot, database, logger) {
    this.bot = bot;
    this.db = database;
    this.logger = logger;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Middleware для парсинга JSON и URL-encoded данных
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Логирование всех входящих запросов
    this.app.use((req, res, next) => {
      this.logger.info(`Postback received: ${req.method} ${req.url}`, {
        headers: req.headers,
        query: req.query,
        body: req.body,
        ip: req.ip
      });
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // PocketOption постбэки
    this.app.get('/postback/pocketoption', (req, res) => this.handlePocketOptionPostback(req, res));
    this.app.post('/postback/pocketoption', (req, res) => this.handlePocketOptionPostback(req, res));

    // TopLink постбэки (если понадобятся)
    this.app.get('/postback/toplink', (req, res) => this.handleTopLinkPostback(req, res));
    this.app.post('/postback/toplink', (req, res) => this.handleTopLinkPostback(req, res));

    // Общий endpoint для других партнеров
    this.app.get('/postback/:partner', (req, res) => this.handleGenericPostback(req, res));
    this.app.post('/postback/:partner', (req, res) => this.handleGenericPostback(req, res));

    // 404 обработчик
    this.app.use('*', (req, res) => {
      this.logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Обработчик ошибок
    this.app.use((error, req, res, next) => {
      this.logger.error('Express error handler', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  async handlePocketOptionPostback(req, res) {
    try {
      const data = { ...req.query, ...req.body };

      this.logger.info('PocketOption postback received', data);

      // Валидация обязательных параметров
      const requiredParams = ['clickid'];
      const missingParams = requiredParams.filter(param => !data[param]);

      if (missingParams.length > 0) {
        this.logger.warn(`Missing required parameters: ${missingParams.join(', ')}`, data);
        return res.status(400).json({
          error: 'Missing required parameters',
          missing: missingParams
        });
      }

      // Валидация секретного ключа (если настроен)
      if (process.env.POCKETOPTION_SECRET_KEY) {
        if (!this.validatePocketOptionSignature(data)) {
          this.logger.warn('Invalid PocketOption signature', data);
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      // Найти пользователя по clickid
      const user = await this.findUserByClickId(data.clickid);
      if (!user) {
        this.logger.warn(`User not found for clickid: ${data.clickid}`);
        return res.status(404).json({ error: 'User not found' });
      }

      // Обработка различных типов событий
      let eventType = 'unknown';
      if (data.reg) {
        eventType = 'registration';
        await this.handleRegistration(user, data);
      } else if (data.ftd) {
        eventType = 'first_deposit';
        await this.handleFirstDeposit(user, data);
      } else if (data.dep) {
        eventType = 'deposit';
        await this.handleDeposit(user, data);
      }

      // Логирование события
      await this.db.logUserAction(user.telegram_id, `postback_${eventType}`, {
        partner: 'pocketoption',
        clickid: data.clickid,
        playerid: data.playerid,
        sum: data.sum,
        eventData: data
      });

      this.logger.info(`PocketOption ${eventType} processed for user ${user.telegram_id}`, data);

      res.json({
        status: 'success',
        event: eventType,
        user_id: user.telegram_id,
        processed_at: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Error processing PocketOption postback', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async handleTopLinkPostback(req, res) {
    try {
      const data = { ...req.query, ...req.body };

      this.logger.info('TopLink postback received', data);

      // Здесь будет логика для TopLink постбэков
      // Пока что возвращаем заглушку

      res.json({
        status: 'success',
        message: 'TopLink postback received but not implemented yet'
      });

    } catch (error) {
      this.logger.error('Error processing TopLink postback', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async handleGenericPostback(req, res) {
    try {
      const partner = req.params.partner;
      const data = { ...req.query, ...req.body };

      this.logger.info(`Generic postback received from ${partner}`, data);

      // Основная логика для обработки постбэков от других партнеров

      res.json({
        status: 'success',
        partner,
        message: 'Generic postback received',
        data
      });

    } catch (error) {
      this.logger.error('Error processing generic postback', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  validatePocketOptionSignature(data) {
    try {
      const secretKey = process.env.POCKETOPTION_SECRET_KEY;
      if (!secretKey) return true; // Если секрет не настроен, пропускаем валидацию

      // Создаем строку для подписи из параметров
      const params = Object.keys(data)
        .filter(key => key !== 'signature' && key !== 'hash')
        .sort()
        .map(key => `${key}=${data[key]}`)
        .join('&');

      const expectedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(params)
        .digest('hex');

      return data.signature === expectedSignature || data.hash === expectedSignature;
    } catch (error) {
      this.logger.error('Error validating signature', error);
      return false;
    }
  }

  async findUserByClickId(clickId) {
    try {
      // Пытаемся найти пользователя по clickid
      // clickid обычно содержит telegram_id пользователя

      // Если clickid - это прямо telegram_id
      const telegramId = parseInt(clickId);
      if (!isNaN(telegramId)) {
        const user = await this.db.getUserByTelegramId(telegramId);
        if (user) return user;
      }

      // Можно также сохранять clickid в отдельном поле при генерации ссылок
      // Пока что ищем по telegram_id
      this.logger.warn(`Could not parse telegram_id from clickid: ${clickId}`);
      return null;

    } catch (error) {
      this.logger.error('Error finding user by clickid', error);
      return null;
    }
  }

  async handleRegistration(user, data) {
    try {
      // Обновляем статус пользователя
      await this.db.updateUser(user.telegram_id, {
        partner_status: 'registered',
        partner_id: data.playerid,
        registration_date: new Date().toISOString()
      });

      // Отправляем уведомление пользователю с предложением пополнить депозит
      const lang = await this.db.getUserLanguage(user.telegram_id);

      let message, depositUrl;
      if (lang === 'en') {
        message = '🎉 *Congratulations! Registration completed successfully!*\n\n' +
                 '💰 To start earning, make your first deposit of $50 or more.\n\n' +
                 '🎁 *Special bonus:* Use promo code **50START** for extra bonus!\n\n' +
                 '👇 Click the button below to make your deposit:';
        depositUrl = 'https://u3.shortink.io/cabinet/demo-high-low/?try-demo=1&redirectUrl=cabinet/deposit-step-1&utm_campaign=764996&utm_source=affiliate&utm_medium=sr&a=qjU9XsMF2HJcK3&ac=bot&code=50START';
      } else {
        message = '🎉 *Поздравляем! Регистрация успешно завершена!*\n\n' +
                 '💰 Для начала заработка сделайте первый депозит от $50.\n\n' +
                 '🎁 *Специальный бонус:* Используйте промо-код **50START** для получения дополнительного бонуса!\n\n' +
                 '👇 Нажмите кнопку ниже для пополнения депозита:';
        depositUrl = 'https://po-ru4.click/cabinet/demo-high-low/?try-demo=1&redirectUrl=cabinet/deposit-step-1&utm_campaign=764996&utm_source=affiliate&utm_medium=sr&a=qjU9XsMF2HJcK3&ac=bot&code=50START';
      }

      const keyboard = {
        inline_keyboard: [
          [{
            text: lang === 'en' ? '💰 Make Deposit ($50+)' : '💰 Пополнить депозит ($50+)',
            url: depositUrl
          }]
        ]
      };

      await this.bot.sendMessage(user.telegram_id, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      this.logger.info(`Registration confirmed for user ${user.telegram_id}`);

    } catch (error) {
      this.logger.error('Error handling registration', error);
    }
  }

  async handleFirstDeposit(user, data) {
    try {
      const depositAmount = parseFloat(data.sum) || 0;

      // Обновляем статус пользователя
      await this.db.updateUser(user.telegram_id, {
        partner_status: 'deposited',
        first_deposit_amount: depositAmount,
        first_deposit_date: new Date().toISOString(),
        vip_status: true // Предоставляем VIP доступ после первого депозита
      });

      // Отправляем уведомление о VIP доступе
      await this.grantVipAccess(user, depositAmount);

      this.logger.info(`First deposit confirmed for user ${user.telegram_id}, amount: ${depositAmount}`);

    } catch (error) {
      this.logger.error('Error handling first deposit', error);
    }
  }

  async handleDeposit(user, data) {
    try {
      const depositAmount = parseFloat(data.sum) || 0;

      // Логируем повторный депозит
      await this.db.logUserAction(user.telegram_id, 'repeat_deposit', {
        amount: depositAmount,
        playerid: data.playerid
      });

      // Можно добавить дополнительную логику для повторных депозитов

      this.logger.info(`Repeat deposit confirmed for user ${user.telegram_id}, amount: ${depositAmount}`);

    } catch (error) {
      this.logger.error('Error handling deposit', error);
    }
  }

  async grantVipAccess(user, depositAmount) {
    try {
      const lang = await this.db.getUserLanguage(user.telegram_id);

      let message;
      if (lang === 'en') {
        message = '🎉 *VIP ACCESS UNLOCKED!*\n\n' +
                 `Your deposit of $${depositAmount} has been confirmed!\n\n` +
                 'You now have access to:\n' +
                 '🔔 Private trading signals\n' +
                 '📈 Exclusive market analysis\n' +
                 '💼 Personal trading consultation\n\n' +
                 'Welcome to the VIP club! 🌟';
      } else {
        message = '🎉 *VIP ДОСТУП ОТКРЫТ!*\n\n' +
                 `Ваш депозит в размере $${depositAmount} подтвержден!\n\n` +
                 'Теперь у вас есть доступ к:\n' +
                 '🔔 Приватным торговым сигналам\n' +
                 '📈 Эксклюзивной аналитике рынка\n' +
                 '💼 Персональным торговым консультациям\n\n' +
                 'Добро пожаловать в VIP клуб! 🌟';
      }

      await this.bot.sendMessage(user.telegram_id, message, {
        parse_mode: 'Markdown'
      });

      // Если настроен VIP канал, можно добавить пользователя
      if (process.env.VIP_CHANNEL_ID) {
        try {
          // Создаем пригласительную ссылку
          const inviteLink = await this.bot.createChatInviteLink(process.env.VIP_CHANNEL_ID, {
            member_limit: 1,
            expire_date: Math.floor(Date.now() / 1000) + 3600 // Истекает через час
          });

          const inviteMessage = lang === 'en'
            ? `🔗 Here's your private link to the VIP channel:\n${inviteLink.invite_link}\n\n*This link will expire in 1 hour.*`
            : `🔗 Вот ваша приватная ссылка на VIP канал:\n${inviteLink.invite_link}\n\n*Ссылка истекает через 1 час.*`;

          await this.bot.sendMessage(user.telegram_id, inviteMessage, {
            parse_mode: 'Markdown'
          });

        } catch (error) {
          this.logger.error('Error creating VIP channel invite', error);
        }
      }

    } catch (error) {
      this.logger.error('Error granting VIP access', error);
    }
  }

  startServer(port = 3000) {
    return new Promise((resolve, reject) => {
      // Bind to all interfaces (0.0.0.0) to accept external connections
      this.server = this.app.listen(port, '0.0.0.0', (error) => {
        if (error) {
          this.logger.error('Failed to start postback server', error);
          reject(error);
        } else {
          this.logger.info(`Postback server started on 0.0.0.0:${port}`);
          console.log(`🌐 Postback server running on 0.0.0.0:${port}`);
          resolve();
        }
      });
    });
  }

  stopServer() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Postback server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = PostbackHandler;
