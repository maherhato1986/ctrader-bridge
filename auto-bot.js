require("dotenv").config();

const WebSocket = require("ws");
const axios = require("axios");
const fs = require("fs");

// =========================
// ENV / CONFIG
// =========================

const MODE = String(process.env.MODE || "SIMULATION").toUpperCase();
if (MODE === "LIVE") {
  console.log("🚨 LIVE MODE ENABLED - REAL ORDERS WILL BE EXECUTED");
}

const CTRADER_CLIENT_ID = process.env.CTRADER_CLIENT_ID || "";
const CTRADER_CLIENT_SECRET = process.env.CTRADER_CLIENT_SECRET || "";
const CTRADER_ACCESS_TOKEN = process.env.CTRADER_ACCESS_TOKEN || "";
const CTRADER_ACCOUNT_ID = Number(process.env.CTRADER_ACCOUNT_ID || 0);
const CTRADER_HOST = process.env.CTRADER_HOST || "live.ctraderapi.com";
const CTRADER_PORT = Number(process.env.CTRADER_PORT || 5036);
const CTRADER_WS_URL = `wss://${CTRADER_HOST}:${CTRADER_PORT}`;

const SYMBOL = process.env.AUTO_SYMBOL || "XAUUSD";
const SYMBOL_ID = Number(process.env.AUTO_SYMBOL_ID || 41);

const SCAN_INTERVAL_MS = Number(process.env.AUTO_SCAN_INTERVAL_MS || 15000);
const MANAGEMENT_INTERVAL_MS = Number(process.env.AUTO_MANAGEMENT_INTERVAL_MS || 5000);

const MIN_CONFIDENCE = Number(process.env.AUTO_MIN_CONFIDENCE || 65);
const MIN_VOLUME = Number(process.env.MIN_VOLUME_UNITS || 1000);
const MAX_VOLUME = Number(process.env.MAX_VOLUME_UNITS || 50000);

const RISK_PERCENT = Number(process.env.RISK_PER_TRADE_PERCENT || 0.5);
const DEFAULT_EQUITY = Number(process.env.AUTO_DEFAULT_EQUITY || 1000);

const DEFAULT_SL_USD = Number(process.env.AUTO_DEFAULT_SL_USD || 8);
const DEFAULT_TP_USD = Number(process.env.AUTO_DEFAULT_TP_USD || 15);

const MAX_OPEN_POSITIONS = Number(process.env.MAX_POSITIONS_PER_SYMBOL || 1);
const MAX_DAILY_LOSS_USD = Number(process.env.MAX_DAILY_LOSS_USD || 100);

const SPREAD_FILTER_ENABLED = process.env.SPREAD_FILTER_ENABLED === "true";

const MAX_SPREAD_USD = Number(process.env.MAX_SPREAD_USD || 0.80);

const NEWS_PROTECTION_ENABLED = process.env.NEWS_PROTECTION_ENABLED === "true";

const NEWS_BLOCK_BEFORE_MINUTES = Number(process.env.NEWS_BLOCK_BEFORE_MINUTES || 30);

const NEWS_BLOCK_AFTER_MINUTES = Number(process.env.NEWS_BLOCK_AFTER_MINUTES || 15);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const LOG_FILE = process.env.AUTO_LOG_FILE || `auto_bot_${SYMBOL}_logs.json`;
const TRADES_FILE = process.env.AUTO_TRADES_FILE || `auto_bot_${SYMBOL}_trades.json`;

// =========================
// cTrader Payload Types
// =========================

const PT = {
  APP_AUTH_REQ: 2100,
  APP_AUTH_RES: 2101,

  ACCOUNT_AUTH_REQ: 2102,
  ACCOUNT_AUTH_RES: 2103,

  SUBSCRIBE_SPOTS_REQ: 2127,
  SPOT_EVENT: 2131,

  NEW_ORDER_REQ: 2106,
  EXECUTION_EVENT: 2126,
  ORDER_ERROR_EVENT: 2132,

  RECONCILE_REQ: Number(process.env.PT_RECONCILE_REQ || 2124),
  RECONCILE_RES: Number(process.env.PT_RECONCILE_RES || 2125),

  AMEND_POSITION_SLTP_REQ: Number(process.env.PT_AMEND_POSITION_SLTP_REQ || 2110),
  CLOSE_POSITION_REQ: Number(process.env.PT_CLOSE_POSITION_REQ || 2111)
};

