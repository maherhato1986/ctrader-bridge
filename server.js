


require('dotenv').config();


const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');



function now() {
  return new Date().toISOString();
}

const cookieParser = require('cookie-parser');
const { Resend } = require('resend');


const app = express();

const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

let dashboardClients = [];

wss.on('connection', (ws) => {
  console.log('🟢 Dashboard connected');

  dashboardClients.push(ws);

  ws.on('close', () => {
    console.log('🔴 Dashboard disconnected');
    dashboardClients = dashboardClients.filter(c => c !== ws);
  });
});

app.get('/test', (req, res) => {
  console.log('🔥 TEST ROUTE HIT');
  res.send('SERVER WORKING');
});


const resend = new Resend(process.env.RESEND_API_KEY);


app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 👈 هذا المهم
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});






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


const CTRADER_CLIENT_ID = process.env.CTRADER_CLIENT_ID || '';
const CTRADER_CLIENT_SECRET = process.env.CTRADER_CLIENT_SECRET || '';
const CTRADER_ACCESS_TOKEN = process.env.CTRADER_ACCESS_TOKEN || '';
const CTRADER_ACCOUNT_ID = Number(process.env.CTRADER_ACCOUNT_ID || 0);
const CTRADER_HOST = process.env.CTRADER_HOST || 'live.ctraderapi.com';
const CTRADER_PORT = Number(process.env.CTRADER_PORT || 5036);
const CTRADER_WS_URL = `wss://${CTRADER_HOST}:${CTRADER_PORT}`;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

let nodemailer = null;

try {
  nodemailer = require('nodemailer');
  console.log('📧 nodemailer loaded');
} catch (err) {
  console.warn('⚠️ nodemailer not installed, email disabled');
}

let loginCodes = {};



const TRADE_MANAGER = {
  enabled: true,
  requireSLTP: true,
  minTakeProfitUsd: 10,
  minStopLossUsd: 5,
  breakEvenTriggerUsd: 8,
  breakEvenBufferUsd: 1,
  allowSecondTradeOnlyIfBE: true
};



const PT = {
  APP_AUTH_REQ: 2100,
  APP_AUTH_RES: 2101,

  GET_ACCOUNTS_REQ: 2149,
  GET_ACCOUNTS_RES: 2150,
  SUBSCRIBE_SPOTS_REQ: 2127,
SPOT_EVENT: 2131,
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

let livePrices = {};
let priceWs = null;


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
let lastAutonomousSignalTime = 0;
let xauPriceHistory = [];
let lastAutoReEntryTime = 0;

function isMarketClosedError(msg) {
  const text = JSON.stringify(msg || {}).toLowerCase();
  return text.includes('market is closed') || text.includes('only pending orders');
}

function extractPositionInfo(p) {
  return {
    positionId: Number(p.positionId || 0),

    symbolId: Number(
      p.symbolId ||
      p.tradeData?.symbolId ||
      p.position?.symbolId ||
      0
    ),

    volume: Number(
      p.volume ||
      p.tradeData?.volume ||
      p.position?.volume ||
      0
    ),

    side:
      p.tradeSide ||
      p.tradeData?.tradeSide ||
      p.position?.tradeSide ||
      0,

    entryPrice: Number(
      p.entryPrice ||
      p.tradeData?.entryPrice ||
      p.tradeData?.openPrice ||
      p.position?.entryPrice ||
      0
    ),

    currentPrice: Number(
      p.price ||
      p.tradeData?.price ||
      p.position?.price ||
      0
    ),

    swap: Number(p.swap || 0),
    commission: Number(p.commission || 0),

    moneyDigits: Number(
      p.moneyDigits ||
      p.position?.moneyDigits ||
      2
    )
  };
}


function startLivePriceStream() {
  if (priceWs) {
    try { priceWs.close(); } catch {}
  }

  priceWs = new WebSocket(CTRADER_WS_URL);

  priceWs.on('open', () => {
    console.log('📡 Live Price Engine Started');

    priceWs.send(JSON.stringify({
      clientMsgId: `app-auth-${Date.now()}`,
      payloadType: PT.APP_AUTH_REQ,
      payload: {
        clientId: CTRADER_CLIENT_ID,
        clientSecret: CTRADER_CLIENT_SECRET
      }
    }));
  });

  priceWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    // AUTH
    if (msg.payloadType === PT.APP_AUTH_RES) {
      priceWs.send(JSON.stringify({
        clientMsgId: `account-auth-${Date.now()}`,
        payloadType: PT.ACCOUNT_AUTH_REQ,
        payload: {
          ctidTraderAccountId: CTRADER_ACCOUNT_ID,
          accessToken: CTRADER_ACCESS_TOKEN
        }
      }));
      return;
    }

    // SUBSCRIBE
    if (msg.payloadType === PT.ACCOUNT_AUTH_RES) {
      priceWs.send(JSON.stringify({
        clientMsgId: `sub-${Date.now()}`,
        payloadType: PT.SUBSCRIBE_SPOTS_REQ,
        payload: {
          ctidTraderAccountId: CTRADER_ACCOUNT_ID,
          symbolId: [41] // XAUUSD
        }
      }));
      return;
    }

    // LIVE PRICE
    const payload = msg.payload || {};
    const bidRaw = payload.bid ?? payload.spotEvent?.bid;
    const askRaw = payload.ask ?? payload.spotEvent?.ask;

    if (bidRaw && askRaw) {
      const digits = Number(process.env.CTRADER_PRICE_DIGITS || 2);

      const bid = Number(bidRaw) / Math.pow(10, digits);
      const ask = Number(askRaw) / Math.pow(10, digits);

      const price = (bid + ask) / 2;

      livePrices[41] = price;
      xauPriceHistory.push({ price, time: Date.now() });

if (xauPriceHistory.length > 300) {
  xauPriceHistory = xauPriceHistory.slice(-300);
}

      // DEBUG
      // console.log('🔥 LIVE PRICE:', price);
    }
  });

  priceWs.on('close', () => {
    console.log('⚠️ Price WS closed... reconnecting');
    setTimeout(startLivePriceStream, 3000);
  });

  priceWs.on('error', (err) => {
    console.log('❌ Price WS error:', err.message);
  });
}


function saveToFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}


const BLOCKED_SIGNALS_FILE = 'blocked_signals.json';

function readArrayFile(file) {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function canAddAggressivePosition({ openPositions, signal, lastPyramidTime }) {
  const maxPositions = Number(process.env.MAX_POSITIONS_PER_SYMBOL || 3);
  const triggerProfit = Number(process.env.PYRAMID_PROFIT_TRIGGER_USD || 10);
  const cooldown = Number(process.env.PYRAMID_COOLDOWN_MS || 60000);

  const sameSymbol = openPositions.filter(p =>
    Number(p.tradeData?.symbolId || p.symbolId) === 41
  );

  if (sameSymbol.length >= maxPositions) {
    return { allow: false, reason: 'Max pyramid positions reached' };
  }

  const now = Date.now();
  if (lastPyramidTime && now - lastPyramidTime < cooldown) {
    return { allow: false, reason: 'Pyramid cooldown active' };
  }

  const winning = sameSymbol.some(p => Number(p.netProfit || p.profit || 0) >= triggerProfit);

  if (!winning) {
    return { allow: false, reason: 'No winning protected position yet' };
  }

  return { allow: true };
}

function removePendingSignal(signalId) {
  pendingSignals.delete(signalId);

  const pendingFromFile = readArrayFile('pending_signals.json')
    .filter(s => String(s.signalId) !== String(signalId));

  const merged = new Map();

  pendingFromFile.forEach(s => merged.set(String(s.signalId), s));
  Array.from(pendingSignals.values()).forEach(s => {
    if (String(s.signalId) !== String(signalId)) {
      merged.set(String(s.signalId), s);
    }
  });

  saveToFile('pending_signals.json', Array.from(merged.values()));
}

function markSignalBlocked(signal, reason, aiDecision = null) {
  const blockedSignal = {
    ...signal,
    status: 'blocked',
    blockReason: reason,
    aiDecision,
    blockedAt: now()
  };

  removePendingSignal(signal.signalId);

  const blockedSignals = readArrayFile(BLOCKED_SIGNALS_FILE);
  blockedSignals.push(blockedSignal);
  saveToFile(BLOCKED_SIGNALS_FILE, blockedSignals);

  return blockedSignal;
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

  try {

const text = `
🚀 إشارة تداول جديدة

🆔 Signal ID: ${signal.signalId || "-"}
📊 Symbol: ${signal.symbol || "-"}
📈 Action: ${signal.action || "-"}
💰 Original Volume: ${signal.volume || "-"}
🛑 Stop Loss: ${signal.stopLossUsd || "-"} USD
🎯 Take Profit: ${signal.takeProfitUsd || "-"} USD

🧠 Smart Analysis:
📊 Confidence: ${signal.confidence ?? "-"}%
📉 Trend: ${signal.trend || "-"}
⚠️ Risk Level: ${signal.riskLevel || "-"}
📦 Suggested Volume Factor: ${signal.suggestedVolumeMultiplier || "-"}

📝 Reason:
${signal.aiNote || "-"}

📌 Status: ${signal.status || "pending"}
⏰ ${new Date().toLocaleString()}
`;

    await telegramApi('sendMessage', {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      reply_markup: buildTelegramSignalButtons(signal.signalId)
    });

    console.log(`📨 Signal sent to Telegram: ${signal.signalId}`);

  } catch (err) {
    console.log('❌ Telegram sendSignal error:', err.response?.data || err.message);
  }
}


async function sendTradeAlertToTelegram(title, data = {}) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('⚠️ Trade alert skipped: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return;
  }

  try {
    const text = `${title}

📊 Symbol: ${data.symbol || '-'}
📈 Action: ${data.action || '-'}
💰 Volume: ${data.volume || '-'}
🆔 Position ID: ${data.positionId || '-'}
💵 Price: ${data.price || '-'}
📌 Status: ${data.status || '-'}
⏱ Time: ${new Date().toLocaleString()}`;

    await telegramApi('sendMessage', {
      chat_id: TELEGRAM_CHAT_ID,
      text
    });

    console.log(`📨 Trade alert sent: ${title}`);

  } catch (err) {
    console.log('❌ Telegram trade alert failed:', err.response?.data || err.message);
  }
}

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

  atr: body.atr !== undefined ? Number(body.atr) : null,

  emaFast: body.emaFast !== undefined ? Number(body.emaFast) : null,
  emaSlow: body.emaSlow !== undefined ? Number(body.emaSlow) : null,
  rsi: body.rsi !== undefined ? Number(body.rsi) : null,

  status: 'pending',
  createdAt: now()
};
}
function detectTrend({ emaFast, emaSlow, price }) {
  if (!emaFast || !emaSlow || !price) return "UNKNOWN";

  if (price > emaFast && emaFast > emaSlow) return "STRONG_UP";
  if (price < emaFast && emaFast < emaSlow) return "STRONG_DOWN";

  if (price > emaFast) return "WEAK_UP";
  if (price < emaFast) return "WEAK_DOWN";

  return "SIDEWAYS";
}
function calculateConfidence({ trend, rsi }) {
  let score = 50;

  if (trend === "STRONG_UP" || trend === "STRONG_DOWN") score += 30;
  if (trend === "WEAK_UP" || trend === "WEAK_DOWN") score += 10;
  if (trend === "SIDEWAYS") score -= 20;

  if (rsi > 55 && rsi < 70) score += 10;
  if (rsi > 70) score -= 10;

  return Math.max(10, Math.min(100, score));
}

