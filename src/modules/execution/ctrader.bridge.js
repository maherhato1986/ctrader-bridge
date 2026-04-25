require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const protobuf = require('protobufjs');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || 'maher123';
const MODE = String(process.env.MODE || 'SIMULATION').toUpperCase();

const CTRADER_CLIENT_ID = process.env.CTRADER_CLIENT_ID || '';
const CTRADER_CLIENT_SECRET = process.env.CTRADER_CLIENT_SECRET || '';
const CTRADER_ACCESS_TOKEN = process.env.CTRADER_ACCESS_TOKEN || '';
const CTRADER_ACCOUNT_ID = Number(process.env.CTRADER_ACCOUNT_ID || 0);
const CTRADER_HOST = process.env.CTRADER_HOST || 'live.ctraderapi.com';
const CTRADER_PROTO_PORT = Number(process.env.CTRADER_PROTO_PORT || 5035);
const CTRADER_WS_URL = `wss://${CTRADER_HOST}:${CTRADER_PROTO_PORT}`;

const PROTO_DIR = path.join(process.cwd(), 'proto');
function auth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
      message: 'Invalid or missing x-api-key'
    });
  }
  next();
}

function nowIso() {
  return new Date().toISOString();
}

function requireEnv() {
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

function getProtoFiles() {
  if (!fs.existsSync(PROTO_DIR)) {
    throw new Error(`Missing proto directory: ${PROTO_DIR}`);
  }

  const files = fs.readdirSync(PROTO_DIR)
    .filter(name => name.endsWith('.proto'))
    .map(name => path.join(PROTO_DIR, name));

  if (!files.length) {
    throw new Error(`No .proto files found in ${PROTO_DIR}`);
  }

  return files;
}

function walkNamespace(ns, list = []) {
  if (!ns || !ns.nested) return list;
  for (const key of Object.keys(ns.nested)) {
    const item = ns.nested[key];
    list.push(item);
    walkNamespace(item, list);
  }
  return list;
}

function findType(root, name) {
  const direct = root.lookup(name);
  if (direct && direct.fields) return direct;

  const all = walkNamespace(root, []);
  for (const item of all) {
    if (item.name === name && item.fields) return item;
  }

  throw new Error(`Type not found: ${name}`);
}

function findEnum(root, nameCandidates) {
  const all = walkNamespace(root, []);
  for (const wanted of nameCandidates) {
    const direct = root.lookup(wanted);
    if (direct && direct.values) return direct;

    for (const item of all) {
      if (item.name === wanted && item.values) return item;
    }
  }
  throw new Error(`Enum not found. Tried: ${nameCandidates.join(', ')}`);
}

function buildReverseMap(obj) {
  const rev = {};
  for (const [k, v] of Object.entries(obj)) rev[v] = k;
  return rev;
}

function enumToMessageName(enumName) {
  const s = String(enumName || '');

  if (s.startsWith('PROTO_OA_')) {
    const rest = s.slice('PROTO_OA_'.length)
      .toLowerCase()
      .split('_')
      .map(x => x.charAt(0).toUpperCase() + x.slice(1))
      .join('');
    return `ProtoOA${rest}`;
  }

  if (s.startsWith('PROTO_')) {
    const rest = s.slice('PROTO_'.length)
      .toLowerCase()
      .split('_')
      .map(x => x.charAt(0).toUpperCase() + x.slice(1))
      .join('');
    return `Proto${rest}`;
  }

  return s;
}
function resolveMessageNameFromPayloadType(payloadTypeName) {
  const map = {
    PROTO_OA_APPLICATION_AUTH_RES: 'ProtoOAApplicationAuthRes',
    PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES: 'ProtoOAGetAccountListByAccessTokenRes',
    PROTO_OA_ACCOUNT_AUTH_RES: 'ProtoOAAccountAuthRes',
    PROTO_OA_ASSET_LIST_RES: 'ProtoOAAssetListRes',
    PROTO_OA_SYMBOLS_LIST_RES: 'ProtoOASymbolsListRes',
    PROTO_OA_SYMBOL_BY_ID_RES: 'ProtoOASymbolByIdRes',
    PROTO_OA_TRADER_RES: 'ProtoOATraderRes',
    PROTO_OA_EXECUTION_EVENT: 'ProtoOAExecutionEvent',
    PROTO_OA_ORDER_ERROR_EVENT: 'ProtoOAOrderErrorEvent',
    PROTO_HEARTBEAT_EVENT: 'ProtoHeartbeatEvent',
    PROTO_OA_ERROR_RES: 'ProtoOAErrorRes'
  };

  return map[payloadTypeName] || null;
}

function resolvePayloadTypeId(ctx, messageName) {
  const explicitMap = {
    ProtoOAApplicationAuthReq: 'PROTO_OA_APPLICATION_AUTH_REQ',
    ProtoOAApplicationAuthRes: 'PROTO_OA_APPLICATION_AUTH_RES',

    ProtoOAGetAccountListByAccessTokenReq: 'PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ',
    ProtoOAGetAccountListByAccessTokenRes: 'PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES',

    ProtoOAAccountAuthReq: 'PROTO_OA_ACCOUNT_AUTH_REQ',
    ProtoOAAccountAuthRes: 'PROTO_OA_ACCOUNT_AUTH_RES',

    ProtoOAAssetListReq: 'PROTO_OA_ASSET_LIST_REQ',
    ProtoOAAssetListRes: 'PROTO_OA_ASSET_LIST_RES',

    ProtoOASymbolsListReq: 'PROTO_OA_SYMBOLS_LIST_REQ',
    ProtoOASymbolsListRes: 'PROTO_OA_SYMBOLS_LIST_RES',

    ProtoOASymbolByIdReq: 'PROTO_OA_SYMBOL_BY_ID_REQ',
    ProtoOASymbolByIdRes: 'PROTO_OA_SYMBOL_BY_ID_RES',
ProtoOATraderReq: 'PROTO_OA_TRADER_REQ',
ProtoOATraderRes: 'PROTO_OA_TRADER_RES',

    ProtoOANewOrderReq: 'PROTO_OA_NEW_ORDER_REQ',
    ProtoOAExecutionEvent: 'PROTO_OA_EXECUTION_EVENT',
    ProtoOAOrderErrorEvent: 'PROTO_OA_ORDER_ERROR_EVENT',

    ProtoHeartbeatEvent: 'PROTO_HEARTBEAT_EVENT'
  };

  const enumValues = ctx.PayloadEnum?.values || {};
  const candidate = explicitMap[messageName];

  if (candidate && Object.prototype.hasOwnProperty.call(enumValues, candidate)) {
    return enumValues[candidate];
  }

  throw new Error(`Payload enum not found for ${messageName}`);
}

function lookupEnumValue(enumObj, candidates) {
  for (const name of candidates) {
    if (Object.prototype.hasOwnProperty.call(enumObj.values, name)) {
      return enumObj.values[name];
    }
  }
  throw new Error(`Enum value not found. Tried: ${candidates.join(', ')}`);
}

async function loadProtoContext() {
  const files = getProtoFiles();
  const root = await protobuf.load(files);

  const ProtoMessage = findType(root, 'ProtoMessage');
  const PayloadEnum = findEnum(root, ['ProtoOAPayloadType', 'ProtoPayloadType']);
  const payloadNameById = buildReverseMap(PayloadEnum.values);

  return {
    root,
    ProtoMessage,
    PayloadEnum,
    payloadNameById
  };
}

function resolveAccountId(inputAccountId) {
  const accountId = Number(inputAccountId || CTRADER_ACCOUNT_ID || 0);
  if (!accountId) {
    throw new Error('ctidTraderAccountId is required');
  }
  return accountId;
}

class CTraderProtoSession {
  constructor(ctx) {
    this.ctx = ctx;
    this.ws = null;
    this.waiters = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(CTRADER_WS_URL);

      this.ws.on('open', () => {
        console.log('Connected to cTrader');
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = this.decodeIncoming(data);
          this.dispatch(msg);
        } catch (err) {
          console.error('DECODE ERROR:', err);
        }
      });

      this.ws.on('error', reject);
      this.ws.on('close', () => {
        console.log('cTrader socket closed');
      });
    });
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }

  decodeIncoming(data) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const envelope = this.ctx.ProtoMessage.decode(buffer);

    const payloadTypeId = envelope.payloadType;
    const payloadTypeName = this.ctx.payloadNameById[payloadTypeId] || `UNKNOWN_${payloadTypeId}`;
    const messageTypeName =
  resolveMessageNameFromPayloadType(payloadTypeName) ||
  enumToMessageName(payloadTypeName);

    let payload = {};

    try {
      const payloadType = findType(this.ctx.root, messageTypeName);
      payload = payloadType.toObject(
        payloadType.decode(envelope.payload),
        { longs: Number, enums: String, defaults: true }
      );
    } catch {
      payload = { raw: envelope.payload };
    }

    return {
      payloadTypeId,
      payloadTypeName,
      messageTypeName,
      clientMsgId: envelope.clientMsgId || null,
      payload
    };
  }

  send(messageName, payload = {}, clientMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {
    const msgType = findType(this.ctx.root, messageName);
    const payloadType = resolvePayloadTypeId(this.ctx, messageName);

    const errMsg = msgType.verify(payload);
    if (errMsg) {
      throw new Error(`${messageName} payload invalid: ${errMsg}`);
    }

    const msgPayload = msgType.create(payload);
    const payloadBytes = msgType.encode(msgPayload).finish();

    const envelope = this.ctx.ProtoMessage.create({
      payloadType,
      payload: payloadBytes,
      clientMsgId
    });

    const bytes = this.ctx.ProtoMessage.encode(envelope).finish();
    this.ws.send(bytes);

    return clientMsgId;
  }

  waitFor(predicate, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== waiter);
        reject(new Error('Timeout waiting for cTrader response'));
      }, timeoutMs);

      const waiter = {
        predicate,
        resolve: (msg) => {
          clearTimeout(timeout);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      };

      this.waiters.push(waiter);
    });
  }

  dispatch(msg) {
    console.log('PROTO MSG:', msg.payloadTypeName);

    if (
  msg.messageTypeName === 'ProtoOAErrorRes' ||
  msg.payloadTypeName === 'PROTO_OA_ERROR_RES'
) {
      const err = new Error(msg.payload.description || msg.payload.errorCode || 'cTrader error');
      err.details = msg;
      for (const waiter of [...this.waiters]) {
        waiter.reject(err);
      }
      this.waiters = [];
      return;
    }

    for (const waiter of [...this.waiters]) {
      try {
        if (waiter.predicate(msg)) {
          this.waiters = this.waiters.filter(w => w !== waiter);
          waiter.resolve(msg);
        }
      } catch (err) {
        this.waiters = this.waiters.filter(w => w !== waiter);
        waiter.reject(err);
      }
    }
  }

  async appAuth() {
    const clientMsgId = this.send('ProtoOAApplicationAuthReq', {
      clientId: CTRADER_CLIENT_ID,
      clientSecret: CTRADER_CLIENT_SECRET
    });

    await this.waitFor(
  m => m.payloadTypeName === 'PROTO_OA_APPLICATION_AUTH_RES',
  10000
);
  }

  async getAccounts() {
    const clientMsgId = this.send('ProtoOAGetAccountListByAccessTokenReq', {
      accessToken: CTRADER_ACCESS_TOKEN
    });

    const res = await this.waitFor(
  m => m.payloadTypeName === 'PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES',
  10000
);

    return res.payload;
  }

