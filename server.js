


require('dotenv').config();

// =========================
// IMPORTS
// =========================
const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

const cookieParser = require('cookie-parser');
const { Resend } = require('resend');

// =========================
// APP INIT (مهم جداً يكون هنا)
// =========================
const app = express();

app.get('/test', (req, res) => {
  console.log('🔥 TEST ROUTE HIT');
  res.send('SERVER WORKING');
});

// =========================
// SERVICES
// =========================
const resend = new Resend(process.env.RESEND_API_KEY);

// =========================
// MIDDLEWARES (بعد تعريف app)
// =========================
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 👈 هذا المهم
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});



// =========================
// FILES
// =========================
const OTP_FILE = 'data/otp_sessions.json';
const AUDIT_FILE = 'data/login_audit.json';
const SESSION_FILE = 'data/dashboard_sessions.json';

const AUDIT_EVENTS_FILE = 'data/audit_events.json';



function ensureDataFiles() {
  if (!fs.existsSync('data')) fs.mkdirSync('data');
  if (!fs.existsSync(OTP_FILE)) fs.writeFileSync(OTP_FILE, '[]');
  if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, '[]');
  if (!fs.existsSync(SESSION_FILE)) fs.writeFileSync(SESSION_FILE, '[]');
  if (!fs.existsSync(AUDIT_EVENTS_FILE)) fs.writeFileSync(AUDIT_EVENTS_FILE, '[]');
}

ensureDataFiles();

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getClientInfo(req) {
  return {
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
    time: new Date().toISOString()
  };
}

function logAuditEvent(req, action, details = {}) {
  const events = readJson(AUDIT_EVENTS_FILE) || [];

  events.push({
    time: new Date().toISOString(),
    action,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
    details
  });

  writeJson(AUDIT_EVENTS_FILE, events.slice(-300));
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const found = cookies.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
  return found ? decodeURIComponent(found.split('=')[1]) : null;
}

function dashboardSessionAuth(req, res, next) {
  const token = getCookie(req, 'dashboard_session');
  const sessions = readJson(SESSION_FILE);
  const active = sessions.find(s => s.token === token && new Date(s.expiresAt) > new Date());

  if (active) return next();

  return res.redirect('/login');
}

async function sendOtpByFormSubmit(email, code, req) {
  const info = getClientInfo(req);

  await axios.post(`https://formsubmit.co/ajax/${email}`, {
    _subject: 'RKL Trading Bot Login Code',
    message:
`رمز الدخول إلى لوحة التداول:

${code}

IP:
${info.ip}

Device:
${info.userAgent}

Time:
${info.time}

هذا الرمز صالح لمدة قصيرة فقط.`
  });
}



/* =========================
   CONFIG
========================= */
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || 'maher123';
function auth(req, res, next) {
  const serverApiKey = process.env.API_KEY || 'maher123';

  if (req.headers['x-api-key'] !== serverApiKey) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  next();
}

const MODE = String(process.env.MODE || 'SIMULATION').toUpperCase();

/* =========================
   CTRADER CONFIG
========================= */
const CTRADER_CLIENT_ID = process.env.CTRADER_CLIENT_ID || '';
const CTRADER_CLIENT_SECRET = process.env.CTRADER_CLIENT_SECRET || '';
const CTRADER_ACCESS_TOKEN = process.env.CTRADER_ACCESS_TOKEN || '';
const CTRADER_ACCOUNT_ID = Number(process.env.CTRADER_ACCOUNT_ID || 0);
const CTRADER_HOST = process.env.CTRADER_HOST || 'live.ctraderapi.com';
const CTRADER_PORT = Number(process.env.CTRADER_PORT || 5036);
const CTRADER_WS_URL = `wss://${CTRADER_HOST}:${CTRADER_PORT}`;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const nodemailer = require('nodemailer');

let loginCodes = {};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* =========================
   PAYLOAD TYPES (نظيفة)
========================= */
const PT = {
  APP_AUTH_REQ: 2100,
  APP_AUTH_RES: 2101,

  GET_ACCOUNTS_REQ: 2149,
  GET_ACCOUNTS_RES: 2150,
RECONCILE_REQ: Number(process.env.PT_RECONCILE_REQ || 2124),
RECONCILE_RES: Number(process.env.PT_RECONCILE_RES || 2125),
   AMEND_POSITION_SLTP_REQ: Number(process.env.PT_AMEND_POSITION_SLTP_REQ || 2110),

CLOSE_POSITION_REQ: Number(process.env.PT_CLOSE_POSITION_REQ || 2111),
  ACCOUNT_AUTH_REQ: 2102,
  ACCOUNT_AUTH_RES: 2103,

  GET_TRADER_REQ: 2141,
  GET_TRADER_RES: 2142,

  SYMBOLS_REQ: 2114,
  SYMBOLS_RES: 2115,

  NEW_ORDER_REQ: 2106,
  EXECUTION_EVENT: 2126,
  ORDER_ERROR_EVENT: 2132
};

/* =========================
   STATE
========================= */
let livePositionsCache = [];
let lastPositionsUpdateAt = null;
let cTraderMainWs = null;
let cTraderAuthed = false;
let accountAuthed = false;
let liveBalance = 0;
let liveFreeMargin = 0;

const pendingSignals = new Map();
const executedSignals = new Set();
let lastExecutionTime = 0;

function isMarketClosedError(msg) {
  const text = JSON.stringify(msg || {}).toLowerCase();
  return text.includes('market is closed') || text.includes('only pending orders');
}

function extractPositionInfo(p) {
  return {
    positionId: Number(p.positionId || p.tradeData?.positionId || p.position?.positionId),
    symbolId: Number(p.symbolId || p.tradeData?.symbolId || p.position?.symbolId),
    volume: Number(p.tradeData?.volume || p.volume || p.position?.volume),
    side: p.tradeData?.tradeSide || p.tradeSide || p.position?.tradeSide || '-',
    entryPrice: p.entryPrice || p.tradeData?.entryPrice || p.position?.entryPrice || null,
    raw: p
  };
}
/* =========================
   HELPERS
========================= */



function auth(req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }
  next();
}

function now() {
  return new Date().toISOString();
}

/* =========================
   STORAGE (بسيط)
========================= */
function saveToFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function telegramApi(method, data) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN in .env');
  }

  const response = await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    data
  );

  return response.data;
}

function buildTelegramSignalText(signal) {
  return `📡 إشارة جديدة

🆔 Signal ID: ${signal.signalId}
📈 Symbol: ${signal.symbol || '-'}
📊 Action: ${signal.action || '-'}
💰 Volume: ${signal.volume ?? '-'}
⚠️ Risk %: ${signal.riskPercent ?? '-'}
🛑 Stop Loss $: ${signal.stopLossUsd ?? '-'}
🎯 Take Profit $: ${signal.takeProfitUsd ?? '-'}
📌 Status: ${signal.status || '-'}`;
}

function buildTelegramSignalButtons(signalId) {
  return {
    inline_keyboard: [
      [
        {
          text: '✅ Approve',
          callback_data: `approve:${signalId}`
        },
        {
          text: '❌ Reject',
          callback_data: `reject:${signalId}`
        }
      ]
    ]
  };
}

async function sendSignalToTelegram(signal) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('⚠️ Telegram auto-send skipped: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return;
  }

  await telegramApi('sendMessage', {
    chat_id: TELEGRAM_CHAT_ID,
    text: buildTelegramSignalText(signal),
    reply_markup: buildTelegramSignalButtons(signal.signalId)
  });
}

/* =========================
   SIGNAL BUILDER
========================= */
function buildSignal(body) {
  const parsedVolume =
    body.volume !== undefined &&
    body.volume !== null &&
    body.volume !== '' &&
    Number(body.volume) > 0
      ? Number(body.volume)
      : null;

  return {
    signalId: body.signalId || `sig-${Date.now()}`,
    symbol: String(body.symbol || '').toUpperCase().trim(),
    action: String(body.action || '').toLowerCase().trim(),
    volume: parsedVolume,

    stopLossUsd: body.stopLossUsd !== undefined ? Number(body.stopLossUsd) : null,
    takeProfitUsd: body.takeProfitUsd !== undefined ? Number(body.takeProfitUsd) : null,
    riskPercent: body.riskPercent !== undefined ? Number(body.riskPercent) : null,

    // 🔥 الجديد
    atr: body.atr !== undefined ? Number(body.atr) : null,

    status: 'pending',
    createdAt: now()
  };
}