function getProfitMultiplier(confidence) {
  if (confidence >= 90) return 2.0;   // 🔥 قوي جداً
  if (confidence >= 80) return 1.6;   // 🔥 قوي
  if (confidence >= 70) return 1.3;   // متوسط قوي
  if (confidence >= 60) return 1.0;   // طبيعي
  if (confidence >= 50) return 0.7;   // حذر
  return 0.4;                         // ضعيف
}

function calculateAutoVolume({ equity, riskPercent, stopLossUsd, confidence = 50 }) {
  const minVolume = Number(process.env.MIN_VOLUME_UNITS || 1000);
  const maxVolume = Number(process.env.MAX_VOLUME_UNITS || 50000);

  const accountEquity = Number(equity || 0);
  const riskPct = Number(riskPercent || process.env.RISK_PER_TRADE_PERCENT || 0.5);
  let slUsd = Number(stopLossUsd || 10);

  if (slUsd < 5) slUsd = 5;
  if (!accountEquity || !riskPct || !slUsd) return minVolume;

  const riskAmountUsd = accountEquity * (riskPct / 100);

  // XAUUSD: 1 lot تقريبًا = 100 oz
  // حجم cTrader عندك: 1000 units = 0.10 lot تقريبًا حسب النظام الحالي عندك
  const contractSize = Number(process.env.XAUUSD_CONTRACT_SIZE || 100);
  const volumePerLot = Number(process.env.CTRADER_VOLUME_PER_LOT || 10000);

  const lots = riskAmountUsd / (slUsd * contractSize);
  let volumeUnits = lots * volumePerLot;

  const aiMultiplier = getProfitMultiplier(Number(confidence || 50));
  volumeUnits = volumeUnits * aiMultiplier;

  volumeUnits = normalizeVolumeUnits(volumeUnits);

  if (volumeUnits < minVolume) volumeUnits = minVolume;
  if (volumeUnits > maxVolume) volumeUnits = maxVolume;

  return volumeUnits;
}


function validateTradeRisk(signal) {
  const stopLossUsd = Number(signal.stopLossUsd || 0);
  const takeProfitUsd = Number(signal.takeProfitUsd || 0);

  if (TRADE_MANAGER.requireSLTP) {
    if (stopLossUsd < TRADE_MANAGER.minStopLossUsd) {
      return {
        ok: false,
        reason: `Stop Loss too small. Minimum is ${TRADE_MANAGER.minStopLossUsd} USD`
      };
    }

    if (takeProfitUsd < TRADE_MANAGER.minTakeProfitUsd) {
      return {
        ok: false,
        reason: `Take Profit too small. Minimum is ${TRADE_MANAGER.minTakeProfitUsd} USD`
      };
    }
  }

  return { ok: true };
}

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

function getPositionSide(p) {
  const raw =
    p.tradeSide ??
    p.tradeData?.tradeSide ??
    p.position?.tradeSide ??
    '';

  if (Number(raw) === 1) return 'BUY';
  if (Number(raw) === 2) return 'SELL';

  return String(raw).toUpperCase();
}

function getPositionId(p) {
  return Number(p.positionId || p.tradeData?.positionId || p.position?.positionId || 0);
}

function getPositionEntry(p) {
  const price =
    p.entryPrice ??
    p.price ??
    p.tradeData?.entryPrice ??
    p.position?.entryPrice;

  return Number(price || 0);
}

function getPositionVolume(p) {
  return Number(p.volume || p.tradeData?.volume || p.position?.volume || 0);
}

function getPositionStopLoss(p) {
  return Number(p.stopLoss || p.tradeData?.stopLoss || p.position?.stopLoss || 0);
}

async function getManagedCurrentPrice(symbolId, p) {
  let price = Number(
    livePrices[symbolId] ||
    livePrices[41] ||
    p.currentPrice ||
    p.price ||
    p.tradeData?.currentPrice ||
    p.tradeData?.price ||
    p.position?.price ||
    0
  );

  if (price > 100000) {
    price = price / 1000;
  }

  return price;
}

async function applyBreakEvenLogic(symbolId, targetPositions = [], trades = []) {
  try {
    if (!Array.isArray(targetPositions) || targetPositions.length === 0) return;

    for (const p of targetPositions) {
      const positionId = getPositionId(p);
      let trade = trades.find(t => Number(t.positionId) === positionId && !t.exitReason);

if (!trade) {
  trade = {
    positionId,
    symbolId,
    breakEvenDone: false,
    source: 'broker_sync'
  };
  trades.push(trade);
}

      if (!positionId || trade.breakEvenDone) continue;

      const entryPrice = getPositionEntry(p);
      const currentPrice = await getManagedCurrentPrice(symbolId, p);
      const side = getPositionSide(p);
      const isBuy = side.includes('BUY');

      console.log('PRICE CHECK:', {
        symbolId,
        positionId,
        side,
        entryPrice,
        currentPrice,
        breakEvenDone: trade.breakEvenDone || false
      });

      if (!entryPrice || !currentPrice || !side) {
        console.log('BREAK EVEN SKIPPED - missing data:', {
          symbolId,
          positionId,
          entryPrice,
          currentPrice,
          side
        });
        continue;
      }

      const triggerUsd = Number(process.env.BREAK_EVEN_TRIGGER_USD || 5);
      const bufferUsd = Number(process.env.BREAK_EVEN_BUFFER_USD || 0.5);

      const profitDistance = isBuy
        ? currentPrice - entryPrice
        : entryPrice - currentPrice;
     

    console.log('BREAK EVEN DISTANCE:', JSON.stringify({
  symbolId,
  positionId,
  entryPrice,
  currentPrice,
  side,
  profitDistance,
  triggerUsd
}, null, 2));

      if (profitDistance < triggerUsd) continue;

      const newSL = isBuy
        ? entryPrice + bufferUsd
        : entryPrice - bufferUsd;

      console.log('BREAK EVEN TRIGGERED:', {
        symbolId,
        positionId,
        side,
        entryPrice,
        currentPrice,
        profitDistance,
        newSL
      });

      await modifyStopLoss(positionId, newSL);

      trade.breakEvenDone = true;
      trade.breakEvenAt = now();
      trade.breakEvenSL = newSL;
    }
  } catch (err) {
    console.log('Break-even error:', err.message);
  }
}

function getPositionVolumeUnits(p) {
  return Number(p.volume || p.tradeData?.volume || p.position?.volume || 0);
}

function getMoneyValue(raw, moneyDigits = 2) {
  let v = Number(raw || 0);
  if (Math.abs(v) > 10000) v = v / Math.pow(10, moneyDigits);
  return v;
}

function getDollarPerPriceMove(p) {
  const volumeUnits = getPositionVolumeUnits(p);
  const lots = volumeUnits / 10000;
  const contractSize = Number(process.env.XAUUSD_CONTRACT_SIZE || 100);
  return lots * contractSize;
}

function estimatePositionProfitUsd(p, entryPrice, currentPrice, isBuy) {
  const volumeUnits = Number(
    p.volume ||
    p.tradeData?.volume ||
    p.position?.volume ||
    0
  );

  const lots = volumeUnits / 10000;
  const contractSize = Number(process.env.XAUUSD_CONTRACT_SIZE || 100);

  const priceMove = isBuy
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;

  return Number((priceMove * lots * contractSize).toFixed(2));
}