async accountAuth(accountId = this.accountId || CTRADER_ACCOUNT_ID) {
  const clientMsgId = this.send('ProtoOAAccountAuthReq', {
    ctidTraderAccountId: Number(accountId),
    accessToken: CTRADER_ACCESS_TOKEN
  });

  const res = await this.waitFor(
    m => m.payloadTypeName === 'PROTO_OA_ACCOUNT_AUTH_RES',
    10000
  );

  return res.payload;
}

async getAssets() {
  const clientMsgId = this.send('ProtoOAAssetListReq', {
    ctidTraderAccountId: Number(this.accountId)
  });

  const res = await this.waitFor(
    m => m.payloadTypeName === 'PROTO_OA_ASSET_LIST_RES',
    10000
  );

  return res.payload;
}

async getSymbols() {
  const clientMsgId = this.send('ProtoOASymbolsListReq', {
    ctidTraderAccountId: Number(this.accountId),
    includeArchivedSymbols: false
  });

  const res = await this.waitFor(
    m => m.payloadTypeName === 'PROTO_OA_SYMBOLS_LIST_RES',
    10000
  );

  return res.payload;
}

async getTrader() {
  const clientMsgId = this.send('ProtoOATraderReq', {
    ctidTraderAccountId: Number(this.accountId)
  });

  const res = await this.waitFor(
    m => m.payloadTypeName === 'PROTO_OA_TRADER_RES',
    10000
  );

  return res.payload;
}