// =========================
// STATE
// =========================

let livePrice = 0;
let bidPrice = 0;
let askPrice = 0;
let priceHistory = [];
let dailyPnL = 0;
let botRunning = true;
let lastEntryTime = 0;
let simulationPositions = [];
let processedPnL = {};

// =========================
// HELPERS
// =========================

function now() {
  return new Date().toISOString();
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function logEvent(type, data = {}) {
  const logs = readJson(LOG_FILE);
  logs.push({
    time: now(),
    type,
    ...data
  });

  writeJson(LOG_FILE, logs.slice(-1000));
  console.log(`[${type}]`, data);
}



function saveTrade(data = {}) {
  const trades = readJson(TRADES_FILE);

  const trade = {
  tradeId: data.tradeId || `T-${Date.now()}`,
  positionId: data.positionId || null,
    time: now(),
    openedAt: data.openedAt || now(),
    closedAt: data.closedAt || null,
    status: data.status || "opened",
    closeReason: data.closeReason || null,
    symbol: data.symbol || SYMBOL,
    symbolId: data.symbolId || SYMBOL_ID,
    side: data.side || null,
    volume: Number(data.volume || 0),
    entryPrice: Number(data.entryPrice || 0),
    closePrice: data.closePrice === undefined ? null : Number(data.closePrice),
    stopLoss: data.stopLoss === undefined ? null : Number(data.stopLoss),
    takeProfit: data.takeProfit === undefined ? null : Number(data.takeProfit),
    profitUsd: Number(data.profitUsd || 0),
    durationSec: Number(data.durationSec || 0),
    confidence: data.confidence || null,
    reason: data.reason || null,
    orderResult: data.orderResult || null
  };

  trades.push(trade);
  writeJson(TRADES_FILE, trades.slice(-1000));
}

function updateTradeByPositionId(positionId, patch = {}) {
  const trades = readJson(TRADES_FILE);
  const id = Number(positionId);

  const index = trades.findIndex(t =>
    Number(t.positionId) === id &&
    t.status === "opened"
  );

  if (index === -1) return false;

  trades[index] = {
    ...trades[index],
    ...patch,
    updatedAt: now()
  };

  writeJson(TRADES_FILE, trades.slice(-1000));

  return true;
}


function requireEnv() {
  const missing = [];

  if (!CTRADER_CLIENT_ID) missing.push("CTRADER_CLIENT_ID");
  if (!CTRADER_CLIENT_SECRET) missing.push("CTRADER_CLIENT_SECRET");
  if (!CTRADER_ACCESS_TOKEN) missing.push("CTRADER_ACCESS_TOKEN");
  if (!CTRADER_ACCOUNT_ID) missing.push("CTRADER_ACCOUNT_ID");

  if (MODE === "LIVE" && missing.length) {
    throw new Error(`Missing .env variables: ${missing.join(", ")}`);
  }
}

function normalizeVolumeUnits(units) {
  let v = Math.round(Number(units) || MIN_VOLUME);

  // Round to nearest 100 units
  v = Math.round(v / 100) * 100;

  if (v < MIN_VOLUME) v = MIN_VOLUME;
  if (v > MAX_VOLUME) v = MAX_VOLUME;

  return v;
}

function getPositionId(p) {
  return Number(p.positionId || p.tradeData?.positionId || p.position?.positionId || 0);
}

function getPositionVolume(p) {
  return Number(p.volume || p.tradeData?.volume || p.position?.volume || 0);
}

function getPositionEntry(p) {
  return Number(
    p.entryPrice ||
    p.price ||
    p.tradeData?.entryPrice ||
    p.tradeData?.openPrice ||
    p.position?.entryPrice ||
    0
  );
}

function getPositionSide(p) {
  const raw = p.tradeSide ?? p.tradeData?.tradeSide ?? p.position?.tradeSide ?? "";

  if (Number(raw) === 1) return "BUY";
  if (Number(raw) === 2) return "SELL";

  return String(raw).toUpperCase();
}

function getPositionStopLoss(p) {
  return Number(p.stopLoss || p.tradeData?.stopLoss || p.position?.stopLoss || 0);
}
function getPositionTakeProfit(p) {
  return Number(
    p.takeProfit ||
    p.tradeData?.takeProfit ||
    p.position?.takeProfit ||
    0
  );
}
function estimateProfitUsd(p, currentPrice) {
  const entry = getPositionEntry(p);
  const side = getPositionSide(p);
  const volume = getPositionVolume(p);

  if (!entry || !currentPrice || !volume || !side) return 0;

  const lots = volume / 10000;
  const contractSize = Number(process.env.XAUUSD_CONTRACT_SIZE || 100);

  const priceMove = side.includes("BUY")
    ? currentPrice - entry
    : entry - currentPrice;

  return Number((priceMove * lots * contractSize).toFixed(2));
}

// =========================
// INDICATORS
// =========================

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateRSI(values, period = 14) {
  if (values.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  const slice = values.slice(-(period + 1));

  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  if (losses === 0) return 100;

  const rs = gains / losses;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

function getMarketSnapshot() {
  const prices = priceHistory.map(x => x.price);

  const fast = sma(prices, 8);
  const slow = sma(prices, 21);
  const rsi = calculateRSI(prices, 14);

  let trend = "UNKNOWN";

  if (fast && slow) {
    if (livePrice > fast && fast > slow) trend = "UP";
    else if (livePrice < fast && fast < slow) trend = "DOWN";
    else trend = "SIDEWAYS";
  }

  const last10 = prices.slice(-10);
  const volatility =
    last10.length >= 2
      ? Math.max(...last10) - Math.min(...last10)
      : 0;

  return {
    symbol: SYMBOL,
    symbolId: SYMBOL_ID,
    price: livePrice,
    smaFast: fast ? Number(fast.toFixed(2)) : null,
    smaSlow: slow ? Number(slow.toFixed(2)) : null,
    rsi,
    trend,
    volatility: Number(volatility.toFixed(2)),
    candles: prices.slice(-30)
  };
}

// =========================
// LIVE PRICE STREAM
// =========================

function startLivePriceStream() {
  requireEnv();

  const ws = new WebSocket(CTRADER_WS_URL);

  ws.on("open", () => {
    logEvent("PRICE_WS_OPEN", { url: CTRADER_WS_URL });

    ws.send(JSON.stringify({
      clientMsgId: `auto-app-auth-${Date.now()}`,
      payloadType: PT.APP_AUTH_REQ,
      payload: {
        clientId: CTRADER_CLIENT_ID,
        clientSecret: CTRADER_CLIENT_SECRET
      }
    }));
  });

  ws.on("message", raw => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.payloadType === PT.APP_AUTH_RES) {
        ws.send(JSON.stringify({
          clientMsgId: `auto-account-auth-${Date.now()}`,
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
          clientMsgId: `auto-sub-${Date.now()}`,
          payloadType: PT.SUBSCRIBE_SPOTS_REQ,
          payload: {
            ctidTraderAccountId: CTRADER_ACCOUNT_ID,
            symbolId: [SYMBOL_ID]
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

bidPrice = Number(bid.toFixed(2));
askPrice = Number(ask.toFixed(2));

livePrice = Number(((bidPrice + askPrice) / 2).toFixed(2));

        priceHistory.push({
          time: Date.now(),
          price: livePrice
        });

        if (priceHistory.length > 500) {
          priceHistory = priceHistory.slice(-500);
        }
      }
    } catch (err) {
      logEvent("PRICE_WS_MESSAGE_ERROR", { error: err.message });
    }
  });

  ws.on("close", () => {
    logEvent("PRICE_WS_CLOSED", { reconnectInMs: 3000 });
    setTimeout(startLivePriceStream, 3000);
  });

  ws.on("error", err => {
    logEvent("PRICE_WS_ERROR", { error: err.message });
  });
}

// =========================
// cTrader Actions
// =========================

async function executeOrder({ side, volume }) {
  if (MODE !== "LIVE") {
    logEvent("SIMULATED_ORDER", { symbol: SYMBOL, symbolId: SYMBOL_ID, side, volume });
    return { simulated: true };
  }

  requireEnv();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error("Order timeout"));
    }, 30000);

    function finish(data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(data);
    }

    ws.on("open", () => {
      ws.send(JSON.stringify({
        clientMsgId: `order-app-auth-${Date.now()}`,
        payloadType: PT.APP_AUTH_REQ,
        payload: {
          clientId: CTRADER_CLIENT_ID,
          clientSecret: CTRADER_CLIENT_SECRET
        }
      }));
    });

    ws.on("message", raw => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.payloadType === PT.APP_AUTH_RES) {
          ws.send(JSON.stringify({
            clientMsgId: `order-account-auth-${Date.now()}`,
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
            clientMsgId: `new-order-${Date.now()}`,
            payloadType: PT.NEW_ORDER_REQ,
            payload: {
              ctidTraderAccountId: CTRADER_ACCOUNT_ID,
              symbolId: SYMBOL_ID,
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
      } catch (err) {
        reject(err);
      }
    });

    ws.on("error", reject);
  });
}

async function closePosition(positionId, volume) {
  if (MODE !== "LIVE") {
    logEvent("SIMULATED_CLOSE", { positionId, volume });
    return { simulated: true };
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error("Close position timeout"));
    }, 30000);

    function finish(data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(data);
    }

    ws.on("open", () => {
      ws.send(JSON.stringify({
        clientMsgId: `close-app-auth-${Date.now()}`,
        payloadType: PT.APP_AUTH_REQ,
        payload: {
          clientId: CTRADER_CLIENT_ID,
          clientSecret: CTRADER_CLIENT_SECRET
        }
      }));
    });

    ws.on("message", raw => {
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

    ws.on("error", reject);
  });
}