function getAdaptiveTrailingSettings(netProfitUsd) {
if (netProfitUsd >= 300) {
  return { startUsd: 100, lockUsd: 150, distanceUsd: 80, mode: 'STRONG RUN' };
}

if (netProfitUsd >= 150) {
  return { startUsd: 50, lockUsd: 80, distanceUsd: 60, mode: 'TREND HOLD' };
}

if (netProfitUsd >= 80) {
  return { startUsd: 30, lockUsd: 40, distanceUsd: 40, mode: 'SAFE RUN' };
}

  return {
    startUsd: Number(process.env.TRAILING_START_USD || 50),
    lockUsd: Number(process.env.TRAILING_LOCK_USD || 10),
    distanceUsd: Number(process.env.TRAILING_DISTANCE_USD || 30),
    mode: 'SAFE_START'
  };
}

function usdToPriceDistance(usd, p) {
  const dollarPerMove = getDollarPerPriceMove(p);
  if (!dollarPerMove) return 0;
  return usd / dollarPerMove;
}


function getSmartTrailing(netProfitUsd) {

  // 🔥 ربح عالي (نقفل أرباح)
  if (netProfitUsd >= 100) {
    return {
      start: 5,
      lock: 40,
      distance: 20,
      mode: 'PROFIT_LOCK'
    };
  }

  // 🟢 ترند قوي
  if (netProfitUsd >= 50) {
    return {
      start: 5,
      lock: 20,
      distance: 15,
      mode: 'STRONG_TREND'
    };
  }

  // 🔵 ترند عادي
  if (netProfitUsd >= 20) {
    return {
      start: 5,
      lock: 10,
      distance: 10,
      mode: 'NORMAL'
    };
  }

  // 🟡 بداية الحركة
  return {
    start: Number(process.env.TRAILING_START_USD || 5),
    lock: Number(process.env.TRAILING_LOCK_USD || 2),
    distance: Number(process.env.TRAILING_DISTANCE_USD || 1.5),
    mode: 'EARLY_STAGE'
  };
}

async function applyTrailingStop(symbolId, targetPositions = [], trades = []) {
  try {
    console.log("🔥 TRAILING FUNCTION RUNNING");

    if (!Array.isArray(targetPositions) || targetPositions.length === 0) return;

    const trailingMode = String(process.env.TRAILING_MODE || 'STATIC').toUpperCase();
    const atrTrailingEnabled = String(process.env.ATR_TRAILING_ENABLED || 'false') === 'true';
    const atrMultiplier = Number(process.env.ATR_MULTIPLIER || 1.5);
    const minMove = Number(process.env.TRAILING_MIN_MOVE_USD || 0.3);

    for (const p of targetPositions) {

      const positionId = getPositionId(p);

      console.log("TRAILING CHECK");
      console.log("Position:", positionId);

      if (!positionId) continue;

      const entryPrice = getPositionEntry(p);
      const currentPrice = await getManagedCurrentPrice(symbolId, p);
      const currentSL = getPositionStopLoss(p);
      const side = getPositionSide(p);
      const isBuy = side.includes('BUY');

      console.log("Entry:", entryPrice);
      console.log("Current:", currentPrice);
      console.log("SL:", currentSL);
      console.log("Side:", side);

      if (!entryPrice || !currentPrice || !side) {
        console.log('❌ TRAILING SKIPPED - missing data');
        continue;
      }

      let trade = trades.find(t => Number(t.positionId) === Number(positionId) && !t.exitReason);

      if (!trade) {
        trade = {
          positionId,
          symbolId,
          source: 'broker_sync_trailing',
          createdAt: now()
        };
        trades.push(trade);
      }

      const netProfitUsd = estimatePositionProfitUsd(p, entryPrice, currentPrice, isBuy);
      const smart = getSmartTrailing(netProfitUsd);

      const trailingStartUsd = Number(smart.start);
      const trailingLockUsd = Number(smart.lock);
      let trailingDistanceUsd = Number(smart.distance);
      let activeMode = smart.mode || 'SMART';

      const atr = Number(trade.atr || p.atr || 0);

      if (atrTrailingEnabled && trailingMode === 'ATR' && atr > 0) {
        trailingDistanceUsd = atr * atrMultiplier;
        activeMode = 'ATR';
      }

      const lockPriceDistance = usdToPriceDistance(trailingLockUsd, p);
      const trailPriceDistance = usdToPriceDistance(trailingDistanceUsd, p);

      console.log('SMART TRAILING:', {
        positionId,
        netProfitUsd,
        trailingStartUsd,
        trailingDistanceUsd
      });

      // 🔥 شرط التفعيل
      if (netProfitUsd < trailingStartUsd) {
        console.log("❌ Trailing NOT triggered yet");
        continue;
      }

      let newSL;

      if (isBuy) {
        const lockSL = entryPrice + lockPriceDistance;
        const trailSL = currentPrice - trailPriceDistance;
        newSL = Math.max(lockSL, trailSL);

        // 🔥 تخفيف الفلترة
        if (currentSL && newSL <= currentSL) {
          console.log("❌ BUY SL not improved");
          continue;
        }

      } else {
        const lockSL = entryPrice - lockPriceDistance;
        const trailSL = currentPrice + trailPriceDistance;
        newSL = Math.min(lockSL, trailSL);

        // 🔥 تخفيف الفلترة
       if (currentSL && newSL === currentSL) {
  console.log("❌ Same SL, no update");
  continue;
}
      }

      newSL = Number(newSL.toFixed(2));

      // 🔥 أهم Log
      console.log("TRAILING APPLIED:", positionId);

      console.log('TRAILING UPDATE:', {
        positionId,
        oldSL: currentSL,
        newSL,
        profit: netProfitUsd
      });

      await modifyStopLoss(positionId, newSL);

      trade.trailingUpdatedAt = now();
      trade.lastTrailingSL = newSL;
      trade.trailingMode = activeMode;
      trade.trailingNetProfitUsd = netProfitUsd;
      trade.trailingDistanceUsd = trailingDistanceUsd;
    }

  } catch (err) {
    console.log('❌ Trailing error:', err.message);
  }
}


async function applyPartialClose(symbolId, targetPositions = [], trades = []) {
  try {
    if (!Array.isArray(targetPositions) || targetPositions.length === 0) return;

    const triggerUsd = Number(process.env.PARTIAL_CLOSE_TRIGGER_USD || 300);
    const closePercent = Number(process.env.PARTIAL_CLOSE_PERCENT || 50);

    for (const p of targetPositions) {

      const positionId = getPositionId(p);
      if (!positionId) continue;

      let trade = trades.find(t => Number(t.positionId) === Number(positionId) && !t.exitReason);

      if (!trade) {
        trade = {
          positionId,
          symbolId,
          source: 'partial_close',
          createdAt: now()
        };
        trades.push(trade);
      }

      if (trade.partialCloseDone) continue;

      const entryPrice = getPositionEntry(p);
      const currentPrice = await getManagedCurrentPrice(symbolId, p);
      const side = getPositionSide(p);
      const isBuy = side.includes('BUY');

      const volume = getPositionVolume(p);

      if (!entryPrice || !currentPrice || !side || !volume) continue;

      const netProfitUsd = estimatePositionProfitUsd(p, entryPrice, currentPrice, isBuy);

      console.log('PARTIAL CLOSE CHECK:', {
        positionId,
        netProfitUsd,
        triggerUsd
      });

      if (netProfitUsd < triggerUsd) continue;

      const closeVolume = Math.floor(volume * (closePercent / 100));

      if (!closeVolume || closeVolume >= volume) {
        console.log('❌ INVALID CLOSE VOLUME');
        continue;
      }

      console.log('🔥 PARTIAL CLOSE EXECUTED:', {
        positionId,
        closeVolume
      });

      await closePosition(positionId, closeVolume);

      trade.partialCloseDone = true;
      trade.partialCloseAt = now();
    }

  } catch (err) {
    console.log('❌ Partial close error:', err.message);
  }
}

async function applyMaxLossPerTrade(symbolId, targetPositions = []) {
  try {
    if (!Array.isArray(targetPositions) || targetPositions.length === 0) return;

    const maxLossUsd = Number(process.env.MAX_LOSS_PER_TRADE_USD || 100);

    for (const p of targetPositions) {
      const positionId = getPositionId(p);
      if (!positionId) continue;

      const entryPrice = getPositionEntry(p);
      const currentPrice = await getManagedCurrentPrice(symbolId, p);
      const side = getPositionSide(p);
      const isBuy = side.includes('BUY');
      const volume = getPositionVolume(p);

      if (!entryPrice || !currentPrice || !side || !volume) continue;

      const netProfitUsd = estimatePositionProfitUsd(p, entryPrice, currentPrice, isBuy);

      if (netProfitUsd <= -Math.abs(maxLossUsd)) {
        console.log('🛑 MAX LOSS HIT - CLOSING POSITION:', {
          positionId,
          netProfitUsd,
          maxLossUsd
        });

        await closePosition(positionId, volume);
      }
    }
  } catch (err) {
    console.log('❌ Max loss error:', err.message);
  }
}


