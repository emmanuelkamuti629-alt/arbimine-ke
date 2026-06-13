require('dotenv').config();

const express = require('express');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit:'2mb' }));
app.use(express.static(path.join(__dirname,'public')));

/*
========================================
MONGODB
========================================
*/

if(process.env.MONGO_URI){

    mongoose.connect(process.env.MONGO_URI)

    .then(()=>{

        console.log('✅ MongoDB Connected');

    })

    .catch(err=>{

        console.log(
            '❌ MongoDB Error:',
            err.message
        );
    });

}else{

    console.log(
        '⚠️ No MONGO_URI found in .env'
    );
}

/*
========================================
USER MODEL
========================================
*/

const User = mongoose.model('User',{

    username:{
        type:String,
        unique:true
    },

    email:String,

    mpesa:String,

    passwordHash:String,

    plan:{
        type:String,
        default:'free'
    },

    createdAt:{
        type:Date,
        default:Date.now
    }
});

/*
========================================
MEMORY
========================================
*/

const sessions = {};
const opportunityHistory = {};
global.latestOpportunities = [];

/*
========================================
HELPERS
========================================
*/

function hashPassword(password){

    return crypto
    .createHash('sha256')
    .update(password)
    .digest('hex');
}

function generateToken(){

    return crypto
    .randomBytes(32)
    .toString('hex');
}

async function safeGet(url,name){

    try{

        const res = await axios.get(url,{

            timeout:20000,

            headers:{
                'User-Agent':'Mozilla/5.0'
            }
        });

        return res.data;

    }catch(err){

        console.log(
            `${name} FAILED:`,
            err.message
        );

        return null;
    }
}

function auth(req,res,next){

    try{

        const token =
        req.headers.authorization;

        if(!token){

            return res.status(401).json({
                error:'Unauthorized'
            });
        }

        const username =
        sessions[token];

        if(!username){

            return res.status(401).json({
                error:'Invalid session'
            });
        }

        req.username = username;

        next();

    }catch{

        return res.status(401).json({
            error:'Unauthorized'
        });
    }
}

/*
========================================
EXCHANGES
========================================
*/

const EXCHANGES = {

    mexc:
    'https://api.mexc.com/api/v3/ticker/24hr',

    kucoin:
    'https://api.kucoin.com/api/v1/market/allTickers',

    bitmart:
    'https://api-cloud.bitmart.com/spot/v1/ticker',

    bitget:
    'https://api.bitget.com/api/spot/v1/market/tickers',

    gateio:
    'https://api.gateio.ws/api/v4/spot/tickers',

    okx:
    'https://www.okx.com/api/v5/market/tickers?instType=SPOT',

    bybit:
    'https://api.bybit.com/v5/market/tickers?category=spot',

    htx:
    'https://api.huobi.pro/market/tickers',

    bitfinex:
    'https://api-pub.bitfinex.com/v2/tickers?symbols=ALL',

    cryptocom:
    'https://api.crypto.com/exchange/v1/public/get-tickers'
};

/*
========================================
REAL NETWORK APIS
========================================
*/

const NETWORK_APIS = {

    kucoin:
    'https://api.kucoin.com/api/v3/currencies'
};

const networkCache = {};

/*
========================================
LOAD NETWORKS
========================================
*/

async function loadNetworks(){

    const exchanges =
    Object.keys(NETWORK_APIS);

    await Promise.all(

        exchanges.map(async(ex)=>{

            try{

                const data =
                await safeGet(
                    NETWORK_APIS[ex],
                    `${ex}-networks`
                );

                networkCache[ex] = data;

                console.log(
                    `✅ ${ex} networks loaded`
                );

            }catch(err){

                console.log(
                    `❌ ${ex} network error`,
                    err.message
                );
            }
        })
    );
}

/*
========================================
PARSE NETWORKS
========================================
*/

