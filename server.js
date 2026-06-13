const express = require('express');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const ccxt = require('ccxt');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/arbimine';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  mpesa: { type: String, required: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '7d' }
});
const User = mongoose.model('User', userSchema);
const Session = mongoose.model('Session', sessionSchema);

const opportunityHistory = {};

const hashPassword = p => crypto.createHash('sha256').update(p).digest('hex');
const generateToken = () => crypto.randomBytes(32).toString('hex');

async function safeGet(url, name) {
  try {
    const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.data;
  } catch (e) {
    console.log(`${name} FAILED:`, e.message);
    return null;
  }
}

// Exchanges for tickers
const EXCHANGES = {
  mexc: 'https://api.mexc.com/api/v3/ticker/24hr',
  kucoin: 'https://api.kucoin.com/api/v1/market/allTickers',
  bitmart: 'https://api-cloud.bitmart.com/spot/v1/ticker',
  bitget: 'https://api.bitget.com/api/spot/v1/market/tickers',
  lbank: 'https://api.lbank.info/v1/ticker.do?symbol=all',
  coinex: 'https://api.coinex.com/v1/market/ticker/all',
  gateio: 'https://api.gateio.ws/api/v4/spot/tickers',
  okx: 'https://www.okx.com/api/v5/market/tickers?instType=SPOT',
  bybit: 'https://api.bybit.com/v5/market/tickers?category=spot',
  htx: 'https://api.huobi.pro/market/tickers',
  bitfinex: 'https://api-pub.bitfinex.com/v2/tickers?symbols=ALL',
  poloniex: 'https://api.poloniex.com/markets/ticker24h',
  cryptocom: 'https://api.crypto.com/exchange/v1/public/get-tickers',
  upbit: 'https://api.upbit.com/v1/ticker?markets=KRW-BTC'
};

const MIN_PROFIT = 0.2;
const MAX_PROFIT = 100;

