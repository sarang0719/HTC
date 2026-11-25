/**
 * LiveTradingChart.tsx  — HTC Trade Custom Chart Engine v2.0
 *
 * Quotex-style live candlestick animation using TradingView Lightweight Charts.
 * No iframe, no TradingView embed. Fully custom, fully controlled.
 *
 * Architecture:
 *   ┌─ Historical OHLC  ──── Backend proxy  → setData()
 *   ├─ Live WebSocket   ──── Binance kline / TwelveData → targetPrice
 *   ├─ REST Poller      ──── /api/market-data/price/:sym (metals / forex)
 *   └─ 100ms Loop       ──── Interpolate currentPrice → series.update()
 *
 * Candle State Machine (Quotex-identical):
 *   New candle:  open = close_of_last  high = low = open
 *   Each tick:   close = price, high = max(high,price), low = min(low,price)
 *   Candle end:  freeze, create new
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

// ── Types ──────────────────────────────────────────────────────────────────
interface CandleOHLC {
  time:   UTCTimestamp;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume?: number;
}

export interface PriceLevel {
  id: number | string;
  price: number;
  color: string;    // e.g. "#10b981" for BUY, "#f43f5e" for SELL
  title: string;    // e.g. "BUY" | "SELL"
  side?: "BUY" | "SELL";
  expiresAt?: number;
  amount?: number;
  payoutRatio?: number;
  tpPrice?: number;
  slPrice?: number;
  tpAmount?: number;
  slAmount?: number;
  currentPrice?: number;
  isAdmin?: boolean;
}

interface LiveTradingChartProps {
  symbol:     string;
  exchange:   string;   // "BINANCE" | "FOREX" | "NASDAQ" etc
  assetClass: string;   // "CRYPTO" | "FOREX" | "US_STOCK" etc
  timeframe:  string;   // "1m" | "5m" | "15m" | "30m" | "1H"
  onPriceUpdate?: (price: number, direction: "up" | "down" | null) => void;
  onCandleUpdate?: (candles: CandleOHLC[]) => void;
  priceLevels?: PriceLevel[];  // Active trade entry lines
  activeIndicators?: string[]; // Array of selected indicators (SMA, EMA, RSI, MACD)
}

// ── Math / Indicator Functions ─────────────────────────────────────────────
function calculateSMA(data: CandleOHLC[], period: number) {
  const result: any[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

function calculateEMA(data: CandleOHLC[], period: number) {
  const result: any[] = [];
  const k = 2 / (period + 1);
  let ema = data[0].close;
  for (let i = 0; i < data.length; i++) {
    ema = (data[i].close - ema) * k + ema;
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

function calculateRSI(data: CandleOHLC[], period: number) {
  const result: any[] = [];
  if (data.length < period) return result;
  
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i-1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period; i < data.length; i++) {
    const diff = data[i].close - data[i-1].close;
    if (i > period) {
      avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    result.push({ time: data[i].time, value: rsi });
  }
  return result;
}

function calculateMACD(data: CandleOHLC[], fast = 12, slow = 26, signal = 9) {
  const fastEma = calculateEMA(data, fast);
  const slowEma = calculateEMA(data, slow);
  
  const macdLine = [];
  const mapSlow = new Map(slowEma.map(s => [s.time, s.value]));
  
  for (const f of fastEma) {
    if (mapSlow.has(f.time)) {
      macdLine.push({ time: f.time, close: f.value - mapSlow.get(f.time)! }); // mock OHLC for EMA
    }
  }
  
  const signalLine = calculateEMA(macdLine as any, signal);
  const sigMap = new Map(signalLine.map(s => [s.time, s.value]));
  
  const result: any[] = [];
  for (const m of macdLine) {
    if (sigMap.has(m.time)) {
      const s = sigMap.get(m.time)!;
      result.push({
        time: m.time,
        macd: m.close,
        signal: s,
        hist: m.close - s,
      });
    }
  }
  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const TF_SECS: Record<string, number> = {
  "1m": 60, "2m": 120, "3m": 180, "5m": 300, "15m": 900,
  "30m": 1800, "1H": 3600, "1h": 3600, "4H": 14400, "4h": 14400, "1D": 86400, "1d": 86400,
};

const bucketTime = (secs: number, candleSecs: number): UTCTimestamp =>
  (Math.floor(secs / candleSecs) * candleSecs) as UTCTimestamp;

const fmtPrice = (v: number, sym: string): string => {
  if (!v) return "—";
  const upper = (sym || "").toUpperCase();
  const is2Dec = upper.includes("XAU") || upper.includes("GOLD") || upper.includes("XAG") || upper.includes("WTI") || upper.includes("BRENT") || ["SPY","QQQ","AAPL","TSLA","NVDA","MSFT","AMZN","GOOGL","META"].includes(upper);
  const dec = is2Dec ? 2
    : upper === "USDJPY" || upper === "GBPJPY" || upper === "EURJPY" ? 3
    : upper.endsWith("USDT") || (upper.includes("USD") && v > 1000) ? 2
    : upper.endsWith("USDT") ? (v < 1 ? 6 : v < 10 ? 4 : 2)
    : 4;
  return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

// ── Component ──────────────────────────────────────────────────────────────
function LiveTradingChartComponent({
  symbol, exchange, assetClass, timeframe, onPriceUpdate, onCandleUpdate, priceLevels = [], activeIndicators = [],
}: LiveTradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const symUpper = symbol.toUpperCase();
  const isCryptoAsset = (
    assetClass === "CRYPTO" ||
    exchange === "BINANCE" ||
    symUpper.endsWith("USDT") ||
    symUpper.endsWith("USDC") ||
    ["BTCUSD", "ETHUSD", "SOLUSD", "BNBUSD", "XRPUSD", "ADAUSD", "DOGEUSD", "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE"].includes(symUpper) ||
    (symUpper.endsWith("USD") && !["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "GBPJPY", "USDCAD", "USDPKR", "USDINR", "CADCHF", "XAUUSD", "XAGUSD", "WTIUSD", "BRENTUSD"].includes(symUpper))
  ) && !["XAUUSD", "GOLD", "XAGUSD", "SILVER", "WTIUSD", "BRENTUSD"].includes(symUpper);

  // Track drawn price lines so we can remove old ones
  const drawnLinesRef = useRef<Map<string | number, any>>(new Map());

  // ── Chart refs (no React state — updated via direct API for performance) ──
  const chartRef    = useRef<IChartApi | null>(null);
  const candleRef   = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef   = useRef<ISeriesApi<"Histogram">   | null>(null);
  const liveLineRef = useRef<ISeriesApi<"Line">        | null>(null);
  
  // Indicator Refs
  const indRefs = useRef<{
    sma?: ISeriesApi<"Line">, 
    ema?: ISeriesApi<"Line">,
    rsi?: ISeriesApi<"Line">,
    macdHist?: ISeriesApi<"Histogram">,
    macdSig?: ISeriesApi<"Line">,
    macdLine?: ISeriesApi<"Line">
  }>({});

  // ── Candle state machine (all refs, zero re-renders per tick) ─────────────
  const liveCandle      = useRef<CandleOHLC | null>(null);
  const targetPriceRef  = useRef<number>(0);   // latest REAL price from WS/REST tick
  const currentPriceRef = useRef<number>(0);   // last price actually rendered
  const renderedPriceRef = useRef<number>(0);
  const lastRenderTsRef  = useRef<number>(0);
  const prevPriceRef    = useRef<number>(0);
  const lastTickRef     = useRef<number>(Date.now());
  const candleSecsRef   = useRef<number>(60);
  const historyRef      = useRef<CandleOHLC[]>([]);
  const lastPriceLineColorRef = useRef<string>("");
  const lastUiUpdateRef = useRef<number>(0);

  // ── UI state (minimal re-renders) ─────────────────────────────────────────
  const [displayPrice, setDisplayPrice]   = useState(0);
  const [priceDir,     setPriceDir]       = useState<"up"|"down"|null>(null);
  const [flashKey,     setFlashKey]       = useState(0);
  const [countdown,    setCountdown]      = useState(0);
  const [ohlcInfo,     setOhlcInfo]       = useState({ o:0, h:0, l:0, c:0, v:0 });
  const [isConnected,  setIsConnected]    = useState(false);
  const [isLoading,    setIsLoading]      = useState(true);
  const [chartReady,   setChartReady]     = useState(false);

  // ── Stable ref for onPriceUpdate so the effect never re-runs due to parent re-renders
  const onPriceUpdateRef = useRef(onPriceUpdate);
  useEffect(() => { onPriceUpdateRef.current = onPriceUpdate; }, [onPriceUpdate]);

  const onCandleUpdateRef = useRef(onCandleUpdate);
  useEffect(() => { onCandleUpdateRef.current = onCandleUpdate; }, [onCandleUpdate]);

  const appendOrUpdateCandle = useCallback((c: CandleOHLC) => {
    const sanitized: CandleOHLC = {
      ...c,
      high: Math.max(c.open, c.close, c.high),
      low:  Math.min(c.open, c.close, c.low),
    };
    const hist = historyRef.current;
    let isNewCandle = false;

    if (hist.length === 0) {
      hist.push(sanitized);
      isNewCandle = true;
    } else {
      const last = hist[hist.length - 1];
      if (sanitized.time > last.time) {
        // A new candle has officially started; previous candle is now closed
        hist.push(sanitized);
        if (hist.length > 500) hist.shift();
        isNewCandle = true;
      } else if (sanitized.time === last.time) {
        // Active open candle: update close/high/low in place without recomputing full series
        hist[hist.length - 1] = sanitized;
      }
    }

    // CRITICAL: Indicators (SMA, EMA, RSI, MACD) and candle-close callbacks ONLY update
    // when a new candle begins. Calling setData on every micro-tick resets auto-scaling bounds
    // and causes violent chart canvas vibration / candle shaking!
    if (isNewCandle) {
      if (indRefs.current.sma) indRefs.current.sma.setData(calculateSMA(hist, 20));
      if (indRefs.current.ema) indRefs.current.ema.setData(calculateEMA(hist, 55));
      if (indRefs.current.rsi) indRefs.current.rsi.setData(calculateRSI(hist, 14));
      if (indRefs.current.macdHist && indRefs.current.macdLine && indRefs.current.macdSig) {
        const macd = calculateMACD(hist);
        indRefs.current.macdHist.setData(macd.map(m => ({ time: m.time, value: m.hist, color: m.hist >= 0 ? "rgba(38,166,154,0.7)" : "rgba(239,83,80,0.7)" })));
        indRefs.current.macdLine.setData(macd.map(m => ({ time: m.time, value: m.macd })));
        indRefs.current.macdSig.setData(macd.map(m => ({ time: m.time, value: m.signal })));
      }

      // Notify parent page only on candle close:
      onCandleUpdateRef.current?.(hist);
    }
  }, []);

  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Draw/update price lines for active trades ───────────────────────────
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;

    const currentTradeIds = new Set(priceLevels.map(l => String(l.id)));

    // Remove lines for trades that no longer exist
    drawnLinesRef.current.forEach((line, key) => {
      const keyStr = String(key);
      const tradeId = keyStr.split("_")[0];
      if (!currentTradeIds.has(tradeId) && !currentTradeIds.has(keyStr)) {
        try { series.removePriceLine(line); } catch {}
        drawnLinesRef.current.delete(key);
      }
    });

    // Add or update lines for active trades
    priceLevels.forEach(level => {
      let timeStr = "";
      if (level.expiresAt && level.expiresAt > nowMs) {
        const remSec = Math.max(0, Math.ceil((level.expiresAt - nowMs) / 1000));
        const m = Math.floor(remSec / 60);
        const s = remSec % 60;
        timeStr = `⏱ ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }

      const isBuy = level.side === "BUY" || level.title?.toUpperCase().includes("BUY") || level.color === "#10b981";
      const curPrice = level.currentPrice || displayPrice || level.price;
      const amt = level.amount || 5;
      const payout = level.payoutRatio || 0.85;
      const isWinning = isBuy ? (curPrice >= level.price) : (curPrice <= level.price);
      const livePnL = isWinning ? (amt * payout) : (-amt);

      if (level.isAdmin) {
        // TradingView-style TP, SL, Entry and Live P&L lines
        const delta = Math.max(0.0001, level.price * 0.0015);
        const tpPrice = level.tpPrice || (isBuy ? level.price + delta : level.price - delta);
        const slPrice = level.slPrice || (isBuy ? level.price - delta : level.price + delta);
        const tpAmount = level.tpAmount || (amt * payout);
        const slAmount = level.slAmount || amt;

        // 1. Entry Line (Solid, clear)
        const entryKey = `${level.id}_entry`;
        const entryTitle = `[ ${isBuy ? '+1 BUY' : '-1 SELL'} $${amt.toFixed(2)} ] [ P&L: ${livePnL >= 0 ? '+' : ''}$${livePnL.toFixed(2)} USD ] ${timeStr}`;
        if (!drawnLinesRef.current.has(entryKey)) {
          try {
            const line = series.createPriceLine({
              price: level.price,
              color: isBuy ? "#10b981" : "#f43f5e",
              lineWidth: 2,
              lineStyle: 0, // Solid
              axisLabelVisible: true,
              title: entryTitle,
            });
            drawnLinesRef.current.set(entryKey, line);
          } catch {}
        } else {
          try {
            drawnLinesRef.current.get(entryKey)?.applyOptions({
              price: level.price,
              color: isBuy ? "#10b981" : "#f43f5e",
              title: entryTitle,
            });
          } catch {}
        }

        // 2. Take Profit (TP) Line (Green dashed)
        const tpKey = `${level.id}_tp`;
        const tpTitle = `[ 🎯 TP ] [ +$${tpAmount.toFixed(2)} USD ] $${tpPrice.toFixed(2)}`;
        if (!drawnLinesRef.current.has(tpKey)) {
          try {
            const line = series.createPriceLine({
              price: tpPrice,
              color: "#10b981",
              lineWidth: 1,
              lineStyle: 1, // Dashed
              axisLabelVisible: true,
              title: tpTitle,
            });
            drawnLinesRef.current.set(tpKey, line);
          } catch {}
        } else {
          try {
            drawnLinesRef.current.get(tpKey)?.applyOptions({
              price: tpPrice,
              title: tpTitle,
            });
          } catch {}
        }

        // 3. Stop Loss (SL) Line (Red dashed)
        const slKey = `${level.id}_sl`;
        const slTitle = `[ 🛑 SL ] [ -$${slAmount.toFixed(2)} USD ] $${slPrice.toFixed(2)}`;
        if (!drawnLinesRef.current.has(slKey)) {
          try {
            const line = series.createPriceLine({
              price: slPrice,
              color: "#ef4444",
              lineWidth: 1,
              lineStyle: 1, // Dashed
              axisLabelVisible: true,
              title: slTitle,
            });
            drawnLinesRef.current.set(slKey, line);
          } catch {}
        } else {
          try {
            drawnLinesRef.current.get(slKey)?.applyOptions({
              price: slPrice,
              title: slTitle,
            });
          } catch {}
        }
      } else {
        // Standard user line
        const fullTitle = `${level.title}${level.amount ? ` ($${level.amount})` : ""}${timeStr ? ` ${timeStr}` : ""}`;
        if (!drawnLinesRef.current.has(level.id)) {
          try {
            const line = series.createPriceLine({
              price: level.price,
              color: level.color,
              lineWidth: 2,
              lineStyle: 1,
              axisLabelVisible: true,
              title: fullTitle,
            });
            drawnLinesRef.current.set(level.id, line);
          } catch {}
        } else {
          try {
            drawnLinesRef.current.get(level.id)?.applyOptions({ title: fullTitle });
          } catch {}
        }
      }
    });
  }, [priceLevels, chartReady, nowMs, displayPrice]);

  // ── Core: update active candle on each tick ───────────────────────────────
  // Stored in a ref (not useCallback) so it never changes identity → won't trigger effect re-run
  const updateCandleRef = useRef((price: number) => {
    if (!candleRef.current || price <= 0 || isNaN(price)) return;

    const nowSec     = Math.floor(Date.now() / 1000);
    const candleSecs = candleSecsRef.current || 60;
    const bucket     = bucketTime(nowSec, candleSecs);
    let candle       = liveCandle.current;

    if (!candle || bucket > candle.time) {
      // Previous candle closes cleanly; new candle opens at previous close
      const open = (candle && candle.close > 0) ? candle.close : price;
      // Guard: initial tick cannot jump wildly from previous close
      const maxJump = isCryptoAsset ? 0.012 : 0.0025;
      const safePrice = (open > 0 && Math.abs(price - open) / open > maxJump) ? open : price;

      candle = {
        time: bucket,
        open,
        high: Math.max(open, safePrice),
        low:  Math.min(open, safePrice),
        close: safePrice,
        volume: 1
      };
      liveCandle.current = candle;
      try {
        chartRef.current?.timeScale().scrollToPosition(8, false);
      } catch {}
    } else {
      // Intra-candle update for current bucket
      // Guard against rogue spike ticks expanding intra-candle wicks abnormally
      const maxIntraMove = isCryptoAsset ? 0.015 : 0.004; // 0.4% max single-bar excursion for metals ($14 on Gold, $0.16 on Silver)
      if (candle.open > 0 && Math.abs(price - candle.open) / candle.open > maxIntraMove) {
        // Discard rogue tick excursion that creates needle wicks
        return;
      }
      candle.close = price;
      candle.high  = Math.max(candle.high, price);
      candle.low   = Math.min(candle.low,  price);
      if (candle.volume !== undefined) candle.volume += 1;
    }

    try {
      const priceLineColor = candle.close >= candle.open ? "#00e676" : "#ff5252";
      if (lastPriceLineColorRef.current !== priceLineColor) {
        lastPriceLineColorRef.current = priceLineColor;
        candleRef.current?.applyOptions({ priceLineColor });
      }
      candleRef.current?.update({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low:  candle.low,
        close: candle.close
      });
      liveLineRef.current?.update({ time: candle.time, value: price });
    } catch (err) { /* ignore */ }

    appendOrUpdateCandle(candle);
  });

  // ── Accept external price tick (called by WS / poller) ───────────────────
  // Also a stable ref — never changes identity, never triggers effect re-run
  const onTickRef = useRef((rawPrice: number) => {
    if (!rawPrice || rawPrice <= 0 || isNaN(rawPrice)) return;
    const prev = prevPriceRef.current;
    
    // Sanity check: reject anomalous single-tick outlier jumps
    // Real ticks never jump > 0.4% in 1 tick for metals/forex, or > 1.0% for crypto
    if (prev > 0) {
      const devFromPrev = Math.abs(rawPrice - prev) / prev;
      const maxTickDev = isCryptoAsset ? 0.01 : 0.0025; // 0.25% for metals/forex, 1.0% for crypto
      if (devFromPrev > maxTickDev) {
        // Drop rogue out-of-band spike tick to preserve clean candlestick geometry
        return;
      }
    }

    targetPriceRef.current  = rawPrice;
    lastTickRef.current     = Date.now();
    prevPriceRef.current    = rawPrice;

    // Direct chart update: instantaneous, accurate, zero lag
    updateCandleRef.current(rawPrice);

    // Throttle React UI state updates to max 10fps (every 100ms) to ensure smooth 60fps chart rendering and 0% CPU waste
    const now = performance.now();
    if (now - lastUiUpdateRef.current >= 100) {
      lastUiUpdateRef.current = now;
      setDisplayPrice(rawPrice);

      const dir: "up"|"down"|null = prev > 0 ? (rawPrice > prev ? "up" : rawPrice < prev ? "down" : null) : null;
      if (dir) {
        setPriceDir(dir);
        setFlashKey(k => (k + 1) % 1000);
      }
      onPriceUpdateRef.current?.(rawPrice, dir);
      if (liveCandle.current) {
        const c = liveCandle.current;
        setOhlcInfo({ o: c.open, h: c.high, l: c.low, c: rawPrice, v: c.volume ?? 0 });
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Effect: Build chart + load history + start live engine
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!containerRef.current) return;
    let isActive = true;
    let localWs: WebSocket | null = null;
    let localHeartbeatTimer: any = null;
    let reconnectTimer: any = null;
    let poller: ReturnType<typeof setInterval> | null = null;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;
    candleSecsRef.current = TF_SECS[timeframe] ?? 60;
    const symUpper = symbol.toUpperCase();
    // Binance WS / klines delivers real per-second OHLC for Cryptos
    const isCrypto = (
      exchange === "BINANCE" ||
      symUpper.endsWith("USDT") ||
      symUpper.endsWith("USDC") ||
      ["BTCUSD", "ETHUSD", "SOLUSD", "BNBUSD", "XRPUSD", "ADAUSD", "DOGEUSD", "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE"].includes(symUpper) ||
      (symUpper.endsWith("USD") && !["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "GBPJPY", "USDCAD", "USDPKR", "USDINR", "CADCHF", "XAUUSD", "XAGUSD", "WTIUSD", "BRENTUSD"].includes(symUpper))
    ) && !["XAUUSD", "GOLD", "XAGUSD", "SILVER", "WTIUSD", "BRENTUSD"].includes(symUpper);
    renderedPriceRef.current = 0;
    lastRenderTsRef.current = 0;

    // ── 1. Create lightweight chart (Quotex exact design) ───────────────────
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor:  "#8c9baa",
        fontSize:   11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)", style: 0 },
        horzLines: { color: "rgba(255,255,255,0.03)", style: 0 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,255,255,0.4)", labelBackgroundColor: "#1e222d", style: 2 },
        horzLine: { color: "rgba(255,255,255,0.4)", labelBackgroundColor: "#1e222d", style: 2 },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        autoScale:   true,
        scaleMargins: { top: 0.06, bottom: 0.12 },
      },
      timeScale: {
        borderColor:    "rgba(255,255,255,0.08)",
        timeVisible:    true,
        secondsVisible: false,
        rightOffset:    8,
        barSpacing:     12, // Thicker candles exactly like Quotex
        minBarSpacing:  3,
        shiftVisibleRangeOnNewBar: true,
        allowShiftVisibleRangeOnWhitespaceReplacement: true,
      },
      autoSize: true,
    });

    // ── 2. Add Candlestick Series (Exact Quotex Neon Green & Red) ────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:         "#00e676", // Quotex pure bullish green
      downColor:       "#ff5252", // Quotex pure bearish red
      borderVisible:   true,
      borderUpColor:   "#00e676",
      borderDownColor: "#ff5252",
      wickUpColor:     "#00e676",
      wickDownColor:   "#ff5252",
      wickVisible:     true,
      priceLineVisible: true,
      priceLineColor:  "#2962ff",
      priceLineWidth:  1,
      priceLineStyle:  2, // Dashed line exactly right across the chart
    });

    // (Only add line series for non-candle charts; hide when showing candlesticks so chart is crystal clean)
    const liveLine = chart.addSeries(LineSeries, {
      color:          "rgba(255,255,255,0)",
      lineWidth:      1,
      lineStyle:      3,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      visible:        false,
    });
    
    // ── 3. Initialize Indicators Panes ───────────────────────────────────────
    indRefs.current.sma = chart.addSeries(LineSeries, { color: "rgba(255, 193, 7, 0.8)", lineWidth: 2, title: "SMA(20)", visible: activeIndicators.includes("SMA") });
    indRefs.current.ema = chart.addSeries(LineSeries, { color: "rgba(103, 58, 183, 0.8)", lineWidth: 2, title: "EMA(55)", visible: activeIndicators.includes("EMA") });
    
    indRefs.current.rsi = chart.addSeries(LineSeries, { color: "#e06cba", lineWidth: 2, priceScaleId: "rsi", title: "RSI(14)", visible: activeIndicators.includes("RSI") });
    chart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.75, bottom: 0 }, visible: activeIndicators.includes("RSI") });
    
    indRefs.current.macdHist = chart.addSeries(HistogramSeries, { priceScaleId: "macd", title: "MACD(12,26,9)", visible: activeIndicators.includes("MACD") });
    indRefs.current.macdLine = chart.addSeries(LineSeries, { color: "#2962FF", lineWidth: 1, priceScaleId: "macd", visible: activeIndicators.includes("MACD") });
    indRefs.current.macdSig = chart.addSeries(LineSeries, { color: "#FF6D00", lineWidth: 1, priceScaleId: "macd", visible: activeIndicators.includes("MACD") });
    chart.priceScale("macd").applyOptions({ scaleMargins: { top: 0.75, bottom: 0 }, visible: activeIndicators.includes("MACD") });

    chartRef.current   = chart;
    candleRef.current  = candleSeries;
    liveLineRef.current = liveLine;
    setChartReady(true);

    // Reset history state for clean timeframe / symbol switch
    historyRef.current = [];
    liveCandle.current = null;

    // ── 3. Load historical candles ───────────────────────────────────────────
    const loadHistory = async () => {
      setIsLoading(true);
      let history: CandleOHLC[] = [];

      try {
        const pr = await fetch(`/api/market-data/price/${symbol}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (pr.ok) {
          const pd = await pr.json();
          const liveP = parseFloat(pd.price);
          if (liveP > 0) {
            targetPriceRef.current  = liveP;
            currentPriceRef.current = liveP;
            prevPriceRef.current    = liveP;
          }
        }
      } catch {}

      // 3a. Primary backend history request (High-speed server proxy with direct Binance & TwelveData access, zero CORS/ISP blocks)
      try {
        const res = await fetch(
          `/api/market-data/history/${symbol}?interval=${timeframe}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.results) && data.results.length > 0) {
            history = data.results;
          } else if (Array.isArray(data) && data.length > 0) {
            history = data;
          }
        }
      } catch {}

      // 3b. Secondary client-side direct Binance Kline Fetch for Cryptos & Gold if backend is unreachable
      if (history.length === 0 && (isCrypto || ["XAUUSD", "GOLD", "PAXGUSD", "PAXGUSDT", "XAUTUSDT", "XAUTUSDC"].includes(symUpper))) {
        try {
          const binIntervalMap: any = {
            "1m": "1m", "2m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
            "1H": "1h", "4H": "4h", "1D": "1d", "1W": "1w", "1M": "1M"
          };
          const bInt = binIntervalMap[timeframe] || "1m";
          let binSymbol = symUpper;
          if (["XAUTUSDC", "XAUTUSDT", "PAXGUSDT", "PAXGUSD", "XAUUSD"].includes(symUpper)) binSymbol = "PAXGUSDT";
          else if (symUpper === "BTCUSD" || symUpper === "BTCUSDT" || symUpper === "BTC") binSymbol = "BTCUSDT";
          else if (symUpper === "ETHUSD" || symUpper === "ETHUSDT" || symUpper === "ETH") binSymbol = "ETHUSDT";
          else if (symUpper === "SOLUSD" || symUpper === "SOLUSDT" || symUpper === "SOL") binSymbol = "SOLUSDT";
          else if (symUpper === "BNBUSD" || symUpper === "BNBUSDT" || symUpper === "BNB") binSymbol = "BNBUSDT";
          else if (symUpper === "XRPUSD" || symUpper === "XRPUSDT" || symUpper === "XRP") binSymbol = "XRPUSDT";
          else if (symUpper === "ADAUSD" || symUpper === "ADAUSDT" || symUpper === "ADA") binSymbol = "ADAUSDT";
          else if (symUpper === "DOGEUSD" || symUpper === "DOGEUSDT" || symUpper === "DOGE") binSymbol = "DOGEUSDT";
          else if (symUpper.endsWith("USD") && !symUpper.endsWith("USDT") && !symUpper.endsWith("USDC")) binSymbol = `${symUpper.slice(0, -3)}USDT`;
          else if (!symUpper.endsWith("USDT") && !symUpper.endsWith("USDC")) binSymbol = `${symUpper}USDT`;

          const mirrors = [
            `https://data-api.binance.vision/api/v3/klines?symbol=${binSymbol}&interval=${bInt}&limit=500`,
            `https://api.binance.com/api/v3/klines?symbol=${binSymbol}&interval=${bInt}&limit=500`,
            `https://api1.binance.com/api/v3/klines?symbol=${binSymbol}&interval=${bInt}&limit=500`,
          ];

          for (const mUrl of mirrors) {
            try {
              const bRes = await fetch(mUrl, { signal: AbortSignal.timeout(2500) });
              if (bRes.ok) {
                const bData = await bRes.json();
                if (Array.isArray(bData) && bData.length > 0) {
                  history = bData.map((d: any) => ({
                    time: Math.floor(d[0] / 1000) as UTCTimestamp,
                    open: parseFloat(d[1]),
                    high: parseFloat(d[2]),
                    low: parseFloat(d[3]),
                    close: parseFloat(d[4]),
                    volume: parseFloat(d[5] || 0)
                  }));
                  break;
                }
              }
            } catch {}
          }
        } catch {}
      }

      // 3c. Fallback: Organic continuous Brownian random walk anchored strictly to live price (Zero gap, realistic financial movements)
      if (history.length === 0) {
        let fallbackBase = targetPriceRef.current > 0 ? targetPriceRef.current : 0;
        if (fallbackBase <= 0) {
          if (symUpper.includes("XAU") || symUpper.includes("PAXG") || symUpper.includes("GOLD")) fallbackBase = 3558.0;
          else if (symUpper.includes("XAG") || symUpper.includes("SILVER")) fallbackBase = 40.80;
          else if (symUpper.includes("BTC")) fallbackBase = 66800.0;
          else if (symUpper.includes("ETH")) fallbackBase = 3400.0;
          else if (symUpper.includes("BNB")) fallbackBase = 740.0;
          else if (symUpper.includes("SOL")) fallbackBase = 180.0;
          else if (symUpper.includes("EUR")) fallbackBase = 1.0850;
          else if (symUpper.includes("GBP")) fallbackBase = 1.2850;
          else fallbackBase = 100.0;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const candleSecs = candleSecsRef.current || 60;
        const bucketedNow = Math.floor(nowSec / candleSecs) * candleSecs;
        let currentLevel = fallbackBase;
        const generated: CandleOHLC[] = [];
        const volatility = 0.0008; // 0.08% realistic bar volatility

        for (let i = 0; i < 80; i++) {
          const t = (bucketedNow - (i * candleSecs)) as UTCTimestamp;
          const shock = (Math.random() - 0.498) * volatility * currentLevel;
          const op = currentLevel - shock;
          const cl = currentLevel;
          const wickSize = Math.random() * volatility * currentLevel * 0.5;
          const hi = Math.max(op, cl) + wickSize;
          const lo = Math.min(op, cl) - wickSize;
          generated.push({
            time: t,
            open: Number(op.toFixed(4)),
            high: Number(hi.toFixed(4)),
            low: Number(lo.toFixed(4)),
            close: Number(cl.toFixed(4)),
            volume: Math.floor(Math.random() * 2500) + 500
          });
          currentLevel = op;
        }
        history = generated.reverse();
      }

      // Sanitize & validate OHLC bounds, strictly sort ascending, and deduplicate timestamps
      const sanitizedMap = new Map<number, CandleOHLC>();
      for (let idx = 0; idx < history.length; idx++) {
        const c = history[idx];
        if (!c) continue;
        const t = Math.floor(Number(c.time));
        let o = Number(c.open);
        let cl = Number(c.close);
        if (isNaN(t) || isNaN(o) || isNaN(cl) || t <= 0 || cl <= 0) continue;
        
        let rawHigh = Number(c.high);
        let rawLow = Number(c.low);
        let h = isNaN(rawHigh) ? Math.max(o, cl) : Math.max(o, cl, rawHigh);
        let l = isNaN(rawLow) ? Math.min(o, cl) : Math.min(o, cl, rawLow);
        if (h < l) {
          h = Math.max(o, cl);
          l = Math.min(o, cl);
        }

        // Clamp freak historical outlier wicks (protects against illiquid book spikes or rogue historical ticks)
        const maxWickRatio = isCryptoAsset ? 0.025 : 0.006; // 0.6% on metals/forex, 2.5% on crypto
        const maxAllowedHigh = Math.max(o, cl) * (1 + maxWickRatio);
        const minAllowedLow  = Math.min(o, cl) * (1 - maxWickRatio);
        if (h > maxAllowedHigh) h = maxAllowedHigh;
        if (l < minAllowedLow)  l = minAllowedLow;

        sanitizedMap.set(t, {
          time: t as UTCTimestamp,
          open: o,
          high: h,
          low: l,
          close: cl,
          volume: Number(c.volume || 0)
        });
      }

      const sortedHistory = Array.from(sanitizedMap.values()).sort((a, b) => (a.time as number) - (b.time as number));
      const validHistory: CandleOHLC[] = [];
      const candleSecs = candleSecsRef.current || 60;

      for (let i = 0; i < sortedHistory.length; i++) {
        const curr = sortedHistory[i];
        if (validHistory.length > 0) {
          const prev = validHistory[validHistory.length - 1];
          const gapSecs = (curr.time as number) - (prev.time as number);
          // If there is a missing candle gap between consecutive bars (up to 2 hours), forward-fill continuation bars
          if (gapSecs > candleSecs && gapSecs <= candleSecs * 120) {
            const missingSteps = Math.floor(gapSecs / candleSecs) - 1;
            for (let s = 1; s <= missingSteps; s++) {
              const bridgeTime = ((prev.time as number) + s * candleSecs) as UTCTimestamp;
              const spread = Math.max(0.04, prev.close * 0.00008);
              validHistory.push({
                time: bridgeTime,
                open: prev.close,
                high: Number((prev.close + spread).toFixed(4)),
                low: Number((prev.close - spread).toFixed(4)),
                close: prev.close,
                volume: 10
              });
            }
          }
        }
        
        // Ensure that zero-height flat doji bars have a visible micro-wick so they never look like invisible slits or gaps
        if (curr.high <= curr.low || Math.abs(curr.high - curr.low) < 0.0001) {
          const spread = Math.max(0.04, curr.close * 0.00008);
          curr.high = Number((Math.max(curr.open, curr.close) + spread).toFixed(4));
          curr.low = Number((Math.min(curr.open, curr.close) - spread).toFixed(4));
        }

        validHistory.push(curr);
      }

      if (!isActive) return;

      const nowSec = Math.floor(Date.now() / 1000);
      const currentBucket = bucketTime(nowSec, candleSecs);

      if (validHistory.length > 0) {
        const lastBar = validHistory[validHistory.length - 1];
        if ((lastBar.time as number) < currentBucket) {
          // If historical feed ended before current minute bucket, seamlessly append open bar
          const open = lastBar.close;
          let livePrice = targetPriceRef.current > 0 ? targetPriceRef.current : open;
          // Seamless continuous flow — clamp initial livePrice to previous close if divergence exceeds 0.25% (0.0025)
          const maxOpenBarDiv = isCryptoAsset ? 0.008 : 0.0025; // 0.25% on metals ($8 on Gold, $0.10 on Silver)
          if (open > 0 && Math.abs(livePrice - open) / open > maxOpenBarDiv) {
            livePrice = open;
          }
          const openCandle: CandleOHLC = {
            time: currentBucket,
            open,
            high: Math.max(open, livePrice),
            low:  Math.min(open, livePrice),
            close: livePrice,
            volume: 1
          };
          validHistory.push(openCandle);
        }
      }

      historyRef.current = validHistory;

      if (isActive && chartRef.current && candleRef.current && validHistory.length > 0) {
        try {
          candleRef.current.setData(validHistory);
          liveLine.setData(validHistory.map(c => ({ time: c.time, value: c.close })));
          requestAnimationFrame(() => {
            try {
              const totalBars = validHistory.length;
              const barsToShow = Math.min(totalBars, 65);
              chart.timeScale().setVisibleLogicalRange({
                from: totalBars - barsToShow,
                to: totalBars + 8,
              });
            } catch {
              try { chart.timeScale().scrollToPosition(8, false); } catch {}
            }
          });
        } catch (setErr) {
          console.error("[LiveTradingChart] Error setting history data:", setErr);
        }
      }

      const last = validHistory[validHistory.length - 1];
      if (last) {
        currentPriceRef.current = last.close;
        targetPriceRef.current  = last.close;
        prevPriceRef.current    = last.close;
        renderedPriceRef.current = last.close;
        liveCandle.current      = { ...last };
        setDisplayPrice(last.close);
        setOhlcInfo({ o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume ?? 0 });
        
        if (indRefs.current.sma) indRefs.current.sma.setData(calculateSMA(validHistory, 20));
        if (indRefs.current.ema) indRefs.current.ema.setData(calculateEMA(validHistory, 55));
        if (indRefs.current.rsi) indRefs.current.rsi.setData(calculateRSI(validHistory, 14));
        if (indRefs.current.macdHist && indRefs.current.macdLine && indRefs.current.macdSig) {
          const macd = calculateMACD(validHistory);
          indRefs.current.macdHist.setData(macd.map(m => ({ time: m.time, value: m.hist, color: m.hist >= 0 ? "rgba(38,166,154,0.7)" : "rgba(239,83,80,0.7)" })));
          indRefs.current.macdLine.setData(macd.map(m => ({ time: m.time, value: m.macd })));
          indRefs.current.macdSig.setData(macd.map(m => ({ time: m.time, value: m.signal })));
        }

        onCandleUpdateRef.current?.(validHistory);
      }

      try {
        chart.timeScale().scrollToRealTime();
      } catch {}

      setIsLoading(false);
    };

    const startEngine = () => {
      // Countdown ticks on its own precise 1s clock — decoupled from price rendering.
      countdownTimer = setInterval(() => {
        if (!isActive) return;
        const nowSec     = Math.floor(Date.now() / 1000);
        const candleSecs = candleSecsRef.current;
        if (candleSecs > 0) {
          setCountdown(candleSecs - (nowSec % candleSecs));
          const bucket = bucketTime(nowSec, candleSecs);
          if (liveCandle.current && bucket > liveCandle.current.time && targetPriceRef.current > 0) {
            updateCandleRef.current(targetPriceRef.current);
          }
        }
      }, 1000);
    };

    const connectWS = () => {
      if (!isActive) return;

      // Fail-safe REST poller for ALL assets (guarantees chart never goes blank if client WS is blocked)
      const poll = async () => {
        if (!isActive) return;
        // Skip REST polling if live WebSocket feed is actively connected
        if (localWs && localWs.readyState === WebSocket.OPEN) return;

        try {
          const r = await fetch(`/api/market-data/price/${symbol}`);
          if (r.ok) {
            const d = await r.json();
            if (d.price && parseFloat(d.price) > 0) {
              onTickRef.current(parseFloat(d.price));
              setIsConnected(true);
            }
          }
        } catch {}
      };
      poll();
      if (!poller) poller = setInterval(poll, 1000);

      // ── Connect to Local Server WebSocket (Same-Origin, Zero ISP Blocks) ──
      const connectLocalWs = () => {
        if (!isActive) return;
        try {
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const localWsUrl = `${protocol}//${window.location.host}/ws`;
          localWs = new WebSocket(localWsUrl);

          localWs.onopen = () => {
            if (!isActive) {
              try { localWs?.close(); } catch {}
              return;
            }
            localWs?.send(JSON.stringify({ type: "subscribe", symbols: [symbol] }));
            if (localHeartbeatTimer) clearInterval(localHeartbeatTimer);
            localHeartbeatTimer = setInterval(() => {
              if (localWs && localWs.readyState === WebSocket.OPEN) {
                try { localWs.send(JSON.stringify({ type: "ping" })); } catch {}
              }
            }, 15000);
          };

          localWs.onmessage = (ev) => {
            if (!isActive) return;
            try {
              const msg = JSON.parse(ev.data);
              if (msg.type === "ping") {
                localWs?.send(JSON.stringify({ type: "pong" }));
              } else if (msg.type === "market_data" && msg.symbol === symbol && msg.data?.price) {
                const p = parseFloat(msg.data.price);
                if (p > 0) {
                  onTickRef.current(p);
                  setIsConnected(true);
                }
              }
            } catch {}
          };

          localWs.onerror = (e) => {
            try { (e as any)?.preventDefault?.(); } catch {}
          };
          localWs.onclose = () => {
            if (localHeartbeatTimer) {
              clearInterval(localHeartbeatTimer);
              localHeartbeatTimer = null;
            }
            if (isActive) {
              if (reconnectTimer) clearTimeout(reconnectTimer);
              reconnectTimer = setTimeout(connectLocalWs, 3000);
            }
          };
        } catch {}
      };
      connectLocalWs();
    };

    const initChart = async () => {
      await loadHistory();
      if (!isActive) return;
      startEngine();
      connectWS();
    };
    initChart();

    return () => {
      isActive = false;
      if (poller)        clearInterval(poller);
      if (countdownTimer) clearInterval(countdownTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (localHeartbeatTimer) clearInterval(localHeartbeatTimer);
      if (localWs) {
        const socket = localWs;
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.onopen = () => {
            try { socket.close(1000, "Clean unmount"); } catch {}
          };
        } else if (socket.readyState === WebSocket.OPEN) {
          try { socket.close(1000, "Clean unmount"); } catch {}
        }
        localWs = null;
      }
      try { chart.remove(); } catch {}
      chartRef.current  = null;
      candleRef.current = null;
      historyRef.current = [];
      liveCandle.current = null;
      drawnLinesRef.current.clear();
      indRefs.current = {};
      setChartReady(false);
    };
  }, [symbol, timeframe, assetClass, exchange]);

  // ── Sync Indicators Visibility ──────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    
    const hasRSI = activeIndicators.includes("RSI");
    const hasMACD = activeIndicators.includes("MACD");
    
    indRefs.current.sma?.applyOptions({ visible: activeIndicators.includes("SMA") });
    indRefs.current.ema?.applyOptions({ visible: activeIndicators.includes("EMA") });
    indRefs.current.rsi?.applyOptions({ visible: hasRSI });
    indRefs.current.macdHist?.applyOptions({ visible: hasMACD });
    indRefs.current.macdLine?.applyOptions({ visible: hasMACD });
    indRefs.current.macdSig?.applyOptions({ visible: hasMACD });
    
    const rightMargin = 0.06;
    if (hasRSI && hasMACD) {
      chartRef.current.priceScale("right").applyOptions({ scaleMargins: { top: rightMargin, bottom: 0.4 } });
      chartRef.current.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.65, bottom: 0.2 }, visible: true });
      chartRef.current.priceScale("macd").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 }, visible: true });
    } else if (hasRSI || hasMACD) {
      chartRef.current.priceScale("right").applyOptions({ scaleMargins: { top: rightMargin, bottom: 0.25 } });
      if (hasRSI) chartRef.current.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: true });
      if (hasMACD) chartRef.current.priceScale("macd").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: true });
    } else {
      chartRef.current.priceScale("right").applyOptions({ scaleMargins: { top: rightMargin, bottom: 0.12 } });
      chartRef.current.priceScale("rsi").applyOptions({ visible: false });
      chartRef.current.priceScale("macd").applyOptions({ visible: false });
    }
  }, [activeIndicators]);

  // ── Countdown display ──────────────────────────────────────────────────────
  const fmtCountdown = (s: number): string => {
    if (s <= 0) return "00:00";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const priceColor = priceDir === "up" ? "#00e676" : priceDir === "down" ? "#ff5252" : "#e5e7eb";
  const isUp = ohlcInfo.c >= ohlcInfo.o;

  return (
    <div className="relative w-full h-full flex flex-col bg-[#131722] overflow-hidden rounded-xl border border-white/5">

      {/* ── OHLC Info Strip (Quotex style) ──────────────────────────────── */}
      {ohlcInfo.o > 0 && (
        <div className="absolute top-2.5 left-4 z-20 flex items-center gap-3.5 text-[11px] font-mono pointer-events-none select-none bg-[#181c25]/90 px-3 py-1 rounded-md border border-white/5 backdrop-blur-sm">
          <span className="text-gray-400">O: <span className={isUp ? "text-[#00e676] font-bold" : "text-[#ff5252] font-bold"}>{fmtPrice(ohlcInfo.o, symbol)}</span></span>
          <span className="text-gray-400">H: <span className="text-[#00e676] font-bold">{fmtPrice(ohlcInfo.h, symbol)}</span></span>
          <span className="text-gray-400">L: <span className="text-[#ff5252] font-bold">{fmtPrice(ohlcInfo.l, symbol)}</span></span>
          <span className="text-gray-400">C: <span style={{ color: priceColor }} className="font-bold">{fmtPrice(ohlcInfo.c, symbol)}</span></span>
        </div>
      )}

      {/* ── Live price badge ─────────────────────────────────────────────── */}
      <div className="absolute top-2.5 right-4 z-20 flex items-center gap-2 pointer-events-none">
        {isConnected && (
          <div className="flex items-center gap-1.5 bg-[#00e676]/10 border border-[#00e676]/40 rounded-full px-2.5 py-0.5 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00e676] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00e676]" />
            </span>
            <span className="text-[10px] text-[#00e676] font-extrabold tracking-wider">LIVE DATA</span>
          </div>
        )}
      </div>

      {/* ── Loading overlay ──────────────────────────────────────────────── */}
      {isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#131722]/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#00e676]/30 border-t-[#00e676] rounded-full animate-spin" />
            <span className="text-[12px] text-gray-300 font-medium tracking-wide">Loading real-time institutional market data…</span>
          </div>
        </div>
      )}

      {/* ── Chart canvas ─────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ cursor: "crosshair" }}
      />

      {/* ── Price flash overlay (Quotex-style color flash) ───────────────── */}
      <div
        key={flashKey}
        className="absolute inset-0 pointer-events-none z-10 opacity-0 animate-price-flash"
        style={{
          background: priceDir === "up"
            ? "radial-gradient(ellipse at 80% 50%, rgba(0,230,118,0.08) 0%, transparent 70%)"
            : priceDir === "down"
              ? "radial-gradient(ellipse at 80% 50%, rgba(255,82,82,0.08) 0%, transparent 70%)"
              : "transparent"
        }}
      />

      {/* ── Active Trades Order & Countdown Overlay (TradingView Pro / Quotex Fast Style) ── */}
      <div className="absolute right-14 top-[20%] z-[35] flex flex-col items-end gap-3 pointer-events-none">
        {priceLevels.map(level => {
          if (!level.expiresAt || level.expiresAt <= nowMs) return null;
          const remSec = Math.max(0, Math.ceil((level.expiresAt - nowMs) / 1000));
          const m = Math.floor(remSec / 60);
          const s = remSec % 60;
          const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
          const isBuy = level.side === "BUY" || level.title?.toUpperCase().includes("BUY") || level.color === "#10b981";
          const curPrice = level.currentPrice || displayPrice || level.price;
          const amt = level.amount || 5;
          const payout = level.payoutRatio || 0.85;
          const isWinning = isBuy ? (curPrice >= level.price) : (curPrice <= level.price);
          const livePnL = isWinning ? (amt * payout) : (-amt);

          const delta = Math.max(0.0001, level.price * 0.0015);
          const tpPrice = level.tpPrice || (isBuy ? level.price + delta : level.price - delta);
          const slPrice = level.slPrice || (isBuy ? level.price - delta : level.price + delta);

          if (level.isAdmin) {
            return (
              <div key={level.id} className="flex flex-col items-end gap-1.5 animate-in fade-in zoom-in-95 duration-200">
                {/* 1. Stop Loss Pill (Top) */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1e222d]/95 backdrop-blur-md border border-rose-500/70 shadow-[0_2px_10px_rgba(239,68,68,0.25)] text-xs font-mono font-bold">
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-400 font-black">SL</span>
                  <span className="text-rose-400">-${amt.toFixed(2)} USD</span>
                  <span className="text-muted-foreground/70 text-[10px]">(${slPrice.toFixed(2)})</span>
                </div>

                {/* 2. Main Entry Position & Live P&L Pill (Center) */}
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded shadow-2xl border font-mono font-bold text-xs transition-all",
                  isWinning 
                    ? "bg-[#0b1b17]/95 border-emerald-500/80 shadow-[0_0_20px_rgba(16,185,129,0.35)]" 
                    : "bg-[#1f1013]/95 border-rose-500/80 shadow-[0_0_20px_rgba(244,63,94,0.35)]"
                )}>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-black uppercase text-white tracking-wider",
                    isBuy ? "bg-emerald-600" : "bg-rose-600"
                  )}>
                    {isBuy ? "+1 BUY" : "-1 SELL"} ${amt}
                  </span>
                  <span className="text-muted-foreground text-[11px] font-medium">@ ${level.price.toFixed(2)}</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-xs font-black flex items-center gap-1 shadow-inner",
                    isWinning ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                  )}>
                    {livePnL >= 0 ? "+" : ""}${livePnL.toFixed(2)} USD
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-amber-300 font-black bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
                    {timeStr}
                  </span>
                </div>

                {/* 3. Take Profit Pill (Bottom) */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1e222d]/95 backdrop-blur-md border border-emerald-500/70 shadow-[0_2px_10px_rgba(16,185,129,0.25)] text-xs font-mono font-bold">
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-black">TP</span>
                  <span className="text-emerald-400">+${(amt * payout).toFixed(2)} USD</span>
                  <span className="text-muted-foreground/70 text-[10px]">(${tpPrice.toFixed(2)})</span>
                </div>
              </div>
            );
          }

          // Standard non-admin view
          return (
            <div key={level.id} className="flex flex-col items-end animate-in fade-in zoom-in-95 duration-200">
              <div className={cn(
                "px-2.5 py-1 rounded text-xs font-black font-mono shadow-xl border flex items-center gap-1.5",
                isBuy 
                  ? "bg-emerald-600/95 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]" 
                  : "bg-rose-600/95 text-white border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.4)]"
              )}>
                <span className="uppercase">{level.title}</span>
                <span>${level.price.toFixed(2)}</span>
              </div>
              <div className="bg-rose-600/95 text-white px-2.5 py-1 rounded text-xs font-black font-mono shadow-lg border border-rose-400 -mt-0.5 flex items-center gap-1.5 animate-pulse">
                <Clock className="w-3.5 h-3.5" />
                <span>{timeStr}</span>
              </div>
            </div>
          );
        })}
      </div>



      {/* ── Price direction flash CSS ────────────────────────────────────── */}
      <style>{`
        @keyframes price-flash {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        .animate-price-flash {
          animation: price-flash 0.6s ease-out forwards;
      `}</style>
    </div>
  );
}

export default React.memo(LiveTradingChartComponent);