function parseNetworks(exchange,symbol){

    const data =
    networkCache[exchange];

    if(!data){

        return [{
            network:'Unknown',
            withdrawEnable:false,
            depositEnable:false,
            withdrawFee:'Unknown',
            confirmations:0,
            estimatedArrival:'Unknown'
        }];
    }

    try{

        /*
        ========================================
        KUCOIN REAL NETWORKS
        ========================================
        */

        if(exchange === 'kucoin'){

            const coin =
            data.data?.find(
                c => c.currency === symbol
            );

            if(!coin){

                return [{
                    network:'Unknown',
                    withdrawEnable:false,
                    depositEnable:false,
                    withdrawFee:'Unknown',
                    confirmations:0,
                    estimatedArrival:'Unknown'
                }];
            }

            return coin.chains.map(n=>({

                network:
                n.chainName,

                withdrawEnable:
                n.isWithdrawEnabled,

                depositEnable:
                n.isDepositEnabled,

                withdrawFee:
                n.withdrawalMinFee,

                confirmations:
                n.confirms,

                estimatedArrival:
                `${n.confirms || 0} confirmations`
            }));
        }

        /*
        ========================================
        OTHER EXCHANGES
        ========================================
        */

        return [{
            network:'Unknown',
            withdrawEnable:false,
            depositEnable:false,
            withdrawFee:'Unknown',
            confirmations:0,
            estimatedArrival:'Unknown'
        }];

    }catch(err){

        console.log(
            'NETWORK PARSE ERROR:',
            err.message
        );

        return [{
            network:'Unknown',
            withdrawEnable:false,
            depositEnable:false,
            withdrawFee:'Unknown',
            confirmations:0,
            estimatedArrival:'Unknown'
        }];
    }
}

/*
========================================
REGISTER
========================================
*/

app.post('/api/register',
async(req,res)=>{

    try{

        const {
            username,
            email,
            mpesa,
            password
        } = req.body;

        if(
            !username ||
            !email ||
            !mpesa ||
            !password
        ){

            return res.status(400).json({
                error:'All fields required'
            });
        }

        const exists =
        await User.findOne({
            username
        });

        if(exists){

            return res.status(409).json({
                error:'User already exists'
            });
        }

        const user =
        await User.create({

            username,
            email,
            mpesa,

            passwordHash:
            hashPassword(password)
        });

        const token =
        generateToken();

        sessions[token] =
        user.username;

        res.json({

            success:true,
            autoLogin:true,
            token,

            username:
            user.username
        });

    }catch(err){

        res.status(500).json({
            error:err.message
        });
    }
});

/*
========================================
LOGIN
========================================
*/

app.post('/api/login',
async(req,res)=>{

    try{

        const {
            username,
            password
        } = req.body;

        const user =
        await User.findOne({
            username
        });

        if(
            !user ||
            user.passwordHash !==
            hashPassword(password)
        ){

            return res.status(401).json({
                error:'Invalid credentials'
            });
        }

        const token =
        generateToken();

        sessions[token] =
        user.username;

        res.json({

            success:true,
            token,

            username:
            user.username
        });

    }catch(err){

        res.status(500).json({
            error:err.message
        });
    }
});

/*
========================================
PROFILE
========================================
*/

app.get(
'/api/me',
auth,
async(req,res)=>{

    try{

        const user =
        await User.findOne({

            username:
            req.username
        });

        if(!user){

            return res.status(404).json({
                error:'User not found'
            });
        }

        res.json({

            username:
            user.username,

            email:
            user.email,

            mpesa:
            user.mpesa,

            plan:
            user.plan,

            createdAt:
            user.createdAt
        });

    }catch(err){

        res.status(500).json({
            error:err.message
        });
    }
});

/*
========================================
EXTRACT SYMBOL
========================================
*/