async function modifyStopLoss(positionId, stopLoss) {
  if (MODE !== "LIVE") {
    logEvent("SIMULATED_SL_UPDATE", { positionId, stopLoss });
    return { simulated: true };
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error("Modify SL timeout"));
    }, 30000);

    function finish(data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(data);
    }

    ws.on("open", () => {
      ws.send(JSON.stringify({
        clientMsgId: `sl-app-auth-${Date.now()}`,
        payloadType: PT.APP_AUTH_REQ,
        payload: {
          clientId: CTRADER_CLIENT_ID,
          clientSecret: CTRADER_CLIENT_SECRET
        }
      }));
    });

    ws.on("message", raw => {
      const msg = JSON.parse(raw.toString());

      if (msg.payloadType === PT.APP_AUTH_RES) {
        ws.send(JSON.stringify({
          clientMsgId: `sl-account-auth-${Date.now()}`,
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
          clientMsgId: `modify-sl-${Date.now()}`,
          payloadType: PT.AMEND_POSITION_SLTP_REQ,
          payload: {
            ctidTraderAccountId: CTRADER_ACCOUNT_ID,
            positionId: Number(positionId),
            stopLoss: Number(stopLoss),
            guaranteedStopLoss: false
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

    ws.on("error", reject);
  });
}

async function getOpenPositionsFromCTrader() {
    if (MODE === "SIMULATION") {
    return simulationPositions;
  }

  if (MODE !== "LIVE") return [];

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CTRADER_WS_URL);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error("Get positions timeout"));
    }, 30000);

    function finish(positions) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(positions);
    }

    ws.on("open", () => {
      ws.send(JSON.stringify({
        clientMsgId: `pos-app-auth-${Date.now()}`,
        payloadType: PT.APP_AUTH_REQ,
        payload: {
          clientId: CTRADER_CLIENT_ID,
          clientSecret: CTRADER_CLIENT_SECRET
        }
      }));
    });

    ws.on("message", raw => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.payloadType === PT.APP_AUTH_RES) {
          ws.send(JSON.stringify({
            clientMsgId: `pos-account-auth-${Date.now()}`,
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
            clientMsgId: `reconcile-${Date.now()}`,
            payloadType: PT.RECONCILE_REQ,
            payload: {
              ctidTraderAccountId: CTRADER_ACCOUNT_ID
            }
          }));
          return;
        }

        if (msg.payloadType === PT.RECONCILE_RES) {
          const rawPositions = msg.payload?.position || msg.payload?.positions || [];
          return finish(Array.isArray(rawPositions) ? rawPositions : [rawPositions]);
        }

        if (msg.payload?.errorCode) {
          return reject(new Error(`${msg.payload.errorCode}: ${msg.payload.description || ""}`));
        }
      } catch (err) {
        reject(err);
      }
    });

    ws.on("error", reject);
  });
}

