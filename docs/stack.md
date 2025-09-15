# Технический стек

## Обзор

Telegram бот для партнерского маркетинга с архитектурой на Node.js, SQLite базой данных и интеграцией с партнерскими системами.

## Основной стек

### Backend
- **Node.js** `18+` - Основная платформа исполнения
- **JavaScript (ES2022)** - Язык программирования
- **Express.js** `4.18+` - Web-сервер для postback endpoints

### База данных
- **SQLite3** `5.1+` - Локальная база данных
- **Схема:** Users, Logs, Settings
- **ORM:** Нативные SQL запросы через sqlite3

### Telegram API
- **node-telegram-bot-api** `0.64+` - Библиотека для работы с Telegram Bot API
- **Polling mode** - Получение обновлений
- **Webhook support** - Для production окружения

### Внешние интеграции
- **Pocket Option API** - Партнерские постбэки
- **TopLink/Tilda** - Альтернативные партнерские системы

## Инфраструктура

### Process Management
- **PM2** - Менеджер процессов для production
- **Автоперезапуск** при сбоях
- **Логирование** и мониторинг

### Файловая система
```
project/
├── src/
│   ├── bot.js              # Главный класс бота
│   ├── database/
│   │   ├── database.js     # Класс базы данных
│   │   └── migrate.js      # Миграции
│   ├── handlers/
│   │   ├── menuHandler.js  # Обработка меню
│   │   ├── adminHandler.js # Админ-команды
│   │   └── subscriptionChecker.js # Проверка подписки
│   ├── services/
│   │   ├── postbacks.js    # Обработка постбэков
│   │   ├── antiSpam.js     # Защита от спама
│   │   └── logger.js       # Система логирования
│   └── utils/
│       ├── backup.js       # Резервное копирование
│       └── constants.js    # Константы
├── docs/                   # Документация
├── backups/               # Бэкапы БД
├── logs/                  # Логи
├── .env                   # Конфигурация
└── package.json
```

## Зависимости

### Production Dependencies
```json
{
  "node-telegram-bot-api": "^0.64.0",
  "sqlite3": "^5.1.6",
  "express": "^4.18.2",
  "axios": "^1.6.0",
  "dotenv": "^16.3.1",
  "moment": "^2.29.4",
  "uuid": "^9.0.1"
}
```

### Development Dependencies
```json
{
  "nodemon": "^3.0.2",
  "eslint": "^8.57.0",
  "jest": "^29.7.0"
}
```

## Конфигурация окружения

### Environment Variables (.env)
```bash
# Bot Configuration
BOT_TOKEN=your_bot_token_here
CHANNEL_USERNAME=@your_channel
OWNER_USERNAME=your_owner_username
SUPPORT_USERNAME=support_username

# VIP Access
VIP_CHANNEL_ID=-1001234567890
VIP_CHANNEL_LINK=https://t.me/+invite_link

# Admin Access
ADMIN_IDS=123456789,987654321

# Partner Integration
POCKET_OPTION_LINK=https://po.cash/cabinet/demo-high-low/?uid=123456&tid=
TOPLINK_OFFER_ID=12345

# Database
DATABASE_PATH=./database/bot.db

# Server Configuration
PORT=3000
NODE_ENV=production

# Security
SECRET_KEY=your_webhook_secret_key
```

## Архитектурные решения

### Паттерны проектирования

#### 1. Module Pattern
- Каждый компонент в отдельном модуле
- Четкое разделение ответственности
- Инкапсуляция логики

#### 2. Event-Driven Architecture
```javascript
// Пример обработки событий
this.bot.on('message', (msg) => this.handleMessage(msg));
this.bot.on('callback_query', (query) => this.handleCallback(query));
this.bot.on('contact', (msg) => this.handleContact(msg));
```

#### 3. State Management
```javascript
// Управление состояниями пользователей
class UserStates {
  constructor() {
    this.states = new Map();
  }
  
  setState(userId, state) {
    this.states.set(userId, state);
  }
  
  getState(userId) {
    return this.states.get(userId) || 'start';
  }
}
```

