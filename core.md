## THIS IS CORE .MD FILE OF PROJECT
# Telegram Bot Core Architecture

## Обзор системы

Telegram бот для партнерского маркетинга с проверкой подписки на канал, сбором контактов и управлением VIP доступом.

## Архитектура

### Компоненты системы

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Telegram Bot  │────│   Core Logic     │────│   Database      │
│                 │    │                  │    │                 │
│ - Message       │    │ - User States    │    │ - Users         │
│ - Callbacks     │    │ - Subscription   │    │ - Subscriptions │
│ - Webhooks      │    │ - Menu Handler   │    │ - Logs          │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Integrations  │    │   Admin Commands │    │   Postbacks     │
│                 │    │                  │    │                 │
│ - Pocket Option │    │ - /admin Stats   │    │ - Registration  │
│ - TopLink       │    │ - Users List     │    │ - Deposit       │
│ - Tilda         │    │ - Broadcasting   │    │ - FTD Events    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Основные модули

### 1. Bot Handler (bot.js)

```javascript
const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database');
const UserStates = require('./userStates');
const MenuHandler = require('./menuHandler');
const SubscriptionChecker = require('./subscriptionChecker');
const AdminHandler = require('./adminHandler');

class TradingBot {
  constructor(token) {
    this.bot = new TelegramBot(token, { polling: true });
    this.db = new Database();
    this.userStates = new UserStates();
    this.menuHandler = new MenuHandler(this.bot, this.db);
    this.subscriptionChecker = new SubscriptionChecker(this.bot, this.db);
    this.adminHandler = new AdminHandler(this.bot, this.db);
    
    this.setupHandlers();
  }

  setupHandlers() {
    // /start command
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
    
    // Contact sharing
    this.bot.on('contact', (msg) => this.handleContact(msg));
    
    // Callback queries
    this.bot.on('callback_query', (query) => this.handleCallback(query));
    
    // Admin commands
    this.bot.onText(/\/admin/, (msg) => this.adminHandler.handleAdmin(msg));
    
    // Postback webhooks
    this.setupPostbackHandlers();
  }
}
```

### 2. Database Schema (database.js)

```sql
-- Users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  phone VARCHAR(20),
  is_subscribed BOOLEAN DEFAULT FALSE,
  is_registered BOOLEAN DEFAULT FALSE,
  has_deposit BOOLEAN DEFAULT FALSE,
  vip_access BOOLEAN DEFAULT FALSE,
  registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User logs table
CREATE TABLE user_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id BIGINT,
  action VARCHAR(255),
  details TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- Settings table
CREATE TABLE settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Subscription Checker (subscriptionChecker.js)

```javascript
class SubscriptionChecker {
  constructor(bot, database) {
    this.bot = bot;
    this.db = database;
    this.channelUsername = process.env.CHANNEL_USERNAME || '@your_channel';
  }

  async checkSubscription(userId) {
    try {
      const chatMember = await this.bot.getChatMember(this.channelUsername, userId);
      const validStatuses = ['member', 'administrator', 'creator'];
      return validStatuses.includes(chatMember.status);
    } catch (error) {
      console.error('Subscription check error:', error);
      return false;
    }
  }

  async handleSubscriptionCheck(msg) {
    const userId = msg.from.id;
    const isSubscribed = await this.checkSubscription(userId);
    
    if (isSubscribed) {
      await this.db.updateUser(userId, { is_subscribed: true });
      await this.requestContact(msg);
    } else {
      await this.showSubscriptionPrompt(msg);
    }
  }

  async showSubscriptionPrompt(msg) {
    const keyboard = {
      inline_keyboard: [
        [{ text: 'Подписаться на канал', url: `https://t.me/${this.channelUsername.substring(1)}` }],
        [{ text: 'Я подписался ✅', callback_data: 'check_subscription' }]
      ]
    };

    await this.bot.sendMessage(msg.chat.id, 
      '📢 Для продолжения подпишитесь на наш Telegram-канал и получите доступ к эксклюзивным торговым сигналам!',
      { reply_markup: keyboard }
    );
  }