/* =========================
   WS REQUEST
========================= */
function wsRequest(handler) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);

    ws.on('open', () => handler(ws));

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        resolve(data);
        ws.close();
      } catch (e) {
        reject(e);
      }
    });

    ws.on('error', reject);
  });
}
function requireCTraderEnv() {
  const missing = [];

  if (!CTRADER_CLIENT_ID) missing.push('CTRADER_CLIENT_ID');
  if (!CTRADER_CLIENT_SECRET) missing.push('CTRADER_CLIENT_SECRET');
  if (!CTRADER_ACCESS_TOKEN) missing.push('CTRADER_ACCESS_TOKEN');
  if (!CTRADER_ACCOUNT_ID) missing.push('CTRADER_ACCOUNT_ID');

  if (missing.length) {
    const err = new Error(`Missing required .env variables: ${missing.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
}

function findSymbolByScanWs({ search = 'XAU', batchSize = 500, maxAssetId = 10000 } = {}) {
  requireCTraderEnv();

  const searchUpper = String(search || '').toUpperCase().trim();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);
    let settled = false;

    const state = {
      currentStart: 1,
      batchSize,
      maxAssetId
    };

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error('Timeout while searching for symbol in cTrader'));
    }, 120000);

    function doneSuccess(data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(data);
    }

    function doneError(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      reject(error);
    }

    function sendNextSymbolsBatch() {
      const start = state.currentStart;
      const end = Math.min(start + state.batchSize - 1, state.maxAssetId);

      console.log(`SCAN RANGE: ${start} -> ${end}`);

      ws.send(JSON.stringify({
        clientMsgId: `symbols-${Date.now()}`,
        payloadType: PT.SYMBOLS_REQ,
        payload: {
          ctidTraderAccountId: CTRADER_ACCOUNT_ID,
          includeArchivedSymbols: false,
          firstAssetId: start,
          lastAssetId: end
        }
      }));
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({
        clientMsgId: `app-auth-${Date.now()}`,
        payloadType: PT.APP_AUTH_REQ,
        payload: {
          clientId: CTRADER_CLIENT_ID,
          clientSecret: CTRADER_CLIENT_SECRET
        }
      }));
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        console.log('WS MESSAGE:', msg);

        if (msg.payloadType === PT.APP_AUTH_RES) {
          ws.send(JSON.stringify({
            clientMsgId: `get-accounts-${Date.now()}`,
            payloadType: PT.GET_ACCOUNTS_REQ,
            payload: {
              accessToken: CTRADER_ACCESS_TOKEN
            }
          }));
          return;
        }

        if (msg.payloadType === PT.GET_ACCOUNTS_RES) {
          const accounts = (msg.payload?.ctidTraderAccount || []).map(acc => ({
            ctidTraderAccountId: Number(acc.ctidTraderAccountId),
            traderLogin: acc.traderLogin,
            isLive: acc.isLive,
            brokerTitleShort: acc.brokerTitleShort
          }));

          const accountFound = accounts.find(
            a => a.ctidTraderAccountId === CTRADER_ACCOUNT_ID
          );

          if (!accountFound) {
            const err = new Error(`CTRADER_ACCOUNT_ID ${CTRADER_ACCOUNT_ID} was not found`);
            err.details = { accounts };
            throw err;
          }

          ws.send(JSON.stringify({
            clientMsgId: `account-auth-${Date.now()}`,
            payloadType: PT.ACCOUNT_AUTH_REQ,
            payload: {
              ctidTraderAccountId: CTRADER_ACCOUNT_ID,
              accessToken: CTRADER_ACCESS_TOKEN
            }
          }));
          return;
        }

        if (msg.payloadType === PT.ACCOUNT_AUTH_RES) {
          sendNextSymbolsBatch();
          return;
        }

        if (msg.payloadType === PT.SYMBOLS_RES || msg.payload?.symbol) {
          const rawSymbols = msg.payload?.symbol || [];

          const list = rawSymbols.map(s => ({
            symbolId: Number(s.symbolId || s.symbolId?.low || 0),
            symbolName:
              s.symbolName ||
              s.symbol ||
              s.displayName ||
              s.name ||
              s.description ||
              '',
            description: s.description || '',
            raw: s
          }));

          const matched = list.filter(s =>
            String(s.symbolName).toUpperCase().includes(searchUpper) ||
            String(s.description).toUpperCase().includes(searchUpper)
          );

          if (matched.length > 0) {
            return doneSuccess({
              ok: true,
              message: 'Symbol found',
              search: searchUpper,
              matched,
              scanRange: {
                start: state.currentStart,
                end: Math.min(state.currentStart + state.batchSize - 1, state.maxAssetId)
              }
            });
          }

          state.currentStart += state.batchSize;

          if (state.currentStart > state.maxAssetId) {
            return doneSuccess({
              ok: false,
              message: `No symbols matched "${searchUpper}" up to assetId ${state.maxAssetId}`
            });
          }

          sendNextSymbolsBatch();
          return;
        }

        if (msg.payload?.description) {
          const description = String(msg.payload.description);

          if (description.includes('Invalid assetID')) {
            return doneSuccess({
              ok: false,
              message: description
            });
          }
        }
      } catch (error) {
        doneError(error);
      }
    });

    ws.on('error', doneError);

    ws.on('close', () => {
      // ignored unless timeout/error/success handles it
    });
  });
}



async function applyBreakEvenLogic(symbolId, targetPositions = [], trades = []) {
  try {
    if (!Array.isArray(targetPositions) || targetPositions.length === 0) return;

    for (const p of targetPositions) {
      const trade = trades.find(t =>
        Number(t.positionId) === Number(p.positionId) &&
        !t.exitReason
      );

      if (!trade || trade.breakEvenDone) continue;

      const atr = Number(trade.atr || 0.5);

      const entryPrice = Number(
        p.entryPrice ||
        p.tradeData?.entryPrice ||
        p.position?.entryPrice ||
        0
      );

      const currentPrice = Number(
        p.price ||
        p.tradeData?.price ||
        p.position?.price ||
        0
      );

      if (!entryPrice || !currentPrice) continue;

      const isBuy =
        String(p.tradeData?.tradeSide || p.tradeSide || p.position?.tradeSide || '')
          .toUpperCase() === 'BUY';

      const profitDistance = isBuy
        ? currentPrice - entryPrice
        : entryPrice - currentPrice;

      if (profitDistance < atr * 1.2) continue;

      const buffer = atr * 0.1;
      const newSL = isBuy ? entryPrice + buffer : entryPrice - buffer;

      console.log('🧠 BREAK EVEN TRIGGERED:', {
        symbolId,
        positionId: p.positionId,
        entryPrice,
        currentPrice,
        atr,
        profitDistance,
        newSL
      });

      await modifyStopLoss(p.positionId, newSL);

      trade.breakEvenDone = true;
      trade.breakEvenAt = now();
      trade.breakEvenSL = newSL;
    }
  } catch (err) {
    console.log('⚠️ Break-even error:', err.message);
  }
}

async function applyTrailingStop(symbolId, targetPositions = [], trades = []) {
  try {
    if (!Array.isArray(targetPositions) || targetPositions.length === 0) return;

    for (const p of targetPositions) {
      const trade = trades.find(t =>
        Number(t.positionId) === Number(p.positionId) &&
        !t.exitReason
      );

      if (!trade) continue;

      const atr = Number(trade.atr || 0.5);

      const entryPrice = Number(
        p.entryPrice ||
        p.tradeData?.entryPrice ||
        p.position?.entryPrice ||
        0
      );

      const currentPrice = Number(
        p.price ||
p.tradeData?.price ||
p.position?.price ||
0
      );

      const currentSL = Number(
        p.stopLoss ||
        p.tradeData?.stopLoss ||
        p.position?.stopLoss ||
        0
      );

      if (!entryPrice || !currentPrice) continue;

      const profitDistance = Math.abs(currentPrice - entryPrice);

      if (profitDistance < atr * 1.5) continue;

      const isBuy =
        (p.tradeData?.tradeSide || p.tradeSide || '').toUpperCase() === 'BUY';

      let newSL;

      if (isBuy) {
        newSL = currentPrice - atr * 0.8;
        if (newSL <= currentSL) continue;
      } else {
        newSL = currentPrice + atr * 0.8;
        if (newSL >= currentSL && currentSL !== 0) continue;
      }

      console.log('🚀 TRAILING STOP UPDATE:', {
        symbolId,
        positionId: p.positionId,
        oldSL: currentSL,
        newSL
      });

      await modifyStopLoss(p.positionId, newSL);
    }

  } catch (err) {
    console.log('⚠️ Trailing error:', err.message);
  }
}

async function smartExitAI(symbolId, targetPositions = [], trades = []) {
  try {
    if (!Array.isArray(targetPositions) || targetPositions.length === 0) return;

    for (const p of targetPositions) {
      const trade = trades.find(t =>
        Number(t.positionId) === Number(p.positionId) &&
        !t.exitReason
      );

      if (!trade) continue;

      const atr = Number(trade.atr || 0.5);

      const entryPrice = Number(
        p.entryPrice ||
        p.tradeData?.entryPrice ||
        p.position?.entryPrice ||
        0
      );

      const currentPrice = Number(
       p.price ||
p.tradeData?.price ||
p.position?.price ||
0
      );

      if (!entryPrice || !currentPrice) continue;

      const isBuy =
        (p.tradeData?.tradeSide || p.tradeSide || '').toUpperCase() === 'BUY';

      const profitDistance = Math.abs(currentPrice - entryPrice);

      if (profitDistance < atr * 1.5) continue;

      let peakPrice = Number(trade.peakPrice || entryPrice);

      if (isBuy && currentPrice > peakPrice) {
        trade.peakPrice = currentPrice;
      }

      if (!isBuy && currentPrice < peakPrice) {
        trade.peakPrice = currentPrice;
      }

      const pullback = Math.abs(currentPrice - trade.peakPrice);

      if (pullback >= atr) {
        console.log('🧠 SMART EXIT TRIGGERED:', {
          symbolId,
          positionId: p.positionId
        });

        await closePosition(p.positionId, p.volume);

        trade.exitReason = 'smart_exit';
        trade.exitPrice = currentPrice;
        trade.exitTime = now();
      }
    }

  } catch (err) {
    console.log('⚠️ Smart exit error:', err.message);
  }
}


/* =========================
   نظام التنبيهات الذكي (Critical Alerts)
========================= */

async function sendCriticalAlert(message) {
    console.error(`🚨 ALERT: ${message}`);
    try {
        // نستخدم توكن تيليجرام لإرسال التنبيه مباشرة
        const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: `⚠️ **تنبيه عاجل من السيرفر** ⚠️\n\n${message}`,
            parse_mode: 'Markdown'
        });
    } catch (err) {
        console.error('❌ فشل إرسال التنبيه لتيليجرام:', err.message);
    }
}



// 2. تطوير وظيفة تنفيذ الصفقات لتشمل التنبيه بالفشل
async function executeTradeWithAlert(params) {
    try {
        const response = await executeOrder(params);
        if (response.payloadType === PT.ERROR_RES) {
            await sendCriticalAlert(`❌ فشل فتح الصفقة!\nالسبب: ${response.payload.errorMessage}`);
        }
        return response;
    } catch (err) {
        await sendCriticalAlert(`🔥 خطأ برمي عند محاولة فتح صفقة: ${err.message}`);
    }
}




async function refreshCTraderToken() {
  try {
    console.log('🔄 المحاولة لتجديد Access Token...');
    
   const response = await axios.post('https://api.ctraderapi.com/v2/oauth/token', null, {
  params: {
    grant_type: 'refresh_token',
    client_id: process.env.CTRADER_CLIENT_ID,
    client_secret: process.env.CTRADER_CLIENT_SECRET,
    refresh_token: process.env.CTRADER_REFRESH_TOKEN,
  }
});

    const newData = response.data;
    if (newData.access_token) {
      // تحديث القيم في الذاكرة
      process.env.CTRADER_ACCESS_TOKEN = newData.access_token;
      process.env.CTRADER_REFRESH_TOKEN = newData.refresh_token;

      // تحديث ملف .env تلقائياً
      updateEnvFile(newData.access_token, newData.refresh_token);
      
      await sendCriticalAlert(`✅ تم تجديد التوكن بنجاح! السيرفر مستمر في العمل.`);
      console.log('✅ New Access Token:', newData.access_token);
    }
  } catch (error) {
    const errorMsg = error.response?.data?.error_description || error.message;
    await sendCriticalAlert(`🚨 فشل تجديد التوكن: ${errorMsg}\nيرجى التدخل يدوياً!`);
  }
}

// وظيفة لتحديث ملف .env برمجياً
function updateEnvFile(newToken, newRefreshToken) {
  const envPath = '.env';
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    envContent = envContent.replace(/CTRADER_ACCESS_TOKEN=.*/, `CTRADER_ACCESS_TOKEN='${newToken}'`);
    envContent = envContent.replace(/CTRADER_REFRESH_TOKEN=.*/, `CTRADER_REFRESH_TOKEN='${newRefreshToken}'`);
    
    fs.writeFileSync(envPath, envContent);
    console.log('💾 تم تحديث ملف .env بالتوكنات الجديدة.');
  }
}

async function modifyStopLoss(positionId, stopLoss) {
  if (MODE !== 'LIVE') {
    return { ok: true, simulated: true };
  }

  requireCTraderEnv();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error('Modify Stop Loss timeout'));
    }, 30000);

    function finish(data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(data);
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({
        clientMsgId: `be-app-auth-${Date.now()}`,
        payloadType: PT.APP_AUTH_REQ,
        payload: {
          clientId: CTRADER_CLIENT_ID,
          clientSecret: CTRADER_CLIENT_SECRET
        }
      }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.payloadType === PT.APP_AUTH_RES) {
          ws.send(JSON.stringify({
            clientMsgId: `be-account-auth-${Date.now()}`,
            payloadType: PT.ACCOUNT_AUTH_REQ,
            payload: {
              ctidTraderAccountId: CTRADER_ACCOUNT_ID,
              accessToken: CTRADER_ACCESS_TOKEN
            }
          }));
          return;
        }

        if (msg.payloadType === PT.ACCOUNT_AUTH_RES) {
          const payload = {
            ctidTraderAccountId: CTRADER_ACCOUNT_ID,
            positionId: Number(positionId),
            stopLoss: Number(stopLoss),
            guaranteedStopLoss: false
          };

          console.log('🛡️ BREAK EVEN SL PAYLOAD:', payload);

          ws.send(JSON.stringify({
            clientMsgId: `break-even-${Date.now()}`,
            payloadType: PT.AMEND_POSITION_SLTP_REQ,
            payload
          }));
          return;
        }

        if (
          msg.payloadType === PT.EXECUTION_EVENT ||
          msg.payloadType === PT.ORDER_ERROR_EVENT ||
          msg.payload?.errorCode
        ) {
          return finish(msg);
        }

      } catch (err) {
        reject(err);
      }
    });

    ws.on('error', reject);
  });
}

async function applyBreakEvenSafe() {
  if (process.env.AUTO_MANAGEMENT_ENABLED !== 'true') return;
  if (process.env.BREAK_EVEN_ENABLED !== 'true') return;

  const triggerUsd = Number(process.env.BREAK_EVEN_TRIGGER_USD || 5);
  const bufferUsd = Number(process.env.BREAK_EVEN_BUFFER_USD || 0.5);

  const positions = await getOpenPositionsFromCTrader();

  for (const raw of positions) {
    const p = extractPositionInfo(raw);

    const price = Number(raw.price || raw.tradeData?.price || 0);
    const entry = Number(raw.entryPrice || raw.tradeData?.entryPrice || raw.position?.entryPrice || 0);
    const side = String(p.side).toUpperCase();

    if (!p.positionId || !price || !entry) continue;

    const profitDistance = side.includes('BUY')
      ? price - entry
      : entry - price;

    if (profitDistance < triggerUsd) continue;

    const newSL = side.includes('BUY')
      ? entry + bufferUsd
      : entry - bufferUsd;

    console.log('🛡️ BREAK EVEN TRIGGER:', {
      positionId: p.positionId,
      side,
      entry,
      price,
      profitDistance,
      newSL
    });

    await modifyStopLoss(p.positionId, newSL);
  }
}

async function resolveSymbolId(symbolName) {
  const clean = String(symbolName || '').toUpperCase().trim();

  if (!clean) {
    const err = new Error('symbol is required to resolve symbolId');
    err.statusCode = 400;
    throw err;
  }

  const result = await findSymbolByScanWs({
    search: clean,
    batchSize: 500,
    maxAssetId: 10000
  });

  if (!result?.ok || !Array.isArray(result.matched) || result.matched.length === 0) {
    const err = new Error(`No symbolId found for symbol "${clean}"`);
    err.statusCode = 404;
    throw err;
  }

  const exact =
    result.matched.find(s => String(s.symbolName || '').toUpperCase() === clean) ||
    result.matched[0];

  return exact;
}


function normalizeVolumeUnits(units) {
  let v = Math.round(Number(units) || 0);

  if (!Number.isFinite(v) || v <= 0) v = 1000;

  v = Math.round(v / 1000) * 1000;

  if (v < 1000) v = 1000;
  if (v > 50000) v = 50000;

  return v;
}


function smartDecision(signal) {
  const hour = new Date().getHours();

  const sessionOK = hour >= 10 && hour <= 22;

  const riskOK = (Number(process.env.MAX_DAILY_TRADES || 10) > 0);

  return {
    allowed: sessionOK && riskOK,
    reason: !sessionOK
      ? 'Outside trading session'
      : !riskOK
      ? 'Risk limit reached'
      : 'OK'
  };
}

function calculateGoldVolumeFromRisk({
  balance,
  riskPercent = 0.01,
  stopLossUsd = 10
}) {
  const bal = Number(balance || 0);
  const risk = Number(riskPercent || 0.01);
  const sl = Number(stopLossUsd || 10);

  if (!Number.isFinite(bal) || bal <= 0) {
    throw new Error('Invalid balance for risk calculation');
  }

  if (!Number.isFinite(risk) || risk <= 0) {
    throw new Error('Invalid riskPercent');
  }

  if (!Number.isFinite(sl) || sl <= 0) {
    throw new Error('Invalid stopLossUsd');
  }

  const riskAmount = bal * risk;

  // تقريب عملي للذهب:
  // 1.00 lot ≈ $100 لكل حركة 1$
  const lots = riskAmount / (sl * 100);

  const rawUnits = lots * 100000;

  return normalizeVolumeUnits(rawUnits);
}

/* =========================
   GET ACCOUNT SNAPSHOT
========================= */

// =========================
// GET ACCOUNT (بسيط)
// =========================
async function getAccount() {
  return wsRequest((ws) => {
    ws.send(JSON.stringify({
      clientMsgId: `app-auth-${Date.now()}`,
      payloadType: PT.APP_AUTH_REQ,
      payload: {
        clientId: CTRADER_CLIENT_ID,
        clientSecret: CTRADER_CLIENT_SECRET
      }
    }));
  });
}

async function closePosition(positionId, volume) {
  if (MODE !== 'LIVE') return { simulated: true };

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error('Close position timeout'));
    }, 30000);

    function finish(data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(data);
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({
        clientMsgId: `close-app-auth-${Date.now()}`,
        payloadType: PT.APP_AUTH_REQ,
        payload: {
          clientId: CTRADER_CLIENT_ID,
          clientSecret: CTRADER_CLIENT_SECRET
        }
      }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());

      if (msg.payloadType === PT.APP_AUTH_RES) {
        ws.send(JSON.stringify({
          clientMsgId: `close-account-auth-${Date.now()}`,
          payloadType: PT.ACCOUNT_AUTH_REQ,
          payload: {
            ctidTraderAccountId: CTRADER_ACCOUNT_ID,
            accessToken: CTRADER_ACCESS_TOKEN
          }
        }));
        return;
      }

      if (msg.payloadType === PT.ACCOUNT_AUTH_RES) {
        ws.send(JSON.stringify({
          clientMsgId: `close-position-${Date.now()}`,
          payloadType: PT.CLOSE_POSITION_REQ,
          payload: {
            ctidTraderAccountId: CTRADER_ACCOUNT_ID,
            positionId: Number(positionId),
            volume: Number(volume)
          }
        }));
        return;
      }

      if (
        msg.payloadType === PT.EXECUTION_EVENT ||
        msg.payloadType === PT.ORDER_ERROR_EVENT ||
        msg.payload?.errorCode
      ) {
        return finish(msg);
      }
    });

    ws.on('error', reject);
  });
}



// =========================
// GET OPEN POSITIONS (محسّن)
// =========================
async function getOpenPositionsFromCTrader() {
  if (MODE !== 'LIVE') {
    console.log('⚠️ Using simulation mode (no positions)');
    return [];
  }

  requireCTraderEnv();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error('❌ Get positions timeout'));
    }, 30000);

    function finish(data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}

      console.log('📊 POSITIONS RECEIVED:', data);
      resolve(data);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}

      console.log('❌ WS ERROR:', error.message);
      reject(error);
    }

    ws.on('open', () => {
      console.log('🔐 APP AUTH...');
      ws.send(JSON.stringify({
        clientMsgId: `app-auth-${Date.now()}`,
        payloadType: PT.APP_AUTH_REQ,
        payload: {
          clientId: CTRADER_CLIENT_ID,
          clientSecret: CTRADER_CLIENT_SECRET
        }
      }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // =========================
        // STEP 1: APP AUTH
        // =========================
        if (msg.payloadType === PT.APP_AUTH_RES) {
          console.log('🔐 ACCOUNT AUTH...');
          ws.send(JSON.stringify({
            clientMsgId: `account-auth-${Date.now()}`,
            payloadType: PT.ACCOUNT_AUTH_REQ,
            payload: {
              ctidTraderAccountId: CTRADER_ACCOUNT_ID,
              accessToken: CTRADER_ACCESS_TOKEN
            }
          }));
          return;
        }

        // =========================
        // STEP 2: ACCOUNT AUTH
        // =========================
        if (msg.payloadType === PT.ACCOUNT_AUTH_RES) {
          console.log('📡 RECONCILE REQUEST...');
          ws.send(JSON.stringify({
            clientMsgId: `reconcile-${Date.now()}`,
            payloadType: PT.RECONCILE_REQ,
            payload: {
              ctidTraderAccountId: CTRADER_ACCOUNT_ID
            }
          }));
          return;
        }

        // =========================
        // STEP 3: RECEIVE POSITIONS
        // =========================
        if (msg.payloadType === PT.RECONCILE_RES) {

          const positionsRaw =
            msg.payload?.position ||
            msg.payload?.positions ||
            [];

          const positions = Array.isArray(positionsRaw)
            ? positionsRaw
            : [positionsRaw];

          console.log('✅ OPEN POSITIONS COUNT:', positions.length);

          return finish(positions);
        }

        // =========================
        // ERROR HANDLING
        // =========================
        if (msg.payload?.errorCode) {
          return fail(
            new Error(`${msg.payload.errorCode}: ${msg.payload.description || ''}`)
          );
        }

      } catch (error) {
        fail(error);
      }
    });

    ws.on('error', (err) => {
      console.log('❌ WS CONNECTION ERROR:', err.message);
      fail(err);
    });

    ws.on('close', () => {
      console.log('🔌 WS CLOSED');
    });
  });
}


async function canOpenNewPosition(symbolId, newAction) {
  try {
    const positions = livePositionsCache || [];

    const sameSymbolPositions = positions.filter(p => {
      const pSymbolId =
        p.symbolId ||
        p.tradeData?.symbolId ||
        p.position?.symbolId;

      return Number(pSymbolId) === Number(symbolId);
    });

    console.log('📌 SAME SYMBOL POSITIONS:', sameSymbolPositions);

    if (sameSymbolPositions.length === 0) {
      return {
        allowed: true,
        reason: 'No open position for this symbol'
      };
    }

    const maxPositions = Number(process.env.MAX_POSITIONS_PER_SYMBOL || 2);

    if (sameSymbolPositions.length >= maxPositions) {
      return {
        allowed: false,
        reason: `Max positions reached for symbolId ${symbolId}`
      };
    }

    const incomingSide = String(newAction || '').toUpperCase();

    const hasOppositeDirection = sameSymbolPositions.some(p => {
      const existingSide =
        p.tradeData?.tradeSide ||
        p.tradeSide ||
        p.position?.tradeSide ||
        '';

      return String(existingSide).toUpperCase() !== incomingSide;
    });

    if (process.env.ALLOW_SAME_DIRECTION_ONLY !== 'false' && hasOppositeDirection) {
      return {
        allowed: false,
        reason: 'Opposite direction trade blocked'
      };
    }

const minProfit = Number(process.env.MIN_PROFIT_TO_ADD_USD || 5);

    const hasSafeProfitablePosition = sameSymbolPositions.some(p => {
      const rawProfit =
        p.netProfit ??
        p.unrealizedNetProfit ??
        p.position?.netProfit ??
        p.position?.unrealizedNetProfit ??
        p.moneyNetProfit ??
        0;

      const moneyDigits =
        p.moneyDigits ??
        p.position?.moneyDigits ??
        2;

      const profit = Number(rawProfit) / Math.pow(10, Number(moneyDigits || 2));

      console.log('💵 POSITION PROFIT:', profit);

      return profit >= minProfit;
    });

    if (!hasSafeProfitablePosition) {
      return {
        allowed: false,
        reason: `Existing position is not profitable enough. Required profit >= ${minProfit} USD`
      };
    }

    return {
      allowed: true,
      reason: 'Hybrid allowed: same direction and existing position is profitable'
    };

  } catch (error) {
    console.log('⚠️ Could not verify hybrid position logic:', error.message);

    return {
      allowed: false,
      reason: 'Could not verify open positions from cTrader'
    };
  }
}

/* =========================
   EXECUTE ORDER
========================= */
async function executeOrder({ symbolId, side, volume }) {
  if (MODE !== 'LIVE') {
    return { simulated: true };
  }

  requireCTraderEnv();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error('Order timeout'));
    }, 30000);

    function finish(data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(data);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      reject(error);
    }

    ws.on('open', () => {
      console.log('🔐 APP AUTH...');
      ws.send(JSON.stringify({
        clientMsgId: `app-auth-${Date.now()}`,
        payloadType: PT.APP_AUTH_REQ,
        payload: {
          clientId: CTRADER_CLIENT_ID,
          clientSecret: CTRADER_CLIENT_SECRET
        }
      }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        console.log('📩 ORDER WS MESSAGE:', msg);

        if (msg.payloadType === PT.APP_AUTH_RES) {
          console.log('🔐 ACCOUNT AUTH...');
          ws.send(JSON.stringify({
            clientMsgId: `account-auth-${Date.now()}`,
            payloadType: PT.ACCOUNT_AUTH_REQ,
            payload: {
              ctidTraderAccountId: CTRADER_ACCOUNT_ID,
              accessToken: CTRADER_ACCESS_TOKEN
            }
          }));
          return;
        }

        if (msg.payloadType === PT.ACCOUNT_AUTH_RES) {
          console.log('🚀 SENDING NEW ORDER...');
          ws.send(JSON.stringify({
            clientMsgId: `new-order-${Date.now()}`,
            payloadType: PT.NEW_ORDER_REQ,
            payload: {
              ctidTraderAccountId: CTRADER_ACCOUNT_ID,
              symbolId: Number(symbolId),
              orderType: 1,
              tradeSide: String(side).toUpperCase(),
              volume: Number(volume)
            }
          }));
          return;
        }

        if (
          msg.payloadType === PT.EXECUTION_EVENT ||
          msg.payloadType === PT.ORDER_ERROR_EVENT ||
          msg.payload?.errorCode ||
          msg.payload?.executionType
        ) {
          return finish(msg);
        }

      } catch (error) {
        fail(error);
      }
    });

    ws.on('error', fail);
  });
}

/* =========================
   ROUTES
========================= */

app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const account = await getCTraderAccountInfo();
    const positions = await getOpenPositionsFromCTrader();
    const pending = Array.from(pendingSignals.values());

    let floatingPnL = 0;

    const formattedPositions = positions.map(p => {
      const info = extractPositionInfo(p);

      const rawProfit =
        p.netProfit ??
        p.unrealizedNetProfit ??
        p.moneyNetProfit ??
        p.position?.netProfit ??
        0;

      const moneyDigits =
        p.moneyDigits ??
        p.position?.moneyDigits ??
        2;

      floatingPnL += Number(rawProfit) / Math.pow(10, Number(moneyDigits || 2));

      return {
        positionId: info.positionId,
        symbolId: info.symbolId,
        symbol: Number(info.symbolId) === 41 ? 'XAUUSD' : String(info.symbolId || '-'),
        volume: info.volume,
        side: info.side,
        price:
          p.price ||
          p.tradeData?.price ||
          p.position?.price ||
          p.tradeData?.entryPrice ||
          p.entryPrice ||
          '-',
        entryPrice: info.entryPrice,
        status: 'ACTIVE'
      };
    });

    res.json({
      ok: true,
      mode: MODE,
      serverTime: new Date().toISOString(),
      equity: account.equity,
      balance: account.balance,
      positions: formattedPositions,
      pending,
      floatingPnL
    });

  } catch (err) {
    console.error('DASHBOARD ERROR:', err);
    res.json({
      ok: false,
      message: err.message
    });
  }
});

app.post('/api/verify-code', (req, res) => {
  const { email, code } = req.body;

  if (loginCodes[email] == code) {
    return res.json({ success: true });
  }

  res.json({ success: false });
});



app.get('/', (req, res) => {
  res.json({ ok: true, mode: MODE });
});

app.post('/signals', auth, async (req, res) => {
  try {
    const signal = buildSignal(req.body);

    pendingSignals.set(signal.signalId, signal);

    saveToFile('pending_signals.json', Array.from(pendingSignals.values()));

    try {
      await sendSignalToTelegram(signal);
      console.log(`📨 Signal ${signal.signalId} sent to Telegram`);
    } catch (tgError) {
      console.error('❌ Telegram auto-send failed:', tgError.response?.data || tgError.message);
    }

    res.json({ ok: true, signal });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});

app.get('/api/audit', (req, res) => {
  const events = readJson(AUDIT_EVENTS_FILE) || [];
  res.json({
    ok: true,
    events: events.slice(-100).reverse()
  });
});

// مسار جلب حالة الحساب والصفقات
app.get('/account-status', async (req, res) => {
  try {
    // 1. جلب معلومات الحساب (Balance, Equity)
    const accountInfo = await getCTraderAccountInfo(); // الدالة الموجودة عندك مسبقاً
    
    // 2. جلب الصفقات المفتوحة
    const positions = await getOpenPositionsFromCTrader();
    
    // 3. حساب إجمالي الأرباح/الخسائر العائمة
    let totalFloatingPnL = 0;
    positions.forEach(p => {
        // حساب تقريبي للربح (يمكنك تطويره حسب العملة)
        totalFloatingPnL += (p.unrealizedGrossProfit || 0) / 100; 
    });

    res.json({
      success: true,
     balance: accountInfo.balance,
equity: accountInfo.equity,
      openPositions: positions.length,
      floatingPnL: totalFloatingPnL,
      mode: process.env.MODE
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



app.post('/close-all-positions', auth, async (req, res) => {
  logAuditEvent(req, 'KILL SWITCH ACTIVATED');
  try {
    const positions = await getOpenPositionsFromCTrader();

    if (!positions || positions.length === 0) {
      return res.json({
        ok: true,
        message: 'No open positions',
        total: 0,
        closedCount: 0,
        failedCount: 0,
        results: []
      });
    }

    const results = [];

 for (const rawPosition of positions) {
  const p = extractPositionInfo(rawPosition);

  if (!p.positionId || !p.volume) {
    results.push({
      ok: false,
      positionId: p.positionId || null,
      symbolId: p.symbolId || null,
      volume: p.volume || null,
      error: 'Missing positionId or volume'
    });
    continue;
  }

  try {
    const result = await closePosition(p.positionId, p.volume);

    // ✅ هنا مكانه الصحيح
    logAuditEvent(req, 'Closed Position', {
      positionId: p.positionId,
      volume: p.volume
    });

    results.push({
      ok: true,
      positionId: p.positionId,
      volume: p.volume
    });

  } catch (err) {
    results.push({
      ok: false,
      positionId: p.positionId,
      error: err.message
    });
  }
}

    const closedCount = results.filter(r => r.ok).length;
    const failedCount = results.filter(r => !r.ok).length;

    return res.json({
      ok: failedCount === 0,
      total: positions.length,
      closedCount,
      failedCount,
      results
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message
    });
  }
});


const HIGH_IMPACT_NEWS = [
  { title: 'FOMC', currency: 'USD' },
  { title: 'CPI', currency: 'USD' },
  { title: 'NFP', currency: 'USD' },
  { title: 'Nonfarm Payrolls', currency: 'USD' },
  { title: 'Interest Rate Decision', currency: 'USD' },
  { title: 'PPI', currency: 'USD' },
  { title: 'Retail Sales', currency: 'USD' }
];

function isNewsBlackoutNow() {
  if (process.env.NEWS_FILTER_ENABLED !== 'true') {
    return { blocked: false, reason: 'News filter disabled' };
  }

  const nowTime = new Date();
  const beforeMin = Number(process.env.NEWS_BLACKOUT_BEFORE_MINUTES || 30);
  const afterMin = Number(process.env.NEWS_BLACKOUT_AFTER_MINUTES || 15);

  // مؤقتًا نستخدم جدول يدوي إلى أن نربط API اقتصادي
  const manualNews = [
    // مثال:
    // { title: 'FOMC', time: '2026-04-29T21:00:00+03:00', currency: 'USD', impact: 'high' }
  ];

  for (const event of manualNews) {
    const eventTime = new Date(event.time);
    const start = new Date(eventTime.getTime() - beforeMin * 60 * 1000);
    const end = new Date(eventTime.getTime() + afterMin * 60 * 1000);

    if (nowTime >= start && nowTime <= end) {
      return {
        blocked: true,
        reason: `News blackout: ${event.title}`,
        event
      };
    }
  }

  return { blocked: false, reason: 'No high impact news now' };
}

// =========================
// TradingView Webhook
// =========================

app.post('/webhook/tradingview', async (req, res) => {
  try {
    // 🔐 حماية webhook
    const providedSecret = req.headers['x-tv-secret'] || req.body.secret;

    if (providedSecret !== process.env.TV_WEBHOOK_SECRET) {
      return res.status(401).json({
        ok: false,
        message: 'Invalid webhook secret'
      });
    }

    const {
      symbol,
      action,
      riskPercent,
      stopLossUsd,
      takeProfitUsd,
      volume
    } = req.body;

    // ✅ تحقق أساسي
    if (!symbol || !action) {
      return res.status(400).json({
        ok: false,
        message: 'Missing data (symbol/action)'
      });
    }

     const newsDecision = isNewsBlackoutNow();

if (newsDecision.blocked) {
  console.log('📰 NEWS FILTER BLOCKED SIGNAL:', newsDecision);

  return res.status(423).json({
    ok: false,
    blocked: true,
    reason: newsDecision.reason,
    event: newsDecision.event || null
  });
}

    // ✅ بناء الإشارة
    const signal = buildSignal({
      signalId: `tv-${Date.now()}`,
      symbol,
      action,
      riskPercent: Number(riskPercent) || 0.01,
      stopLossUsd: Number(stopLossUsd) || 10,
      takeProfitUsd: takeProfitUsd !== undefined ? Number(takeProfitUsd) : null,
      volume: volume !== undefined ? Number(volume) : null
    });

    // ✅ حفظ في الذاكرة
    pendingSignals.set(signal.signalId, signal);

    // ✅ حفظ في الملف (مهم بعد restart)
    saveToFile('pending_signals.json', Array.from(pendingSignals.values()));

    // 📡 إرسال لتيليجرام
    try {
      await sendSignalToTelegram(signal);
      console.log(`📡 TradingView Signal received: ${signal.signalId}`);
    } catch (tgError) {
      console.error(
        '❌ Telegram auto-send failed:',
        tgError.response?.data || tgError.message
      );
    }

    // ✅ رد سريع لـ TradingView
    return res.json({
      ok: true,
      signalId: signal.signalId,
      signal
    });

  } catch (err) {
    console.error('❌ Webhook error:', err.message);

    return res.status(500).json({
      ok: false,
      message: err.message
    });
  }
});


async function getCTraderAccountInfo() {
  if (MODE !== 'LIVE') {
    return {
      balance: Number(process.env.TEST_ACCOUNT_BALANCE || 500),
      equity: Number(process.env.TEST_ACCOUNT_BALANCE || 500),
      freeMargin: Number(process.env.TEST_ACCOUNT_BALANCE || 500),
      source: 'simulation'
    };
  }

  requireCTraderEnv();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error('Get account info timeout'));
    }, 30000);

    function finish(data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(data);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      reject(error);
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({
        clientMsgId: `app-auth-${Date.now()}`,
        payloadType: PT.APP_AUTH_REQ,
       payload: {
  clientId: CTRADER_CLIENT_ID,
  clientSecret: CTRADER_CLIENT_SECRET
}
      }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.payloadType === PT.APP_AUTH_RES) {
          ws.send(JSON.stringify({
            clientMsgId: `account-auth-${Date.now()}`,
            payloadType: PT.ACCOUNT_AUTH_REQ,
            payload: {
              ctidTraderAccountId: CTRADER_ACCOUNT_ID,
              accessToken: process.env.CTRADER_ACCESS_TOKEN
            }
          }));
          return;
        }

        if (msg.payloadType === PT.ACCOUNT_AUTH_RES) {
          ws.send(JSON.stringify({
            clientMsgId: `trader-info-${Date.now()}`,
            payloadType: PT.GET_TRADER_REQ,
            payload: {
              ctidTraderAccountId: CTRADER_ACCOUNT_ID
            }
          }));
          return;
        }

        if (msg.payloadType === PT.GET_TRADER_RES) {
          const trader = msg.payload?.trader || msg.payload || {};

          return finish({
            balance: Number(trader.balance || 0) / 100,
            equity: Number(trader.equity || trader.balance || 0) / 100,
            freeMargin: Number(trader.freeMargin || 0) / 100,
            marginLevel: trader.marginLevel || null,
            raw: trader,
            source: 'ctrader'
          });
        }

        if (msg.payload?.errorCode) {
          return fail(new Error(`${msg.payload.errorCode}: ${msg.payload.description || ''}`));
        }

      } catch (error) {
        fail(error);
      }
    });

    ws.on('error', fail);
  });
}




app.post('/approve', auth, async (req, res) => {
  try {
    const { signalId, symbolId } = req.body;

    console.log('✅ APPROVE REQUEST RECEIVED:', req.body);

    if (!signalId) {
      return res.status(400).json({
        ok: false,
        message: 'signalId is required'
      });
    }

    let signal = pendingSignals.get(signalId);

    if (!signal) {
      try {
        if (fs.existsSync('pending_signals.json')) {
          const raw = fs.readFileSync('pending_signals.json', 'utf8');
          const fileData = raw ? JSON.parse(raw) : [];

          if (Array.isArray(fileData)) {
            signal = fileData.find(s => String(s.signalId) === String(signalId)) || null;

           if (signal) {
  console.log('⚠️ Signal restored from file:', signalId);
  pendingSignals.set(signalId, signal);
}
          }
        }
      } catch (e) {
        console.log('⚠️ Could not read pending_signals.json:', e.message);
      }
    }

    if (!signal) {
      console.log('❌ Signal not found:', signalId);
      return res.status(404).json({
        ok: false,
        message: 'Not found'
      });
    }

    if (executedSignals.has(signalId)) {
      return res.status(409).json({
        ok: false,
        message: 'Already executed'
      });
    }

    console.log('📌 SIGNAL TO EXECUTE:', signal);
logAuditEvent(req, 'Execute Trade Start', {
  symbol: signal.symbol,
  action: signal.action
});
 
const nowTime = Date.now();

const EXECUTION_COOLDOWN = Number(process.env.EXECUTION_COOLDOWN || 15000);

if (nowTime - lastExecutionTime < EXECUTION_COOLDOWN){
  console.log('⛔ Duplicate execution blocked');
  return res.status(429).json({
    ok: false,
    message: 'Duplicate execution blocked'
  });
}

lastExecutionTime = nowTime;

    let finalSymbolId = Number(symbolId || 0);
    let resolvedSymbol = null;

    if (!finalSymbolId) {
      console.log('🔎 Resolving symbolId for:', signal.symbol);
      resolvedSymbol = await resolveSymbolId(signal.symbol);
      finalSymbolId = Number(resolvedSymbol.symbolId);
      console.log('✅ Resolved symbolId:', finalSymbolId);
    }

    const accountInfo = await getCTraderAccountInfo();
const accountBalance = Number(accountInfo.equity || accountInfo.balance || process.env.TEST_ACCOUNT_BALANCE || 500);
const maxDailyLoss = Number(process.env.MAX_DAILY_LOSS || 50);

if (accountBalance < maxDailyLoss) {
  return res.status(403).json({
    ok: false,
    message: 'Account below safety threshold'
  });
}

console.log('💰 ACCOUNT INFO:', accountInfo);
console.log('💰 RISK BALANCE USED:', accountBalance);

    let finalVolume = signal.volume;

    if (!finalVolume) {
      console.log('⚠️ No volume in signal, calculating from risk...');
      finalVolume = calculateGoldVolumeFromRisk({
        balance: accountBalance,
        riskPercent: signal.riskPercent || 0.01,
        stopLossUsd: signal.stopLossUsd || 10
      });
    }

// تأكد أنه رقم
finalVolume = Number(finalVolume);

// تحويل lot إلى units
if (finalVolume > 0 && finalVolume < 10) {
  finalVolume = finalVolume * 100000;
}

// ضبط نهائي
finalVolume = Math.round(finalVolume);

// حدود الأمان
const minUnits = Number(process.env.MIN_VOLUME_UNITS || 1000);
const maxUnits = Number(process.env.MAX_VOLUME_UNITS || 50000);

if (finalVolume < minUnits) finalVolume = minUnits;
if (finalVolume > maxUnits) finalVolume = maxUnits;

console.log('📏 FINAL SAFE VOLUME:', finalVolume);


const positionDecision = await canOpenNewPosition(finalSymbolId, signal.action);

console.log('🧠 POSITION DECISION:', positionDecision);


if (!positionDecision.allowed) {

  // إذا السبب اتجاه معاكس → اغلق وكمّل
  if (positionDecision.reason.includes('Opposite direction')) {

    console.log('🔄 Closing opposite positions before new trade...');

    const positions = await getOpenPositionsFromCTrader();

    const oppositePositions = positions.filter(p => {
      const pSymbolId =
        p.symbolId ||
        p.tradeData?.symbolId ||
        p.position?.symbolId;

      return Number(pSymbolId) === Number(finalSymbolId);
    });

  await Promise.all(
  oppositePositions.map(p => {
    const info = extractPositionInfo(p);
    return closePosition(info.positionId, info.volume);
  })
);

    console.log('✅ Old positions closed, executing new trade...');

  } else {
    // أي سبب ثاني → وقف
    return res.status(409).json({
      ok: false,
      message: positionDecision.reason,
      symbolId: finalSymbolId
    });
  }
}

    console.log('🚀 EXECUTING REAL TRADE...');
    console.log({
      mode: MODE,
      symbol: signal.symbol,
      symbolId: finalSymbolId,
      action: signal.action,
      side: String(signal.action || '').toUpperCase(),
      volume: finalVolume
    });

 const result = await executeTradeWithAlert({
  symbolId: finalSymbolId,
  side: String(signal.action || '').toUpperCase(),
  volume: finalVolume
});


console.log('📊 ORDER RESULT:', result);

    logAuditEvent(req, 'Executed Trade', {
  symbol: signal.symbol,
  volume: finalVolume,
  action: signal.action
});
    executedSignals.add(signalId);
    pendingSignals.delete(signalId);

    saveToFile('pending_signals.json', Array.from(pendingSignals.values()));

    let trades = [];
    try {
      if (fs.existsSync('trades.json')) {
        const rawTrades = fs.readFileSync('trades.json', 'utf8');
        const parsedTrades = rawTrades ? JSON.parse(rawTrades) : [];
        trades = Array.isArray(parsedTrades) ? parsedTrades : [parsedTrades];
      }
    } catch (e) {
      console.log('⚠️ Could not read trades.json, creating a new one');
      trades = [];
    }

const tradeRecord = {
  signalId,
  symbol: signal.symbol,
  action: signal.action,
  volume: finalVolume,
  symbolId: finalSymbolId,
  resolvedSymbol,

  // 🔥 أهم إضافة
 positionId:
  result?.payload?.positionId ||
  result?.payload?.executionEvent?.position?.positionId ||
  null,

  atr: signal.atr || 0.5,

  result,
  time: now(),
  status: 'executed'
};

    trades.push(tradeRecord);
    saveToFile('trades.json', trades);

    console.log('✅ TRADE SAVED:', tradeRecord);

    return res.json({
      ok: true,
      symbolId: finalSymbolId,
      resolvedSymbol,
      volume: finalVolume,
      result
    });

  } catch (error) {
    console.error('❌ APPROVE ERROR:', error);

    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});


app.post('/reject', auth, async (req, res) => {
  try {
    const { signalId } = req.body;

    if (!signalId) {
      return res.status(400).json({
        ok: false,
        message: 'signalId is required'
      });
    }

    let signal = pendingSignals.get(signalId);

    // fallback: اقرأ من الملف إذا ما لقيه في الذاكرة
    if (!signal) {
      try {
        if (fs.existsSync('pending_signals.json')) {
          const raw = fs.readFileSync('pending_signals.json', 'utf8');
          const fileData = raw ? JSON.parse(raw) : [];

          if (Array.isArray(fileData)) {
            signal = fileData.find(s => String(s.signalId) === String(signalId)) || null;

            if (signal) {
              console.log('⚠️ Reject restored signal from file:', signalId);
              pendingSignals.set(signalId, signal);
            }
          }
        }
      } catch (e) {
        console.log('⚠️ Could not read pending_signals.json:', e.message);
      }
    }

    if (!signal) {
      return res.status(404).json({
        ok: false,
        message: 'Not found'
      });
    }

    pendingSignals.delete(signalId);

    // حدّث ملف pending بعد الحذف
    saveToFile('pending_signals.json', Array.from(pendingSignals.values()));

    // اقرأ الملف الحالي للمرفوضات
    let rejectedSignals = [];
    try {
      if (fs.existsSync('rejected_signals.json')) {
        const rawRejected = fs.readFileSync('rejected_signals.json', 'utf8');
        const parsedRejected = rawRejected ? JSON.parse(rawRejected) : [];
        rejectedSignals = Array.isArray(parsedRejected) ? parsedRejected : [parsedRejected];
      }
    } catch (e) {
      console.log('⚠️ Could not read rejected_signals.json, creating a new one');
      rejectedSignals = [];
    }

    rejectedSignals.push({
      signalId: signal.signalId,
      symbol: signal.symbol,
      action: signal.action,
      volume: signal.volume,
      stopLossUsd: signal.stopLossUsd ?? null,
      takeProfitUsd: signal.takeProfitUsd ?? null,
      riskPercent: signal.riskPercent ?? null,
      status: 'rejected',
      rejectedAt: now()
    });

    saveToFile('rejected_signals.json', rejectedSignals);

    return res.json({
      ok: true,
      message: 'Signal rejected',
      signalId: signal.signalId
    });
  } catch (error) {
    console.error('REJECT ERROR:', error);

    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});

app.get('/positions', auth, async (req, res) => {
  try {
    const positions = await getOpenPositionsFromCTrader();

    const formatted = positions.map(extractPositionInfo);

    return res.json({
      ok: true,
      count: formatted.length,
      positions: formatted
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message
    });
  }
});

app.post('/close-position', auth, async (req, res) => {
  try {
    const { positionId, volume } = req.body;

    if (!positionId) {
      return res.status(400).json({
        ok: false,
        message: 'positionId is required'
      });
    }

    let finalVolume = Number(volume || 0);

    if (!finalVolume) {
      const positions = await getOpenPositionsFromCTrader();
      const found = positions.map(extractPositionInfo)
        .find(p => Number(p.positionId) === Number(positionId));

      if (!found) {
        return res.status(404).json({
          ok: false,
          message: 'Position not found'
        });
      }

      finalVolume = found.volume;
    }

    console.log('🛑 CLOSE POSITION REQUEST:', {
      positionId,
      volume: finalVolume
    });

    const result = await closePosition(positionId, finalVolume);

    return res.json({
      ok: !isMarketClosedError(result),
      positionId: Number(positionId),
      volume: finalVolume,
      marketClosed: isMarketClosedError(result),
      result
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message
    });
  }
});



app.get('/ctrader/find-symbol', async (req, res) => {
  try {
    const search = req.query.search || 'XAU';
    const batchSize = Number(req.query.batchSize || 500);
    const maxAssetId = Number(req.query.maxAssetId || 10000);

    const result = await findSymbolByScanWs({
      search,
      batchSize,
      maxAssetId
    });

    return res.json(result);
  } catch (error) {
    console.error('FIND SYMBOL ERROR:', error);

    return res.status(error.statusCode || 500).json({
      ok: false,
      error: 'Find symbol failed',
      message: error.message,
      details: error.details || null
    });
  }
});


app.get('/status', auth, (req, res) => {
  try {
    let pending = Array.from(pendingSignals.values());

    if (pending.length === 0 && fs.existsSync('pending_signals.json')) {
      const rawPending = fs.readFileSync('pending_signals.json', 'utf8');
      const parsedPending = rawPending ? JSON.parse(rawPending) : [];
      pending = Array.isArray(parsedPending) ? parsedPending : [parsedPending];
    }

    let trades = [];
    let rejected = [];

    if (fs.existsSync('trades.json')) {
      const rawTrades = fs.readFileSync('trades.json', 'utf8');
      const parsedTrades = rawTrades ? JSON.parse(rawTrades) : [];
      trades = Array.isArray(parsedTrades) ? parsedTrades : [parsedTrades];
    }

    if (fs.existsSync('rejected_signals.json')) {
      const rawRejected = fs.readFileSync('rejected_signals.json', 'utf8');
      const parsedRejected = rawRejected ? JSON.parse(rawRejected) : [];
      rejected = Array.isArray(parsedRejected) ? parsedRejected : [parsedRejected];
    }

    return res.json({
      ok: true,
      mode: MODE,
      pendingCount: pending.length,
      executedCount: trades.length,
      rejectedCount: rejected.length,
      lastPending: pending[pending.length - 1] || null,
      lastTrade: trades[trades.length - 1] || null,
      lastRejected: rejected[rejected.length - 1] || null
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});


function loginPage() {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Trading Bot Login</title>
<style>
body{font-family:Arial;background:#07111f;color:white;display:flex;align-items:center;justify-content:center;height:100vh}
.box{background:#101d30;padding:30px;border-radius:18px;width:360px;border:1px solid #243b5a}
input,button{width:100%;padding:12px;margin-top:12px;border-radius:10px;border:0}
button{background:#22c55e;color:white;font-weight:bold;cursor:pointer}
.small{color:#9fb3c8;font-size:13px;margin-top:10px}
</style>
</head>
<body>
<div class="box">
<h2>🔐 Trading Bot Login</h2>
<input id="email" placeholder="Email" value="admin@rk-lifts.com">
<input id="password" type="password" placeholder="Password">
<button onclick="login()">Login</button>
<div class="small" id="msg"></div>
</div>

<script>
async function login(){
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const r = await fetch('/auth/login-password', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password})
  });

  const d = await r.json();

  if(d.ok) location.href='/dashboard';
  else document.getElementById('msg').innerText = d.message || 'Login failed';
}
</script>
</body>
</html>
`;
}


app.get('/login.html', (req, res) => {
  res.redirect('/login');
});

app.get('/dashboard', dashboardSessionAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});



app.post('/auth/request-code', async (req, res) => {
  const { email } = req.body;

  const code = Math.floor(100000 + Math.random() * 900000);

  // حفظ الكود (زي ما عندك)

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: 'Trading Bot OTP',
    html: `<h2>Code: ${code}</h2>`
  });

  res.json({ ok: true });
});