async function smartExitAI(symbolId, targetPositions = [], trades = []) {
  try {
    if (!Array.isArray(targetPositions) || targetPositions.length === 0) return;

    for (const p of targetPositions) {
      const positionId = getPositionId(p);
      const trade = trades.find(t => Number(t.positionId) === positionId && !t.exitReason);

      if (!positionId || !trade) continue;

      const entryPrice = getPositionEntry(p);
      const currentPrice = await getManagedCurrentPrice(symbolId, p);
      const volume = getPositionVolume(p);
      const side = getPositionSide(p);
      const isBuy = side.includes('BUY');

      if (!entryPrice || !currentPrice || !volume || !side) continue;

      const smartExitPullbackUsd = Number(process.env.SMART_EXIT_PULLBACK_USD || 4);

      if (!trade.peakPrice) trade.peakPrice = entryPrice;

      if (isBuy && currentPrice > Number(trade.peakPrice)) {
        trade.peakPrice = currentPrice;
      }

      if (!isBuy && currentPrice < Number(trade.peakPrice)) {
        trade.peakPrice = currentPrice;
      }

      const pullback = isBuy
        ? Number(trade.peakPrice) - currentPrice
        : currentPrice - Number(trade.peakPrice);

      if (pullback < smartExitPullbackUsd) continue;

      console.log('SMART EXIT TRIGGERED:', {
        symbolId,
        positionId,
        side,
        entryPrice,
        currentPrice,
        peakPrice: trade.peakPrice,
        pullback
      });

      await closePosition(positionId, volume);

      trade.exitReason = 'smart_exit';
      trade.exitPrice = currentPrice;
      trade.exitTime = now();
    }
  } catch (err) {
    console.log('Smart exit error:', err.message);
  }
}



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


function getPositionNetProfit(p) {
  const raw =
    p.netProfit ??
    p.unrealizedNetProfit ??
    p.moneyProfit ??
    p.profit ??
    p.position?.netProfit ??
    p.tradeData?.netProfit ??
    0;

  const moneyDigits = Number(
    p.moneyDigits ||
    p.position?.moneyDigits ||
    p.tradeData?.moneyDigits ||
    2
  );

  let value = Number(raw || 0);

  // cTrader أحيانًا يرجع المال بصيغة integer حسب moneyDigits
  if (Math.abs(value) > 10000) {
    value = value / Math.pow(10, moneyDigits);
  }

  return value;
}

function normalizeVolumeUnits(units) {
  let v = Math.round(Number(units) || 0);

  if (!Number.isFinite(v) || v <= 0) v = 1000;

  v = Math.round(v / 1000) * 1000;

  if (v < 1000) v = 1000;
  if (v > 50000) v = 50000;

  return v;
}

async function aiTradeDecision(signal) {
  try {
    const prompt = `
You are a professional gold trader.

Analyze this signal and return JSON only:

{
  "decision": "BUY or SELL or REJECT",
  "confidence": number (0-100),
  "reason": "short explanation"
}

Signal:
Symbol: ${signal.symbol}
Action: ${signal.action}
Risk: ${signal.riskPercent}
SL: ${signal.stopLossUsd}
TP: ${signal.takeProfitUsd}
`;

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    const text = response.data.choices[0].message.content;

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('AI response not valid JSON');
    }

    const parsed = JSON.parse(text.substring(jsonStart, jsonEnd + 1));

    return parsed;

  } catch (err) {
    console.log('⚠️ AI decision error:', err.message);
    return { decision: 'REJECT', confidence: 0, reason: 'AI error' };
  }
}

function detectTrendFromPrice(currentPrice, entryPrice) {
  if (!currentPrice || !entryPrice) return 'UNKNOWN';

  if (currentPrice < entryPrice) return 'DOWN';
  if (currentPrice > entryPrice) return 'UP';

  return 'SIDEWAYS';
}

function calculateSmartConfidence(signal, trend) {
  let confidence = 50;
  let reason = [];

  const action = String(signal.action || '').toUpperCase();

  // توافق الاتجاه
  if (trend === 'UP' && action === 'BUY') {
    confidence += 25;
    reason.push("Trend supports BUY");
  }

  if (trend === 'DOWN' && action === 'SELL') {
    confidence += 25;
    reason.push("Trend supports SELL");
  }

  // عكس الاتجاه
  if (trend === 'DOWN' && action === 'BUY') {
    confidence -= 30;
    reason.push("Against trend");
  }

  if (trend === 'UP' && action === 'SELL') {
    confidence -= 30;
    reason.push("Against trend");
  }

  // ATR (إذا موجود)
  if (signal.atr && signal.atr > 10) {
    confidence += 10;
    reason.push("Strong volatility");
  }

  return {
    confidence: Math.max(0, Math.min(100, confidence)),
    reason: reason.join(" | ")
  };
}

function smartDecision(signal, trend = 'UNKNOWN') {
  const action = String(signal.action || '').toUpperCase();

  const ai = calculateSmartConfidence(signal, trend);

  console.log("🧠 AI CONFIDENCE:", ai);

  if (ai.confidence < 55) {
    return {
      allowed: false,
      reason: `Low confidence (${ai.confidence})`
    };
  }

  return {
    allowed: true,
    reason: `Approved (${ai.confidence}) - ${ai.reason}`,
    confidence: ai.confidence
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

function shouldAddPosition(existingPositions) {
  if (!existingPositions.length) return true;

  const profit = existingPositions.reduce((sum, p) => sum + p.netProfit, 0);

  return profit > 5; // مثلا 5$ ربح
}

function canOpenNewTrade(existingPositions) {
  if (!existingPositions.length) return true;

  const losing = existingPositions.find(p => p.netProfit < 0);

  if (losing) {
    console.log('❌ Blocked: losing position exists');
    return false;
  }

  return true;
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


async function getLiveSpotPriceFromCTrader(symbolId) {
  requireCTraderEnv();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error('Live price timeout'));
    }, 15000);

    function finish(price) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(price);
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({
        clientMsgId: `spot-app-auth-${Date.now()}`,
        payloadType: PT.APP_AUTH_REQ,
        payload: {
          clientId: CTRADER_CLIENT_ID,
          clientSecret: CTRADER_CLIENT_SECRET
        }
      }));
    });

    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());

      if (msg.payloadType === PT.APP_AUTH_RES) {
        ws.send(JSON.stringify({
          clientMsgId: `spot-account-auth-${Date.now()}`,
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
          clientMsgId: `subscribe-spot-${Date.now()}`,
          payloadType: PT.SUBSCRIBE_SPOTS_REQ,
          payload: {
            ctidTraderAccountId: CTRADER_ACCOUNT_ID,
            symbolId: [Number(symbolId)]
          }
        }));
        return;
      }

      const payload = msg.payload || {};
      const bidRaw = payload.bid ?? payload.spotEvent?.bid;
      const askRaw = payload.ask ?? payload.spotEvent?.ask;

      if (bidRaw && askRaw) {
        const digits = Number(process.env.CTRADER_PRICE_DIGITS || 2);
        const bid = Number(bidRaw) / Math.pow(10, digits);
        const ask = Number(askRaw) / Math.pow(10, digits);
        finish((bid + ask) / 2);
      }
    });

    ws.on('error', reject);
  });
}

function normalizeMoney(value, digits = 2) {
  const n = Number(value || 0);
  const d = Number(digits || 2);

  if (!Number.isFinite(n)) return 0;

  // cTrader يرجع قيم المال غالباً كـ integer حسب moneyDigits
  // مثال: -41 مع moneyDigits=2 تعني -0.41
  if (Number.isInteger(n) && d > 0) {
    return n / Math.pow(10, d);
  }

  return n;
}



function canOpenNewTrade(currentFloatingPnL) {
  const maxLoss = Number(process.env.MAX_DAILY_LOSS || 500);

  if (currentFloatingPnL <= -maxLoss) {
    return {
      allowed: false,
      reason: "Max daily loss reached"
    };
  }

  return { allowed: true };
}

function preventDuplicateTrades(positions, symbol) {
  return positions.some(p => p.symbol === symbol);
}