async getSymbolById(symbolIds = []) {
  const clientMsgId = this.send('ProtoOASymbolByIdReq', {
    ctidTraderAccountId: Number(this.accountId),
    symbolId: symbolIds
  });

  const res = await this.waitFor(
    m => m.payloadTypeName === 'PROTO_OA_SYMBOL_BY_ID_RES',
    10000
  );

  return res.payload;
}

  async sendMarketOrder({
    symbolId,
    side,
    volume,
    relativeStopLoss,
    relativeTakeProfit,
    label,
    comment
  }) {
    const orderTypeEnum = findEnum(this.ctx.root, ['ProtoOAOrderType']);
    const tradeSideEnum = findEnum(this.ctx.root, ['ProtoOATradeSide']);

    const orderType = lookupEnumValue(orderTypeEnum, [
      'MARKET',
      'ORDER_TYPE_MARKET',
      'PROTO_OA_ORDER_TYPE_MARKET'
    ]);

    const tradeSide = lookupEnumValue(tradeSideEnum, [
      String(side || '').toUpperCase(),
      `TRADE_SIDE_${String(side || '').toUpperCase()}`
    ]);

const encodedVolume = parseInt(volume, 10);

const payload = {
  ctidTraderAccountId: Number(this.accountId),
  symbolId: Number(symbolId),
  orderType,
  tradeSide,
  volume: encodedVolume,
  label: label || `RKL-${Date.now()}`,
  comment: comment || 'Live order from proto bridge'
};

    if (relativeStopLoss !== undefined && relativeStopLoss !== null && relativeStopLoss !== '') {
      payload.relativeStopLoss = Number(relativeStopLoss);
    }

    if (relativeTakeProfit !== undefined && relativeTakeProfit !== null && relativeTakeProfit !== '') {
      payload.relativeTakeProfit = Number(relativeTakeProfit);
    }

    const clientMsgId = this.send('ProtoOANewOrderReq', payload);

    const res = await this.waitFor(
      m =>
        (
          m.messageTypeName === 'ProtoOAExecutionEvent' ||
          m.messageTypeName === 'ProtoOAOrderErrorEvent'
        ) &&
        (
          m.clientMsgId === clientMsgId ||
         Number(m.payload?.ctidTraderAccountId) === Number(this.accountId)
        ),
      15000
    );

    return res;
  }
}