app.post('/auth/login-password', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();

  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@rk-lifts.com').toLowerCase();
  const adminPassword = String(process.env.DASHBOARD_PASSWORD || '123456');

  if (email !== adminEmail || password !== adminPassword) {
    return res.status(401).json({ ok: false, message: 'Invalid email or password' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const hours = Number(process.env.SESSION_EXPIRE_HOURS || 8);

  let sessions = readJson(SESSION_FILE) || [];
  sessions = sessions.filter(s => new Date(s.expiresAt) > new Date());

  sessions.push({
    token,
    email,
    loginAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
    ...getClientInfo(req)
  });

  writeJson(SESSION_FILE, sessions);

  res.setHeader(
    'Set-Cookie',
    `dashboard_session=${token}; HttpOnly; Path=/; Max-Age=${hours * 60 * 60}`
  );

  logAuditEvent(req, 'LOGIN_SUCCESS', { email });

  return res.json({ ok: true, message: 'Login successful' });
});

app.post('/auth/verify-code', (req, res) => {
  try {
    // 🔹 تنظيف المدخلات
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ ok: false, message: 'Missing email or code' });
    }

    // 🔹 قراءة OTPs
    let otps = readJson(OTP_FILE) || [];

    // 🔹 تنظيف الأكواد المنتهية
    const now = new Date();
    otps = otps.filter(o => new Date(o.expiresAt) > now);

    writeJson(OTP_FILE, otps); // تحديث الملف بعد التنظيف

    // 🔹 البحث عن الكود الصحيح
    const found = otps.find(o =>
      o.email === email &&
      String(o.code) === code
    );

    if (!found) {
      return res.status(401).json({
        ok: false,
        message: 'Invalid or expired code'
      });
    }

    // 🔐 إنشاء Session
    const token = crypto.randomBytes(32).toString('hex');
    const hours = Number(process.env.SESSION_EXPIRE_HOURS || 8);

    let sessions = readJson(SESSION_FILE) || [];

    // 🔹 تنظيف الجلسات المنتهية
    sessions = sessions.filter(s => new Date(s.expiresAt) > now);

    // 🔹 إضافة جلسة جديدة
 sessions.push({
  token,
  email,
  loginAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  ...getClientInfo(req)
});

    writeJson(SESSION_FILE, sessions);

    // 🔥 حذف OTP المستخدم فقط
    const remainingOtps = otps.filter(o =>
      !(o.email === email && String(o.code) === code)
    );
    writeJson(OTP_FILE, remainingOtps);

    // 🧾 Audit log
    let audit = readJson(AUDIT_FILE) || [];
    audit.push({
      type: 'login_success',
      email,
      time: new Date().toISOString(),
      ...getClientInfo(req)
    });
    writeJson(AUDIT_FILE, audit);

    // 🍪 Cookie
    res.setHeader(
      'Set-Cookie',
      `dashboard_session=${token}; HttpOnly; Path=/; Max-Age=${hours * 60 * 60}`
    );

    return res.json({
      ok: true,
      message: 'Login successful'
    });

  } catch (err) {
    console.error('VERIFY CODE ERROR:', err);
    return res.status(500).json({
      ok: false,
      message: 'Server error'
    });
  }
});