### Обработка ошибок

#### Error Handling Strategy
```javascript
// Централизованная обработка ошибок
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Логирование в файл
  // Уведомление админов
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await database.close();
  process.exit(0);
});
```

#### Retry Logic
```javascript
// Повторные попытки для API запросов
async function retryApiCall(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}
```

### Безопасность

#### Input Validation
```javascript
// Валидация входных данных
function validatePhoneNumber(phone) {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

function sanitizeInput(input) {
  return input.replace(/[<>]/g, '');
}
```

#### Rate Limiting
```javascript
// Ограничение частоты запросов
class RateLimiter {
  constructor(maxRequests = 10, timeWindow = 60000) {
    this.requests = new Map();
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
  }
  
  isAllowed(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    
    // Очистка старых запросов
    const validRequests = userRequests.filter(
      timestamp => now - timestamp < this.timeWindow
    );
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(userId, validRequests);
    return true;
  }
}
```

## Database Schema

### Users Table
```sql
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
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_telegram_id (telegram_id),
  INDEX idx_phone (phone),
  INDEX idx_registration_date (registration_date)
);
```

### User Logs Table
```sql
CREATE TABLE user_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id BIGINT NOT NULL,
  action VARCHAR(255) NOT NULL,
  details TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_telegram_id (telegram_id),
  INDEX idx_timestamp (timestamp),
  INDEX idx_action (action),
  
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);
```

### Settings Table
```sql
CREATE TABLE settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### Postback Endpoints
```javascript
// Pocket Option postbacks
POST /postback/po
Content-Type: application/json
{
  "event": "registration|deposit|ftd",
  "user_id": "12345",
  "custom_param": "telegram_user_id",
  "amount": "100.00",
  "currency": "USD"
}

// TopLink postbacks  
POST /postback/toplink
Content-Type: application/x-www-form-urlencoded
event=registration&user_id=12345&amount=100
```

### Webhook Configuration
```javascript
// Telegram webhook setup
POST https://api.telegram.org/bot{token}/setWebhook
{
  "url": "https://yourdomain.com/webhook",
  "secret_token": "your_secret_token"
}
```

## Мониторинг и логирование

### Logging Strategy
```javascript
// Уровни логирования
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Структура логов
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "message": "User registered",
  "telegram_id": 123456789,
  "action": "registration",
  "details": {
    "referrer": "direct"
  }
}
```

### Metrics Collection
- Количество активных пользователей (DAU/MAU)
- Конверсионные воронки
- Время отклика API
- Частота ошибок

## Performance Considerations

### Database Optimization
- Индексы на часто используемые поля
- Периодическая очистка старых логов
- Backup и восстановление

### Memory Management
- Очистка неиспользуемых состояний пользователей
- Кэширование часто запрашиваемых данных
- Ограничение размера логов в памяти

### Scalability
- Горизонтальное масштабирование через PM2 кластеры
- Разделение на микросервисы при росте нагрузки
- Миграция на PostgreSQL для больших объемов данных

## Deployment Requirements

### System Requirements
- **OS:** Ubuntu 20.04+ / CentOS 8+ / Windows Server 2019+
- **RAM:** 512MB минимум, 1GB рекомендуется
- **Storage:** 1GB для приложения + место под логи и бэкапы
- **Network:** Доступ к Telegram API и партнерским системам

### Production Checklist
- [ ] SSL сертификат для webhook
- [ ] Firewall настройка (порты 80, 443, 3000)
- [ ] PM2 автозапуск при перезагрузке
- [ ] Логирование в syslog
- [ ] Бэкап база данных
- [ ] Мониторинг доступности
- [ ] Error tracking (Sentry, Bugsnag)

Этот технический стек обеспечивает надежную, масштабируемую и поддерживаемую архитектуру для Telegram бота с полным функционалом партнерского маркетинга.