function extractSymbol(exchange,symbol,t){

    let sym = null;
    let price = null;
    let volume = 0;

    try{

        if(
            exchange === 'mexc' &&
            symbol?.endsWith('USDT')
        ){

            sym =
            symbol.replace(
                'USDT',
                ''
            );

            price =
            +t.lastPrice;

            volume =
            +t.quoteVolume;
        }

        else if(exchange === 'kucoin'){

            sym =
            t.symbol?.replace(
                '-USDT',
                ''
            );

            price =
            +t.last;

            volume =
            +t.volValue;
        }

        else if(exchange === 'bitmart'){

            sym =
            t.symbol?.replace(
                '_USDT',
                ''
            );

            price =
            +t.last_price;

            volume =
            +t.quote_volume;
        }

        else if(exchange === 'bitget'){

            sym =
            t.symbol?.replace(
                'USDT',
                ''
            );

            price =
            +t.close;

            volume =
            +t.usdtVol;
        }

        else if(exchange === 'gateio'){

            sym =
            t.currency_pair?.replace(
                '_USDT',
                ''
            );

            price =
            +t.last;

            volume =
            +t.quote_volume;
        }

        else if(exchange === 'okx'){

            sym =
            t.instId?.replace(
                '-USDT',
                ''
            );

            price =
            +t.last;

            volume =
            +t.volCcy24h;
        }

        else if(exchange === 'bybit'){

            sym =
            t.symbol?.replace(
                'USDT',
                ''
            );

            price =
            +t.lastPrice;

            volume =
            +t.turnover24h;
        }

        else if(exchange === 'htx'){

            sym =
            t.symbol
            ?.replace('usdt','')
            .toUpperCase();

            price =
            +t.close;

            volume =
            +t.vol;
        }

        else if(exchange === 'bitfinex'){

            if(
                Array.isArray(t) &&
                t[0]?.startsWith('t')
            ){

                sym =
                t[0]
                .replace('t','')
                .replace('USD','');

                price =
                +t[7];

                volume =
                +t[8];
            }
        }

        else if(exchange === 'cryptocom'){

            const inst =
            t.i;

            if(
                inst?.includes('_USDT')
            ){

                sym =
                inst.replace(
                    '_USDT',
                    ''
                );

                price =
                +t.a;

                volume =
                +t.v;
            }
        }

        if(
            !sym ||
            !price ||
            isNaN(price)
        ) return null;

        return {

            symbol:sym,
            price,
            volume
        };

    }catch{

        return null;
    }
}

/*
========================================
UTILS
========================================
*/

function formatLiquidity(v){

    if(!v) return 0;

    return Number(v.toFixed(2));
}

const MIN_PROFIT = 0.2;
const MAX_PROFIT = 100;

/*
========================================
OPPORTUNITIES
========================================
*/

