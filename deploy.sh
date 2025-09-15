#!/bin/bash

# Скрипт для деплоя Telegram бота на VPS
# Использование: ./deploy.sh

set -e

echo "🚀 Начинаем деплой Telegram Trading Bot на VPS..."

# Функция проверки установки
check_installation() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 не установлен. Устанавливаем..."
        return 1
    else
        echo "✅ $1 установлен"
        return 0
    fi
}

# Проверяем и устанавливаем зависимости
echo "📦 Проверяем зависимости..."

# Node.js
if ! check_installation node; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# PM2
if ! check_installation pm2; then
    sudo npm install -g pm2
fi

# Git (если не установлен)
if ! check_installation git; then
    sudo apt-get update
    sudo apt-get install -y git
fi

echo "📁 Создаем директорию для бота..."
BOT_DIR="/opt/telegram-trading-bot"
sudo mkdir -p $BOT_DIR
sudo chown $USER:$USER $BOT_DIR

echo "📥 Копируем файлы бота..."
cp -r * $BOT_DIR/

echo "📁 Переходим в директорию бота..."
cd $BOT_DIR

echo "📦 Устанавливаем npm зависимости..."
npm install --production

echo "🔧 Настраиваем PM2..."
pm2 stop telegram-trading-bot 2>/dev/null || true
pm2 delete telegram-trading-bot 2>/dev/null || true
pm2 start index.js --name telegram-trading-bot

echo "💾 Сохраняем PM2 конфигурацию..."
pm2 save
pm2 startup

echo "🎉 Деплой завершен успешно!"
echo "📊 Для просмотра логов используйте: pm2 logs telegram-trading-bot"
echo "🔄 Для перезапуска используйте: pm2 restart telegram-trading-bot"
echo "⏹️  Для остановки используйте: pm2 stop telegram-trading-bot"