const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logDir = path.join(process.cwd(), 'logs');

    // Ensure logs directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    // Create log file names
    this.currentDate = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDir, `bot-${this.currentDate}.log`);
    this.errorFile = path.join(this.logDir, `error-${this.currentDate}.log`);

    // Rotate logs daily
    this.setupLogRotation();
  }

  setupLogRotation() {
    // Check for log rotation every hour
    setInterval(() => {
      const today = new Date().toISOString().split('T')[0];
      if (today !== this.currentDate) {
        this.currentDate = today;
        this.logFile = path.join(this.logDir, `bot-${this.currentDate}.log`);
        this.errorFile = path.join(this.logDir, `error-${this.currentDate}.log`);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaString = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}\n`;
  }

  writeToFile(content, isError = false) {
    const file = isError ? this.errorFile : this.logFile;

    try {
      fs.appendFileSync(file, content);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, meta);

    // Write to file
    this.writeToFile(formattedMessage, level === 'error');

    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      const consoleMethod = level === 'error' ? 'error' :
        level === 'warn' ? 'warn' : 'log';
      console[consoleMethod](formattedMessage.trim());
    }
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  // Log user actions
  logUserAction(userId, action, details = {}) {
    this.info(`User action: ${action}`, {
      user_id: userId,
      action,
      ...details
    });
  }

  // Log bot errors with more context
  logBotError(error, context = {}) {
    this.error(`Bot error: ${error.message}`, {
      error: error.stack,
      ...context
    });
  }

  // Log API calls
  logApiCall(method, endpoint, status, responseTime, data = {}) {
    this.info(`API call: ${method} ${endpoint}`, {
      method,
      endpoint,
      status,
      response_time_ms: responseTime,
      ...data
    });
  }

  // Get recent logs
  getRecentLogs(lines = 100) {
    try {
      const logContent = fs.readFileSync(this.logFile, 'utf8');
      return logContent.split('\n').slice(-lines).join('\n');
    } catch (error) {
      return 'Unable to read log file';
    }
  }

  // Get error logs
  getErrorLogs(lines = 100) {
    try {
      const errorContent = fs.readFileSync(this.errorFile, 'utf8');
      return errorContent.split('\n').slice(-lines).join('\n');
    } catch (error) {
      return 'Unable to read error log file';
    }
  }

  // Clean old logs
  cleanupLogs(daysToKeep = 7) {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);

          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }
      }

      this.info(`Cleaned up ${deletedCount} old log files`);
      return deletedCount;

    } catch (error) {
      this.error('Failed to cleanup logs', error);
      return 0;
    }
  }
}

module.exports = Logger;