async function withSession(handler, options = {}) {
  requireEnv();

  const ctx = await loadProtoContext();
  const session = new CTraderProtoSession(ctx);

  const accountId = resolveAccountId(options.accountId);
console.log("withSession resolved accountId =", accountId);
  try {
    await session.connect();
    await session.appAuth();
    const accounts = await session.getAccounts();

    const accountExists = (accounts.ctidTraderAccount || []).some(
      a => Number(a.ctidTraderAccountId) === Number(accountId)
    );

    if (!accountExists) {
      const err = new Error(`Account ${accountId} not found in access token account list`);
      err.statusCode = 404;
      throw err;
    }

    session.accountId = accountId;
console.log("session.accountId set to =", session.accountId);
    await session.accountAuth(accountId);

    return await handler(session, accounts, accountId);
  } finally {
    session.close();
  }
}
/* =========================
   ROUTES
========================= */

app.get('/', (req, res) => {
  res.json({
    ok: true,
    mode: MODE,
    wsUrl: CTRADER_WS_URL,
    accountId: CTRADER_ACCOUNT_ID || null,
    now: nowIso()
  });
});

app.get('/ctrader/proto/accounts', async (req, res) => {
  try {
    requireEnv();

    const ctx = await loadProtoContext();
    const session = new CTraderProtoSession(ctx);

    try {
      await session.connect();
      await session.appAuth();
      const accounts = await session.getAccounts();

      res.json({
        ok: true,
        permissionScope: accounts.permissionScope,
        accounts: accounts.ctidTraderAccount || []
      });
    } finally {
      session.close();
    }
  } catch (error) {
    console.error('PROTO ACCOUNTS ERROR:', error);
    res.status(error.statusCode || 500).json({
      ok: false,
      error: 'Proto accounts failed',
      message: error.message,
      details: error.details || null
    });
  }
});