  async requestContact(msg) {
    const keyboard = {
      keyboard: [
        [{ text: 'Поделиться номером телефона', request_contact: true }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };

    await this.bot.sendMessage(msg.chat.id,
      '📱 Поделитесь номером телефона для получения персональных уведомлений и бонусов',
      { reply_markup: keyboard }
    );
  }
}
```

### 4. Menu Handler (menuHandler.js)

```javascript
class MenuHandler {
  constructor(bot, database) {
    this.bot = bot;
    this.db = database;
  }

  async showMainMenu(chatId) {
    const keyboard = {
      inline_keyboard: [
        [{ text: '💰 Копировать мои сделки', callback_data: 'copy_trades' }],
        [{ text: '🔔 Приватные сигналы', callback_data: 'private_signals' }],
        [{ text: '📚 Бесплатная информация', callback_data: 'free_info' }],
        [
          { text: '🎯 Связаться со мной', url: `https://t.me/${process.env.OWNER_USERNAME}` },
          { text: '🛠 Поддержка 24/7', url: `https://t.me/${process.env.SUPPORT_USERNAME}` }
        ]
      ]
    };

    const message = `
🎯 *Добро пожаловать в мир успешной торговли!*

Выберите интересующий вас раздел:

💰 *Копировать мои сделки* - автоматическое копирование успешных торговых операций
🔔 *Приватные сигналы* - эксклюзивные сигналы для VIP участников  
📚 *Бесплатная информация* - полезные материалы и курсы
🎯 *Связаться со мной* - прямая связь с трейдером
🛠 *Поддержка 24/7* - помощь в любое время

_Начните свой путь к финансовой независимости уже сегодня!_
    `;

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async handleCopyTrades(query) {
    const keyboard = {
      inline_keyboard: [
        [{ text: '⚡️ Зарегистрироваться и получить бонус →', callback_data: 'register_po' }],
        [{ text: '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    const message = `
💰 *Копирование торговых сделок*

🎯 Автоматически повторяйте мои успешные сделки
📈 Средняя прибыльность: 78% в месяц
⚡️ Быстрая обработка сигналов (2-5 секунд)
🛡 Встроенное управление рисками

*Как это работает:*
1. Регистрируетесь на платформе
2. Пополняете счет (мин. $10)
3. Включаете автокопирование
4. Получаете прибыль автоматически!

💎 *Бонус для новых пользователей: +100% к депозиту*
    `;

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async handlePrivateSignals(query) {
    const keyboard = {
      inline_keyboard: [
        [{ text: '🚀 Получить VIP доступ', callback_data: 'get_vip' }],
        [{ text: '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    const message = `
🔔 *Приватные VIP сигналы*

🎯 Эксклюзивные торговые сигналы для VIP участников
📊 Точность сигналов: 85%+
⏰ 3-5 сигналов ежедневно
📱 Мгновенные уведомления

*Что входит в VIP:*
• Приватный Telegram канал
• Подробный анализ каждой сделки  
• Персональные консультации
• Стратегии управления капиталом
• Приоритетная поддержка 24/7

💎 *VIP доступ открывается после первого депозита*
    `;

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async handleFreeInfo(query) {
    const keyboard = {
      inline_keyboard: [
        [{ text: '📖 Скачать PDF гид', callback_data: 'download_pdf' }],
        [{ text: '🎥 Бесплатный курс', callback_data: 'free_course' }],
        [{ text: '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    const message = `
📚 *Бесплатная информация*

🎁 Полезные материалы для изучения торговли:

📖 *PDF Гид "Основы трейдинга"*
• Базовые принципы торговли
• Управление рисками
• Психология трейдера
• Практические примеры

🎥 *Бесплатный видео-курс*
• 5 уроков для начинающих
• Разбор реальных сделок
• Секреты профессионалов
• Домашние задания

💡 Изучите основы перед началом торговли!
    `;

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
}
```

### 5. Postback Handler (postbacks.js)

```javascript
const express = require('express');

class PostbackHandler {
  constructor(bot, database) {
    this.bot = bot;
    this.db = database;
    this.app = express();
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Pocket Option postbacks
    this.app.post('/postback/po', (req, res) => this.handlePocketOptionPostback(req, res));
    
    // TopLink postbacks
    this.app.post('/postback/toplink', (req, res) => this.handleTopLinkPostback(req, res));
  }

  async handlePocketOptionPostback(req, res) {
    try {
      const { event, user_id, amount, currency } = req.body;
      
      // Find user by custom parameter (telegram_id)
      const telegramId = req.body.custom_param || user_id;
      const user = await this.db.getUserByTelegramId(telegramId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      switch (event) {
        case 'registration':
          await this.handleRegistration(user, req.body);
          break;
          
        case 'deposit':
        case 'ftd':
          await this.handleDeposit(user, req.body);
          break;
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Postback error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async handleRegistration(user, data) {
    // Update user registration status
    await this.db.updateUser(user.telegram_id, { 
      is_registered: true,
      registration_date: new Date()
    });

    // Log action
    await this.db.logUserAction(user.telegram_id, 'registration', data);

    // Send congratulations message
    const message = `
🎉 *Поздравляем с регистрацией!*

Ваш аккаунт успешно создан. Теперь пополните счет для получения:

💎 Бонуса к депозиту
🔔 Доступа к VIP сигналам  
📈 Возможности копировать сделки

Минимальный депозит: $10
    `;

    await this.bot.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
  }

  async handleDeposit(user, data) {
    // Update user deposit status
    await this.db.updateUser(user.telegram_id, { 
      has_deposit: true,
      vip_access: true,
      first_deposit_date: new Date()
    });

    // Log action
    await this.db.logUserAction(user.telegram_id, 'deposit', data);

    // Grant VIP access
    await this.grantVipAccess(user);

    // Send success message with VIP link
    const message = `
🚀 *Поздравляем с первым депозитом!*

💰 Депозит: $${data.amount}
🎁 Бонус активирован

🔥 *VIP доступ открыт!*
Присоединяйтесь к закрытому каналу с приватными сигналами:

👇 Ваша персональная ссылка:
${process.env.VIP_CHANNEL_LINK}?start=${user.telegram_id}

📈 Желаем успешной торговли!
    `;

    await this.bot.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
  }

  async grantVipAccess(user) {
    try {
      // Add user to VIP channel
      await this.bot.approveChatJoinRequest(process.env.VIP_CHANNEL_ID, user.telegram_id);
    } catch (error) {
      console.error('Error granting VIP access:', error);
    }
  }

  start(port = 3000) {
    this.app.listen(port, () => {
      console.log(`Postback server running on port ${port}`);
    });
  }
}
```

### 6. Admin Handler (adminHandler.js)

```javascript
class AdminHandler {
  constructor(bot, database) {
    this.bot = bot;
    this.db = database;
    this.adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];
  }

  isAdmin(userId) {
    return this.adminIds.includes(userId);
  }

  async handleAdmin(msg) {
    if (!this.isAdmin(msg.from.id)) {
      await this.bot.sendMessage(msg.chat.id, '❌ У вас нет доступа к админ-панели');
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
  }

  async showStats(query) {
    if (!this.isAdmin(query.from.id)) return;

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
  }

  async showUsers(query, page = 1) {
    if (!this.isAdmin(query.from.id)) return;

    const limit = 10;
    const offset = (page - 1) * limit;
    const users = await this.db.getUsers(limit, offset);
    const total = await this.db.getTotalUsers();

    let message = `👥 *Пользователи (стр. ${page}/${Math.ceil(total/limit)})*\n\n`;
    
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
          { text: '⬅️', callback_data: `admin_users_${page-1}` },
          { text: `${page}/${Math.ceil(total/limit)}`, callback_data: 'noop' },
          { text: '➡️', callback_data: `admin_users_${page+1}` }
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
  }

  async handleBroadcast(query) {
    if (!this.isAdmin(query.from.id)) return;

    const keyboard = {
      inline_keyboard: [
        [{ text: '📤 Всем пользователям', callback_data: 'broadcast_all' }],
        [{ text: '📱 С телефоном', callback_data: 'broadcast_phone' }],
        [{ text: '💰 Зарегистрированным', callback_data: 'broadcast_registered' }],
        [{ text: '👑 VIP пользователям', callback_data: 'broadcast_vip' }],
        [{ text: '← Назад', callback_data: 'admin_menu' }]
      ]
    };

    await this.bot.editMessageText(
      '📢 *Рассылка сообщений*\n\nВыберите целевую аудиторию:', 
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  async showLogs(query, page = 1) {
    if (!this.isAdmin(query.from.id)) return;

    const limit = 20;
    const offset = (page - 1) * limit;
    const logs = await this.db.getRecentLogs(limit, offset);
    const total = await this.db.getTotalLogs();

    let message = `📝 *Логи активности (стр. ${page}/${Math.ceil(total/limit)})*\n\n`;
    
    logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleString('ru-RU');
      message += `🕒 ${time}\n`;
      message += `👤 ID: ${log.telegram_id}\n`;
      message += `⚡️ ${log.action}\n`;
      if (log.details) {
        const details = JSON.parse(log.details);
        if (details.amount) message += `💰 $${details.amount}\n`;
      }
      message += `\n`;
    });

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⬅️', callback_data: `admin_logs_${page-1}` },
          { text: `${page}/${Math.ceil(total/limit)}`, callback_data: 'noop' },
          { text: '➡️', callback_data: `admin_logs_${page+1}` }
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
  }

  async showSettings(query) {
    if (!this.isAdmin(query.from.id)) return;

    const settings = await this.db.getSettings();
    
    let message = '⚙️ *Настройки бота*\n\n';
    message += `📢 Канал: ${process.env.CHANNEL_USERNAME}\n`;
    message += `👑 VIP канал: ${process.env.VIP_CHANNEL_ID ? 'Настроен' : 'Не настроен'}\n`;
    message += `🔗 Партнерка PO: ${process.env.POCKET_OPTION_LINK ? 'Настроена' : 'Не настроена'}\n`;
    message += `👨‍💼 Админов: ${this.adminIds.length}\n`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🗄 Создать бекап', callback_data: 'admin_backup' }],
        [{ text: '📊 Экспорт данных', callback_data: 'admin_export' }],
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
}
```

### 7. Environment Configuration (.env)

```bash
# Bot Configuration
BOT_TOKEN=your_bot_token
CHANNEL_USERNAME=@your_channel
OWNER_USERNAME=your_username
SUPPORT_USERNAME=support_username

# VIP Channel
VIP_CHANNEL_ID=-1001234567890
VIP_CHANNEL_LINK=https://t.me/+your_vip_invite_link

# Admin
ADMIN_IDS=123456789,987654321

# Partner Links
POCKET_OPTION_LINK=https://po.cash/cabinet/demo-high-low/?uid=123456&tid=
TOPLINK_OFFER_ID=12345

# Database
DATABASE_URL=sqlite:./database.db

# Server
PORT=3000
WEBHOOK_URL=https://yourdomain.com

# Security
SECRET_KEY=your_secret_key_for_postbacks
```

### 8. Package Configuration (package.json)

```json
{
  "name": "telegram-trading-bot",
  "version": "1.0.0",
  "description": "Telegram bot for trading affiliate marketing",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "db:migrate": "node scripts/migrate.js",
    "db:seed": "node scripts/seed.js"
  },
  "dependencies": {
    "node-telegram-bot-api": "^0.64.0",
    "sqlite3": "^5.1.6",
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "moment": "^2.29.4",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

## Безопасность и антиспам

### Защита от повторной регистрации

```javascript
class AntiSpam {
  constructor(database) {
    this.db = database;
    this.userInteractions = new Map();
  }

  async isSpam(userId, action) {
    const key = `${userId}_${action}`;
    const now = Date.now();
    const lastInteraction = this.userInteractions.get(key);
    
    if (lastInteraction && now - lastInteraction < 60000) { // 1 minute cooldown
      return true;
    }
    
    this.userInteractions.set(key, now);
    return false;
  }

  async checkDuplicateRegistration(userId, phone) {
    // Check if user with same phone already exists
    const existingUser = await this.db.getUserByPhone(phone);
    if (existingUser && existingUser.telegram_id !== userId) {
      return true;
    }
    return false;
  }
}
```

## Мониторинг и логирование

### Система логов

```javascript
class Logger {
  static async logUserAction(db, telegramId, action, details = {}) {
    await db.query(`
      INSERT INTO user_logs (telegram_id, action, details, timestamp)
      VALUES (?, ?, ?, ?)
    `, [telegramId, action, JSON.stringify(details), new Date()]);
  }

  static async getActionLogs(db, telegramId, limit = 50) {
    return await db.query(`
      SELECT * FROM user_logs 
      WHERE telegram_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [telegramId, limit]);
  }
}
```

## Резервное копирование

### Бекап базы данных

```javascript
class DatabaseBackup {
  constructor(database) {
    this.db = database;
  }

  async createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `./backups/backup_${timestamp}.sql`;
    
    // Export database to SQL file
    const users = await this.db.getAllUsers();
    const logs = await this.db.getAllLogs();
    
    // Generate SQL export
    let sql = '-- Database Backup\n\n';
    sql += 'BEGIN TRANSACTION;\n\n';
    
    // Export users
    users.forEach(user => {
      sql += `INSERT INTO users VALUES (${Object.values(user).map(v => `'${v}'`).join(', ')});\n`;
    });
    
    sql += '\nCOMMIT;';
    
    require('fs').writeFileSync(backupPath, sql);
    return backupPath;
  }

  scheduleBackups() {
    // Daily backup at 3 AM
    setInterval(async () => {
      try {
        await this.createBackup();
        console.log('Database backup created successfully');
      } catch (error) {
        console.error('Backup failed:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
  }
}
```

## Развертывание

### Простая установка

```bash
# 1. Клонирование и установка зависимостей
git clone <repository>
cd telegram-trading-bot
npm install

# 2. Настройка окружения
cp .env.example .env
# Заполнить .env файл

# 3. Создание базы данных
npm run db:migrate

# 4. Запуск бота
npm start
```

### PM2 (рекомендуется для продакшна)

```bash
# Установка PM2
npm install -g pm2

# Создание конфигурации
echo 'module.exports = {
  apps: [{
    name: "trading-bot",
    script: "index.js",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production"
    }
  }]
}' > ecosystem.config.js

# Запуск через PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Аналитика и метрики

### Ключевые показатели (KPI)

1. **Конверсии:**
   - Подписка на канал → Передача номера
   - Передача номера → Регистрация
   - Регистрация → Первый депозит

2. **Активность:**
   - DAU (дневная активность)
   - MAU (месячная активность)
   - Retention (удержание пользователей)

3. **Финансовые:**
   - LTV (жизненная ценность)
   - ARPU (средний доход с пользователя)
   - ROI по каналам привлечения

Эта архитектура обеспечивает масштабируемое и надежное решение для партнерского Telegram бота с полным функционалом проверки подписки, сбора контактов и управления VIP доступом.