const axios = require('axios');
require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://67.205.174.166';
const API_KEY = process.env.API_KEY || 'maher123';

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in .env');
}

let offset = 0;

async function telegramApi(method, data) {
  const response = await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    data
  );
  return response.data;
}

async function initTelegramBot() {
  await telegramApi('deleteWebhook', {
    drop_pending_updates: true
  });

  console.log('✅ Telegram webhook deleted, polling mode active');
}

async function getPositions() {
  const response = await axios.get(`${BRIDGE_URL}/positions`, {
    headers: { 'x-api-key': API_KEY }
  });

  return response.data;
}

async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  await telegramApi('sendMessage', payload);
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  await telegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text
  });
}

async function editTelegramMessage(chatId, messageId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  await telegramApi('editMessageText', payload);
}

function parseCommand(text) {
  if (!text) return null;

  const clean = text.trim();
  const parts = clean.split(' ').filter(Boolean);

  const command = (parts[0] || '').toLowerCase();
  const signalId = parts[1];

  if (command === '/approve' && !signalId) {
    return { error: 'missing_id', command };
  }

  if (command === '/reject' && !signalId) {
    return { error: 'missing_id', command };
  }

  if (command === '/signal' && !signalId) {
    return { error: 'missing_id', command };
  }

  if (command === '/approve' && signalId) {
    return { decision: 'approve', signalId };
  }

  if (command === '/reject' && signalId) {
    return { decision: 'reject', signalId };
  }

  if (command === '/signal' && signalId) {
    return { decision: 'signal', signalId };
  }

  if (command === '/help' || command === '/start') {
    return { decision: 'help' };
  }

  return null;
}

async function approveSignal(signalId) {
  const signal = await getSignalFromPending(signalId);

  const body = { signalId };

  if (signal?.symbol === 'XAUUSD') {
    body.symbolId = 41;
  }

  const response = await axios.post(
    `${BRIDGE_URL}/approve`,
    body,
    {
     headers: {
  'Content-Type': 'application/json',
  'x-api-key': process.env.API_KEY
}
    }
  );

  return response.data;
}

async function rejectSignal(signalId) {
  const response = await axios.post(
    `${BRIDGE_URL}/reject`,
    { signalId },
    {
   headers: {
  'Content-Type': 'application/json',
  'x-api-key': process.env.API_KEY
}
    }
  );

  return response.data;
}

async function getPendingSignals() {
  const response = await axios.get(`${BRIDGE_URL}/pending`, {
    headers: {
      'x-api-key': API_KEY
    }
  });

  return response.data;
}

async function getSignalFromPending(signalId) {
  const pending = await getPendingSignals();

  if (!Array.isArray(pending)) return null;

  return pending.find(s => String(s.signalId) === String(signalId)) || null;
}

async function getSignalById(signalId) {
  try {
    // أولاً: نبحث في pending
    const pending = await getPendingSignals();

    if (Array.isArray(pending)) {
      const found = pending.find(s => String(s.signalId) === String(signalId));
      if (found) return found;
    }

    // ثانياً: نبحث في executed (trades.json)
    const response = await axios.get(`${BRIDGE_URL}/trades`, {
      headers: {
        'x-api-key': API_KEY
      }
    });

    const trades = response.data;

    if (Array.isArray(trades)) {
      return trades.find(t => String(t.signalId) === String(signalId)) || null;
    }

    return null;
  } catch (err) {
    console.error('Error fetching signal:', err.message);
    return null;
  }
}

async function handleApprove(chatId, signalId, callbackQueryId = null, messageId = null) {
  try {
    const signal = await getSignalFromPending(signalId);
    const result = await approveSignal(signalId);

    const action = signal?.action || result.action || '-';
    const volume = result.volume || signal?.volume || '-';

    const position =
      result.result?.payload?.position ||
      result.result?.payload?.executionEvent?.position ||
      result.result?.payload?.order ||
      {};

    const positionId =
      position.positionId ||
      result.positionId ||
      result.executedPositionId ||
      '-';

    const executedPrice =
      position.price ||
      position.entryPrice ||
      result.price ||
      result.executedPrice ||
      '-';

    const status = result.result?.simulated ? 'SIMULATION' : 'LIVE EXECUTED';

    const text = `🚀 تم تنفيذ الصفقة بنجاح

🆔 Signal ID: ${signalId}
📊 Symbol: ${result.resolvedSymbol?.symbolName || signal?.symbol || 'XAUUSD'}
📈 Action: ${action}
💰 Volume: ${volume}
🆔 Position ID: ${positionId}
💵 Entry Price: ${executedPrice}

🛡️ إدارة الصفقة:
• Break Even: مفعّل
• Trailing Stop: مفعّل
• Partial Close: مفعّل
• Smart Exit: مفعّل

📌 Status: ${status}
⏱ Time: ${new Date().toLocaleString()}`;

    if (callbackQueryId) {
      await answerCallbackQuery(callbackQueryId, 'Approved');
    }

    if (messageId) {
      await editTelegramMessage(chatId, messageId, text);
    } else {
      await sendTelegramMessage(chatId, text);
    }
  } catch (err) {
    const errorText = `❌ فشل تنفيذ الموافقة على الإشارة ${signalId}

${err.response?.data?.message || err.message}`;

    if (callbackQueryId) {
      await answerCallbackQuery(callbackQueryId, 'Failed');
    }

    if (messageId) {
      await editTelegramMessage(chatId, messageId, errorText);
    } else {
      await sendTelegramMessage(chatId, errorText);
    }
  }
}

