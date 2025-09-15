-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  phone VARCHAR(20),
  language VARCHAR(5) DEFAULT 'ru',
  is_subscribed BOOLEAN DEFAULT FALSE,
  is_registered BOOLEAN DEFAULT FALSE,
  has_deposit BOOLEAN DEFAULT FALSE,
  vip_access BOOLEAN DEFAULT FALSE,
  registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User logs table
CREATE TABLE IF NOT EXISTS user_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id BIGINT NOT NULL,
  action VARCHAR(255) NOT NULL,
  details TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_registration_date ON users(registration_date);
CREATE INDEX IF NOT EXISTS idx_users_is_subscribed ON users(is_subscribed);
CREATE INDEX IF NOT EXISTS idx_users_has_deposit ON users(has_deposit);
CREATE INDEX IF NOT EXISTS idx_users_vip_access ON users(vip_access);

CREATE INDEX IF NOT EXISTS idx_logs_telegram_id ON user_logs(telegram_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON user_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_action ON user_logs(action);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES 
('bot_version', '1.0.0'),
('maintenance_mode', 'false'),
('welcome_message', 'Добро пожаловать в мир успешной торговли!'),
('subscription_check_enabled', 'true');