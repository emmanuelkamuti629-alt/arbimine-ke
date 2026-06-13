const ccxt = require('ccxt');
const Opportunity = require('../models/Opportunity');

const exchanges = [
  new ccxt.binance({ enableRateLimit: true }),
  new ccxt.kucoin({ enableRateLimit: true }),
  new ccxt.bybit({ enableRateLimit: true }),
  new ccxt.okx({ enableRateLimit: true })
];

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];

async function fetchRealNetworks(exchange, symbol) {
  try {
    await exchange.loadMarkets();
    const currency = symbol.split('/')[0];
    const currencies = await exchange.fetchCurrencies();
    const coinData = currencies[currency];
    if (!coinData ||!coinData.networks) return {};
    return coinData.networks;
  } catch (e) {
    console.log(`Network fetch failed for ${exchange.id}:`, e.message);
    return {};
  }
}

async function scanArbitrage() {
  console.log('Scanning real arbitrage opportunities...');
  for (const symbol of SYMBOLS) {
    let tickers = {};

    for (const ex of exchanges) {
      try {
        const ticker = await ex.fetchTicker(symbol);
        if (ticker.bid && ticker.ask) {
          tickers[ex.id] = { bid: ticker.bid, ask: ticker.ask };
        }
      } catch (e) { continue; }
    }

    const exIds = Object.keys(tickers);
    for (let i = 0; i < exIds.length; i++) {
      for (let j = 0; j < exIds.length; j++) {
        if (i === j) continue;
        const buyEx = exIds[i], sellEx = exIds[j];
        const buyPrice = tickers[buyEx].ask;
        const sellPrice = tickers[sellEx].bid;
        if (!buyPrice ||!sellPrice) continue;

        const spread = ((sellPrice - buyPrice) / buyPrice) * 100;
        if (spread < 0.5) continue;

        const buyExObj = exchanges.find(e => e.id === buyEx);
        const sellExObj = exchanges.find(e => e.id === sellEx);

        const withdrawNets = await fetchRealNetworks(buyExObj, symbol);
        const depositNets = await fetchRealNetworks(sellExObj, symbol);

        const commonNets = Object.keys(withdrawNets).filter(net =>
          depositNets[net] &&
          withdrawNets[net].withdraw === true &&
          depositNets[net].deposit === true
        );

        let liquidityScore = 0;
        try {
          const orderbook = await buyExObj.fetchOrderBook(symbol, 5);
          liquidityScore = orderbook.bids.slice(0, 3).reduce((sum, [p, q]) => sum + p * q, 0);
        } catch (e) {}

        await Opportunity.findOneAndUpdate(
          { symbol, buyExchange: buyEx, sellExchange: sellEx },
          {
            symbol, buyExchange: buyEx, sellExchange: sellEx,
            spread: spread.toFixed(2), buyPrice, sellPrice,
            tradable: commonNets.length > 0,
            networks: commonNets,
            liquidityScore,
            updatedAt: new Date(),
            $push: {
              spreadHistory: {
                $each: [{ value: spread, timestamp: new Date() }],
                $slice: -100
              }
            }
          },
          { upsert: true, new: true }
        );
      }
    }
  }
}

function startArbitrageScanner() {
  setInterval(scanArbitrage, 120000);
  scanArbitrage();
}

module.exports = { startArbitrageScanner };