app.get('/ctrader/proto/assets', async (req, res) => {
  try {
    const result = await withSession(async (session) => {
      const assets = await session.getAssets();
      return {
        ok: true,
        count: (assets.asset || []).length,
        assets: assets.asset || []
      };
    });

    res.json(result);
  } catch (error) {
    console.error('PROTO ASSETS ERROR:', error);
    res.status(error.statusCode || 500).json({
      ok: false,
      error: 'Proto assets failed',
      message: error.message,
      details: error.details || null
    });
  }
});

app.get('/ctrader/proto/symbols', async (req, res) => {
  try {
    const search = String(req.query.search || '').toUpperCase().trim();

    const result = await withSession(async (session) => {
      const payload = await session.getSymbols();
      const allSymbols = payload.symbol || [];

      const filtered = search
        ? allSymbols.filter(s =>
            String(s.symbolName || '').toUpperCase().includes(search) ||
            String(s.description || '').toUpperCase().includes(search)
          )
        : allSymbols;

      return {
        ok: true,
        count: filtered.length,
        symbols: filtered
      };
    });

    res.json(result);
  } catch (error) {
    console.error('PROTO SYMBOLS ERROR:', error);
    res.status(error.statusCode || 500).json({
      ok: false,
      error: 'Proto symbols failed',
      message: error.message,
      details: error.details || null
    });
  }
});

app.get('/ctrader/proto/symbol/:id', async (req, res) => {
  try {
    const symbolId = Number(req.params.id);

    const result = await withSession(async (session) => {
      const payload = await session.getSymbolById([symbolId]);
      return {
        ok: true,
        symbol: payload.symbol || [],
        archivedSymbol: payload.archivedSymbol || []
      };
    });

    res.json(result);
  } catch (error) {
    console.error('PROTO SYMBOL BY ID ERROR:', error);
    res.status(error.statusCode || 500).json({
      ok: false,
      error: 'Proto symbol by id failed',
      message: error.message,
      details: error.details || null
    });
  }
});