// =========================
// AI DECISION ENGINE
// =========================

async function aiDecision(snapshot) {
  if (!OPENAI_API_KEY) {
    return localDecision(snapshot);
  }

  try {
    const prompt = `
You are an autonomous trading risk engine for ${snapshot.symbol}.

Return JSON only:
{
  "decision": "BUY" | "SELL" | "WAIT",
  "confidence": 0-100,
  "stopLossUsd": number,
  "takeProfitUsd": number,
  "reason": "short reason"
}

Rules:
- Avoid overtrading but do not be overly conservative.
- Return WAIT only if:
  - trend is SIDEWAYS and volatility < 0.30
  - or RSI > 82 for BUY
  - or RSI < 18 for SELL
- If trend is UP and price > smaFast, prefer BUY.
- If trend is DOWN and price < smaFast, prefer SELL.
- Strong trends should produce confidence between 60-80.
- Use tighter stop loss during high volatility.
- Prefer momentum continuation over reversals.
- Analyze ${snapshot.symbol} only.

Market snapshot:
${JSON.stringify(snapshot, null, 2)}
`;

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.15
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const text = response.data.choices?.[0]?.message?.content || "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start === -1 || end === -1) {
      throw new Error("Invalid AI JSON");
    }

    return JSON.parse(text.substring(start, end + 1));
  } catch (err) {
    logEvent("AI_ERROR", { error: err.message });
    return localDecision(snapshot);
  }
}

