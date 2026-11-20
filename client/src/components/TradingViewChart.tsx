import { useMemo, memo, useEffect, useRef } from "react";

// ── Symbol mapping: internal → TradingView ────────────────────────────────
const TV_SYMBOL: Record<string, string> = {
  // Crypto (Binance)
  BTCUSD:   "BINANCE:BTCUSDT",
  BTCUSDT:  "BINANCE:BTCUSDT",
  ETHUSD:   "BINANCE:ETHUSDT",
  ETHUSDT:  "BINANCE:ETHUSDT",
  BNBUSD:   "BINANCE:BNBUSDT",
  BNBUSDT:  "BINANCE:BNBUSDT",
  SOLUSD:   "BINANCE:SOLUSDT",
  SOLUSDT:  "BINANCE:SOLUSDT",
  XRPUSDT:  "BINANCE:XRPUSDT",
  ADAUSDT:  "BINANCE:ADAUSDT",
  DOGEUSDT: "BINANCE:DOGEUSDT",
  DOTUSDT:  "BINANCE:DOTUSDT",
  AVAXUSDT: "BINANCE:AVAXUSDT",
  MATICUSDT:"BINANCE:MATICUSDT",
  LTCUSDT:  "BINANCE:LTCUSDT",
  LINKUSDT: "BINANCE:LINKUSDT",
  UNIUSDT:  "BINANCE:UNIUSDT",
  ATOMUSDT: "BINANCE:ATOMUSDT",
  TRXUSDT:  "BINANCE:TRXUSDT",
  SHIBUSDT: "BINANCE:SHIBUSDT",
  PEPEUSDT: "BINANCE:PEPEUSDT",
  NEARUSDT: "BINANCE:NEARUSDT",
  // Metals & Commodities
  XAUUSD:   "BINANCE:PAXGUSDT",
  GOLD:     "BINANCE:PAXGUSDT",
  PAXGUSDT: "BINANCE:PAXGUSDT",
  PAXGUSD:  "BINANCE:PAXGUSDT",
  XAGUSD:   "OANDA:XAGUSD",
  SILVER:   "OANDA:XAGUSD",
  WTIUSD:   "TVC:USOIL",
  USOIL:    "TVC:USOIL",
  BRENTUSD: "TVC:UKOIL",
  UKOIL:    "TVC:UKOIL",
  // Forex
  EURUSD:   "FX:EURUSD",
  GBPUSD:   "FX:GBPUSD",
  USDJPY:   "FX:USDJPY",
  USDCHF:   "FX:USDCHF",
  AUDUSD:   "FX:AUDUSD",
  NZDUSD:   "FX:NZDUSD",
  USDCAD:   "FX:USDCAD",
  EURJPY:   "FX:EURJPY",
  GBPJPY:   "FX:GBPJPY",
  EURGBP:   "FX:EURGBP",
  EURAUD:   "FX:EURAUD",
  GBPAUD:   "FX:GBPAUD",
  // Stocks
  AAPL:     "NASDAQ:AAPL",
  GOOGL:    "NASDAQ:GOOGL",
  MSFT:     "NASDAQ:MSFT",
  AMZN:     "NASDAQ:AMZN",
  TSLA:     "NASDAQ:TSLA",
  META:     "NASDAQ:META",
  NVDA:     "NASDAQ:NVDA",
  NFLX:     "NASDAQ:NFLX",
};

// ── Timeframe mapping: internal → TradingView interval ────────────────────
const TV_INTERVAL: Record<string, string> = {
  "1m":  "1",
  "2m":  "2",
  "3m":  "3",
  "5m":  "5",
  "15m": "15",
  "30m": "30",
  "1h":  "60",
  "1H":  "60",
  "4h":  "240",
  "4H":  "240",
  "1d":  "D",
  "1D":  "D",
  "1w":  "W",
  "1W":  "W",
  "1M":  "M",
};

function resolveTradingViewSymbol(rawSym: string): string {
  if (!rawSym) return "BINANCE:BTCUSDT";
  const sym = rawSym.toUpperCase().replace(/[-/_ ]/g, "");
  if (TV_SYMBOL[sym]) return TV_SYMBOL[sym];
  if (TV_SYMBOL[rawSym]) return TV_SYMBOL[rawSym];
  if (sym.endsWith("USDT")) return `BINANCE:${sym}`;
  if (sym.endsWith("USD")) return `BINANCE:${sym}T`;
  return `BINANCE:${sym}USDT`;
}

interface TradingViewChartProps {
  symbol: string;
  timeframe?: string;
  height?: number | string;
}

function TradingViewChart({
  symbol,
  timeframe = "1m",
  height = "100%",
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tvSym = resolveTradingViewSymbol(symbol);
  const tvInterval = TV_INTERVAL[timeframe] ?? TV_INTERVAL[timeframe.toLowerCase()] ?? "1";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container";
    widgetContainer.style.height = "100%";
    widgetContainer.style.width = "100%";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    widgetContainer.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSym,
      interval: tvInterval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#0B1120",
      gridColor: "rgba(255,255,255,0.04)",
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      support_host: "https://www.tradingview.com"
    });

    widgetContainer.appendChild(script);
    container.appendChild(widgetContainer);

    return () => {
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [tvSym, tvInterval]);

  return (
    <div
      ref={containerRef}
      key={`${tvSym}_${tvInterval}`}
      style={{
        width: "100%",
        height,
        minHeight: 0,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0B1120"
      }}
    />
  );
}

export default memo(TradingViewChart);
