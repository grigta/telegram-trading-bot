class AntiSpam {
  constructor(database, logger) {
    this.db = database;
    this.logger = logger;

    // Rate limiting configuration
    this.rateLimits = {
      contact_sharing: { maxRequests: 3, timeWindow: 60000 }, // 3 attempts per minute
      subscription_check: { maxRequests: 10, timeWindow: 60000 }, // 10 checks per minute
      menu_interaction: { maxRequests: 30, timeWindow: 60000 } // 30 interactions per minute
    };

    // In-memory rate limiting storage
    this.userRequests = new Map();

    // Cleanup interval
    setInterval(() => this.cleanup(), 5 * 60 * 1000); // Every 5 minutes
  }

  async isSpam(userId, action) {
    const key = `${userId}_${action}`;
    const now = Date.now();

    if (!this.rateLimits[action]) {
      this.logger.warn(`Unknown action for spam check: ${action}`);
      return false;
    }

    const { maxRequests, timeWindow } = this.rateLimits[action];

    // Get or create user request history
    if (!this.userRequests.has(key)) {
      this.userRequests.set(key, []);
    }

    const requests = this.userRequests.get(key);

    // Remove old requests outside time window
    const validRequests = requests.filter(timestamp => now - timestamp < timeWindow);

    // Check if limit exceeded
    if (validRequests.length >= maxRequests) {
      this.logger.warn(`Rate limit exceeded for user ${userId}, action: ${action}`, {
        userId,
        action,
        requestCount: validRequests.length,
        maxRequests
      });

      await this.db.logUserAction(userId, 'rate_limit_exceeded', {
        action,
        requestCount: validRequests.length
      });

      return true;
    }

    // Add current request
    validRequests.push(now);
    this.userRequests.set(key, validRequests);

    return false;
  }

  async checkDuplicatePhone(userId, phone) {
    try {
      // Clean phone number for comparison
      const cleanPhone = this.cleanPhoneNumber(phone);

      // Check if phone already exists for different user
      const existingUser = await this.db.getUserByPhone(cleanPhone);

      if (existingUser && existingUser.telegram_id !== userId) {
        this.logger.warn('Duplicate phone detected', {
          phone: cleanPhone,
          originalUser: existingUser.telegram_id,
          newUser: userId
        });

        await this.db.logUserAction(userId, 'duplicate_phone_attempt', {
          phone: cleanPhone,
          originalUser: existingUser.telegram_id
        });

        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Error checking duplicate phone', error);
      return false;
    }
  }

  cleanPhoneNumber(phone) {
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Handle different phone formats
    if (cleaned.startsWith('8') && cleaned.length === 11) {
      cleaned = '+7' + cleaned.substring(1);
    } else if (cleaned.startsWith('7') && cleaned.length === 11) {
      cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  validatePhoneNumber(phone) {
    const cleanPhone = this.cleanPhoneNumber(phone);

    // Basic validation
    const phoneRegex = /^\+[1-9]\d{1,14}$/;

    if (!phoneRegex.test(cleanPhone)) {
      return { valid: false, error: 'Неверный формат номера телефона' };
    }

    // Length validation
    if (cleanPhone.length < 10 || cleanPhone.length > 16) {
      return { valid: false, error: 'Слишком короткий или длинный номер' };
    }

    // Common spam patterns
    const spamPatterns = [
      /^\+1{10,}/, // Too many ones
      /^\+0+/, // All zeros
      /^\+(\d)\1{9,}/, // Repeated digits
      /^\+1234567890/, // Sequential numbers
    ];

    for (const pattern of spamPatterns) {
      if (pattern.test(cleanPhone)) {
        return { valid: false, error: 'Недействительный номер телефона' };
      }
    }

    return { valid: true, phone: cleanPhone };
  }

  async checkSuspiciousActivity(userId) {
    try {
      const recentLogs = await this.db.getUserLogs(userId, 20);

      // Check for suspicious patterns
      const now = Date.now();
      const hourAgo = now - (60 * 60 * 1000);

      const recentActions = recentLogs.filter(log =>
        new Date(log.timestamp).getTime() > hourAgo
      );

      // Too many start commands
      const startCommands = recentActions.filter(log => log.action === 'start_command');
      if (startCommands.length > 10) {
        return { suspicious: true, reason: 'Too many start commands' };
      }

      // Too many failed subscription checks
      const failedChecks = recentActions.filter(log =>
        log.action === 'subscription_check_failed'
      );
      if (failedChecks.length > 15) {
        return { suspicious: true, reason: 'Too many failed subscription checks' };
      }

      return { suspicious: false };

    } catch (error) {
      this.logger.error('Error checking suspicious activity', error);
      return { suspicious: false };
    }
  }

  async handleSpamDetection(userId, action, reason) {
    this.logger.warn(`Spam detected for user ${userId}`, {
      userId,
      action,
      reason
    });

    await this.db.logUserAction(userId, 'spam_detected', {
      action,
      reason,
      timestamp: new Date().toISOString()
    });

    // Could implement additional actions like:
    // - Temporary ban
    // - Admin notification
    // - Rate limiting increase
  }

  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, requests] of this.userRequests.entries()) {
      // Find the action to get timeWindow
      const action = key.split('_').slice(1).join('_');
      const timeWindow = this.rateLimits[action]?.timeWindow || 60000;

      // Filter out old requests
      const validRequests = requests.filter(timestamp => now - timestamp < timeWindow);

      if (validRequests.length === 0) {
        this.userRequests.delete(key);
        cleanedCount++;
      } else if (validRequests.length !== requests.length) {
        this.userRequests.set(key, validRequests);
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} rate limit entries`);
    }
  }

  // Get current rate limit status for a user
  getRateLimitStatus(userId, action) {
    const key = `${userId}_${action}`;
    const requests = this.userRequests.get(key) || [];
    const limit = this.rateLimits[action];

    if (!limit) return null;

    const now = Date.now();
    const validRequests = requests.filter(timestamp => now - timestamp < limit.timeWindow);

    return {
      current: validRequests.length,
      max: limit.maxRequests,
      remaining: Math.max(0, limit.maxRequests - validRequests.length),
      resetTime: validRequests.length > 0 ? Math.max(...validRequests) + limit.timeWindow : now
    };
  }
}

module.exports = AntiSpam;
