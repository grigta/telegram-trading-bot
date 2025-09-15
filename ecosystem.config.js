module.exports = {
  apps: [{
    name: 'telegram-trading-bot',
    script: 'index.js',
    cwd: '/opt/telegram-trading-bot',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/telegram-trading-bot/error.log',
    out_file: '/var/log/telegram-trading-bot/out.log',
    log_file: '/var/log/telegram-trading-bot/combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm Z'
  }]
};