function localDecision(snapshot) {
  let decision = "WAIT";
  let confidence = 50;
  let reason = "Local fallback decision";

  // BUY أقوى وأسرع
  if (
    snapshot.trend === "UP" &&
    snapshot.rsi >= 38 &&
    snapshot.rsi <= 72 &&
    snapshot.volatility >= 0.15 &&
    snapshot.price > snapshot.smaFast
  ) {
    decision = "BUY";
    confidence = 78;
    reason = "Strong buy setup: uptrend, price above SMA fast, RSI acceptable";
  }

  // SELL أقوى وأسرع
  if (
    snapshot.trend === "DOWN" &&
    snapshot.rsi >= 28 &&
    snapshot.rsi <= 62 &&
    snapshot.volatility >= 0.15 &&
    snapshot.price < snapshot.smaFast
  ) {
    decision = "SELL";
    confidence = 78;
    reason = "Strong sell setup: downtrend, price below SMA fast, RSI acceptable";
  }

  // SIDEWAYS لا يمنع دائمًا، فقط إذا الحركة ضعيفة جدًا
  if (
    snapshot.trend === "SIDEWAYS" &&
    snapshot.volatility < 0.20
  ) {
    decision = "WAIT";
    confidence = 42;
    reason = "Sideways market with weak volatility";
  }

  return {
    decision,
    confidence,
    stopLossUsd: DEFAULT_SL_USD,
    takeProfitUsd: DEFAULT_TP_USD,
    reason
  };
}

// =========================
// RISK MANAGER
// =========================

function calculateVolume({ equity, riskPercent, stopLossUsd, confidence }) {
  const accountEquity = Number(equity || DEFAULT_EQUITY);
  const riskPct = Number(riskPercent || RISK_PERCENT);
  const sl = Math.max(Number(stopLossUsd || DEFAULT_SL_USD), 5);

  const riskAmountUsd = accountEquity * (riskPct / 100);

  const contractSize = Number(process.env.XAUUSD_CONTRACT_SIZE || 100);
  const volumePerLot = Number(process.env.CTRADER_VOLUME_PER_LOT || 10000);

  let lots = riskAmountUsd / (sl * contractSize);
  let units = lots * volumePerLot;

  if (confidence >= 85) units *= 1.3;
  else if (confidence >= 75) units *= 1.1;
  else if (confidence < 70) units *= 0.7;

  return normalizeVolumeUnits(units);
}

function normalizeDecisionStops({ decision, side, entryPrice }) {
  const isBuy = String(side).toUpperCase() === "BUY";

  const rawSL = Number(decision.stopLossUsd || DEFAULT_SL_USD);
  const rawTP = Number(decision.takeProfitUsd || DEFAULT_TP_USD);

  const isPriceValue = (v) => Number(v) > 1000;

  const stopLoss = isPriceValue(rawSL)
    ? rawSL
    : isBuy
      ? entryPrice - Math.abs(rawSL)
      : entryPrice + Math.abs(rawSL);

  const takeProfit = isPriceValue(rawTP)
    ? rawTP
    : isBuy
      ? entryPrice + Math.abs(rawTP)
      : entryPrice - Math.abs(rawTP);

  return {
    stopLoss: Number(stopLoss.toFixed(2)),
    takeProfit: Number(takeProfit.toFixed(2))
  };
}