// =========================
// DASHBOARD API
// =========================

app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const positions = await getOpenPositionsFromCTrader();

    let pending = [];
    if (fs.existsSync('pending_signals.json')) {
      const raw = fs.readFileSync('pending_signals.json', 'utf8');
      pending = raw ? JSON.parse(raw) : [];
    }

    let trades = [];
    if (fs.existsSync('trades.json')) {
      const raw = fs.readFileSync('trades.json', 'utf8');
      trades = raw ? JSON.parse(raw) : [];
    }

    return res.json({
      ok: true,
      mode: MODE,
      serverTime: now(),
      positions: positions.map(p => ({
        positionId: p.positionId,
        symbolId: p.symbolId || p.tradeData?.symbolId,
        volume: p.volume || p.tradeData?.volume,
        price: p.price || p.tradeData?.price
      })),
      pending,
      trades
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message
    });
  }
});

app.get('/rejected', auth, (req, res) => {
  try {
    if (!fs.existsSync('rejected_signals.json')) {
      return res.json([]);
    }

    const raw = fs.readFileSync('rejected_signals.json', 'utf8');
    const data = raw ? JSON.parse(raw) : [];

    return res.json(Array.isArray(data) ? data : [data]);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});

app.get('/trades', auth, (req, res) => {
  try {
    if (!fs.existsSync('trades.json')) {
      return res.json([]);
    }

    const raw = fs.readFileSync('trades.json', 'utf8');
    const data = raw ? JSON.parse(raw) : [];

    return res.json(Array.isArray(data) ? data : [data]);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});


app.get('/pending', auth, (req, res) => {
  try {
    // لو الذاكرة فاضية نحاول نقرأ من الملف
    if (pendingSignals.size === 0 && fs.existsSync('pending_signals.json')) {
      const raw = fs.readFileSync('pending_signals.json', 'utf8');
      const fileData = raw ? JSON.parse(raw) : [];

      if (Array.isArray(fileData)) {
        for (const signal of fileData) {
          pendingSignals.set(signal.signalId, signal);
        }
      }
    }

    return res.json(Array.from(pendingSignals.values()));
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});




// =========================
// GLOBAL BREAK EVEN ENGINE
// =========================

/* =========================
   CORE ENGINE: SYNC & MANAGEMENT
   ========================= */

// 1. دالة المطابقة الفرعية (ضعها خارج الـ setInterval أو فوقه)
function syncTradesWithBroker(positions, trades) {
  // استخراج الـ IDs الحقيقية الموجودة في منصة cTrader حالياً
  const brokerPositionIds = positions.map(p => 
    String(p.positionId || p.tradeData?.positionId || p.position?.positionId)
  );

  // تصفية ملف trades.json: نحتفظ فقط بالصفقات التي لا تزال مفتوحة في المنصة
  const initialLength = trades.length;
  const filteredTrades = trades.filter(t => brokerPositionIds.includes(String(t.positionId)));

  if (filteredTrades.length < initialLength) {
    const removedCount = initialLength - filteredTrades.length;
    console.log(`🧹 [Sync] Removed ${removedCount} trades from JSON (closed manually on cTrader).`);
  }

  return filteredTrades;
}


// =========================
// CORE ENGINE: SYNC & MANAGEMENT
// =========================

// 2. المحرك الرئيسي الآمن
setInterval(async () => {
  try {
    // =========================
    // STEP 0: قراءة الصفقات المفتوحة
    // =========================
    const positions = await getOpenPositionsFromCTrader();

    // =========================
    // STEP 1: قراءة trades.json
    // =========================
    let trades = [];
    if (fs.existsSync('trades.json')) {
      const raw = fs.readFileSync('trades.json', 'utf8');
      trades = raw ? JSON.parse(raw) : [];
      trades = Array.isArray(trades) ? trades : [trades];
    }

    // =========================
    // STEP 2: مزامنة trades.json مع cTrader
    // =========================

    // إذا لا توجد صفقات مفتوحة في cTrader
    if (!positions || positions.length === 0) {
      if (trades.length > 0) {
        console.log('🧹 [Sync] No open positions on cTrader. Clearing trades.json');
        saveToFile('trades.json', []);
      }
      return;
    }

    // إذا توجد صفقات في الملف، طابقها مع الصفقات الحية
    if (trades.length > 0) {
      const syncedTrades = syncTradesWithBroker(positions, trades);

      if (syncedTrades.length !== trades.length) {
        console.log('🧹 [Sync] trades.json updated after broker sync');
        trades = syncedTrades;
        saveToFile('trades.json', trades);
      }
    }

    // =========================
    // STEP 3: تحديث الكاش
    // =========================
    livePositionsCache = positions;
    lastPositionsUpdateAt = now();

    // =========================
    // STEP 4: حماية الإدارة التلقائية
    // =========================
    if (process.env.AUTO_MANAGEMENT_ENABLED !== 'true') {
      console.log('🟡 Auto management disabled. Sync only.');
      return;
    }

    // =========================
    // STEP 5: تجميع الرموز المفتوحة
    // =========================
    const uniqueSymbols = new Set();

    for (const p of positions) {
      const symbolId =
        p.symbolId ||
        p.tradeData?.symbolId ||
        p.position?.symbolId;

      if (symbolId) uniqueSymbols.add(Number(symbolId));
    }

    // =========================
    // STEP 6: إدارة الصفقات الذكية
    // =========================
    for (const symbolId of uniqueSymbols) {
      const symbolPositions = positions.filter(p => {
        const pSymbolId =
          p.symbolId ||
          p.tradeData?.symbolId ||
          p.position?.symbolId;

        return Number(pSymbolId) === Number(symbolId);
      });

      // Break Even
      if (process.env.BREAK_EVEN_ENABLED === 'true') {
        await applyBreakEvenLogic(symbolId, symbolPositions, trades);
      }

      // Trailing Stop
      if (process.env.TRAILING_STOP_ENABLED === 'true') {
        await applyTrailingStop(symbolId, symbolPositions, trades);
      }

      // Smart Exit AI
      if (process.env.SMART_EXIT_ENABLED === 'true') {
        await smartExitAI(symbolId, symbolPositions, trades);
      }
    }

    // =========================
    // STEP 7: حفظ التحديثات
    // =========================
    saveToFile('trades.json', trades);

  } catch (err) {
    console.error('⚠️ [Engine Error]:', err.message);
  }
}, 20000); // يعمل كل 20 ثانية

/* =========================
   AUTO TOKEN REFRESH LOGIC
========================= */



// جدولة التجديد كل 15 يوم (بالملي ثانية)
const FIFTEEN_DAYS = 15 * 24 * 60 * 60 * 1000;


// تشغيل الفحص مرة واحدة فور تشغيل السيرفر للتأكد من الصلاحية
setInterval(refreshCTraderToken, FIFTEEN_DAYS);


let ws;
// 1. تعديل وظيفة الاتصال لإضافة نظام Reconnect
function connectToCTrader() {
  cTraderMainWs = new WebSocket(CTRADER_WS_URL);

  cTraderMainWs.on('open', () => {
    console.log('✅ Main WebSocket connected');

    cTraderMainWs.send(JSON.stringify({
      clientMsgId: `main-app-auth-${Date.now()}`,
      payloadType: PT.APP_AUTH_REQ,
      payload: {
        clientId: CTRADER_CLIENT_ID,
        clientSecret: CTRADER_CLIENT_SECRET
      }
    }));
  });

  cTraderMainWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.payloadType === PT.APP_AUTH_RES) {
        cTraderAuthed = true;
        console.log('🔐 Main APP AUTH OK');

        cTraderMainWs.send(JSON.stringify({
          clientMsgId: `main-account-auth-${Date.now()}`,
          payloadType: PT.ACCOUNT_AUTH_REQ,
          payload: {
            ctidTraderAccountId: CTRADER_ACCOUNT_ID,
            accessToken: process.env.CTRADER_ACCESS_TOKEN
          }
        }));
        return;
      }

      if (msg.payloadType === PT.ACCOUNT_AUTH_RES) {
        accountAuthed = true;
        console.log('🔐 Main ACCOUNT AUTH OK');

        cTraderMainWs.send(JSON.stringify({
          clientMsgId: `main-reconcile-${Date.now()}`,
          payloadType: PT.RECONCILE_REQ,
          payload: {
            ctidTraderAccountId: CTRADER_ACCOUNT_ID
          }
        }));
        return;
      }

      if (msg.payloadType === PT.RECONCILE_RES) {
        const positionsRaw =
          msg.payload?.position ||
          msg.payload?.positions ||
          [];

        livePositionsCache = Array.isArray(positionsRaw)
          ? positionsRaw
          : [positionsRaw];

        lastPositionsUpdateAt = now();

        console.log('📡 CACHE POSITIONS UPDATED:', livePositionsCache.length);
        return;
      }

      if (msg.payloadType === PT.EXECUTION_EVENT) {
        console.log('📩 EXECUTION EVENT RECEIVED');

        cTraderMainWs.send(JSON.stringify({
          clientMsgId: `main-reconcile-after-event-${Date.now()}`,
          payloadType: PT.RECONCILE_REQ,
          payload: {
            ctidTraderAccountId: CTRADER_ACCOUNT_ID
          }
        }));
        return;
      }

      if (msg.payload?.errorCode) {
        console.log('❌ Main WS Error:', msg.payload);
      }

    } catch (err) {
      console.log('❌ Main WS parse error:', err.message);
    }
  });

  cTraderMainWs.on('close', () => {
    console.log('🔌 Main WebSocket closed. Reconnecting...');
    cTraderAuthed = false;
    accountAuthed = false;
    setTimeout(connectToCTrader, 5000);
  });

  cTraderMainWs.on('error', (error) => {
    console.log('❌ Main WebSocket error:', error.message);
  });
}





/* =========================
   START
========================= */



app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`MODE: ${MODE}`);
});