async function handleReject(chatId, signalId, callbackQueryId = null, messageId = null) {
  try {
    await rejectSignal(signalId);

    const text = `❌ تم رفض الإشارة ${signalId}`;

    if (callbackQueryId) {
      await answerCallbackQuery(callbackQueryId, 'Rejected');
    }

    if (messageId) {
      await editTelegramMessage(chatId, messageId, text);
    } else {
      await sendTelegramMessage(chatId, text);
    }
  } catch (err) {
    const errorText = `❌ فشل تنفيذ الرفض للإشارة ${signalId}

${err.response?.data?.message || err.message}`;

    if (callbackQueryId) {
      await answerCallbackQuery(callbackQueryId, 'Failed');
    }

    if (messageId) {
      await editTelegramMessage(chatId, messageId, errorText);
    } else {
      await sendTelegramMessage(chatId, errorText);
    }
  }
}


async function processMessageUpdate(update) {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  console.log('📩 Telegram received:', text);

  // --- إضافة الأوامر المباشرة الجديدة ---

  // 1. أمر عرض حالة الحساب /status
  if (text === '/status') {
    try {
      // استدعاء الـ API الجديد الذي أنشأناه في server.js
      const response = await axios.get(`${BRIDGE_URL}/account-status`, {
        headers: { 'x-api-key': API_KEY }
      });
      const data = response.data;

      if (data.success) {
        const statusMsg = `
📊 **تقرير حالة الحساب الحالية** 📊
---
🏢 **الوضع:** ${data.mode}
💰 **الرصيد (Balance):** $${data.balance.toFixed(2)}
📈 **السيولة (Equity):** $${data.equity.toFixed(2)}
---
📑 **الصفقات المفتوحة:** ${data.openPositions}
💵 **الربح/الخسارة العائم:** ${data.floatingPnL >= 0 ? '🟢' : '🔴'} $${data.floatingPnL.toFixed(2)}

🕒 _آخر تحديث: ${new Date().toLocaleTimeString()}_
        `;
        await sendTelegramMessage(chatId, statusMsg);
      }
    } catch (err) {
      console.error('Status Error:', err.message);
      await sendTelegramMessage(chatId, "❌ فشل جلب بيانات الحساب. تأكد أن server.js يعمل.");
    }
    return;
  }

  // 2. أمر إغلاق جميع الصفقات (Emergency Close)
if (text === '/closeall') {
  try {
    await sendTelegramMessage(chatId, '⚠️ جاري محاولة إغلاق جميع الصفقات...');

    const response = await axios.post(`${BRIDGE_URL}/close-all-positions`, {}, {
      headers: { 'x-api-key': API_KEY }
    });

    const data = response.data;

    await sendTelegramMessage(
      chatId,
      `🛑 نتيجة الإغلاق:
Total: ${data.total ?? 0}
Closed: ${data.closedCount ?? 0}
Failed: ${data.failedCount ?? 0}

${JSON.stringify(data.results || [], null, 2)}`
    );

  } catch (err) {
    await sendTelegramMessage(chatId, `❌ فشل إغلاق الصفقات\n${err.response?.data?.message || err.message}`);
  }
  return;
}

  // --- الأوامر القديمة المرتبطة بالـ Parser ---
  const parsed = parseCommand(text);

  if (!parsed) {
    await sendTelegramMessage(
      chatId,
      '❌ الأمر غير معروف\n\nاستخدم:\n/status - حالة الحساب\n/close_all - إغلاق الكل\n/signal sig-123 - عرض إشارة\n/help - المساعدة'
    );
    return;
  }

  if (parsed.decision === 'help') {
    await sendTelegramMessage(
      chatId,
      '📘 **أوامر البوت المتاحة:**\n\n' +
      '📊 `/status` -> عرض الرصيد والربح العائم\n' +
      '🛑 `/close_all` -> إغلاق جميع الصفقات فوراً\n' +
      '📡 `/signal ID` -> عرض تفاصيل إشارة معلقة\n' +
      '✅ `/approve ID` -> الموافقة على التنفيذ\n' +
      '❌ `/reject ID` -> رفض الإشارة'
    );
    return;
  }

  if (text === '/positions') {
  try {
    const data = await getPositions();

    if (!data.positions || data.positions.length === 0) {
      await sendTelegramMessage(chatId, '📭 لا توجد صفقات مفتوحة حالياً.');
      return;
    }

    const lines = data.positions.map(p =>
      `🆔 Position: ${p.positionId}
📈 Symbol ID: ${p.symbolId}
📊 Side: ${p.side}
💰 Volume: ${p.volume}
🎯 Entry: ${p.entryPrice ?? '-'}`
    ).join('\n\n');

    await sendTelegramMessage(chatId, `📊 الصفقات المفتوحة:\n\n${lines}`);
  } catch (err) {
    await sendTelegramMessage(chatId, `❌ فشل جلب الصفقات\n${err.response?.data?.message || err.message}`);
  }
  return;
}

  if (parsed.error === 'missing_id') {
    await sendTelegramMessage(
      chatId,
      `⚠️ لازم تكتب رقم الإشارة\n\nمثال:\n${parsed.command} sig-123`
    );
    return;
  }

  if (parsed.decision === 'signal') {
    try {
      const signal = await getSignalById(parsed.signalId);

      if (!signal) {
        await sendTelegramMessage(chatId, `❌ الإشارة ${parsed.signalId} غير موجودة في pending`);
        return;
      }

      await sendTelegramMessage(
        chatId,
        buildSignalMessage(signal),
        buildSignalButtons(signal.signalId)
      );
      return;
    } catch (err) {
      await sendTelegramMessage(
        chatId,
        `❌ تعذر جلب الإشارة ${parsed.signalId}\n\n${err.response?.data?.message || err.message}`
      );
      return;
    }
  }

  if (parsed.decision === 'approve') {
    await handleApprove(chatId, parsed.signalId);
    return;
  }

  if (parsed.decision === 'reject') {
    await handleReject(chatId, parsed.signalId);
    return;
  }
}


