const messageManager = require('../utils/messageManager');

class MenuHandler {
  constructor(bot, database, logger) {
    this.bot = bot;
    this.db = database;
    this.logger = logger;
  }

  async showMainMenu(chatId, userId = null) {
    try {
      // Get user info for personalization
      let user = null;
      let lang = 'ru';
      if (userId) {
        user = await this.db.getUserByTelegramId(userId);
        lang = await this.db.getUserLanguage(userId);
      }

      // Determine user status for personalized menu
      const userStatus = this.getUserStatus(user);

      const keyboard = {
        inline_keyboard: [
          [{ text: lang === 'en' ? '📈 Copy Trading' : '📈 Копирование сделок', callback_data: 'copy_trades' }],
          [{ text: lang === 'en' ? '🔐 Private Signals' : '🔐 Приватные сигналы', callback_data: 'private_signals' }],
          [{ text: lang === 'en' ? '📚 Free Guide' : '📚 Бесплатный гайд', callback_data: 'free_guide' }],
          [
            { text: lang === 'en' ? '🛠 24/7 Support' : '🛠 Поддержка 24/7', url: 'https://t.me/whyofcoin_support' },
            { text: lang === 'en' ? '🧠 About My Strategy' : '🧠 О моей стратегии', callback_data: 'about_strategy' }
          ],
          [
            { text: lang === 'en' ? '🎁 VIP Bonus' : '🎁 VIP бонус', callback_data: 'vip_bonus' },
            { text: lang === 'en' ? '📄 FAQ' : '📄 Частые вопросы', callback_data: 'faq' }
          ],
          [
            { text: lang === 'en' ? '⭐ Reviews' : '⭐ Отзывы', callback_data: 'reviews' },
            { text: lang === 'en' ? '🔗 Pocket Option' : '🔗 Pocket Option', callback_data: 'pocket_option' }
          ],
          [{ text: lang === 'en' ? '⚙️ Settings' : '⚙️ Настройки', callback_data: 'settings' }]
        ]
      };

      const greeting = user && user.first_name ?
        (lang === 'en' ? `Hello, ${user.first_name}! 👋` : `Привет, ${user.first_name}! 👋`) :
        (lang === 'en' ? 'Welcome! 👋' : 'Добро пожаловать! 👋');

      const message = lang === 'en' ? `
${greeting}

*Welcome to Why Of Coin*

📈 I'm a trader with 5 years of experience who made $1,500,000 in just one year — with over 80% winning trades.

*My results:*
• 500+ active students
• 250+ signals every month
• Personal approach to trading
• Member of pro trading communities

_Choose any option from the menu to start:_
      ` : `
${greeting}

*Добро пожаловать в Why Of Coin*

📈 Я — трейдер с 5-летним опытом, который за год сделал $1.500.000, из них 80% прибыльных сделок.

*Мои результаты:*
• 250+ сигналов в месяц
• 500+ активных учеников
• Личный подход к торговле
• Участник трейдинг-сообществ

_Выберите любой пункт меню для начала:_
      `;

      // Try to edit last message, otherwise send a new one
      const lastId = messageManager.getLastMessage(chatId);
      if (lastId) {
        try {
          await this.bot.editMessageText(message, {
            chat_id: chatId,
            message_id: lastId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
          });
        } catch (e) {
          // If edit fails (message not found/too old), send new and delete previous
          const sent = await this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          });
          await messageManager.deleteMessageById(this.bot, chatId, lastId);
          messageManager.setLastMessage(chatId, sent.message_id);
        }
      } else {
        const sent = await this.bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        messageManager.setLastMessage(chatId, sent.message_id);
      }

      // Log menu display
      await this.db.logUserAction(userId || chatId, 'main_menu_shown', {
        user_status: userStatus,
        personalized: !!user
      });