app.post('/ctrader/proto/order', auth, async (req, res) => {
  try {
    const {
      accountId,
      symbolId,
      side,
      volume,
      relativeStopLoss,
      relativeTakeProfit,
      label,
      comment
    } = req.body;
console.log("REQ BODY accountId =", accountId);

    if (!symbolId) {
      return res.status(400).json({
        ok: false,
        error: 'Bad Request',
        message: 'symbolId is required'
      });
    }

    if (!['BUY', 'SELL'].includes(String(side || '').toUpperCase())) {
      return res.status(400).json({
        ok: false,
        error: 'Bad Request',
        message: 'side must be BUY or SELL'
      });
    }

    if (!Number.isFinite(Number(volume)) || Number(volume) <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'Bad Request',
        message: 'volume must be a positive number'
      });
    }

    const result = await withSession(async (session, _accounts, resolvedAccountId) => {
      const traderRes = await session.getTrader();
      const trader = traderRes.trader || traderRes;
      const balance = Number(trader.balance || 0);

      if (balance <= 0) {
        return {
          ok: false,
          error: 'INSUFFICIENT_ACCOUNT_BALANCE',
          message: 'Selected cTrader account has zero balance',
          accountId: resolvedAccountId,
          trader: {
            ctidTraderAccountId: trader.ctidTraderAccountId,
            traderLogin: trader.traderLogin,
            balance: trader.balance,
            moneyDigits: trader.moneyDigits
          }
        };
      }

      if (MODE !== 'LIVE') {
        return {
          ok: true,
          simulated: true,
          message: 'Simulation mode: order not sent',
          accountId: resolvedAccountId,
          request: {
            symbolId,
            side,
            volume,
            relativeStopLoss,
            relativeTakeProfit,
            label,
            comment
          }
        };
      }

      const exec = await session.sendMarketOrder({
        symbolId,
        side,
        volume,
        relativeStopLoss,
        relativeTakeProfit,
        label,
        comment
      });

      return {
        ok: true,
        message: 'Order request sent',
        accountId: resolvedAccountId,
        eventType: exec.payloadTypeName,
        execution: exec.payload
      };
    }, { accountId });

    res.json(result);
  } catch (error) {
    console.error('PROTO ORDER ERROR:', error);
    res.status(error.statusCode || 500).json({
      ok: false,
      error: 'Proto order failed',
      message: error.message,
      details: error.details || null
    });
  }
});

app.get('/ctrader/proto/trader', async (req, res) => {
  try {
    const result = await withSession(async (session) => {
      const trader = await session.getTrader();
      return {
        ok: true,
        trader
      };
    });

    res.json(result);
  } catch (error) {
    console.error('PROTO TRADER ERROR:', error);
    res.status(error.statusCode || 500).json({
      ok: false,
      error: 'Proto trader failed',
      message: error.message,
      details: error.details || null
    });
  }
});

console.log("RKL NEW ORDER ROUTE LOADED");

app.post('/telegram/decision', async (req, res) => {
  try {
    const { signalId, decision, symbolId, side, volume } = req.body;

    if (!signalId || !decision) {
      return res.status(400).json({
        ok: false,
        message: 'signalId and decision required'
      });
    }

    console.log('📩 Telegram Decision:', { signalId, decision });

    if (decision === 'reject') {
      return res.json({
        ok: true,
        message: `❌ Signal ${signalId} rejected`
      });
    }

    if (decision === 'approve') {
      const result = await withSession(async (session) => {

        if (MODE !== 'LIVE') {
          return {
            ok: true,
            simulated: true,
            message: 'Simulation mode: order not sent',
            request: { symbolId, side, volume }
          };
        }

        const exec = await session.sendMarketOrder({
          symbolId: Number(symbolId),
          side: side.toUpperCase(),
          volume: Number(volume)
        });

        return {
          ok: true,
          message: '✅ Order executed',
          execution: exec.payload
        };
      });

      return res.json(result);
    }

    res.status(400).json({
      ok: false,
      message: 'Invalid decision'
    });

  } catch (err) {
    console.error('Telegram decision error:', err);
    res.status(500).json({
      ok: false,
      message: err.message
    });
  }
});

console.log("RKL NEW ORDER ROUTE LOADED");

app.listen(PORT, () => {
  console.log(`Proto server running on http://localhost:${PORT}`);
  console.log(`MODE: ${MODE}`);
  console.log(`CTRADER_WS_URL: ${CTRADER_WS_URL}`);
  console.log(`CTRADER_ACCOUNT_ID: ${CTRADER_ACCOUNT_ID || 'NOT SET'}`);
});