async function canEnterTrade(decision, positions) {
  if (!["BUY", "SELL"].includes(decision.decision)) {
    return { ok: false, reason: "Decision is WAIT" };
  }

  if (Number(decision.confidence || 0) < MIN_CONFIDENCE) {
    return { ok: false, reason: `Low confidence ${decision.confidence}` };
  }

  if (dailyPnL <= -Math.abs(MAX_DAILY_LOSS_USD)) {
    botRunning = false;
    return { ok: false, reason: "Max daily loss reached. Bot stopped." };
  }

  const sameSymbol = positions.filter(p => {
    const symbolId = Number(p.symbolId || p.tradeData?.symbolId || p.position?.symbolId || 0);
    return symbolId === SYMBOL_ID;
  });

  if (sameSymbol.length >= MAX_OPEN_POSITIONS) {
    return { ok: false, reason: "Max open positions reached" };
  }

  const opposite = sameSymbol.some(p => {
    const side = getPositionSide(p);
    return side && side !== decision.decision;
  });

  if (opposite) {
    return { ok: false, reason: "Opposite position exists" };
  }

  const cooldownMs = Number(process.env.AUTO_ENTRY_COOLDOWN_MS || 60000);
  if (Date.now() - lastEntryTime < cooldownMs) {
    return { ok: false, reason: "Entry cooldown active" };
  }

  const sameDirection = sameSymbol.some(p => {
  const side = getPositionSide(p);
  return side === decision.decision;
});

if (sameDirection) {
  return {
    ok: false,
    reason: "Same direction position already exists"
  };
}

  return { ok: true };
}

async function syncClosedTrades() {
  try {
    const trades = readJson(TRADES_FILE);

    const openTrades = trades.filter(t =>
      t.status === "opened" &&
      t.positionId
    );

    if (!openTrades.length) return;

    const positions = await getOpenPositionsFromCTrader();

    const openPositionIds = positions.map(p =>
      Number(getPositionId(p))
    );

    for (const trade of openTrades) {
      const positionId = Number(trade.positionId);

      if (openPositionIds.includes(positionId)) {
        continue;
      }

      const closePrice = livePrice;

      const side = String(trade.side || "").toUpperCase();

      const volume = Number(trade.volume || 0);

      const entryPrice = Number(trade.entryPrice || 0);

      if (
        !closePrice ||
        !entryPrice ||
        !volume ||
        !side
      ) {
        continue;
      }

      const lots = volume / 10000;

      const contractSize =
        Number(process.env.XAUUSD_CONTRACT_SIZE || 100);

      const priceMove =
        side === "BUY"
          ? closePrice - entryPrice
          : entryPrice - closePrice;

      const profitUsd = Number(
        (priceMove * lots * contractSize).toFixed(2)
      );

      const openedMs = new Date(
        trade.openedAt || trade.time || Date.now()
      ).getTime();

      const durationSec = Math.max(
        0,
        Math.round((Date.now() - openedMs) / 1000)
      );

      updateTradeByPositionId(positionId, {
        status: "closed",
        closedAt: now(),
        closeReason: "POSITION_NOT_FOUND_IN_CTRADER",
        closePrice,
        profitUsd,
        durationSec
      });

      dailyPnL += profitUsd;

      logEvent("CLOSED_TRADE_SYNCED", {
        positionId,
        side,
        entryPrice,
        closePrice,
        volume,
        profitUsd,
        dailyPnL
      });
    }
  } catch (err) {
    logEvent("CLOSED_SYNC_ERROR", {
      error: err.message
    });
  }
}

// =========================
// TRADE MANAGEMENT
// =========================

