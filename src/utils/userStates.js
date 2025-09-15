class UserStates {
  constructor() {
    this.states = new Map();
    this.stateTimeouts = new Map();

    // Auto-cleanup states after 1 hour of inactivity
    this.CLEANUP_TIMEOUT = 60 * 60 * 1000; // 1 hour

    // Start cleanup interval
    setInterval(() => this.cleanup(), 5 * 60 * 1000); // Every 5 minutes
  }

  setState(userId, state, data = null) {
    this.states.set(userId, {
      state,
      data,
      timestamp: Date.now()
    });

    // Clear existing timeout
    if (this.stateTimeouts.has(userId)) {
      clearTimeout(this.stateTimeouts.get(userId));
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.clearState(userId);
    }, this.CLEANUP_TIMEOUT);

    this.stateTimeouts.set(userId, timeout);
  }

  getState(userId) {
    const userState = this.states.get(userId);
    if (!userState) {
      return 'start';
    }
    return userState.state;
  }

  getStateData(userId) {
    const userState = this.states.get(userId);
    return userState ? userState.data : null;
  }

  clearState(userId) {
    this.states.delete(userId);

    if (this.stateTimeouts.has(userId)) {
      clearTimeout(this.stateTimeouts.get(userId));
      this.stateTimeouts.delete(userId);
    }
  }

  updateStateData(userId, data) {
    const userState = this.states.get(userId);
    if (userState) {
      userState.data = { ...userState.data, ...data };
      userState.timestamp = Date.now();
    }
  }

  hasState(userId) {
    return this.states.has(userId);
  }

  getAllStates() {
    const result = {};
    for (const [userId, stateData] of this.states.entries()) {
      result[userId] = stateData;
    }
    return result;
  }

  getActiveUsersCount() {
    return this.states.size;
  }

  cleanup() {
    const now = Date.now();
    const toDelete = [];

    for (const [userId, stateData] of this.states.entries()) {
      if (now - stateData.timestamp > this.CLEANUP_TIMEOUT) {
        toDelete.push(userId);
      }
    }

    for (const userId of toDelete) {
      this.clearState(userId);
    }

    if (toDelete.length > 0) {
      console.log(`🧹 Cleaned up ${toDelete.length} inactive user states`);
    }
  }

  // Predefined states for the bot
  static get STATES() {
    return {
      START: 'start',
      WAITING_SUBSCRIPTION: 'waiting_subscription',
      WAITING_CONTACT: 'waiting_contact',
      MAIN_MENU: 'main_menu',
      WAITING_BROADCAST_TEXT: 'waiting_broadcast_text',
      WAITING_BROADCAST_CONFIRMATION: 'waiting_broadcast_confirmation',
      ADMIN_MENU: 'admin_menu'
    };
  }
}

module.exports = UserStates;