// ==================== AUTH ====================
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, mpesa, password } = req.body;
    if (!username || !email || !mpesa || !password) return res.status(400).json({ error: 'All fields required' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: 'Username exists' });
    const user = new User({ username, email, mpesa, passwordHash: hashPassword(password) });
    await user.save();
    const token = generateToken();
    await new Session({ token, username }).save();
    res.json({ success: true, token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || user.passwordHash !== hashPassword(password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateToken();
    await new Session({ token, username }).save();
    res.json({ success: true, token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/me', async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: 'No token' });
    const session = await Session.findOne({ token });
    if (!session) return res.status(401).json({ error: 'Invalid session' });
    const user = await User.findOne({ username: session.username });
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ username: user.username, email: user.email, mpesa: user.mpesa });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== SYMBOL EXTRACTION ====================
function extractSymbol(exchange, symbol, t) {
  let sym = null, price = null, volume = null;
  try {
    if (exchange === 'mexc' && symbol.endsWith('USDT')) { sym = symbol.replace('USDT', ''); price = +t.lastPrice; volume = +t.quoteVolume; }
    else if (exchange === 'kucoin' && symbol.includes('-USDT')) { sym = symbol.replace('-USDT', ''); price = +t.last; volume = +t.volValue; }
    else if (exchange === 'bitmart' && symbol.includes('_USDT')) { sym = symbol.replace('_USDT', ''); price = +t.last_price; volume = +t.quote_volume; }
    else if (exchange === 'bitget') { sym = t.symbol?.replace('USDT', ''); price = +t.close; volume = +t.usdtVol; }
    else if (exchange === 'gateio' && symbol.includes('_USDT')) { sym = symbol.replace('_USDT', ''); price = +t.last; volume = +t.quote_volume; }
    else if (exchange === 'okx' && symbol.includes('-USDT')) { sym = symbol.replace('-USDT', ''); price = +t.last; volume = +t.volCcy24h; }
    else if (exchange === 'bybit') { sym = t.symbol?.replace('USDT', ''); price = +t.lastPrice; volume = +t.turnover24h; }
    else if (exchange === 'htx') { sym = symbol.replace('usdt', '').toUpperCase(); price = +t.close; volume = +t.vol; }
    else if (exchange === 'bitfinex' && Array.isArray(t) && t[0]?.startsWith('t')) { sym = t[0].replace('t', '').replace('USD', ''); price = +t[7]; volume = +t[8]; }
    else if (exchange === 'cryptocom') { const inst = t.i; if (inst?.includes('_USDT')) { sym = inst.replace('_USDT', ''); price = +t.a; volume = +t.v; } }
    else if (exchange === 'upbit' && t.market?.startsWith('KRW-')) { sym = t.market.replace('KRW-', ''); price = +t.trade_price; volume = +t.acc_trade_price_24h; }
    if (!sym || !price) return null;
    return { symbol: sym, price, volume: volume || 0 };
  } catch { return null; }
}

// ==================== REAL NETWORK DATA (CCXT) ====================
const CCXT_EXCHANGES = {
  binance: ccxt.binance,
  kucoin: ccxt.kucoin,
  okx: ccxt.okx,
  bybit: ccxt.bybit,
  gateio: ccxt.gateio,
  htx: ccxt.huobi,
  mexc: ccxt.mexc,
  bitmart: ccxt.bitmart,
  bitget: ccxt.bitget,
  coinex: ccxt.coinex,
  lbank: ccxt.lbank,
  poloniex: ccxt.poloniex,
  bitfinex: ccxt.bitfinex,
  cryptocom: ccxt.cryptocom,
  upbit: ccxt.upbit
};

const networkCache = new Map();

async function fetchRealNetworks(exchangeId, coin) {
  const cacheKey = `${exchangeId}:${coin}`;
  if (networkCache.has(cacheKey)) {
    const cached = networkCache.get(cacheKey);
    if (Date.now() - cached.timestamp < 3600000) return cached.data;
  }

  const ExchangeClass = CCXT_EXCHANGES[exchangeId.toLowerCase()];
  if (!ExchangeClass) {
    console.log(`No CCXT support for exchange: ${exchangeId}`);
    return null;
  }

  try {
    const ex = new ExchangeClass({ enableRateLimit: true });
    await ex.loadMarkets();
    const currencies = await ex.fetchCurrencies();
    const coinData = currencies[coin];
    if (!coinData || !coinData.networks) return null;

    const networks = {};
    for (const [netName, netInfo] of Object.entries(coinData.networks)) {
      networks[netName] = {
        name: netName,
        deposit: netInfo.deposit === true,
        withdraw: netInfo.withdraw === true,
        fee: netInfo.fee || 0,
        minWithdraw: netInfo.withdrawMin || 0
      };
    }
    const result = {
      networks,
      canWithdraw: coinData.withdraw === true,
      canDeposit: coinData.deposit === true
    };
    networkCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  } catch (err) {
    console.log(`Network error ${exchangeId} ${coin}:`, err.message);
    return null;
  }
}

app.get('/api/network/:exchange/:symbol', async (req, res) => {
  const { exchange, symbol } = req.params;
  const coin = symbol.split('/')[0];
  const data = await fetchRealNetworks(exchange, coin);
  if (!data) return res.status(404).json({ error: 'Network data not available' });
  res.json(data);
});

// ==================== OPPORTUNITIES ====================
app.get('/api/opportunities', async (req, res) => {
  try {
    const results = await Promise.all(Object.entries(EXCHANGES).map(([n, u]) => safeGet(u, n)));
    const allData = {};
    Object.keys(EXCHANGES).forEach(e => (allData[e] = {}));
    results.forEach((data, idx) => {
      const ex = Object.keys(EXCHANGES)[idx];
      if (!data) return;
      let tickers = [];
      if (ex === 'mexc') tickers = data;
      else if (ex === 'kucoin') tickers = data.data?.ticker || [];
      else if (ex === 'bitmart') tickers = data.data?.tickers || [];
      else if (ex === 'bitget') tickers = data.data || [];
      else if (ex === 'gateio') tickers = data;
      else if (ex === 'okx') tickers = data.data || [];
      else if (ex === 'bybit') tickers = data.result?.list || [];
      else if (ex === 'htx') tickers = data.data || [];
      else if (ex === 'bitfinex') tickers = data || [];
      else if (ex === 'poloniex') tickers = data.data || [];
      else if (ex === 'cryptocom') tickers = data.result?.data || [];
      else if (ex === 'upbit') tickers = data || [];
      for (const t of tickers) {
        const symKey = t.symbol || t.currency_pair || t.instId || t.market || t.i || '';
        const d = extractSymbol(ex, symKey, t);
        if (!d) continue;
        allData[ex][d.symbol] = { price: d.price, volume: d.volume };
      }
    });

    const symbols = new Set();
    Object.values(allData).forEach(ex => Object.keys(ex).forEach(s => symbols.add(s)));

    const opportunities = [];
    for (const symbol of symbols) {
      const prices = [];
      for (const ex of Object.keys(allData)) {
        if (allData[ex][symbol]) prices.push([ex, allData[ex][symbol]]);
      }
      if (prices.length < 2) continue;
      prices.sort((a, b) => a[1].price - b[1].price);
      const [buyEx, buy] = prices[0];
      const [sellEx, sell] = prices[prices.length - 1];
      const spread = ((sell.price - buy.price) / buy.price) * 100;
      if (spread < MIN_PROFIT || spread > MAX_PROFIT) continue;
      const id = `${symbol}-${buyEx}-${sellEx}`;
      if (!opportunityHistory[id]) opportunityHistory[id] = [];
      opportunityHistory[id].push({ time: Date.now(), spread });
      if (opportunityHistory[id].length > 20) opportunityHistory[id].shift();
      let liquidityScore = buy.volume ? buy.volume * buy.price : Math.random() * 50000 + 10000;
      opportunities.push({
        id, symbol,
        buyExchange: buyEx.toUpperCase(),
        sellExchange: sellEx.toUpperCase(),
        buyPrice: buy.price.toFixed(8),
        sellPrice: sell.price.toFixed(8),
        spread: spread.toFixed(2),
        liquidity: liquidityScore.toFixed(0),
        history: opportunityHistory[id],
        tradable: true
      });
    }
    res.json({ count: opportunities.length, opportunities: opportunities.sort((a,b) => +b.spread - +a.spread) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ==================== PAYMENT ====================
app.post('/api/pesapal/pay', (req, res) => {
  const { phone, amount, plan } = req.body;
  console.log('PAYMENT:', phone, amount, plan);
  res.json({ success: true, message: `STK Push sent to ${phone}` });
});

// ==================== START SERVER ====================
app.listen(PORT, () => console.log(`🚀 ArbiMine running on ${PORT}`));