async function manageOpenPositions() {
  try {
    const positions = await getOpenPositionsFromCTrader();

    if (!positions.length) return;

    for (const p of positions) {
      const positionId = getPositionId(p);
      const volume = getPositionVolume(p);
      const entry = getPositionEntry(p);
      const side = getPositionSide(p);
      const currentSL = getPositionStopLoss(p);
      const currentTP = getPositionTakeProfit(p);

      if (!positionId || !volume || !entry || !livePrice || !side) continue;

      const isBuy = side.includes("BUY");
      const profitUsd = estimateProfitUsd(p, livePrice);

      const sl = Number(currentSL || p.stopLoss || 0);
      const tp = Number(currentTP || p.takeProfit || 0);

      if (MODE === "SIMULATION") {
        const hitTP = tp && (isBuy ? livePrice >= tp : livePrice <= tp);
        const hitSL = sl && (isBuy ? livePrice <= sl : livePrice >= sl);

        if (hitTP || hitSL) {
          const closeReason = hitTP ? "TP_HIT" : "SL_HIT";

          simulationPositions = simulationPositions.filter(
            x => getPositionId(x) !== positionId
          );

         

          console.log(hitTP ? "🎯 SIM TAKE PROFIT HIT" : "🛑 SIM STOP LOSS HIT", {
            positionId,
            side,
            entry,
            livePrice,
            stopLoss: sl,
            takeProfit: tp,
            profitUsd
          });

          continue;
        }
      }

    if (!processedPnL[positionId]) {
  processedPnL[positionId] = true;
  dailyPnL += profitUsd;
}

      const breakEvenTrigger = Number(process.env.BREAK_EVEN_TRIGGER_USD || 5);
      const breakEvenBuffer = Number(process.env.BREAK_EVEN_BUFFER_USD || 0.5);

      if (profitUsd >= breakEvenTrigger) {
        const newSL = isBuy
          ? Number((entry + breakEvenBuffer).toFixed(2))
          : Number((entry - breakEvenBuffer).toFixed(2));

        const shouldUpdate =
          !currentSL ||
          (isBuy && newSL > currentSL) ||
          (!isBuy && newSL < currentSL);

        if (shouldUpdate) {
          await modifyStopLoss(positionId, newSL);
          logEvent("BREAK_EVEN_APPLIED", {
            positionId,
            side,
            entry,
            livePrice,
            newSL,
            profitUsd
          });
        }
      }

      const trailingStart = Number(process.env.TRAILING_START_USD || 10);
      const trailingDistance = Number(process.env.TRAILING_DISTANCE_USD || 4);

      if (profitUsd >= trailingStart) {
        const newSL = isBuy
          ? Number((livePrice - trailingDistance).toFixed(2))
          : Number((livePrice + trailingDistance).toFixed(2));

        const updatedSL = getPositionStopLoss(p);

        const shouldUpdate =
          !updatedSL ||
          (isBuy && newSL > updatedSL) ||
          (!isBuy && newSL < updatedSL);

        if (shouldUpdate) {
          await modifyStopLoss(positionId, newSL);
          logEvent("TRAILING_APPLIED", {
            positionId,
            side,
            livePrice,
            oldSL: updatedSL,
            newSL,
            profitUsd
          });
        }
      }

      const maxLoss = Number(process.env.MAX_LOSS_PER_TRADE_USD || 50);

      if (profitUsd <= -Math.abs(maxLoss)) {
        await closePosition(positionId, volume);

        logEvent("MAX_LOSS_CLOSE", {
          positionId,
          side,
          livePrice,
          profitUsd
        });

        saveTrade({
          tradeId: p.tradeId,
          status: "closed",
          closeReason: "MAX_LOSS",
          symbol: p.symbol || SYMBOL,
          symbolId: p.symbolId || SYMBOL_ID,
          side,
          volume,
          entryPrice: entry,
          closePrice: livePrice,
          stopLoss: sl,
          takeProfit: tp,
          profitUsd,
          openedAt: p.openedAt,
          closedAt: now(),
          durationSec: Math.round(
            (Date.now() - new Date(p.openedAt || Date.now()).getTime()) / 1000
          )
        });
      }
    }
  } catch (err) {
    logEvent("MANAGEMENT_ERROR", { error: err.message });
  }
}

// =========================
// AUTO ENTRY LOOP
// =========================

