require('dotenv').config();
const TradingBot = require('./src/bot');

// Validate required environment variables
const requiredVars = ['BOT_TOKEN', 'ADMIN_IDS'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  console.error('Please check your .env file');
  process.exit(1);
}

// Initialize and start the bot
async function startBot() {
  try {
    const bot = new TradingBot(process.env.BOT_TOKEN);
    await bot.init();
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
startBot();