      this.logger.info(`Main menu shown to user: ${chatId}`, { userStatus });

    } catch (error) {
      this.logger.error('Error showing main menu', { chatId, error: error.message });
      throw error;
    }
  }

  getUserStatus(user) {
    if (!user) {
      return {
        isSubscribed: false,
        isRegistered: false,
        hasDeposit: false,
        isVip: false
      };
    }

    return {
      isSubscribed: !!user.is_subscribed,
      isRegistered: !!user.is_registered,
      hasDeposit: !!user.has_deposit,
      isVip: !!user.vip_access
    };
  }

  async handleCallback(query) {
    const data = query.callback_data || query.data;
    const userId = query.from.id;
    const lang = await this.db.getUserLanguage(userId);

    this.logger.info(`Menu callback: ${userId}, data: ${data}`);

    // Validate callback data exists
    if (!data || typeof data !== 'string') {
      this.logger.warn(`Invalid menu callback data for user ${userId}: ${data}`);
      await this.bot.answerCallbackQuery(query.id, {
        text: lang === 'en' ? 'Error: Invalid data' : 'Ошибка: неверные данные'
      });
      return;
    }

    try {
      // Track menu interactions for analytics
      await this.db.logUserAction(userId, 'menu_interaction', {
        callback_data: data,
        menu_type: this.getMenuType(data)
      });

      switch (data) {
      case 'copy_trades':
        await this.handleCopyTrades(query, lang);
        break;
      case 'private_signals':
        await this.handlePrivateSignals(query, lang);
        break;
      case 'free_guide':
        await this.handleFreeGuide(query, lang);
        break;
      case 'about_strategy':
        await this.handleAboutStrategy(query, lang);
        break;
      case 'vip_bonus':
        await this.handleVipBonus(query, lang);
        break;
      case 'faq':
        await this.handleFaq(query, lang);
        break;
      case 'pocket_option':
        await this.handlePocketOption(query, lang);
        break;
      case 'reviews':
        await this.handleReviews(query, lang);
        break;
      case 'settings':
        await this.handleSettings(query, lang);
        break;
      case 'change_language':
        await this.handleChangeLanguage(query, lang);
        break;
      case 'main_menu':
        await this.handleBackToMainMenu(query);
        break;
      default:
        if (data.startsWith('faq_')) {
          await this.handleFaqItem(query, lang, data);
        } else if (data.startsWith('review_')) {
          await this.handleReviewNavigation(query, lang, data);
        } else {
          this.logger.warn(`Unknown callback data: ${data}`);
          await this.bot.answerCallbackQuery(query.id, {
            text: lang === 'en' ? 'Unknown command' : 'Неизвестная команда'
          });
        }
        break;
      }
    } catch (error) {
      this.logger.error('Error handling menu callback', { userId, data, error: error.message });
      await this.bot.answerCallbackQuery(query.id, {
        text: lang === 'en' ? 'An error occurred' : 'Произошла ошибка'
      });
    }
  }

  getMenuType(callbackData) {
    const menuTypes = {
      'copy_trades': 'trading',
      'private_signals': 'vip',
      'free_guide': 'education',
      'about_strategy': 'info',
      'vip_bonus': 'bonus',
      'faq': 'info',
      'pocket_option': 'registration',
      'settings': 'settings',
      'main_menu': 'navigation',
    };

    return menuTypes[callbackData] || 'unknown';
  }

  async handleCopyTrades(query, lang) {
    const keyboard = {
      inline_keyboard: [
        [{ text: lang === 'en' ? '📝 Register & Get Bonus' : '📝 Регистрация и бонус', callback_data: 'pocket_option' }],
        [{ text: lang === 'en' ? '← Back to menu' : '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    const message = lang === 'en' ? `
*Copy Trading* — means connecting to my account, where every trade I make is automatically mirrored on yours. No analysis needed — just exact repetition and the same result.

📌 *What you need to do:*

1. Create an account with the broker
2. Fund your balance from $50

All trades are made with my own real money in real time. You simply follow — no analysis, no complicated setup.
    ` : `
*Копирование сделок* — это подключение к моему аккаунту, где каждая моя сделка автоматически повторяется у тебя. Никакого анализа, просто точное повторение и такой же результат.

📌 *Что нужно сделать:*

1. Зарегистрировать аккаунт на брокере
2. Пополнить баланс от 50$

Все сделки я совершаю на свои деньги в реальном времени. Ты просто повторяешь — без анализа и сложных настроек.
    `;

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    await this.bot.answerCallbackQuery(query.id);
  }

  async handlePrivateSignals(query, lang) {
    const keyboard = {
      inline_keyboard: [
        [{ text: lang === 'en' ? '📝 Register & Get Access' : '📝 Регистрация и доступ', callback_data: 'pocket_option' }],
        [{ text: lang === 'en' ? '← Back to menu' : '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    const message = lang === 'en' ? `
*Private signals* give you real-time access to the exact trade entries I use on my own accounts. Each signal includes the asset, direction, and exact entry time — all you have to do is follow.

📌 *What you need to do:*

1. Create an account with the broker
2. Fund your balance from $50

The signals are based on economic news and my personal trading strategy.
    ` : `
*Приватные сигналы* — это доступ к моим торговым входам в реальном времени, которые я использую на своих счетах. Каждый сигнал содержит актив, направление и точное время входа — тебе остаётся только повторить.

📌 *Что нужно сделать:*

1. Зарегистрировать аккаунт на брокере
2. Пополнить баланс от 50$

Сигналы основаны на экономических новостях и моей авторской стратегии.
    `;

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    await this.bot.answerCallbackQuery(query.id);
  }

  async handleFreeGuide(query, lang) {
    const keyboard = {
      inline_keyboard: [
        [{ text: lang === 'en' ? '← Back to menu' : '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    const message = lang === 'en' ? `
📚 *Free Guide: How to Trade on Economic News*

News trading is a strategy where trades are opened immediately after the release of major economic indicators. The market often reacts with strong, fast movements — and that's exactly what my method is built on.

*Here are the basic principles:*

1️⃣ *Where to track news?*
Use an economic calendar:
• Investing.com
• Forexfactory.com

Look for high-impact events like:
• Non-Farm Payrolls (USA)
• CPI (Inflation)
• FOMC / Interest Rates
• Unemployment Rate
• GDP

2️⃣ *When to enter a trade?*
I open trades within the first 1–5 seconds after the news is released — but only if the actual result is far from the forecast.

Direction is based on the numbers:
• Actual > Forecast → price tends to go up
• Actual < Forecast → price tends to drop

3️⃣ *What timeframe do I use?*
Binary options with 1–2 minute expiry. The goal is to catch the immediate spike after the news.

📌 *Important:* I only trade major economic news — not every day.

⚠️ This is just the basics. Full algorithm, news filtering, and exact entry rules are available in the private signals.
    ` : `
📚 *Бесплатный гайд: Как торговать на экономических новостях*

Торговля на новостях — это стратегия, при которой сделки открываются сразу после выхода важных экономических показателей. В момент публикации рынок реагирует резко, создавая сильные импульсы — именно на них и строится мой подход.

*Вот базовые принципы:*

1️⃣ *Где смотреть новости?*
Используй экономический календарь:
• Investing.com
• Forexfactory.com

Ищи события с высокой важностью:
• Non-Farm Payrolls (США)
• CPI (инфляция)
• FOMC / процентные ставки
• Безработица
• ВВП

2️⃣ *Когда входить в рынок?*
Я открываю сделку в первые 1–5 секунд после выхода новости, если она сильно отличается от прогноза.

Направление выбираю по факту:
• Показатель выше прогноза → цена чаще растёт
• Ниже прогноза → цена падает

3️⃣ *На каком таймфрейме торгую?*
Бинарные опционы на 1–2 минуты. Цель — поймать краткий импульс сразу после новости.

📌 *Важно:* торгую только на ключевых новостях и не каждый день.

⚠️ Это базовый уровень. Полный алгоритм, фильтрация новостей и система входов — доступны в приватных сигналах.
    `;

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    await this.bot.answerCallbackQuery(query.id);
  }

  async handleAboutStrategy(query, lang) {
    const keyboard = {
      inline_keyboard: [
        [{ text: lang === 'en' ? '← Back to menu' : '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    const message = lang === 'en' ? `
🧠 *About My Strategy: How I Analyze the Market*

My strategy is based on trading economic news — no indicators, just raw data and instant reaction.

• I monitor key events (CPI, NFP, interest rates) using an economic calendar.
• As soon as the news is released, I compare the actual numbers with the forecast.
• If there's a strong difference, I enter a trade within the first 1–5 seconds while the market is moving impulsively.

📌 I don't guess the direction — I react to facts.

I use a fixed trade size and only trade major news events. I don't trade every day — only when the setup is clean.

This strategy delivers 80%+ winning trades and allows for consistent profit.
    ` : `
🧠 *О моей стратегии: Как я анализирую рынок*

Моя стратегия основана на торговле по экономическим новостям — никаких индикаторов, только факт и моментальная реакция.

• Я отслеживаю ключевые события (CPI, NFP, ставки) через экономический календарь.
• Как только выходит новость — сравниваю фактическое значение с прогнозом.
• Если данные сильно отличаются — открываю сделку в первые 1–5 секунд, пока рынок двигается импульсом.

📌 Я не угадываю направление — я реагирую на факты.

Использую фиксированную сумму и работаю только на сильных новостях. Не торгую каждый день — только когда есть качественный сигнал.

Стратегия даёт 80%+ прибыльных сделок и позволяет зарабатывать стабильно.
    `;

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    await this.bot.answerCallbackQuery(query.id);
  }

  async handleVipBonus(query, lang) {
    const keyboard = {
      inline_keyboard: [
        [{ text: lang === 'en' ? '🎁 Get Bonus' : '🎁 Получить бонус', callback_data: 'pocket_option' }],
        [{ text: lang === 'en' ? '← Back to menu' : '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    const message = lang === 'en' ? `
🎁 *VIP Bonus*

Get +60% on your first deposit at Pocket Option. Use this promo code when depositing: *ATY737*

📌 Example: deposit $500 → your account will show $800.

Click the button below to register and get your bonus!
    ` : `
🎁 *VIP Бонус*

Получай +60% к первому депозиту на Pocket Option. Используй промокод при пополнении: *ATY737*

📌 Пример: внес $500 → на счёт зачислится $800.

Жми на кнопку ниже для регистрации и получения бонуса!
    `;

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    await this.bot.answerCallbackQuery(query.id);
  }

  async handleFaq(query, lang) {
    const keyboard = {
      inline_keyboard: [
        [{ text: lang === 'en' ? '← Back to menu' : '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    const message = lang === 'en' ? `
📄 *Frequently Asked Questions*

1. *Do I need trading experience to start?* — No, just copy my trades or follow the signals.

2. *Where do you trade?* — On Pocket Option. The link is in the menu.

3. *How much do I need to start?* — Optimal: $500–$1000 for stable trading. $10–$50 is possible, but with a high risk of losing the balance.

4. *Is there a registration bonus?* — Yes, if you register through my link, you get a deposit bonus.

5. *How do I copy your trades?* — Register, deposit, and you'll get access to my copy signals.

6. *Is this real or demo trading?* — I trade with real money. All trades are shared live.

7. *Is Pocket Option reliable?* — Yes. It's been operating for years, and I withdraw funds regularly.

8. *Can I withdraw my money?* — Yes, withdrawals are available to cards, crypto, and wallets. I'll guide you.

9. *How much time do I need per day?* — 10–20 minutes is enough. All signals come via Telegram.

10. *What happens after I register?* — You'll receive full instructions, the bonus, and access to education and signals.

11. *How do I access private signals?* — Register via my link and make a deposit — then you get access.

12. *Where will I receive the signals?* — In a private Telegram channel.

13. *I'm in another country. Will it work?* — Yes. Pocket Option is available in most countries.

14. *What are the deposit methods?* — Bank cards, cryptocurrency, and e-wallets.

15. *What if I lose money?* — You trade at your own risk. I share a strategy with 80%+ winning trades.

16. *Can I trade from my phone?* — Yes, there are mobile apps for both iOS and Android.

17. *How fast can I make profit?* — Depends on your deposit and discipline. Many students see +30–70% in the first week.

18. *Is support available?* — Yes. My team and I are available 24/7.
    ` : `
📄 *Частые вопросы*

1. *Нужно ли уметь торговать, чтобы начать?* — Нет, ты просто копируешь мои сделки или следуешь сигналам.

2. *Где я торгую?* — На платформе Pocket Option. Ссылка есть в меню.

3. *Сколько нужно денег для старта?* — Оптимально: $500–$1000 для стабильной торговли. $10-$50 — возможно, но риск потери баланса высокий.

4. *Есть ли бонус за регистрацию?* — Да, при регистрации по моей ссылке ты получаешь бонус к депозиту.

5. *Как копировать сделки?* — Регистрируешься, вносишь депозит, и получаешь доступ к сигналам для копирования.

6. *Это реальная торговля или демо?* — Я торгую на реальные деньги. Все сделки публикуются в реальном времени.

7. *Pocket Option — это надёжно?* — Да. Платформа работает много лет, я регулярно вывожу средства.

8. *Могу ли я вывести деньги?* — Да, вывод доступен на карты, крипту и кошельки. Подскажу как.

9. *Сколько времени нужно в день?* — Достаточно 10–20 минут. Все сигналы приходят в Telegram.

10. *Что будет после регистрации?* — Ты получаешь инструкции, бонус и доступ к обучению и сигналам.

11. *Как попасть в приватные сигналы?* — Регистрируешься по моей ссылке, вносишь депозит — и получаешь доступ.

12. *Где приходят сигналы?* — В закрытом Telegram-канале.

13. *Я в другой стране. Всё будет работать?* — Да. Pocket Option работает почти во всех странах.

14. *Какие способы пополнения?* — Банковская карта, криптовалюта, электронные кошельки.

15. *Если я потеряю деньги — кто виноват?* — Риски ты берёшь на себя. Я делюсь стратегией с 80%+ прибыльных сделок.

16. *Можно ли торговать с телефона?* — Да, есть мобильные приложения для iOS и Android.

17. *Как быстро можно заработать?* — Всё зависит от депозита и дисциплины. Часто ученики делают +30–70% за первую неделю.

18. *Есть ли поддержка?* — Да. Я и моя команда на связи 24/7.
    `;

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    await this.bot.answerCallbackQuery(query.id);
  }

  async handleFaqItem(query, lang, data) {
    const faqNum = data.replace('faq_', '');

    const faqAnswers = {
      en: {
        '1': 'No, just copy my trades or follow the signals.',
        '2': 'On Pocket Option. The link is in the menu.',
        '3': 'Optimal: $500–$1000 for stable trading. $10–$50 is possible, but with a high risk of losing the balance.',
        '4': 'Yes, if you register through my link, you get a deposit bonus.',
        '5': 'Register, deposit, and you\'ll get access to my copy signals.',
        '6': 'I trade with real money. All trades are shared live.',
        '7': 'Yes. It\'s been operating for years, and I withdraw funds regularly.',
        '8': 'Yes, withdrawals are available to cards, crypto, and wallets. I\'ll guide you.',
        '9': '10–20 minutes is enough. All signals come via Telegram.'
      },
      ru: {
        '1': 'Нет, ты просто копируешь мои сделки или следуешь сигналам.',
        '2': 'На платформе Pocket Option. Ссылка есть в меню.',
        '3': 'Оптимально: $500–$1000 для стабильной торговли. $10-$50 — возможно, но риск потери баланса высокий.',
        '4': 'Да, при регистрации по моей ссылке ты получаешь бонус к депозиту.',
        '5': 'Регистрируешься, вносишь депозит, и получаешь доступ к сигналам для копирования.',
        '6': 'Я торгую на реальные деньги. Все сделки публикуются в реальном времени.',
        '7': 'Да. Платформа работает много лет, я регулярно вывожу средства.',
        '8': 'Да, вывод доступен на карты, крипту и кошельки. Подскажу как.',
        '9': 'Достаточно 10–20 минут. Все сигналы приходят в Telegram.'
      }
    };

    const answer = lang === 'en' ? faqAnswers.en[faqNum] : faqAnswers.ru[faqNum];

    const keyboard = {
      inline_keyboard: [
        [{ text: lang === 'en' ? '← Back to FAQ' : '← Назад к FAQ', callback_data: 'faq' }],
        [{ text: lang === 'en' ? '← Back to menu' : '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    await this.bot.editMessageText(`💬 ${answer}`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      reply_markup: keyboard
    });

    await this.bot.answerCallbackQuery(query.id);
  }

  async handlePocketOption(query, lang) {
    const url = lang === 'en'
      ? 'https://u3.shortink.io/register?utm_campaign=764996&utm_source=affiliate&utm_medium=sr&a=qjU9XsMF2HJcK3&ac=bot&code=50START'
      : 'https://po-ru4.click/register?utm_campaign=764996&utm_source=affiliate&utm_medium=sr&a=qjU9XsMF2HJcK3&ac=bot&code=50START';

    const keyboard = {
      inline_keyboard: [
        [{ text: lang === 'en' ? '🔗 Register on Pocket Option' : '🔗 Регистрация в Pocket Option', url: url }],
        [{ text: lang === 'en' ? '← Back to menu' : '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    const message = lang === 'en' ? `
🔗 *Pocket Option Registration*

Click the button below to register and get:
• +60% bonus on first deposit (code: ATY737)
• Access to copy trading
• Private signals access

After registration and deposit, contact support to get your access.
    ` : `
🔗 *Регистрация в Pocket Option*

Нажмите кнопку ниже для регистрации и получите:
• +60% бонус на первый депозит (код: ATY737)
• Доступ к копированию сделок
• Доступ к приватным сигналам

После регистрации и депозита свяжитесь с поддержкой для получения доступа.
    `;

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    await this.bot.answerCallbackQuery(query.id);
  }

  async handleSettings(query, lang) {
    const keyboard = {
      inline_keyboard: [
        [{ text: lang === 'en' ? '🌐 Change Language' : '🌐 Изменить язык', callback_data: 'change_language' }],
        [{ text: lang === 'en' ? '← Back to menu' : '← Назад в меню', callback_data: 'main_menu' }]
      ]
    };

    const message = lang === 'en' ?
      '⚙️ *Settings*\n\nChoose what you want to configure:' :
      '⚙️ *Настройки*\n\nВыберите что вы хотите настроить:';

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    await this.bot.answerCallbackQuery(query.id);
  }

  async handleChangeLanguage(query, lang) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🇷🇺 Русский', callback_data: 'lang_ru_settings' },
          { text: '🇬🇧 English', callback_data: 'lang_en_settings' }
        ],
        [{ text: lang === 'en' ? '← Back' : '← Назад', callback_data: 'settings' }]
      ]
    };

    const message = lang === 'en' ?
      '🌐 Choose your language:' :
      '🌐 Выберите язык:';

    await this.bot.editMessageText(message, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      reply_markup: keyboard
    });

    await this.bot.answerCallbackQuery(query.id);
  }

  async handleBackToMainMenu(query) {
    const userId = query.from.id;
    await this.showMainMenu(query.message.chat.id, userId);
    await this.bot.answerCallbackQuery(query.id);
  }

  async handleReviews(query, lang) {
    try {
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;

      // Show first review image
      await this.showReviewImage(chatId, messageId, 0, lang);
      await this.bot.answerCallbackQuery(query.id);

    } catch (error) {
      this.logger.error('Error handling reviews', error);
      await this.bot.answerCallbackQuery(query.id, {
        text: lang === 'en' ? 'Error loading reviews' : 'Ошибка загрузки отзывов'
      });
    }
  }

  async handleReviewNavigation(query, lang, data) {
    try {
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;

      if (data === 'review_back') {
        // Return to main menu
        await this.showMainMenu(chatId, query.from.id);
        await this.bot.answerCallbackQuery(query.id);
        return;
      }

      // Parse review navigation data (review_left_X or review_right_X)
      const parts = data.split('_');
      if (parts.length !== 3) {
        throw new Error('Invalid review navigation data');
      }

      const direction = parts[1]; // 'left' or 'right'
      const currentIndex = parseInt(parts[2]);

      let newIndex;
      if (direction === 'left') {
        newIndex = currentIndex - 1;
      } else if (direction === 'right') {
        newIndex = currentIndex + 1;
      } else {
        throw new Error('Invalid navigation direction');
      }

      await this.showReviewImage(chatId, messageId, newIndex, lang);
      await this.bot.answerCallbackQuery(query.id);

    } catch (error) {
      this.logger.error('Error handling review navigation', error);
      await this.bot.answerCallbackQuery(query.id, {
        text: lang === 'en' ? 'Navigation error' : 'Ошибка навигации'
      });
    }
  }

  async showReviewImage(chatId, messageId, index, lang) {
    try {
      const fs = require('fs');
      const path = require('path');

      // Get list of review images
      const reviewsDir = path.join(process.cwd(), '@review_pics');

      if (!fs.existsSync(reviewsDir)) {
        throw new Error('Reviews directory not found');
      }

      const files = fs.readdirSync(reviewsDir)
        .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
        .sort();

      if (files.length === 0) {
        const noImagesText = lang === 'en'
          ? '📷 No review images found.\n\nPlease add images to @review_pics directory.'
          : '📷 Изображения отзывов не найдены.\n\nДобавьте изображения в папку @review_pics.';

        await this.bot.editMessageText(noImagesText, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: lang === 'en' ? '← Back' : '← Назад', callback_data: 'main_menu' }]
            ]
          }
        });
        return;
      }

      // Handle index boundaries
      if (index < 0) index = files.length - 1;
      if (index >= files.length) index = 0;

      const currentFile = files[index];
      const imagePath = path.join(reviewsDir, currentFile);

      // Create navigation buttons
      const keyboard = {
        inline_keyboard: [
          [
            { text: '⬅️', callback_data: `review_left_${index}` },
            { text: '➡️', callback_data: `review_right_${index}` }
          ],
          [{ text: lang === 'en' ? '← Back' : '← Назад', callback_data: 'review_back' }]
        ]
      };

      const caption = '';

      // Try to edit with photo first
      try {
        await this.bot.editMessageMedia({
          type: 'photo',
          media: imagePath,
          caption: caption,
          parse_mode: 'Markdown'
        }, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: keyboard
        });
      } catch (editError) {
        // If edit fails, delete old message and send new one
        try {
          await this.bot.deleteMessage(chatId, messageId);
        } catch (deleteError) {
          this.logger.warn('Could not delete old message', deleteError);
        }

        await this.bot.sendPhoto(chatId, imagePath, {
          caption: caption,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      }

    } catch (error) {
      this.logger.error('Error showing review image', error);

      // Fallback to text message
      const errorText = lang === 'en'
        ? '❌ Error loading review images.\n\nPlease make sure images are in @review_pics directory.'
        : '❌ Ошибка загрузки изображений отзывов.\n\nУбедитесь, что изображения находятся в папке @review_pics.';

      await this.bot.editMessageText(errorText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: lang === 'en' ? '← Back' : '← Назад', callback_data: 'main_menu' }]
          ]
        }
      });
    }
  }
}

module.exports = MenuHandler;