async function scanMarketAndTrade() {
  try {
    if (!botRunning) {
      logEvent("BOT_STOPPED", { reason: "botRunning=false" });
      return;
    }

    if (!livePrice || priceHistory.length < 30) {
      logEvent("WAITING_FOR_PRICE_HISTORY", {
        livePrice,
        candles: priceHistory.length
      });
      return;
    }

    const snapshot = getMarketSnapshot();
    const spreadUsd = Math.abs(Number(askPrice || 0) - Number(bidPrice || 0));

if (
  SPREAD_FILTER_ENABLED &&
  spreadUsd > MAX_SPREAD_USD
) {
  console.log("🚫 SPREAD TOO HIGH", {
    spreadUsd,
    maxAllowed: MAX_SPREAD_USD
  });

  return;
}
    const positions = await getOpenPositionsFromCTrader();

    const decision = await aiDecision(snapshot);

    console.log("📊 AUTO BOT SUMMARY:", {
  price: snapshot.price,
  trend: snapshot.trend,
  rsi: snapshot.rsi,
  decision: decision.decision,
  confidence: decision.confidence,
  reason: decision.reason
});
    const allowed = await canEnterTrade(decision, positions);

    logEvent("AI_DECISION", {
      snapshot,
      decision,
      allowed
    });

    if (!allowed.ok) return;

    const volume = calculateVolume({
      equity: DEFAULT_EQUITY,
      riskPercent: RISK_PERCENT,
      stopLossUsd: decision.stopLossUsd || DEFAULT_SL_USD,
      confidence: decision.confidence
    });

const stops = normalizeDecisionStops({
  decision,
  side: decision.decision,
  entryPrice: livePrice
});
    
 const orderResult = await executeOrder({
  side: decision.decision,
  volume
});
    const realPositionId =
  orderResult?.payload?.position?.positionId ||
  orderResult?.payload?.deal?.positionId ||
  orderResult?.payload?.executionEvent?.position?.positionId ||
  orderResult?.payload?.order?.positionId ||
  null;

if (MODE === "SIMULATION") {
  const tradeId = `SIM-${Date.now()}`;

  simulationPositions.push({
    tradeId,
    positionId: Date.now(),
    symbol: SYMBOL,
    symbolId: SYMBOL_ID,
    tradeSide: decision.decision,
    volume,
    entryPrice: livePrice,
    stopLoss: stops.stopLoss,
    takeProfit: stops.takeProfit,
    openedAt: now(),
    status: "OPEN"
  });

  console.log("🧪 SIM POSITION ADDED", {
    tradeId,
    symbol: SYMBOL,
    side: decision.decision,
    volume,
    entryPrice: livePrice,
    stopLoss: stops.stopLoss,
    takeProfit: stops.takeProfit
  });
}

lastEntryTime = Date.now();

logEvent("AUTO_TRADE_EXECUTED", {
  symbol: SYMBOL,
  symbolId: SYMBOL_ID,
  side: decision.decision,
  volume,
  price: livePrice,
  confidence: decision.confidence,
  reason: decision.reason,
  orderResult
});

saveTrade({
  tradeId: realPositionId ? `POS-${realPositionId}` : `OPEN-${Date.now()}`,
  positionId: realPositionId,
  status: "opened",
  symbol: SYMBOL,
  symbolId: SYMBOL_ID,
  side: decision.decision,
  volume,
  entryPrice: livePrice,
  stopLoss: stops.stopLoss,
  takeProfit: stops.takeProfit,
  openedAt: now(),
  confidence: decision.confidence,
  reason: decision.reason
});

} catch (err) {
  logEvent("SCAN_ERROR", { error: err.message });
}
}

// =========================
// START BOT
// =========================

function startAutoBot() {
  console.log("=================================");
  console.log("🤖 AUTO TRADING BOT STARTED");
  console.log("Symbol:", SYMBOL);
  console.log("Symbol ID:", SYMBOL_ID);
  console.log("Mode:", MODE);
  console.log("Scan:", SCAN_INTERVAL_MS, "ms");
  console.log("Management:", MANAGEMENT_INTERVAL_MS, "ms");
  console.log("=================================");

  requireEnv();

  startLivePriceStream();

 setInterval(scanMarketAndTrade, SCAN_INTERVAL_MS);

setInterval(
  manageOpenPositions,
  MANAGEMENT_INTERVAL_MS
);

setInterval(
  syncClosedTrades,
  MANAGEMENT_INTERVAL_MS
);
}

process.on("uncaughtException", err => {
  logEvent("UNCAUGHT_EXCEPTION", { error: err.message });
});

process.on("unhandledRejection", err => {
  logEvent("UNHANDLED_REJECTION", { error: err.message || String(err) });
});

startAutoBot();