app.get(
'/api/opportunities',
auth,
async(req,res)=>{

    try{

        const results =
        await Promise.all(

            Object.entries(
                EXCHANGES
            ).map(

                ([name,url])=>
                safeGet(url,name)
            )
        );

        const allData = {};

        Object.keys(EXCHANGES)
        .forEach(ex=>{

            allData[ex] = {};
        });

        results.forEach((data,idx)=>{

            const ex =
            Object.keys(EXCHANGES)[idx];

            if(!data) return;

            let tickers = [];

            if(ex === 'mexc')
            tickers = data;

            else if(ex === 'kucoin')
            tickers =
            data.data?.ticker || [];

            else if(ex === 'bitmart')
            tickers =
            data.data?.tickers || [];

            else if(ex === 'bitget')
            tickers =
            data.data || [];

            else if(ex === 'gateio')
            tickers = data;

            else if(ex === 'okx')
            tickers =
            data.data || [];

            else if(ex === 'bybit')
            tickers =
            data.result?.list || [];

            else if(ex === 'htx')
            tickers =
            data.data || [];

            else if(ex === 'bitfinex')
            tickers = data || [];

            else if(ex === 'cryptocom')
            tickers =
            data.result?.data || [];

            for(const t of tickers){

                const key =

                    t.symbol ||
                    t.currency_pair ||
                    t.instId ||
                    t.market ||
                    t.i ||
                    '';

                const d =
                extractSymbol(
                    ex,
                    key,
                    t
                );

                if(!d) continue;

                allData[ex][d.symbol] = d;
            }
        });

        const symbols =
        new Set();

        Object.values(allData)
        .forEach(ex=>{

            Object.keys(ex)
            .forEach(s=>{

                symbols.add(s);
            });
        });

        const opportunities = [];

        for(const symbol of symbols){

            const prices = [];

            for(const ex in allData){

                if(
                    allData[ex][symbol]
                ){

                    prices.push([

                        ex,
                        allData[ex][symbol]
                    ]);
                }
            }

            if(prices.length < 2)
            continue;

            prices.sort(
                (a,b)=>
                a[1].price -
                b[1].price
            );

            const [
                buyEx,
                buy
            ] = prices[0];

            const [
                sellEx,
                sell
            ] =
            prices[
                prices.length - 1
            ];

            const spread =
            (
                (
                    sell.price -
                    buy.price
                )
                /
                buy.price
            ) * 100;

            if(
                spread < MIN_PROFIT ||
                spread > MAX_PROFIT
            ) continue;

            const buyNetworks =
            parseNetworks(
                buyEx,
                symbol
            );

            const sellNetworks =
            parseNetworks(
                sellEx,
                symbol
            );

            const tradable =

            buyNetworks.some(
                n => n.withdrawEnable
            )

            &&

            sellNetworks.some(
                n => n.depositEnable
            );

            const id =
            `${symbol}-${buyEx}-${sellEx}`;

            opportunityHistory[id] =
            opportunityHistory[id] || [];

            opportunityHistory[id].push({

                time:Date.now(),

                spread:
                +spread.toFixed(2)
            });

            if(
                opportunityHistory[id]
                .length > 50
            ){

                opportunityHistory[id]
                .shift();
            }

            opportunities.push({

                id,

                symbol,

                buyExchange:
                buyEx.toUpperCase(),

                sellExchange:
                sellEx.toUpperCase(),

                buyPrice:
                buy.price.toFixed(8),

                sellPrice:
                sell.price.toFixed(8),

                spread:
                spread.toFixed(2),

                tradable,

                liquidity:{

                    buyVolume:
                    formatLiquidity(
                        buy.volume
                    ),

                    sellVolume:
                    formatLiquidity(
                        sell.volume
                    )
                },

                estimatedTransferTime:

                buyNetworks[0]
                ?.estimatedArrival
                || 'Unknown',

                buyNetworks,

                sellNetworks,

                history:
                opportunityHistory[id]
            });
        }

        opportunities.sort(
            (a,b)=>
            +b.spread -
            +a.spread
        );

        global.latestOpportunities =
        opportunities;

        res.json({

            success:true,

            count:
            opportunities.length,

            opportunities
        });

    }catch(err){

        res.status(500).json({
            error:err.message
        });
    }
});

/*
========================================
OPPORTUNITY DETAILS
========================================
*/

app.get(
'/api/opportunity/:id',
auth,
(req,res)=>{

    try{

        const id =
        req.params.id;

        const opportunity =
        global.latestOpportunities
        .find(
            o => o.id === id
        );

        if(!opportunity){

            return res.status(404).json({
                error:'Opportunity not found'
            });
        }

        res.json({

            success:true,

            ...opportunity
        });

    }catch(err){

        res.status(500).json({
            error:err.message
        });
    }
});

/*
========================================
PAYMENT
========================================
*/

app.post(
'/api/payhero/pay',
auth,
async(req,res)=>{

    try{

        const {
            phone,
            amount,
            plan
        } = req.body;

        res.json({

            success:true,

            message:
            'Payment initiated',

            phone,
            amount,
            plan
        });

    }catch(err){

        res.status(500).json({
            error:err.message
        });
    }
});

/*
========================================
REFRESH NETWORKS
========================================
*/

setInterval(async()=>{

    await loadNetworks();

    console.log(
        '✅ Network cache refreshed'
    );

},1000 * 60 * 5);

loadNetworks();

/*
========================================
FRONTEND
========================================
*/

app.use((req,res)=>{

    res.sendFile(

        path.join(
            __dirname,
            'public',
            'index.html'
        )
    );
});

/*
========================================
START
========================================
*/

app.listen(PORT,()=>{

    console.log(
        `🚀 ArbiMine running on ${PORT}`
    );
});
