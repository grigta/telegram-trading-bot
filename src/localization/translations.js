const translations = {
  ru: {
    welcome: '👋 Добро пожаловать в Trading Bot!',
    chooseLanguage: '🌐 Выберите язык / Choose language:',
    languageChanged: '✅ Язык изменен на русский',
    subscriptionRequired: '📢 Для продолжения подпишитесь на наш канал:',
    checkSubscription: '✅ Проверить подписку',
    subscriptionSuccess: '✅ Отлично! Вы подписаны на канал.',
    subscriptionFailed: '❌ Вы еще не подписаны на канал. Подпишитесь и попробуйте снова.',
    sharePhone: '📱 Для персонализации уведомлений поделитесь своим номером телефона:',
    sharePhoneButton: '📱 Поделиться номером',
    phoneSuccess: '✅ Отлично! Номер телефона сохранен.\n\nТеперь вы будете получать персональные уведомления о торговых возможностях.',
    mainMenu: '📊 Главное меню',
    tradingSignals: '📈 Торговые сигналы',
    portfolio: '💼 Портфель',
    settings: '⚙️ Настройки',
    support: '💬 Поддержка',
    language: '🌐 Язык',
    notifications: '🔔 Уведомления',
    profile: '👤 Профиль',
    error: '❌ Произошла ошибка. Попробуйте позже или обратитесь в поддержку.',
    tooManyAttempts: '⏳ Слишком много попыток. Попробуйте еще раз через минуту.',
    duplicatePhone: '⚠️ Этот номер телефона уже используется другим пользователем.\n\nЕсли это ваш номер, обратитесь в поддержку: @',
    backToMenu: '⬅️ Назад в меню',
    chooseOption: 'Выберите опцию:',
    comingSoon: '🚧 Эта функция скоро будет доступна!',
    notificationsEnabled: '✅ Уведомления включены',
    notificationsDisabled: '🔕 Уведомления отключены',
    yourProfile: '👤 *Ваш профиль*\n\nID: `{id}`\nИмя: {name}\nТелефон: {phone}\nЯзык: {language}\nДата регистрации: {date}'
  },
  en: {
    welcome: '👋 Welcome to Trading Bot!',
    chooseLanguage: '🌐 Choose language / Выберите язык:',
    languageChanged: '✅ Language changed to English',
    subscriptionRequired: '📢 To continue, please subscribe to our channel:',
    checkSubscription: '✅ Check subscription',
    subscriptionSuccess: '✅ Great! You are subscribed to the channel.',
    subscriptionFailed: '❌ You are not subscribed to the channel yet. Please subscribe and try again.',
    sharePhone: '📱 Share your phone number for personalized notifications:',
    sharePhoneButton: '📱 Share phone number',
    phoneSuccess: '✅ Great! Phone number saved.\n\nYou will now receive personalized trading notifications.',
    mainMenu: '📊 Main Menu',
    tradingSignals: '📈 Trading Signals',
    portfolio: '💼 Portfolio',
    settings: '⚙️ Settings',
    support: '💬 Support',
    language: '🌐 Language',
    notifications: '🔔 Notifications',
    profile: '👤 Profile',
    error: '❌ An error occurred. Please try again later or contact support.',
    tooManyAttempts: '⏳ Too many attempts. Please try again in a minute.',
    duplicatePhone: '⚠️ This phone number is already used by another user.\n\nIf this is your number, please contact support: @',
    backToMenu: '⬅️ Back to menu',
    chooseOption: 'Choose an option:',
    comingSoon: '🚧 This feature is coming soon!',
    notificationsEnabled: '✅ Notifications enabled',
    notificationsDisabled: '🔕 Notifications disabled',
    yourProfile: '👤 *Your Profile*\n\nID: `{id}`\nName: {name}\nPhone: {phone}\nLanguage: {language}\nRegistration date: {date}'
  }
};

class Translator {
  constructor() {
    this.translations = translations;
    this.defaultLanguage = 'ru';
  }

  get(key, language = this.defaultLanguage, params = {}) {
    const lang = this.translations[language] || this.translations[this.defaultLanguage];
    let text = lang[key] || this.translations[this.defaultLanguage][key] || key;

    // Replace parameters in text
    Object.keys(params).forEach(param => {
      text = text.replace(`{${param}}`, params[param]);
    });

    return text;
  }

  getLanguageButtons() {
    return {
      inline_keyboard: [
        [
          { text: '🇷🇺 Русский', callback_data: 'lang_ru' },
          { text: '🇬🇧 English', callback_data: 'lang_en' }
        ]
      ]
    };
  }

  getAvailableLanguages() {
    return Object.keys(this.translations);
  }

  isValidLanguage(lang) {
    return this.translations.hasOwnProperty(lang);
  }
}

module.exports = new Translator();