app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const account = await getCTraderAccountInfo();
    const positions = await getOpenPositionsFromCTrader();
    const pending = Array.from(pendingSignals.values());

    const MAX_DAILY_LOSS_USD = Number(process.env.MAX_DAILY_LOSS_USD || 500);
    const AUTO_KILL_ON_MAX_LOSS = String(process.env.AUTO_KILL_ON_MAX_LOSS || "false") === "true";

    function normalizePrice(v) {
      const n = Number(v || 0);
      if (!n) return 0;
      if (n > 100000) return n / 1000;
      return n;
    }

    let floatingPnL = 0;

    const formattedPositions = await Promise.all(positions.map(async p => {
      const info = extractPositionInfo(p);

      const moneyDigits = Number(info.moneyDigits || p.moneyDigits || 2);

      const volumeUnits = Number(
        info.volume ||
        p.tradeData?.volume ||
        p.position?.volume ||
        p.volume ||
        0
      );

      const lots = volumeUnits / 10000;

      const entryPrice = normalizePrice(
        p.price ||
        info.entryPrice ||
        p.tradeData?.entryPrice ||
        p.tradeData?.openPrice ||
        p.position?.entryPrice ||
        0
      );

      const symbolId = Number(
        info.symbolId ||
        p.tradeData?.symbolId ||
        p.position?.symbolId ||
        41
      );

      let currentPrice = 0;

      try {
        const live = await getLiveSpotPriceFromCTrader(symbolId);
        currentPrice = normalizePrice(live);
      } catch (err) {
        currentPrice = 0;
      }

      if (!currentPrice) {
        currentPrice = normalizePrice(
          livePrices[symbolId] ||
          livePrices[41] ||
          p.currentPrice ||
          p.tradeData?.currentPrice ||
          p.tradeData?.price ||
          p.position?.price ||
          p.price ||
          entryPrice ||
          0
        );
      }

      const tradeSide =
        String(info.side).toUpperCase().includes('SELL') ||
        String(p.tradeData?.tradeSide).toUpperCase().includes('SELL') ||
        Number(info.side || p.tradeData?.tradeSide) === 2
          ? 2
          : 1;

      const contractSize = 100;
      let calculatedProfit = 0;

      if (entryPrice && currentPrice && lots) {
        calculatedProfit = tradeSide === 1
          ? (currentPrice - entryPrice) * contractSize * lots
          : (entryPrice - currentPrice) * contractSize * lots;
      }

      const swap = normalizeMoney(info.swap || p.swap, moneyDigits);
      const commission = normalizeMoney(info.commission || p.commission, moneyDigits);

      // 🔥 استخدم الربح الحقيقي من cTrader إذا موجود
const brokerNet = getPositionNetProfit(p);

const netUsd = brokerNet !== 0
  ? Number(brokerNet.toFixed(2))
  : Number((calculatedProfit + swap + commission).toFixed(2));
      floatingPnL += netUsd;

      return {
        positionId: info.positionId || p.positionId,
        symbolId,
        symbol: symbolId === 41 ? 'XAUUSD' : String(symbolId || '-'),
        volume: volumeUnits,
        lots: Number(lots.toFixed(2)),
        side: tradeSide === 2 ? 'SELL' : 'BUY',
        sideText: tradeSide === 2 ? 'SELL' : 'BUY',
        price: entryPrice,
        entryPrice,
        currentPrice,
        netUsd,
        netProfit: netUsd,
        status: 'ACTIVE'
      };
    }));

    let cleanPositions = formattedPositions.filter(p => p && p.positionId);

    let riskStatus = {
      maxDailyLossUsd: MAX_DAILY_LOSS_USD,
      autoKillEnabled: AUTO_KILL_ON_MAX_LOSS,
      maxLossHit: Number(floatingPnL) <= -Math.abs(MAX_DAILY_LOSS_USD),
      actionTaken: false,
      closed: 0,
      failed: 0,
      message: 'Risk normal'
    };

    if (riskStatus.maxLossHit) {
      riskStatus.message = `Max daily loss reached: ${Number(floatingPnL).toFixed(2)}`;

      if (AUTO_KILL_ON_MAX_LOSS && cleanPositions.length) {
        const closeResults = [];

        for (const pos of cleanPositions) {
          try {
            const result = await closePosition(pos.positionId, pos.volume);
            closeResults.push({ ok: true, positionId: pos.positionId, result });
          } catch (err) {
            closeResults.push({ ok: false, positionId: pos.positionId, message: err.message });
          }
        }

        riskStatus.actionTaken = true;
        riskStatus.closed = closeResults.filter(r => r.ok).length;
        riskStatus.failed = closeResults.filter(r => !r.ok).length;
        riskStatus.message = `AUTO KILL executed. Closed: ${riskStatus.closed}, Failed: ${riskStatus.failed}`;

        const updatedPositions = await getOpenPositionsFromCTrader();
        cleanPositions = updatedPositions.map(p => {
          const info = extractPositionInfo(p);
          return {
            positionId: info.positionId || p.positionId,
            symbolId: info.symbolId || p.tradeData?.symbolId || 41,
            symbol: Number(info.symbolId || p.tradeData?.symbolId || 41) === 41 ? 'XAUUSD' : String(info.symbolId || '-'),
            volume: Number(info.volume || p.tradeData?.volume || p.volume || 0),
            lots: Number((Number(info.volume || p.tradeData?.volume || p.volume || 0) / 10000).toFixed(2)),
            side: String(info.side).toUpperCase().includes('SELL') ? 'SELL' : 'BUY',
            sideText: String(info.side).toUpperCase().includes('SELL') ? 'SELL' : 'BUY',
            status: 'ACTIVE'
          };
        }).filter(p => p && p.positionId);
      }
    }

    dashboardClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'dashboard_update',
          floatingPnL: Number(floatingPnL.toFixed(2)),
          positions: cleanPositions,
          riskStatus
        }));
      }
    });

    res.json({
      ok: true,
      mode: MODE,
      serverTime: new Date().toISOString(),
      balance: Number(account.balance || 0),
      equity: Number(account.equity || (Number(account.balance || 0) + floatingPnL)),
      freeMargin: Number(account.freeMargin || account.marginFree || 0),
      usedMargin: Number(account.usedMargin || account.margin || 0),
      positions: cleanPositions,
      pending,
      floatingPnL: Number(floatingPnL.toFixed(2)),
      riskStatus
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

function smartOpportunityFilter(signal) {
  let confidence = 50;
  const reasons = [];

  const action = String(signal.action || '').toUpperCase();
  const rsi = Number(signal.rsi || 50);
  const emaFast = Number(signal.emaFast || 0);
  const emaSlow = Number(signal.emaSlow || 0);
  const atr = Number(signal.atr || 0);

  let trend = 'SIDEWAYS';

  if (emaFast && emaSlow) {
    if (emaFast > emaSlow) trend = 'BULLISH';
    if (emaFast < emaSlow) trend = 'BEARISH';
  }

  if (action === 'BUY' && trend === 'BULLISH') {
    confidence += 25;
    reasons.push('Trend supports BUY');
  }

  if (action === 'SELL' && trend === 'BEARISH') {
    confidence += 25;
    reasons.push('Trend supports SELL');
  }

  if (action === 'BUY' && trend === 'BEARISH') {
    confidence -= 25;
    reasons.push('BUY against bearish trend');
  }

  if (action === 'SELL' && trend === 'BULLISH') {
    confidence -= 25;
    reasons.push('SELL against bullish trend');
  }

  if (rsi >= 70 && action === 'BUY') {
    confidence -= 15;
    reasons.push('RSI overbought');
  }

  if (rsi <= 30 && action === 'SELL') {
    confidence -= 15;
    reasons.push('RSI oversold');
  }

  if (atr >= 8) {
    confidence += 10;
    reasons.push('Good volatility');
  }

  confidence = Math.max(0, Math.min(100, confidence));

  let riskLevel = 'LOW';
  let suggestedVolumeMultiplier = 0.3;

  if (confidence >= 80) {
    riskLevel = 'STRONG';
    suggestedVolumeMultiplier = 1;
  } else if (confidence >= 70) {
    riskLevel = 'GOOD';
    suggestedVolumeMultiplier = 0.75;
  } else if (confidence >= 60) {
    riskLevel = 'NORMAL';
    suggestedVolumeMultiplier = 0.5;
  }

  const minConfidence = Number(process.env.MIN_TELEGRAM_CONFIDENCE || 70);

  return {
    allowed: confidence >= minConfidence,
    confidence,
    trend,
    riskLevel,
    suggestedVolumeMultiplier,
    reason: reasons.join(' | ') || 'Neutral market'
  };
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;

  const k = 2 / (period + 1);
  let emaValue = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < values.length; i++) {
    emaValue = values[i] * k + emaValue * (1 - k);
  }

  return Number(emaValue.toFixed(2));
}

function calculateRSI(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  const recent = values.slice(-period - 1);

  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  if (losses === 0) return 70;

  const rs = gains / losses;
  const rsi = 100 - (100 / (1 + rs));

  return Number(rsi.toFixed(2));
}

async function autonomousGoldEngine() {
  try {
    if (process.env.AUTONOMOUS_BOT_ENABLED !== 'true') return;

    const cooldownMs = Number(process.env.AUTONOMOUS_SIGNAL_COOLDOWN_MS || 180000);

    if (Date.now() - lastAutonomousSignalTime < cooldownMs) return;

    const openPositions = await getOpenPositionsFromCTrader();

    if (openPositions.length > 0) {
      console.log('🤖 AUTO BOT WAITING: open position exists');
      return;
    }

    const prices = xauPriceHistory.map(x => Number(x.price)).filter(Boolean);

    if (prices.length < 60) {
      console.log('🤖 AUTO BOT WAITING: not enough price history');
      return;
    }

    const currentPrice = prices[prices.length - 1];
    const emaFast = ema(prices, Number(process.env.AUTO_EMA_FAST || 20));
    const emaSlow = ema(prices, Number(process.env.AUTO_EMA_SLOW || 50));
    const rsi = calculateRSI(prices, 14);

    const trend = detectTrend({
      emaFast,
      emaSlow,
      price: currentPrice
    });

    let action = null;

    if (trend === 'STRONG_UP' || trend === 'WEAK_UP') action = 'buy';
    if (trend === 'STRONG_DOWN' || trend === 'WEAK_DOWN') action = 'sell';

    if (!action) {
      console.log('🤖 AUTO BOT SKIPPED: sideways market');
      return;
    }

    const confidence = calculateConfidence({ trend, rsi });
    const minConfidence = Number(process.env.AUTONOMOUS_MIN_CONFIDENCE || 80);

    if (confidence < minConfidence) {
      console.log('🤖 AUTO BOT SKIPPED: low confidence', confidence);
      return;
    }

    const signal = buildSignal({
      signalId: `auto-xau-${Date.now()}`,
      symbol: 'XAUUSD',
      action,
      riskPercent: Number(process.env.AUTONOMOUS_RISK_PERCENT || 0.5),
      stopLossUsd: Number(process.env.AUTONOMOUS_STOP_LOSS_USD || 10),
      takeProfitUsd: Number(process.env.AUTONOMOUS_TAKE_PROFIT_USD || 25),
      emaFast,
      emaSlow,
      rsi,
      atr: Number(process.env.AUTONOMOUS_ATR || 12)
    });

    signal.volume = null;
    signal.autoRisk = true;
    signal.trend = trend;
    signal.confidence = confidence;
    signal.riskLevel = confidence >= 85 ? 'STRONG' : 'MEDIUM';
    signal.suggestedVolumeMultiplier = getProfitMultiplier(confidence);
    signal.aiNote = `Autonomous AI signal | ${trend} | RSI ${rsi}`;
    signal.status = 'pending';
    signal.aiAnalysis = {
      confidence,
      trend,
      rsi,
      emaFast,
      emaSlow,
      source: 'autonomous_engine',
      analyzedAt: now()
    };

    pendingSignals.set(signal.signalId, signal);
    saveToFile('pending_signals.json', Array.from(pendingSignals.values()));

    await sendSignalToTelegram(signal);

    lastAutonomousSignalTime = Date.now();

    console.log('🤖 AUTO SIGNAL SENT:', signal);

  } catch (err) {
    console.log('❌ autonomousGoldEngine error:', err.message);
  }
}

app.post('/signals', async (req, res) => {
  try {
    const signal = buildSignal(req.body);

    const symbolId = 41;
    const currentPrice = await getManagedCurrentPrice(symbolId, {});

    const trendEMA = detectTrend({
      emaFast: signal.emaFast,
      emaSlow: signal.emaSlow,
      price: currentPrice
    });

    const priceTrend = detectTrendFromPrice(
      currentPrice,
      signal.entryPrice || currentPrice
    );

    const finalTrend =
      trendEMA !== "UNKNOWN" ? trendEMA : priceTrend;

    const baseConfidence = calculateConfidence({
      trend: finalTrend,
      rsi: signal.rsi
    });

    const decision = smartOpportunityFilter({
      ...signal,
      trend: finalTrend,
      confidence: baseConfidence
    });

    signal.trend = decision.trend || finalTrend;
    signal.confidence = decision.confidence || baseConfidence;
    signal.riskLevel = decision.riskLevel || 'LOW';
    signal.suggestedVolumeMultiplier = decision.suggestedVolumeMultiplier || 0.3;
    signal.aiNote = decision.reason || '';

    signal.aiAnalysis = {
      confidence: signal.confidence,
      trend: signal.trend,
      riskLevel: signal.riskLevel,
      suggestedVolumeMultiplier: signal.suggestedVolumeMultiplier,
      reason: signal.aiNote,
      analyzedAt: now()
    };

    signal.originalVolume = signal.volume || null;
    signal.volume = null;
    signal.autoRisk = true;
    signal.riskEngineNote =
      'Volume will be calculated on approval using equity + SL + riskPercent';

    signal.status =
      Number(signal.confidence || 0) < 60
        ? 'pending_low_confidence'
        : 'pending';

    pendingSignals.set(signal.signalId, signal);
    saveToFile('pending_signals.json', Array.from(pendingSignals.values()));

    await sendSignalToTelegram(signal);

    return res.json({
      ok: true,
      sentToTelegram: true,
      signal
    });

  } catch (error) {
    console.log('❌ /signals error:', error.message);
    return res.status(500).json({
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

app.post('/api/close-all', auth, async (req, res) => {
  try {
    const positions = await getOpenPositionsFromCTrader();

    let closed = 0;
    let failed = 0;

    for (const p of positions) {
      const info = extractPositionInfo(p);

      try {
        await closePosition(info.positionId, info.volume);
        closed++;
      } catch (err) {
        console.error("Close error:", err.message);
        failed++;
      }
    }

    res.json({
      ok: true,
      message: `Closed ${closed} positions`,
      closed,
      failed
    });

  } catch (err) {
    res.json({
      ok: false,
      message: err.message
    });
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

    await sendTradeAlertToTelegram('🚨 KILL SWITCH USED', {
  symbol: 'ALL',
  action: 'CLOSE_ALL',
  volume: '-',
  positionId: '-',
  status: `Closed: ${closedCount} | Failed: ${failedCount}`
});

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

    // AUTO FIX TP/SL
if (!signal.takeProfitUsd || signal.takeProfitUsd === 0) {
  signal.takeProfitUsd = signal.stopLossUsd * 2; // RR = 1:2
}

if (!signal.stopLossUsd || signal.stopLossUsd === 0) {
  signal.stopLossUsd = 10; // fallback
}

    const openPositions = await getOpenPositionsFromCTrader();

if (TRADE_MANAGER.allowSecondTradeOnlyIfBE && openPositions.length > 0) {
  console.log("❌ Trade blocked: existing open position");
  return res.json({ blocked: true, reason: "Existing position open" });
}

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

function getProfitVolumeMultiplier(confidence, signal = {}) {
  const atr = Number(signal.atr || 0);

  if (confidence >= 85) return 1.5;   // فرصة قوية جدًا
  if (confidence >= 75) return 1.2;   // فرصة قوية
  if (confidence >= 60) return 1.0;   // عادي
  if (confidence >= 45) return 0.6;   // ضعيف
  return 0.3;                         // ضعيف جدًا
}

function smartTradingEngine(signal, aiDecision = {}) {
  const action = String(signal.action || '').toLowerCase();

  let confidence = Number(aiDecision.confidence || 50);
  let trend = 'SIDEWAYS';

  const emaFast = Number(signal.emaFast || 0);
  const emaSlow = Number(signal.emaSlow || 0);
  const rsi = Number(signal.rsi || 50);

  if (emaFast && emaSlow) {
    if (emaFast > emaSlow) trend = 'BULLISH';
    if (emaFast < emaSlow) trend = 'BEARISH';
  }

  if (action === 'buy' && trend === 'BULLISH') confidence += 20;
  if (action === 'sell' && trend === 'BEARISH') confidence += 20;

  if (action === 'buy' && trend === 'BEARISH') confidence -= 20;
  if (action === 'sell' && trend === 'BULLISH') confidence -= 20;

  if (rsi > 70 && action === 'buy') confidence -= 10;
  if (rsi < 30 && action === 'sell') confidence -= 10;

  confidence = Math.max(0, Math.min(100, confidence));

  let volumeMultiplier = 1;
  let riskLevel = 'NORMAL';

  if (confidence >= 80) {
    volumeMultiplier = 1;
    riskLevel = 'STRONG';
  } else if (confidence >= 60) {
    volumeMultiplier = 0.75;
    riskLevel = 'NORMAL';
  } else if (confidence >= 40) {
    volumeMultiplier = 0.4;
    riskLevel = 'LOW';
  } else {
    volumeMultiplier = 0.25;
    riskLevel = 'MICRO';
  }

  signal.stopLossUsd = Math.max(5, Number(signal.stopLossUsd || 10));

  if (!signal.takeProfitUsd || Number(signal.takeProfitUsd) < 10) {
    signal.takeProfitUsd = signal.stopLossUsd * 2;
  }

  return {
    allowed: true,
    decision: 'ALLOW_WITH_SMART_RISK',
    trend,
    confidence,
    volumeMultiplier,
    riskLevel,
    reason: `Smart Engine allowed trade with adjusted risk. Confidence ${confidence}%.`
  };
}


function smartRiskBrain({ signal, aiDecision, positions = [], account = {} }) {
  const enabled = String(process.env.SMART_RISK_ENABLED || 'true') === 'true';
  if (!enabled) return { allowed: true, volumeFactor: 1, reason: 'Smart risk disabled' };

  const engine = smartTradingEngine(signal, aiDecision);

  const confidence = Number(engine.confidence || signal.confidence || 50);
  const maxOpenPositions = Number(process.env.MAX_OPEN_POSITIONS || 3);

  if (positions.length >= maxOpenPositions) {
    return {
      allowed: false,
      volumeFactor: 0,
      reason: `Max open positions reached: ${positions.length}/${maxOpenPositions}`,
      engine
    };
  }

  const floatingPnL = positions.reduce((sum, p) => {
    return sum + Number(getPositionNetProfit(p) || 0);
  }, 0);

  const maxDailyLoss = Number(process.env.MAX_DAILY_LOSS_USD || 250);
  if (floatingPnL <= -Math.abs(maxDailyLoss)) {
    return {
      allowed: false,
      volumeFactor: 0,
      reason: `Daily loss protection triggered: ${floatingPnL.toFixed(2)} USD`,
      engine
    };
  }

  const maxProfitLock = Number(process.env.MAX_DAILY_PROFIT_LOCK_USD || 500);
  if (floatingPnL >= Math.abs(maxProfitLock)) {
    return {
      allowed: false,
      volumeFactor: 0,
      reason: `Daily profit locked: ${floatingPnL.toFixed(2)} USD`,
      engine
    };
  }

  let volumeFactor = Number(engine.volumeMultiplier || 1);

  if (confidence >= 90) {
    volumeFactor = Number(process.env.EXTREME_CONFIDENCE_VOLUME_FACTOR || 2);
  } else if (confidence >= Number(process.env.MIN_CONFIDENCE_TO_FULL_RISK || 80)) {
    volumeFactor = Number(process.env.STRONG_CONFIDENCE_VOLUME_FACTOR || 1.5);
  } else if (confidence < 60) {
    volumeFactor = Number(process.env.LOW_CONFIDENCE_VOLUME_FACTOR || 0.4);
  }

  return {
    allowed: true,
    confidence,
    trend: engine.trend,
    riskLevel: engine.riskLevel,
    volumeFactor,
    reason: engine.reason,
    engine
  };
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
      return res.status(404).json({
        ok: false,
        message: 'Signal not found'
      });
    }

    if (executedSignals.has(signalId)) {
      return res.status(409).json({
        ok: false,
        message: 'Already executed'
      });
    }

    console.log('📌 SIGNAL TO EXECUTE:', signal);

 
   const aiApprovalEnabled = process.env.AI_APPROVAL_ENABLED === 'true';

const aiDecision = aiApprovalEnabled
  ? await aiTradeDecision(signal)
  : { decision: 'ALLOW', confidence: 100, reason: 'AI approval disabled' };
const positions = await getOpenPositionsFromCTrader();
const account = await getCTraderAccountInfo();

const smartRisk = smartRiskBrain({
  signal,
  aiDecision,
  positions,
  account
});

if (!smartRisk.allowed) {
  await sendTradeAlertToTelegram('🛑 TRADE BLOCKED BY SMART RISK BRAIN', {
    symbol: signal.symbol,
    action: signal.action,
    volume: signal.volume || '-',
    positionId: '-',
    price: '-',
    status: smartRisk.reason
  });

  return res.status(409).json({
    ok: false,
    message: smartRisk.reason,
    smartRisk
  });
}

signal.confidence = smartRisk.confidence || signal.confidence;
signal.trend = smartRisk.trend || signal.trend;
signal.riskLevel = smartRisk.riskLevel || signal.riskLevel;
signal.suggestedVolumeMultiplier = smartRisk.volumeFactor;
signal.aiNote = `${signal.aiNote || ''} | SmartRisk: ${smartRisk.reason}`;

const riskCheck = validateTradeRisk(signal);

if (!riskCheck.ok) {
  console.log('🚫 RISK MANAGER BLOCK:', riskCheck.reason);

  await sendTradeAlertToTelegram('🚫 TRADE BLOCKED BY RISK MANAGER', {
    symbol: signal.symbol,
    action: signal.action,
    volume: signal.volume || '-',
    positionId: '-',
    price: '-',
    status: `BLOCKED | ${riskCheck.reason}`
  });

  return res.status(403).json({
    ok: false,
    message: riskCheck.reason
  });
}

    console.log('🤖 AI DECISION:', aiDecision);

 const smartDecision = smartTradingEngine(signal, aiDecision);

console.log('🧠 SMART ENGINE DECISION:', smartDecision);

signal.aiDecision = aiDecision;
signal.smartDecision = smartDecision;

   const aiDirection = String(aiDecision.decision || '').toUpperCase();

if (
  ['BUY', 'SELL'].includes(aiDirection) &&
  aiDirection !== String(signal.action || '').toUpperCase()
) {
  console.log('⚠️ AI changed direction');
  signal.action = aiDirection.toLowerCase();
}

    logAuditEvent(req, 'Execute Trade Start', {
      symbol: signal.symbol,
      action: signal.action
    });


    const nowTime = Date.now();
    const EXECUTION_COOLDOWN = Number(process.env.EXECUTION_COOLDOWN || 15000);

    if (nowTime - lastExecutionTime < EXECUTION_COOLDOWN) {
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
    const accountEquity = Number(
      accountInfo.equity ||
      accountInfo.balance ||
      process.env.TEST_ACCOUNT_BALANCE ||
      500
    );

    const openPositions = await getOpenPositionsFromCTrader();

    let currentFloatingPnL = 0;

    for (const p of openPositions) {
      const raw =
        p.netProfit ??
        p.unrealizedNetProfit ??
        p.position?.netProfit ??
        0;

      const digits =
        p.moneyDigits ??
        p.position?.moneyDigits ??
        2;

      currentFloatingPnL += Number(raw) / Math.pow(10, digits);
    }

    const maxDailyLoss = Number(process.env.MAX_DAILY_LOSS_USD || process.env.MAX_DAILY_LOSS || 500);

    if (currentFloatingPnL <= -Math.abs(maxDailyLoss)) {
      return res.status(403).json({
        ok: false,
        message: 'Blocked: max daily loss reached',
        floatingPnL: Number(currentFloatingPnL.toFixed(2)),
        maxDailyLoss
      });
    }


    const sameSymbolPositions = openPositions.filter(p => {
      const info = extractPositionInfo(p);
      return Number(info.symbolId) === Number(finalSymbolId);
    });

   if (openPositions.length > 0) {
  if (process.env.TRADING_MODE === 'AGGRESSIVE' && process.env.ALLOW_PYRAMIDING === 'true') {
    const pyramidCheck = canAddAggressivePosition({
      openPositions,
      signal,
      lastPyramidTime
    });

    if (!pyramidCheck.allow) {
      return res.json({
        ok: false,
        ignored: true,
        reason: pyramidCheck.reason
      });
    }

    signal.isPyramid = true;
    signal.volume = Math.round(Number(signal.volume || 1000) * Number(process.env.PYRAMID_VOLUME_MULTIPLIER || 0.7));
  } else {
    return res.json({
      ok: false,
      reason: 'Blocked: position already open on this symbol'
    });
  }
}


let finalVolume = 0;

if (signal.autoRisk === true || !Number(signal.volume || 0)) {
  console.log('🧮 Risk Engine calculating volume from Equity + SL...');

  const riskPercent = Number(signal.riskPercent || process.env.RISK_PER_TRADE_PERCENT || 0.5);
  const stopLossUsd = Math.max(5, Number(signal.stopLossUsd || 10));
  const confidence = Number(signal.confidence || aiDecision?.confidence || 50);

  finalVolume = calculateAutoVolume({
    equity: accountEquity,
    riskPercent,
    stopLossUsd,
    confidence
  });

  signal.riskEngine = {
    enabled: true,
    equity: accountEquity,
    riskPercent,
    stopLossUsd,
    confidence,
    calculatedVolume: finalVolume,
    calculatedAt: now()
  };

  console.log('✅ RISK ENGINE RESULT:', signal.riskEngine);
} else {
  finalVolume = Number(signal.volume || 0);
}

    finalVolume = Number(finalVolume);

    if (signal.smartDecision?.volumeMultiplier) {
  finalVolume = Math.round(finalVolume * signal.smartDecision.volumeMultiplier);
  console.log('🧠 SMART ENGINE VOLUME ADJUSTED:', {
    multiplier: signal.smartDecision.volumeMultiplier,
    finalVolume
  });
}

    // إذا القيمة Lot مثل 0.01 أو 0.10 نحولها units
    if (finalVolume > 0 && finalVolume < 10) {
      finalVolume = finalVolume * 10000;
    }

    finalVolume = Math.round(finalVolume);

    const minUnits = Number(process.env.MIN_VOLUME_UNITS || 100);
    const maxUnits = Number(process.env.MAX_VOLUME_UNITS || 1000);

    if (finalVolume < minUnits) finalVolume = minUnits;
    if (finalVolume > maxUnits) finalVolume = maxUnits;

    signal.volume = finalVolume;

    console.log('💰 ACCOUNT INFO:', accountInfo);
    console.log('📉 FLOATING PNL:', currentFloatingPnL);
    console.log('📏 FINAL SAFE VOLUME:', finalVolume);


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

      confidence: signal.confidence || 0,
riskLevel: signal.riskLevel || 'LOW',
aiAnalysis: signal.aiAnalysis || null,
stopLossUsd: signal.stopLossUsd || 10,
takeProfitUsd: signal.takeProfitUsd || 25,
reEntryCount: Number(signal.reEntryCount || 0),

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

  const executedPosition =
  result?.position ||
  result?.order?.position ||
  result?.executionEvent?.position ||
  result?.payload?.position ||
  result;

const executedPositionId =
  executedPosition?.positionId ||
  executedPosition?.id ||
  result?.positionId ||
  tradeRecord?.positionId ||
  "-";

const executedPrice =
  executedPosition?.price ||
  executedPosition?.entryPrice ||
  executedPosition?.tradeData?.openPrice ||
  result?.price ||
  tradeRecord?.price ||
  "-";



console.log('🚀 REAL TRADE RESULT:', result);
await sendTradeAlertToTelegram('🚀 TRADE EXECUTED', {
  symbol: signal.symbol,
  action: signal.action,
  volume: finalVolume,
  positionId: executedPositionId,
  price: executedPrice || result?.payload?.position?.price || result?.payload?.executionEvent?.position?.price || '-',
  status: 'EXECUTED'
});

return res.json({
  ok: true,
  action: signal.action,
  volume: finalVolume,
  positionId: executedPositionId,
  executedPositionId,
  price: executedPrice,
  executedPrice,
  symbolId: finalSymbolId,
  resolvedSymbol,
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


app.post('/close-position', auth, async (req, res) => {
  try {
    const { positionId, volume } = req.body;

    if (!positionId) {
      return res.status(400).json({
        ok: false,
        message: 'positionId is required'
      });
    }

    const positions = await getOpenPositionsFromCTrader();

    const found = positions
      .map(extractPositionInfo)
      .find(p => Number(p.positionId) === Number(positionId));

    if (!found) {
      return res.status(404).json({
        ok: false,
        message: 'Position not found or already closed'
      });
    }

    const closeVolume = Number(volume || found.volume || 0);

    if (!closeVolume) {
      return res.status(400).json({
        ok: false,
        message: 'Volume is required'
      });
    }

    const result = await closePosition(found.positionId, closeVolume);

    const updatedPositions = await getOpenPositionsFromCTrader();

    return res.json({
      ok: true,
      message: 'Position close request sent',
      positionId: found.positionId,
      volume: closeVolume,
      result,
      openPositionsCount: updatedPositions.length
    });

  } catch (err) {
    console.error('CLOSE POSITION ERROR:', err);
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

    let blocked = [];

if (fs.existsSync('blocked_signals.json')) {
  const rawBlocked = fs.readFileSync('blocked_signals.json', 'utf8');
  const parsedBlocked = rawBlocked ? JSON.parse(rawBlocked) : [];
  blocked = Array.isArray(parsedBlocked) ? parsedBlocked : [parsedBlocked];
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
      blockedCount: blocked.length,
lastBlocked: blocked[blocked.length - 1] || null,
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

async function autoReEntryFromClosedTrade(closedTrade) {
  try {
    if (process.env.AUTO_REENTRY_ENABLED !== 'true') return;

    const cooldownMs = Number(process.env.AUTO_REENTRY_COOLDOWN_MS || 180000);
    if (Date.now() - lastAutoReEntryTime < cooldownMs) {
      console.log('⏳ AUTO RE-ENTRY SKIPPED: cooldown active');
      return;
    }

    const confidence = Number(closedTrade.confidence || closedTrade.aiAnalysis?.confidence || 0);
    const minConfidence = Number(process.env.AUTO_REENTRY_MIN_CONFIDENCE || 80);

    if (confidence < minConfidence) {
      console.log('❌ AUTO RE-ENTRY SKIPPED: low confidence', confidence);
      return;
    }

    const finalSymbolId = Number(closedTrade.symbolId || 41);

    const positions = await getOpenPositionsFromCTrader();
    const sameSymbolOpen = positions.some(p => {
      const sid = p.symbolId || p.tradeData?.symbolId || p.position?.symbolId;
      return Number(sid) === finalSymbolId;
    });

    if (sameSymbolOpen) {
      console.log('❌ AUTO RE-ENTRY SKIPPED: position already open');
      return;
    }

    const account = await getCTraderAccountInfo();

    let volume = calculateAutoVolume({
      equity: account.equity || account.balance || liveBalance,
      riskPercent: Number(process.env.AUTO_REENTRY_RISK_PERCENT || process.env.RISK_PER_TRADE_PERCENT || 0.5),
      stopLossUsd: Number(closedTrade.stopLossUsd || 10),
      confidence
    });
volume = normalizeVolumeUnits(Number(volume) * Number(signal.suggestedVolumeMultiplier || 1));
    const boost = Number(process.env.AUTO_REENTRY_VOLUME_MULTIPLIER || 1.2);
    volume = normalizeVolumeUnits(volume * boost);

    console.log('🔥 AUTO RE-ENTRY EXECUTING:', {
      signalId: closedTrade.signalId,
      symbolId: finalSymbolId,
      action: closedTrade.action,
      confidence,
      volume
    });

    const result = await executeOrder({
      symbolId: finalSymbolId,
      side: closedTrade.action,
      volume
    });

    lastAutoReEntryTime = Date.now();

    await sendTradeAlertToTelegram('🔥 AUTO RE-ENTRY EXECUTED', {
      symbol: closedTrade.symbol || 'XAUUSD',
      action: closedTrade.action,
      volume,
      positionId:
        result?.payload?.positionId ||
        result?.payload?.executionEvent?.position?.positionId ||
        result?.payload?.position?.positionId ||
        '-',
      price:
        result?.payload?.position?.price ||
        result?.payload?.executionEvent?.position?.price ||
        '-',
      status: 'AUTO RE-ENTRY'
    });

  } catch (err) {
    console.log('❌ AUTO RE-ENTRY ERROR:', err.message);
  }
}


// 1. دالة المطابقة الفرعية (ضعها خارج الـ setInterval أو فوقه)
function syncTradesWithBroker(positions, trades) {
  // استخراج الـ IDs الحقيقية الموجودة في منصة cTrader حالياً
  const brokerPositionIds = positions.map(p => 
    String(p.positionId || p.tradeData?.positionId || p.position?.positionId)
  );

  async function managePositions() {
  const positions = await getOpenPositionsFromCTrader();

  for (const p of positions) {
    const profit = Number(p.netProfit || 0);

    if (profit >= TRADE_MANAGER.breakEvenTriggerUsd) {
      console.log("🔒 Moving to Break Even:", p.positionId);

      await modifyPositionSL(p.positionId, p.entryPrice + TRADE_MANAGER.breakEvenBufferUsd);
    }
  }
}

  // تصفية ملف trades.json: نحتفظ فقط بالصفقات التي لا تزال مفتوحة في المنصة
  const initialLength = trades.length;
  const filteredTrades = trades.filter(t => brokerPositionIds.includes(String(t.positionId)));

  if (filteredTrades.length < initialLength) {
    const removedCount = initialLength - filteredTrades.length;
    console.log(`🧹 [Sync] Removed ${removedCount} trades from JSON (closed manually on cTrader).`);
  }

  return filteredTrades;
}



// 2. المحرك الرئيسي الآمن
setInterval(async () => {
  try {

    const positions = await getOpenPositionsFromCTrader();


    let trades = [];
    if (fs.existsSync('trades.json')) {
      const raw = fs.readFileSync('trades.json', 'utf8');
      trades = raw ? JSON.parse(raw) : [];
      trades = Array.isArray(trades) ? trades : [trades];
    }


if (!positions || positions.length === 0) {
  if (trades.length > 0) {
    const lastTrade = trades[trades.length - 1];

    console.log('🧹 [Sync] No open positions on cTrader. Checking Auto Re-entry...');

    await autoReEntryFromClosedTrade(lastTrade);

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


    livePositionsCache = positions;
    lastPositionsUpdateAt = now();


    if (process.env.AUTO_MANAGEMENT_ENABLED !== 'true') {
      console.log('🟡 Auto management disabled. Sync only.');
      return;
    }

    const uniqueSymbols = new Set();

    for (const p of positions) {
      const symbolId =
        p.symbolId ||
        p.tradeData?.symbolId ||
        p.position?.symbolId;

      if (symbolId) uniqueSymbols.add(Number(symbolId));
    }

for (const symbolId of uniqueSymbols) {

  const symbolPositions = positions.filter(p => {
    const pSymbolId =
      p.symbolId ||
      p.tradeData?.symbolId ||
      p.position?.symbolId;

    return Number(pSymbolId) === Number(symbolId);
  });

  // 🔹 General Log
  console.log('SYMBOL PROCESSING:', {
    symbolId,
    positionsCount: symbolPositions.length
  });


  const breakEvenEnabled = process.env.BREAK_EVEN_ENABLED === 'true';

  console.log('BREAK EVEN STATUS:', breakEvenEnabled);

if (breakEvenEnabled) {
  console.log('CALLING BREAK EVEN...', { symbolId });
  await applyBreakEvenLogic(symbolId, symbolPositions, trades);
  saveToFile('trades.json', trades);
}

const trailingEnabled = process.env.TRAILING_STOP_ENABLED === 'true';
console.log('TRAILING STATUS:', trailingEnabled);

if (trailingEnabled) {
  console.log('CALLING SMART TRADE MANAGEMENT...', { symbolId });

  await applyMaxLossPerTrade(symbolId, symbolPositions);
  await applyPartialClose(symbolId, symbolPositions, trades);
  await applyTrailingStop(symbolId, symbolPositions, trades);
  await smartExitAI(symbolId, symbolPositions, trades);

  saveToFile('trades.json', trades);
}
  

  const smartExitEnabled = process.env.SMART_EXIT_ENABLED === 'true';

  console.log('SMART EXIT STATUS:', smartExitEnabled);

  if (smartExitEnabled) {
    console.log('CALLING SMART EXIT...', { symbolId });
    await smartExitAI(symbolId, symbolPositions, trades);
  }
}

    saveToFile('trades.json', trades);

  } catch (err) {
    console.error('⚠️ [Engine Error]:', err.message);
  }
}, 20000); // يعمل كل 20 ثانية





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

startLivePriceStream();

setInterval(async () => {
  try {
    const positions = await getOpenPositionsFromCTrader();

    let floatingPnL = 0;

    const formatted = positions.map(p => {
      const info = extractPositionInfo(p);

      const currentPrice = livePrices[info.symbolId] || 0;
      const entryPrice = Number(info.entryPrice || 0);

      const lots = info.volume / 100000;
      const contractSize = 100;

      let profit = 0;

      if (entryPrice && currentPrice && lots) {
        if (String(info.side).toUpperCase().includes('SELL')) {
          profit = (entryPrice - currentPrice) * contractSize * lots;
        } else {
          profit = (currentPrice - entryPrice) * contractSize * lots;
        }
      }

      floatingPnL += profit;

      return {
        positionId: info.positionId,
        symbol: 'XAUUSD',
        profit: Number(profit.toFixed(2))
      };
    });

    const payload = {
      type: 'dashboard_update',
      positions: formatted,
      floatingPnL
    };

    dashboardClients.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(payload));
      }
    });

  } catch (err) {
    console.log('WS BROADCAST ERROR:', err.message);
  }
}, 1000);


setInterval(autonomousGoldEngine, Number(process.env.AUTONOMOUS_CHECK_INTERVAL_MS || 30000));

server.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});
setInterval(async () => {
  try {
    const positions = await getOpenPositionsFromCTrader();

    await applyTrailingStop(41, positions, []);

  } catch (err) {
    console.log("Trailing loop error:", err.message);
  }
}, 3000);