async function setBotCommands() {
  await telegramApi('setMyCommands', {
    commands: [
      { command: 'status', description: 'عرض حالة الحساب والصفقات الحالية' },
      { command: 'help', description: 'تعليمات استخدام البوت' }
    ]
  });
}
// استدعها داخل startBot()


async function processCallbackUpdate(update) {
  const callback = update.callback_query;
  if (!callback) return;

  const callbackQueryId = callback.id;
  const data = callback.data || '';
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;

  console.log('🖱 Callback received:', data);

  if (!chatId || !messageId) {
    await answerCallbackQuery(callbackQueryId, 'Invalid callback');
    return;
  }

  const [decision, signalId] = data.split(':');

  if (!decision || !signalId) {
    await answerCallbackQuery(callbackQueryId, 'Invalid payload');
    return;
  }

  if (decision === 'approve') {
    await handleApprove(chatId, signalId, callbackQueryId, messageId);
    return;
  }

  if (decision === 'reject') {
    await handleReject(chatId, signalId, callbackQueryId, messageId);
    return;
  }

  await answerCallbackQuery(callbackQueryId, 'Unknown action');
}

async function pollTelegram() {
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`,
      {
       params: {
  offset,
  timeout: 30,
  allowed_updates: JSON.stringify(['message', 'callback_query'])
},
        timeout: 35000
      }
    );

    const updates = response.data.result || [];

    for (const update of updates) {
      offset = update.update_id + 1;

      if (update.message) {
        await processMessageUpdate(update);
      } else if (update.callback_query) {
        await processCallbackUpdate(update);
      }
    }
  } catch (err) {
    const msg = err.response?.data || err.message || '';

    // تجاهل timeout الطبيعي في long polling
    if (
      String(msg).includes('timeout') ||
      String(err.code || '').includes('ECONNABORTED')
    ) {
      console.log('⏳ Telegram polling timeout (normal)');
      return;
    }

    console.error('❌ Telegram polling error:', msg);
  }
}

async function startBot() {
  console.log('🤖 Telegram bot polling started...');
  console.log(`🔗 Bridge URL: ${BRIDGE_URL}`);

  while (true) {
    try {
      await pollTelegram();
    } catch (err) {
      console.error('❌ startBot loop error:', err.message);
    }

    // مهلة بسيطة بين الدورات
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

initTelegramBot()
  .then(() => startBot())
  .catch(err => {
    console.error('❌ Bot init failed:', err.response?.data || err.message);
  });
