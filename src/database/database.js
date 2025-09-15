const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class Database {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DATABASE_PATH || './src/database/bot.db';
  }

  async init() {
    return new Promise((resolve, reject) => {
      // Ensure database directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('📦 Connected to SQLite database');
          this.migrate().then(resolve).catch(reject);
        }
      });
    });
  }

  async migrate() {
    return new Promise((resolve, reject) => {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');

      this.db.exec(schema, async (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('🔄 Database schema migrated successfully');

          // Run additional migrations for existing databases
          try {
            await this.runAdditionalMigrations();
            resolve();
          } catch (migrationErr) {
            reject(migrationErr);
          }
        }
      });
    });
  }

  async runAdditionalMigrations() {
    // Check if language column exists and add it if missing
    try {
      const checkColumnSql = "PRAGMA table_info(users)";
      const columns = await this.query(checkColumnSql);
      const hasLanguageColumn = columns.some(col => col.name === 'language');
      const hasLanguageSelectedColumn = columns.some(col => col.name === 'language_selected');

      if (!hasLanguageColumn) {
        console.log('📝 Adding language column to users table...');
        const addColumnSql = "ALTER TABLE users ADD COLUMN language VARCHAR(5) DEFAULT 'ru'";
        await this.run(addColumnSql);
        console.log('✅ Language column added successfully');
      }

      if (!hasLanguageSelectedColumn) {
        console.log('📝 Adding language_selected column to users table...');
        const addColumnSql = "ALTER TABLE users ADD COLUMN language_selected BOOLEAN DEFAULT FALSE";
        await this.run(addColumnSql);
        console.log('✅ Language_selected column added successfully');
      }

      // Add partner-related columns
      const hasPartnerStatusColumn = columns.some(col => col.name === 'partner_status');
      const hasPartnerIdColumn = columns.some(col => col.name === 'partner_id');
      const hasFirstDepositAmountColumn = columns.some(col => col.name === 'first_deposit_amount');
      const hasFirstDepositDateColumn = columns.some(col => col.name === 'first_deposit_date');
      const hasVipStatusColumn = columns.some(col => col.name === 'vip_status');

      if (!hasPartnerStatusColumn) {
        console.log('📝 Adding partner_status column to users table...');
        const addColumnSql = "ALTER TABLE users ADD COLUMN partner_status VARCHAR(50) DEFAULT NULL";
        await this.run(addColumnSql);
        console.log('✅ Partner_status column added successfully');
      }

      if (!hasPartnerIdColumn) {
        console.log('📝 Adding partner_id column to users table...');
        const addColumnSql = "ALTER TABLE users ADD COLUMN partner_id VARCHAR(255) DEFAULT NULL";
        await this.run(addColumnSql);
        console.log('✅ Partner_id column added successfully');
      }

      if (!hasFirstDepositAmountColumn) {
        console.log('📝 Adding first_deposit_amount column to users table...');
        const addColumnSql = "ALTER TABLE users ADD COLUMN first_deposit_amount DECIMAL(10,2) DEFAULT NULL";
        await this.run(addColumnSql);
        console.log('✅ First_deposit_amount column added successfully');
      }

      if (!hasFirstDepositDateColumn) {
        console.log('📝 Adding first_deposit_date column to users table...');
        const addColumnSql = "ALTER TABLE users ADD COLUMN first_deposit_date DATETIME DEFAULT NULL";
        await this.run(addColumnSql);
        console.log('✅ First_deposit_date column added successfully');
      }

      if (!hasVipStatusColumn) {
        console.log('📝 Adding vip_status column to users table...');
        const addColumnSql = "ALTER TABLE users ADD COLUMN vip_status BOOLEAN DEFAULT FALSE";
        await this.run(addColumnSql);
        console.log('✅ Vip_status column added successfully');
      }
    } catch (error) {
      // If error contains "duplicate column name", ignore it
      if (!error.message.includes('duplicate column name')) {
        throw error;
      }
    }
  }

  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // User management methods
  async createOrUpdateUser(userData) {
    const { telegram_id, username, first_name, last_name } = userData;

    const sql = `
      INSERT INTO users (telegram_id, username, first_name, last_name, last_activity)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        last_activity = CURRENT_TIMESTAMP
    `;

    return await this.run(sql, [telegram_id, username, first_name, last_name]);
  }

  async getUserByTelegramId(telegramId) {
    const sql = 'SELECT * FROM users WHERE telegram_id = ?';
    return await this.get(sql, [telegramId]);
  }

  async getUserByPhone(phone) {
    const sql = 'SELECT * FROM users WHERE phone = ?';
    return await this.get(sql, [phone]);
  }

  async updateUser(telegramId, updates) {
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates), telegramId];

    const sql = `
      UPDATE users 
      SET ${setClause}, last_activity = CURRENT_TIMESTAMP 
      WHERE telegram_id = ?
    `;

    return await this.run(sql, values);
  }

  async getUsers(limit = 10, offset = 0) {
    const sql = `
      SELECT * FROM users 
      ORDER BY registration_date DESC 
      LIMIT ? OFFSET ?
    `;
    return await this.query(sql, [limit, offset]);
  }

  async getTotalUsers() {
    const sql = 'SELECT COUNT(*) as count FROM users';
    const result = await this.get(sql);
    return result.count;
  }

  // Statistics methods
  async getStats() {
    const stats = {};

    // Total users
    const totalUsersResult = await this.get('SELECT COUNT(*) as count FROM users');
    stats.total_users = totalUsersResult.count;

    // Users with phone
    const phoneUsersResult = await this.get('SELECT COUNT(*) as count FROM users WHERE phone IS NOT NULL');
    stats.users_with_phone = phoneUsersResult.count;

    // Subscribed users
    const subscribedResult = await this.get('SELECT COUNT(*) as count FROM users WHERE is_subscribed = 1');
    stats.subscribed_users = subscribedResult.count;

    // Registered users
    const registeredResult = await this.get('SELECT COUNT(*) as count FROM users WHERE is_registered = 1');
    stats.registered_users = registeredResult.count;

    // Users with deposit
    const depositResult = await this.get('SELECT COUNT(*) as count FROM users WHERE has_deposit = 1');
    stats.users_with_deposit = depositResult.count;

    // VIP users
    const vipResult = await this.get('SELECT COUNT(*) as count FROM users WHERE vip_access = 1');
    stats.vip_users = vipResult.count;

    // Today's stats
    const todayNewUsers = await this.get(`
      SELECT COUNT(*) as count FROM users 
      WHERE DATE(registration_date) = DATE('now')
    `);
    stats.today_new_users = todayNewUsers.count;

    const todayRegistrations = await this.get(`
      SELECT COUNT(*) as count FROM user_logs 
      WHERE action = 'registration' AND DATE(timestamp) = DATE('now')
    `);
    stats.today_registrations = todayRegistrations.count;

    const todayDeposits = await this.get(`
      SELECT COUNT(*) as count FROM user_logs 
      WHERE action = 'deposit' AND DATE(timestamp) = DATE('now')
    `);
    stats.today_deposits = todayDeposits.count;

    // Calculate conversions
    stats.subscription_to_registration = stats.subscribed_users > 0
      ? Math.round((stats.registered_users / stats.subscribed_users) * 100)
      : 0;

    stats.registration_to_deposit = stats.registered_users > 0
      ? Math.round((stats.users_with_deposit / stats.registered_users) * 100)
      : 0;

    return stats;
  }

  // Logging methods
  async logUserAction(telegramId, action, details = null) {
    const sql = `
      INSERT INTO user_logs (telegram_id, action, details, timestamp)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const detailsJson = details ? JSON.stringify(details) : null;
    return await this.run(sql, [telegramId, action, detailsJson]);
  }

  async getRecentLogs(limit = 50, offset = 0) {
    const sql = `
      SELECT ul.*, u.first_name, u.username 
      FROM user_logs ul
      LEFT JOIN users u ON ul.telegram_id = u.telegram_id
      ORDER BY ul.timestamp DESC 
      LIMIT ? OFFSET ?
    `;
    return await this.query(sql, [limit, offset]);
  }

  async getTotalLogs() {
    const sql = 'SELECT COUNT(*) as count FROM user_logs';
    const result = await this.get(sql);
    return result.count;
  }

  async getUserLogs(telegramId, limit = 50) {
    const sql = `
      SELECT * FROM user_logs 
      WHERE telegram_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `;
    return await this.query(sql, [telegramId, limit]);
  }

  // Language methods
  async getUserLanguage(telegramId) {
    const sql = 'SELECT language FROM users WHERE telegram_id = ?';
    const result = await this.get(sql, [telegramId]);
    return result ? result.language : 'ru';
  }

  async setUserLanguage(telegramId, language) {
    const sql = 'UPDATE users SET language = ?, language_selected = TRUE WHERE telegram_id = ?';
    return await this.run(sql, [language, telegramId]);
  }

  // Settings methods
  async getSetting(key) {
    const sql = 'SELECT value FROM settings WHERE key = ?';
    const result = await this.get(sql, [key]);
    return result ? result.value : null;
  }

  async setSetting(key, value) {
    const sql = `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
    `;
    return await this.run(sql, [key, value]);
  }

  async getSettings() {
    const sql = 'SELECT * FROM settings ORDER BY key';
    return await this.query(sql);
  }

  // Broadcast methods
  async getUsersForBroadcast(type = 'all') {
    let sql = 'SELECT telegram_id FROM users WHERE 1=1';
    const params = [];

    switch (type) {
    case 'phone':
      sql += ' AND phone IS NOT NULL';
      break;
    case 'registered':
      sql += ' AND is_registered = 1';
      break;
    case 'vip':
      sql += ' AND vip_access = 1';
      break;
    case 'subscribed':
      sql += ' AND is_subscribed = 1';
      break;
    default:
      // 'all' - no additional conditions
      break;
    }

    return await this.query(sql, params);
  }

  // Cleanup methods
  async cleanupOldLogs(daysToKeep = 30) {
    const sql = `
      DELETE FROM user_logs 
      WHERE timestamp < datetime('now', '-${daysToKeep} days')
    `;
    return await this.run(sql);
  }

  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          } else {
            console.log('📦 Database connection closed');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = Database;
