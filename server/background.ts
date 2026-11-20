import { db } from "./db";
import { storage } from "./storage";
import { instruments, latestPrices, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import WebSocket from "ws";
import { sendWinAlert } from "./sms";
import { isGlobalMarketOpen } from "@shared/market-hours";
import { broadcastPriceTick } from "./websocket";

const ZERODHA_API_KEY = process.env.ZERODHA_API_KEY || "";
const ZERODHA_ACCESS_TOKEN = process.env.ZERODHA_ACCESS_TOKEN || "";
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || ZERODHA_API_KEY || "";
const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY || "4a3bb708bb7247528d0efe958476bdaa";
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "d9c7kppr01qs0pv947ogd9c7kppr01qs0pv947p0";


function getFinalResult(trade: any, finalPrice: number) {
  const entryPrice = parseFloat(trade.strikePrice);
  const amount = parseFloat(trade.amount);
  const payout = parseFloat(trade.payoutRatio || "0.85");
  const type = trade.side;

  const profit = amount * payout;

  // Exact tie only when prices are identical
  if (Math.abs(finalPrice - entryPrice) < 0.0001) {
    return {
      result: "TIE",
      returnAmount: amount
    };
  }

  let isWin = false;
  if (type === "BUY") {
    isWin = finalPrice > entryPrice;
  } else {
    isWin = finalPrice < entryPrice;
  }

  return {
    result: isWin ? "WIN" : "LOSS",
    returnAmount: isWin ? amount + profit : 0
  };
}

let bgTick = 11;
export function startBackgroundTasks() {
  console.log("Starting API background tasks with Binance, AlphaVantage & TwelveData engines...");


  const LOGO_MAP: Record<string, string> = {
    "BTCUSD":   "https://assets.coincap.io/assets/icons/btc@2x.png",
    "BTCUSDT":  "https://assets.coincap.io/assets/icons/btc@2x.png",
    "ETHUSDT":  "https://assets.coincap.io/assets/icons/eth@2x.png",
    "BNBUSDT":  "https://assets.coincap.io/assets/icons/bnb@2x.png",
    "SOLUSDT":  "https://assets.coincap.io/assets/icons/sol@2x.png",
    "XRPUSDT":  "https://assets.coincap.io/assets/icons/xrp@2x.png",
    "DOGEUSDT": "https://assets.coincap.io/assets/icons/doge@2x.png",
    "ADAUSDT":  "https://assets.coincap.io/assets/icons/ada@2x.png",
    "AVAXUSDT": "https://assets.coincap.io/assets/icons/avax@2x.png",
    "LINKUSDT": "https://assets.coincap.io/assets/icons/link@2x.png",
    "XAUTUSDC": "https://assets.coincap.io/assets/icons/xaut@2x.png",
    "XAUTUSDT": "https://assets.coincap.io/assets/icons/xaut@2x.png",
  };

  async function fixCryptoLogos() {
    try {
      for (const [symbol, url] of Object.entries(LOGO_MAP)) {
        await db.update(instruments)
          .set({ imageUrl: url })
          .where(eq(instruments.symbol, symbol));
      }
      console.log("Crypto logo URLs updated to coincap.io");
    } catch (e) {
      console.error("Logo migration error:", e);
    }
  }
  fixCryptoLogos();

  let cryptoMap: Map<string, any> | null = null;
  const sparklinesCache = new Map<number, string[]>();

  async function refreshCryptoMap() {
    const allInstruments = await db.select().from(instruments);
    const map = new Map<string, any>();
    allInstruments.forEach((i: any) => {
      if (i.assetClass === "CRYPTO" || ["PAXGUSDT", "BTCUSD", "XAUTUSDC", "XAUTUSDT", "XAUUSD", "GOLD"].includes(i.symbol)) {
        map.set(i.symbol, i);
      }
    });
    cryptoMap = map;
  }

  async function fetchRealSparkline(instrument: any, currentPrice: number, changeAbs: number): Promise<string[]> {
    try {
      if (instrument.assetClass === "CRYPTO" || ["PAXGUSDT", "BTCUSD", "XAUTUSDC", "XAUTUSDT", "XAUUSD", "GOLD"].includes(instrument.symbol)) {
        const BINANCE_API_KEY = process.env.BINANCE_API_KEY || "4ZxKHsnocjAIQAVfcdfy1yh5Yf5AlfryUWa7cYmAlwbsSmAHwgNHnjIJHhBJGATW";
        const headers: Record<string, string> = { "X-MBX-APIKEY": BINANCE_API_KEY };
        let binSym = instrument.symbol;
        if (instrument.symbol === "BTCUSD") binSym = "BTCUSDT";
        else if (instrument.symbol === "ETHUSD") binSym = "ETHUSDT";
        else if (instrument.symbol === "SOLUSD") binSym = "SOLUSDT";
        else if (["XAUTUSDC", "XAUTUSDT", "XAUUSD", "GOLD"].includes(instrument.symbol)) binSym = "PAXGUSDT";
        const res = await fetch(`https://api3.binance.com/api/v3/klines?symbol=${binSym}&interval=15m&limit=60`, { headers });
        if (res.ok) {
          const data = await res.json() as any[];
          const closes = data.map(k => parseFloat(k[4]).toString());
          if (closes.length > 0) return closes;
        }
      } else {
        let sym = instrument.symbol;
        if (sym === "XAUUSD") sym = "PAXG-USD";
        else if (sym === "XAGUSD") sym = "SI=F";
        else if (sym === "WTIUSD") sym = "CL=F";
        else if (sym === "BANKNIFTY") sym = "^NSEBANK";
        else if (instrument.assetClass === "INDIAN_STOCK" || instrument.country === "IN" || ["HDFCBANK","ICICIBANK","SBIN","KOTAKBANK","AXISBANK","BANKBARODA"].includes(sym)) sym += ".NS";
        else if (instrument.assetClass === "FOREX") sym = sym + "=X";
        
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=15m&range=5d`);
        if (res.ok) {
          const data = await res.json() as any;
          const result = data?.chart?.result?.[0];
          if (result && result.indicators?.quote?.[0]?.close) {
            let closes = result.indicators.quote[0].close.filter((c: number | null) => c !== null).map((c: number) => c.toString());
            if (closes.length >= 60) return closes.slice(-60);
            if (closes.length > 0) return closes; 
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch real sparkline for", instrument.symbol, e);
    }
    return [];
  }

  async function updateCachedSparkline(instrument: any, currentPrice: number, changeAbs: number): Promise<string[]> {
    const instrumentId = instrument.id;
    let line = sparklinesCache.get(instrumentId);
    if (!line) {
      const [row] = await db.select().from(latestPrices).where(eq(latestPrices.instrumentId, instrumentId));
      line = (row?.sparkline as string[]) || [];
    }
    
    const lastPrice = line.length > 0 ? parseFloat(line[line.length - 1]) : currentPrice;
    const isWildlyOutdated = currentPrice > 0 && Math.abs(lastPrice - currentPrice) / currentPrice > 0.5;

    if (line.length < 60 || isWildlyOutdated) {
      line = await fetchRealSparkline(instrument, currentPrice, changeAbs);
    } else {
      line.push(currentPrice.toString());
      if (line.length > 60) line.shift();
    }
    sparklinesCache.set(instrumentId, line);
    return line;
  }

  let isBinanceGeoBlocked = false;
  
  function setupBinanceWebsocket() {
    if (isBinanceGeoBlocked) return;

    const ws = new WebSocket("wss://stream.binance.com:9443/stream?streams=!miniTicker@arr/paxgusdt@bookTicker");

    ws.on("open", async () => {
      console.log("Connected to live Binance WebSocket mirror for Cryptos & Gold (with BookTicker)!");
      await refreshCryptoMap();
    });

    ws.on("message", async (data: string) => {
      try {
        if (!cryptoMap) return;

        const payload = JSON.parse(data);

        // Real-time orderbook mid-price for Gold (PAXGUSDT / XAUUSD)
        if (payload.stream === "paxgusdt@bookTicker" && payload.data) {
          const b = parseFloat(payload.data.b);
          const a = parseFloat(payload.data.a);
          const spread = Math.abs(a - b);
          // Spread protection: if book spread is abnormal (> $2.00 or > 0.08%), use bid to prevent ask spikes
          const midPrice = (spread <= 2.0 && b > 0 && spread / b < 0.0008) ? (b + a) / 2 : b;
          const targets: any[] = [];
          if (cryptoMap.has("XAUTUSDC")) targets.push(cryptoMap.get("XAUTUSDC")!);
          if (cryptoMap.has("XAUTUSDT")) targets.push(cryptoMap.get("XAUTUSDT")!);
          if (cryptoMap.has("PAXGUSDT")) targets.push(cryptoMap.get("PAXGUSDT")!);
          if (cryptoMap.has("XAUUSD")) targets.push(cryptoMap.get("XAUUSD")!);
          if (cryptoMap.has("GOLD")) targets.push(cryptoMap.get("GOLD")!);

          for (const instrument of targets) {
            const instId = instrument.id;
            const newSparkline = await updateCachedSparkline(instrument, midPrice, 0);

            await db.update(latestPrices)
              .set({
                price: String(midPrice.toFixed(2)),
                sparkline: newSparkline,
                asOf: new Date(),
                isOpen: true
              })
              .where(eq(latestPrices.instrumentId, instId));

            broadcastPriceTick(instrument.symbol, midPrice);
          }
          broadcastPriceTick("XAUUSD", midPrice);
          return;
        }

        const events = payload.data || payload;
        if (!Array.isArray(events)) return;

        for (const ev of events) {
          const symbol = ev.s;
          const targets: any[] = [];
          if (cryptoMap.has(symbol)) targets.push(cryptoMap.get(symbol)!);

          if (symbol === "BTCUSDT" && cryptoMap.has("BTCUSD")) {
            targets.push(cryptoMap.get("BTCUSD")!);
          }
          if (symbol === "ETHUSDT" && cryptoMap.has("ETHUSD")) {
            targets.push(cryptoMap.get("ETHUSD")!);
          }
          if (symbol === "SOLUSDT" && cryptoMap.has("SOLUSD")) {
            targets.push(cryptoMap.get("SOLUSD")!);
          }

          for (const instrument of targets) {
            const instId = instrument.id;
            const price = parseFloat(ev.c);
            const openPrice = parseFloat(ev.o);
            const changeAbs = price - openPrice;
            const changePct = openPrice > 0 ? (changeAbs / openPrice) * 100 : 0;
            
            const newSparkline = await updateCachedSparkline(instrument, price, changeAbs);

            await db.update(latestPrices)
              .set({
                price: String(price),
                changeAbs: String(changeAbs),
                changePct: String(changePct),
                sparkline: newSparkline,
                asOf: new Date(),
                isOpen: true 
              })
              .where(eq(latestPrices.instrumentId, instId));

            broadcastPriceTick(instrument.symbol, price, changeAbs, changePct);
          }
        }
      } catch (err) { }
    });

    ws.on("close", () => {
      console.log("Binance WebSocket closed. Reconnecting in 5s...");
      setTimeout(setupBinanceWebsocket, 5000);
    });

    ws.on("error", (err) => {
     
      if (err.message.includes("451")) {
         console.warn("[Binance Connectivity] Switching to Institutional Stealth Fallback (Geo-blocked).");
         isBinanceGeoBlocked = true;
         ws.terminate();
         return;
      }
      console.error("Binance WS error:", err);
    });
  }

  function setupFinnhubWebsocket() {
    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "d9c7kppr01qs0pv947ogd9c7kppr01qs0pv947p0";
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);

    ws.on("open", async () => {
      console.log("Connected to live Finnhub WebSocket mirror for Forex & Silver!");
      const symbolsToSubscribe = ["BINANCE:PAXGUSDT", "OANDA:XAG_USD", "OANDA:EUR_USD", "OANDA:GBP_USD", "OANDA:USD_JPY"];
      for (const sym of symbolsToSubscribe) {
        ws.send(JSON.stringify({'type':'subscribe', 'symbol': sym}));
      }
    });

    ws.on("message", async (data: string) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "trade" && msg.data) {
          const allInstruments = await db.select().from(instruments).where(eq(instruments.isActive, true));
          for (const trade of msg.data) {
            const sym = trade.s; // e.g. "BINANCE:PAXGUSDT"
            let dbSym = "";
            if (sym === "BINANCE:PAXGUSDT") dbSym = "PAXGUSDT";
            else if (sym === "OANDA:XAG_USD") dbSym = "XAGUSD";
            else if (sym.startsWith("OANDA:")) dbSym = sym.replace("OANDA:", "").replace("_", "");
            
            if (!dbSym) continue;

            const instrument = allInstruments.find((i: any) => i.symbol === dbSym);
            if (instrument) {
              const price = parseFloat(trade.p);
              if (dbSym === "XAUUSD" && price < 3500) continue;

              // fetch previous close to compute change
              let changeAbs = 0;
              let changePct = 0;
              
              const [row] = await db.select().from(latestPrices).where(eq(latestPrices.instrumentId, instrument.id));
              if (row && row.price) {
                  const prevPrice = parseFloat(row.price);
                  changeAbs = price - prevPrice;
                  changePct = (changeAbs / prevPrice) * 100;
              }

              const newSparkline = await updateCachedSparkline(instrument, price, changeAbs);

              await db.update(latestPrices)
                .set({
                  price: String(price),
                  changeAbs: String(changeAbs),
                  changePct: String(changePct),
                  sparkline: newSparkline,
                  asOf: new Date(),
                  isOpen: true 
                })
                .where(eq(latestPrices.instrumentId, instrument.id));
            }
          }
        }
      } catch (err) {}
    });

    ws.on("close", () => {
      console.log("Finnhub WebSocket closed. Reconnecting in 5s...");
      setTimeout(setupFinnhubWebsocket, 5000);
    });
    
    ws.on("error", (err) => {
      console.error("Finnhub WS error:", err);
    });
  }

  function setupTwelveDataWebsocket() {
    try {
      const ws = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${TWELVEDATA_API_KEY}`);

      ws.on("open", () => {
        console.log("Connected to live TwelveData WebSocket mirror for Spot Gold & Forex!");
        ws.send(JSON.stringify({
          action: "subscribe",
          params: {
            symbols: "XAU/USD,XAG/USD,EUR/USD,GBP/USD,USD/JPY"
          }
        }));
      });

      ws.on("message", async (data: string) => {
        try {
          const msg = JSON.parse(data);
          if (msg.event === "price" && msg.symbol && msg.price) {
            const symRaw = msg.symbol.replace("/", "");
            const price = parseFloat(msg.price);
            if (isNaN(price) || price <= 0) return;

            const allInstruments = await db.select().from(instruments).where(eq(instruments.isActive, true));
            const instrument = allInstruments.find((i: any) => i.symbol === symRaw);
            if (instrument) {
              let changeAbs = 0;
              let changePct = 0;
              const [row] = await db.select().from(latestPrices).where(eq(latestPrices.instrumentId, instrument.id));
              if (row && row.price) {
                const prevPrice = parseFloat(row.price);
                changeAbs = price - prevPrice;
                changePct = prevPrice > 0 ? (changeAbs / prevPrice) * 100 : 0;
              }

              const newSparkline = await updateCachedSparkline(instrument, price, changeAbs);

              await db.update(latestPrices)
                .set({
                  price: String(price),
                  changeAbs: String(changeAbs.toFixed(4)),
                  changePct: String(changePct.toFixed(2)),
                  sparkline: newSparkline,
                  asOf: new Date(),
                  isOpen: true
                })
                .where(eq(latestPrices.instrumentId, instrument.id));
            }
          }
        } catch (err) {}
      });

      ws.on("close", () => {
        if (!isTwelveDataRateLimited) {
          console.log("TwelveData WebSocket closed. Reconnecting in 30s...");
          setTimeout(setupTwelveDataWebsocket, 30000);
        }
      });

      ws.on("error", (err) => {
        isTwelveDataRateLimited = true;
      });
    } catch (e) {
      console.error("TwelveData WS setup error:", e);
    }
  }

  let isTwelveDataRateLimited = true;

  refreshCryptoMap().then(() => {
    setupBinanceWebsocket();
    setupFinnhubWebsocket();
    if (!isTwelveDataRateLimited) {
      setupTwelveDataWebsocket();
    }
  });

  setInterval(async () => {
    try {
      const allInstruments = await db.select().from(instruments).where(eq(instruments.isActive, true));
    
      const activeInstruments = allInstruments.filter((i: any) => {
         if (i.assetClass === "CRYPTO") return isBinanceGeoBlocked;
         return true;
      });

      bgTick++;
      const shouldFetchTwelveData = (bgTick % 30) === 0;

      let callCount = 0;
      for (const instrument of activeInstruments) {
        let priceData = null;

        // Priority 0: Real Spot Gold (XAUUSD / PAXG) via Binance Paxos Gold Spot or TwelveData
        if (["XAUUSD", "GOLD", "PAXGUSDT", "XAUTUSDC", "XAUTUSDT"].includes(instrument.symbol)) {
          // 1. Direct Binance Paxos Gold Spot (Fastest, zero rate limits, authentic 1:1 match with chart candles)
          try {
            const bRes = await fetch("https://api3.binance.com/api/v3/ticker/24hr?symbol=PAXGUSDT", { signal: AbortSignal.timeout(2000) });
            if (bRes.ok) {
              const bData = await bRes.json() as any;
              if (bData && bData.lastPrice) {
                const mid = parseFloat(bData.lastPrice);
                const chg = parseFloat(bData.priceChange || "0");
                const chgPct = parseFloat(bData.priceChangePercent || "0");
                priceData = {
                  price: String(mid.toFixed(2)),
                  changeAbs: String(chg.toFixed(2)),
                  changePct: String(chgPct.toFixed(2))
                };
              }
            }
          } catch {}

          if (!priceData) {
            try {
              const bRes = await fetch("https://api3.binance.com/api/v3/ticker/bookTicker?symbol=PAXGUSDT", { signal: AbortSignal.timeout(2000) });
              if (bRes.ok) {
                const bData = await bRes.json() as any;
                if (bData && bData.bidPrice && bData.askPrice) {
                  const b = parseFloat(bData.bidPrice);
                  const a = parseFloat(bData.askPrice);
                  const spread = Math.abs(a - b);
                  const mid = (spread <= 2.0 && b > 0 && spread / b < 0.0008) ? (b + a) / 2 : b;
                  priceData = {
                    price: String(mid.toFixed(2)),
                    changeAbs: "0.00",
                    changePct: "0.00"
                  };
                }
              }
            } catch {}
          }

          // 2. TwelveData Spot Feed (Only if Binance was down & not rate limited)
          if (!priceData && shouldFetchTwelveData && TWELVEDATA_API_KEY && !isTwelveDataRateLimited) {
            try {
              const tdRes = await fetch(`https://api.twelvedata.com/quote?symbol=XAU/USD&apikey=${TWELVEDATA_API_KEY}`, { signal: AbortSignal.timeout(2500) });
              if (tdRes.ok) {
                const tdData = await tdRes.json() as any;
                if (!tdData.code) {
                  const px = parseFloat(tdData.close || tdData.price);
                  if (!isNaN(px) && px > 0) {
                    const chg = parseFloat(tdData.change || "0");
                    const chgPct = parseFloat(tdData.percent_change || "0");
                    priceData = {
                      price: String(px.toFixed(2)),
                      changeAbs: String(chg.toFixed(2)),
                      changePct: String(chgPct.toFixed(2))
                    };
                  }
                }
              }
            } catch {}
          }

          // 3. Fallback to Yahoo Finance Spot Gold (PAXG-USD)
          if (!priceData) {
            try {
              const yRes = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/PAXG-USD?interval=15m&range=1d", {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
                signal: AbortSignal.timeout(2500)
              });
              if (yRes.ok) {
                const yData = await yRes.json() as any;
                const result = yData.chart?.result?.[0];
                if (result) {
                  const meta = result.meta;
                  const px = meta ? parseFloat(meta.regularMarketPrice) : null;
                  if (px && !isNaN(px)) {
                    const prev = meta ? parseFloat(meta.previousClose || px) : px;
                    const chg = px - prev;
                    const chgPct = prev > 0 ? (chg / prev) * 100 : 0;
                    priceData = {
                      price: String(px.toFixed(2)),
                      changeAbs: String(chg.toFixed(2)),
                      changePct: String(chgPct.toFixed(2))
                    };
                  }
                }
              }
            } catch {}
          }
        } else if (instrument.symbol === "XAGUSD") {
          // Primary institutional feed for Silver: Yahoo Finance COMEX Silver (SI=F)
          try {
            const yRes = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/SI=F?interval=15m&range=1d", {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
            });
            if (yRes.ok) {
              const yData = await yRes.json() as any;
              const result = yData.chart?.result?.[0];
              if (result) {
                const meta = result.meta;
                const px = meta ? parseFloat(meta.regularMarketPrice) : null;
                if (px && !isNaN(px)) {
                  const prev = meta ? parseFloat(meta.previousClose || px) : px;
                  const chg = px - prev;
                  const chgPct = prev > 0 ? (chg / prev) * 100 : 0;
                  priceData = {
                    price: String(px.toFixed(4)),
                    changeAbs: String(chg.toFixed(4)),
                    changePct: String(chgPct.toFixed(2))
                  };
                }
              }
            }
          } catch {}
        } else if (instrument.assetClass === "FOREX") {
          const shouldFetch = (bgTick % 30 === 0) && (((bgTick / 30) % 36) === (callCount % 36));
          callCount++;
          
          if (shouldFetch && !isTwelveDataRateLimited) {
            try {
              let tdSym = instrument.symbol;
              if (instrument.symbol.length === 6) tdSym = `${instrument.symbol.substring(0,3)}/${instrument.symbol.substring(3,6)}`;

              const res = await fetch(`https://api.twelvedata.com/price?symbol=${tdSym}&apikey=${TWELVEDATA_API_KEY}`);
              const data = await res.json() as any;
              if (data && data.code === 429) {
                isTwelveDataRateLimited = true;
              } else if (data && data.price) {
                 let val = parseFloat(data.price);
                 priceData = { price: String(val), changeAbs: "0.01", changePct: "0.01" };
              }
            } catch (err) {}
          }

          // Fallback to Yahoo Finance Forex Proxy
          if (!priceData) {
            try {
              const ySym = `${instrument.symbol}=X`;
              const yRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=15m&range=1d`, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
              });
              if (yRes.ok) {
                const yData = await yRes.json() as any;
                const result = yData.chart?.result?.[0];
                if (result) {
                  const meta = result.meta;
                  const px = meta ? parseFloat(meta.regularMarketPrice) : null;
                  if (px && !isNaN(px)) {
                    const prev = meta ? parseFloat(meta.previousClose || px) : px;
                    const chg = px - prev;
                    const chgPct = prev > 0 ? (chg / prev) * 100 : 0;
                    priceData = {
                      price: String(px.toFixed(4)),
                      changeAbs: String(chg.toFixed(4)),
                      changePct: String(chgPct.toFixed(2))
                    };
                  }
                }
              }
            } catch {}
          }
        }

        if (!priceData && ["US_STOCK", "BANKING", "INDIAN_STOCK", "ETF", "MUTUAL_FUND"].includes(instrument.assetClass)) {
          // Priority 0: Finnhub Quote API (Primary Institutional Feed for US/Global Stocks)
          try {
            if (callCount < 1) {
              callCount++;
              const fhRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${instrument.symbol}&token=${FINNHUB_API_KEY}`, { signal: AbortSignal.timeout(2000) });
              if (fhRes.ok) {
                const fhData = await fhRes.json() as any;
                if (fhData && fhData.c && fhData.c > 0 && !fhData.error) {
                  priceData = {
                    price: String(Number(fhData.c).toFixed(4)),
                    changeAbs: String(Number(fhData.d || 0).toFixed(4)),
                    changePct: String(Number(fhData.dp || 0).toFixed(2)),
                  };
                }
              }
            }
          } catch {}

          // Priority 1: TwelveData Paced Fallback (max 1 call per 2.5 min cycle)
          if (!priceData && shouldFetchTwelveData && !isTwelveDataRateLimited && callCount < 2) {
            try {
              callCount++;
              const res = await fetch(`https://api.twelvedata.com/price?symbol=${instrument.symbol}&apikey=${TWELVEDATA_API_KEY}`, { signal: AbortSignal.timeout(2000) });
              const data = await res.json() as any;
              if (data && data.code === 429) {
                isTwelveDataRateLimited = true;
              } else if (data && data.price) {
                priceData = { price: String(data.price), changeAbs: "0.01", changePct: "0.01" };
              }
            } catch {}
          }
        }

        // Priority 2: Yahoo Finance Universal Live Proxy (Zero Rate Limit for Stocks, Forex & Indian Banking)
        if (!priceData && instrument.assetClass !== "CRYPTO") {
          try {
            let ySym = instrument.symbol;
            if (ySym === "XAUUSD") ySym = "PAXG-USD";
            else if (ySym === "XAGUSD") ySym = "SI=F";
            else if (ySym === "WTIUSD") ySym = "CL=F";
            else if (ySym === "BANKNIFTY") ySym = "^NSEBANK";
            else if (instrument.country === "IN" || ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK", "BANKBARODA"].includes(ySym)) ySym = `${ySym}.NS`;
            else if (instrument.assetClass === "FOREX") ySym = `${ySym}=X`;

            const yRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=15m&range=5d`, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
            });
            if (yRes.ok) {
              const yData = await yRes.json() as any;
              const result = yData.chart?.result?.[0];
              if (result) {
                const meta = result.meta;
                const closes = result.indicators?.quote?.[0]?.close?.filter((c: any) => c != null);
                const lastBarClose = (closes && closes.length > 0) ? parseFloat(closes[closes.length - 1]) : null;
                const px = lastBarClose || (meta ? parseFloat(meta.regularMarketPrice) : null);
                if (px && !isNaN(px)) {
                  const prev = meta ? parseFloat(meta.previousClose || px) : px;
                  const chg = px - prev;
                  const chgPct = prev > 0 ? (chg / prev) * 100 : 0;
                  priceData = {
                    price: String(px.toFixed(4)),
                    changeAbs: String(chg.toFixed(4)),
                    changePct: String(chgPct.toFixed(2))
                  };
                }
              }
            }
          } catch {}
        }

        // If no live price was fetched this tick, skip updating DB to prevent stale overwrites
        if (!priceData) {
          continue;
        }

        const isOpen = isGlobalMarketOpen(instrument.assetClass, instrument.symbol);

        // ── 24/7 CONTINUOUS LIQUIDITY & OTC SIMULATION ENGINE ──
        // Only when real-world spot exchanges are closed over the weekend or off-hours (`!isOpen`),
        // apply realistic institutional micro-liquidity so users can trade OTC 24/7. When `isOpen` is true, NEVER alter real prices!
        if (priceData && instrument.assetClass !== "CRYPTO" && !isOpen) {
          const now = new Date();
          const day = now.getUTCDay();
          const isWeekend = day === 0 || day === 6;
          if (isWeekend || Math.random() < 0.3) {
            const basePrice = parseFloat(priceData.price);
            const drift = (Math.random() - 0.50) * (basePrice * 0.00015); // unbiased micro-oscillation only during closed markets
            const simPrice = basePrice + drift;
            const prevPrice = parseFloat(priceData.price) - parseFloat(priceData.changeAbs || "0");
            const newChg = simPrice - (prevPrice || basePrice);
            const newChgPct = prevPrice > 0 ? (newChg / prevPrice) * 100 : 0;
            
            priceData = {
              price: String(simPrice.toFixed(4)),
              changeAbs: String(newChg.toFixed(4)),
              changePct: String(newChgPct.toFixed(2))
            };
          }
        }

        if (priceData) {
          const currentPrice = parseFloat(priceData.price);
          const changeAbs = parseFloat(priceData.changeAbs);
          const newSparkline = await updateCachedSparkline(instrument, currentPrice, changeAbs);

          console.log(`Updated ${instrument.symbol} to $${priceData.price} [Open: ${isOpen}]`);
          await db.update(latestPrices)
            .set({
              price: String(priceData.price),
              changeAbs: String(priceData.changeAbs),
              changePct: String(priceData.changePct),
              sparkline: newSparkline,
              asOf: new Date(),
              isOpen: true
            })
            .where(eq(latestPrices.instrumentId, instrument.id));

          broadcastPriceTick(instrument.symbol, currentPrice, changeAbs, parseFloat(priceData.changePct || "0"));
        } else {
            // Fallback safety
            const isOpen = isGlobalMarketOpen(instrument.assetClass, instrument.symbol);
            await db.update(latestPrices)
              .set({
                asOf: new Date(),
                isOpen: true
              })
              .where(eq(latestPrices.instrumentId, instrument.id));
        }

      }
    } catch (e) {
      console.error("Error fetching background info", e);
    }
  }, 5000); 

  setTimeout(() => {
    try {
      console.log("Running initial institutional background api fetch for stocks...");
      (async () => {
        const allInstruments = await db.select().from(instruments).where(eq(instruments.isActive, true));
        const stockInstruments = allInstruments.filter((i: any) => i.assetClass !== "CRYPTO");
        for (const instrument of stockInstruments) {
          let priceData = null;
          if (["US_STOCK", "ETF", "MUTUAL_FUND"].includes(instrument.assetClass)) {
            // Priority 0: Finnhub Quote API
            try {
              const fhRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${instrument.symbol}&token=${FINNHUB_API_KEY}`);
              const fhData = await fhRes.json() as any;
              if (fhData && fhData.c && fhData.c > 0 && !fhData.error) {
                priceData = {
                  price: String(Number(fhData.c).toFixed(4)),
                  changeAbs: String(Number(fhData.d || 0).toFixed(4)),
                  changePct: String(Number(fhData.dp || 0).toFixed(2)),
                };
              }
            } catch {}

            if (!priceData) {
              try {
                const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${instrument.symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`);
                const data = await res.json() as any;
                if (data && data["Global Quote"] && data["Global Quote"]["05. price"]) {
                  priceData = {
                    price: String(data["Global Quote"]["05. price"]),
                    changeAbs: String(data["Global Quote"]["09. change"]),
                    changePct: String(data["Global Quote"]["10. change percent"].replace("%", "")),
                  };
                }
              } catch {}
            }
          } else if (instrument.assetClass === "FOREX") {
            // Yahoo finance handles rapid queries fine, but we let background loop handle it
            continue;
          }
          if (priceData) {
            const currentPrice = parseFloat(priceData.price);
            const changeAbs = parseFloat(priceData.changeAbs);
            const newSparkline = await updateCachedSparkline(instrument, currentPrice, changeAbs);

            console.log(`Initial fetch: Updated ${instrument.symbol} to $${priceData.price}`);
            await db.update(latestPrices)
              .set({
                price: String(priceData.price),
                changeAbs: String(priceData.changeAbs),
                changePct: String(priceData.changePct) || "0",
                sparkline: newSparkline,
                asOf: new Date()
              })
              .where(eq(latestPrices.instrumentId, instrument.id));
          }
        }
      })();
    } catch (err) { }
  }, 5000);

  // 3. Time-Based Order Execution Engine
  // Checks every second for any expired ACTIVE time-based trades
  setInterval(async () => {
    try {
      const activeTrades = await storage.getActiveTimeBasedOrders();
      if (!activeTrades || activeTrades.length === 0) return;

      const now = Date.now();
      console.log(`[Engine] Found ${activeTrades.length} active trades.`);
      for (const trade of activeTrades) {
        const tradeExpires = new Date(trade.expiresAt).getTime();
        console.log(`[Engine] Trade #${trade.id} expires at ${tradeExpires}, now is ${now}. Expired? ${now >= tradeExpires}`);
        if (now >= tradeExpires) {
          // Time expired, let's settle it!
          const [priceRow] = await db.select().from(latestPrices).where(eq(latestPrices.instrumentId, trade.instrumentId));
          if (!priceRow || !priceRow.price) continue;

          let currentPrice = parseFloat(priceRow.price as string);
          
          const { result, returnAmount } = getFinalResult(trade, currentPrice);

          await storage.updateTimeBasedOrder(trade.id, {
            status: result as any, // "WIN" | "LOSS"
            settlePrice: currentPrice.toString(),
          });
          
          if ((result === "WIN" || result === "TIE") && returnAmount > 0) {
             try {
                // Determine which balance to credit: check the trade's deduction transaction for mode
                const txs = await storage.getWalletTransactions(trade.userId);
                const deductTx = txs.find(t => t.referenceId === String(trade.id) && t.type === "TRADE_DEDUCTION");
                const tradeMode = (deductTx as any)?.mode ?? "REAL";

                if (tradeMode === "DEMO") {
                  await storage.updateDemoBalance(trade.userId, returnAmount);
                } else {
                  await storage.updateWalletBalance(trade.userId, returnAmount);
                }

                await storage.createWalletTransaction({
                   userId: trade.userId, 
                   type: result === "WIN" ? "TRADE_WIN" : "TRADE_REFUND", 
                   amount: String(returnAmount),
                   status: "SUCCESS", 
                   referenceId: String(trade.id), 
                   mode: tradeMode
                } as any);

                // Send SMS Win Notification only for actual wins
                if (result === "WIN") {
                  try {
                    const user = await storage.getUser(trade.userId);
                    if (user && user.phoneNumber) {
                      await sendWinAlert(user.phoneNumber, returnAmount.toFixed(2));
                    }
                  } catch (smsErr) {
                    console.error("SMS notification failed:", smsErr);
                  }
                }
             } catch(err) { console.error("Wallet payout failed for trade:", trade.id, err); }
          }

          // ── AI ROUND PROFIT/LOSS TRACKING (NON-ADMINS) ──
          try {
            const user = await storage.getUser(trade.userId);
            const isAdmin = ["saran123@gmail.com", "htctrade123@gmail.com"].includes((user?.email || "").toLowerCase());
            
            if (user && !isAdmin && trade.placedBy === "AI_BOT") {
               const isWin = result === "WIN";
               const profit = isWin 
                  ? (returnAmount - parseFloat(trade.amount as string)) 
                  : -parseFloat(trade.amount as string);
               
               let currentPnl = parseFloat(user.autoInvestRoundPnl as string) + profit;
               let currentRound = user.autoInvestRound;
               
               let roundProfitLimit = 50.00;
               let roundLossLimit = 20.00;

               if (currentRound === 2) {
                  roundProfitLimit = 45.00;
                  roundLossLimit = 20.00;
               } else if (currentRound >= 3) {
                  roundProfitLimit = 35.00;
                  roundLossLimit = 15.00;
               }

               let autoTradeEnabled = user.autoTradeEnabled;

               // Target Reached -> Next Round
               if (currentPnl >= roundProfitLimit) {
                  currentRound++;
                  currentPnl = 0; // Reset for next tier
               }

               // Loss Limit Breach -> STOP
               if (currentPnl <= -roundLossLimit) {
                  autoTradeEnabled = false;
                  console.log(`[AI Protection] User ${user.email} Round ${currentRound} STOP LOSS BREACH (-$${Math.abs(currentPnl)})`);
               }

               await db.update(users).set({ 
                  autoInvestRound: currentRound,
                  autoInvestRoundPnl: String(currentPnl),
                  autoTradeEnabled
               }).where(eq(users.id, user.id));
            }
          } catch (pnlErr) {
            console.error("AI PnL Tracking Error:", pnlErr);
          }
          
          console.log(`Resolved Time Trade #${trade.id}: ${trade.side} @ ${trade.strikePrice} -> Settle ${currentPrice} = ${result}`);
        }
      }
    } catch (err) {
      console.error("Execution engine error:", err);
    }
  }, 1000);
}
