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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tvSym = resolveTradingViewSymbol(symbol);
  const tvInterval = TV_INTERVAL[timeframe] ?? TV_INTERVAL[timeframe.toLowerCase()] ?? "1";

  useEffect(() => {
    return () => {
      // Clean teardown before DOM removal to avoid abrupt Safari WebSocket drop
      if (iframeRef.current) {
        try {
          iframeRef.current.src = "about:blank";
        } catch {}
      }
    };
  }, []);

  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      symbol:           tvSym,
      interval:         tvInterval,
      theme:            "dark",
      style:            "1",
      locale:           "en",
      toolbar_bg:       "#0B1120",
      backgroundColor:  "#0B1120",
      gridColor:        "rgba(255,255,255,0.04)",
      hide_top_toolbar: "0",
      hide_legend:      "0",
      hide_side_toolbar:"1",
      allow_symbol_change: "0",
      save_image:       "0",
      withdateranges:   "0",
      hide_volume:      "0",
      support_host:     "https://www.tradingview.com",
    });

    return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
  }, [tvSym, tvInterval]);

  return (
    <div
      style={{
        width: "100%",
        height,
        minHeight: 0,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0B1120"
      }}
    >
      <iframe
        ref={iframeRef}
        key={`${tvSym}_${tvInterval}`}
        src={iframeSrc}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
          backgroundColor: "#0B1120",
        }}
        allowFullScreen
        title="TradingView Pro Chart"
      />
    </div>
  );
}

export default memo(TradingViewChart);
