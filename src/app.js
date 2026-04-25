const axios = require('axios');
require('dotenv').config();

const { runStrategy } = require('./modules/strategy/strategy.engine');
const { runRisk } = require('./modules/risk/risk.engine');
// const { executeTrade } = require('./modules/execution/execution.service');

const signal = {
  traceId: 'test-123',
  symbol: 'XAUUSD',
  action: 'BUY',
  volume: 0.01
};

async function sendToTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
  }

  const response = await axios.post(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      chat_id: chatId,
      text: message
    }
  );

  return response.data;
}

async function start() {
  console.log('🚀 SYSTEM STARTED');

  const strategyOk = runStrategy(signal);
  if (!strategyOk) {
    console.log('❌ Strategy rejected signal');
    return;
  }

  const riskOk = runRisk(signal);
  if (!riskOk) {
    console.log('❌ Risk rejected signal');
    return;
  }

  const message = `
🚨 إشارة تداول جديدة

📊 Signal ID: ${signal.traceId}
📈 Symbol: ${signal.symbol}
⚡ Action: ${signal.action}
📦 Lot: ${signal.volume}

━━━━━━━━━━━
❌ رفض:
/reject ${signal.traceId}

✅ تنفيذ:
/approve ${signal.traceId}
`;

  try {
    const result = await sendToTelegram(message);
    console.log('✅ Telegram sent:', result.ok);
  } catch (err) {
    console.error('❌ Telegram send failed:', err.response?.data || err.message);
  }
}

start();