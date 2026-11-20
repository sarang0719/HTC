import React from "react";
import { PlusCircle, MinusCircle, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

interface TradingOrderPanelProps {
  user: any;
  tradeAmount: number;
  setTradeAmount: (n: number) => void;
  autoTradeEnabled: boolean;
  isAdmin: boolean;
  timeframe: string;
  setTimeframe: (tf: string) => void;
  setTradeDuration: (secs: number) => void;
  stableBankDir: "BUY" | "SELL";
  prediction: any;
  placeTradePending: boolean;
  handlePlaceTrade: (side: "BUY" | "SELL") => void;
  fmtUsd: (n?: number) => string;
}

export const TradingOrderPanel: React.FC<TradingOrderPanelProps> = ({
  user,
  tradeAmount,
  setTradeAmount,
  autoTradeEnabled,
  isAdmin,
  timeframe,
  setTimeframe,
  setTradeDuration,
  stableBankDir,
  prediction,
  placeTradePending,
  handlePlaceTrade,
  fmtUsd,
}) => {
  return (
    <div className="p-4 border-b border-border/20">
      {/* Amount Input */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-bold text-muted-foreground uppercase block">
            Investment Amount ($)
          </label>
          <div
            className={cn(
              "text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-tighter",
              user?.tradeMode === "REAL"
                ? "bg-primary/10 text-primary"
                : "bg-violet-500/10 text-violet-400"
            )}
          >
            {user?.tradeMode ?? "DEMO"}:{" "}
            <span>
              $
              {user?.tradeMode === "REAL"
                ? user?.walletBalance || "0.00"
                : user?.demoBalance || "10000.00"}
            </span>
          </div>
        </div>
        <div className="flex bg-background rounded-xl overflow-hidden border border-border/10 transition-colors focus-within:border-primary/50">
          <button
            disabled={autoTradeEnabled && !isAdmin}
            onClick={() => setTradeAmount(Math.max(1, tradeAmount - 10))}
            className="w-10 hover:bg-white/5 flex items-center justify-center text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <MinusCircle className="w-4 h-4" />
          </button>
          <input
            type="number"
            value={tradeAmount}
            disabled={autoTradeEnabled && !isAdmin}
            onChange={(e) => setTradeAmount(Number(e.target.value))}
            className="flex-1 min-w-0 bg-transparent text-center font-bold text-lg outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <button
            disabled={autoTradeEnabled && !isAdmin}
            onClick={() => setTradeAmount(tradeAmount + 10)}
            className="w-10 hover:bg-white/5 flex items-center justify-center text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Time / Duration — controls BOTH chart candle timeframe + trade expiry */}
      <div className="mb-5">
        <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1.5 block">
          Candle Timeframe
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "1m", tf: "1m", secs: 60 },
            { label: "2m", tf: "2m", secs: 120 },
            { label: "3m", tf: "3m", secs: 180 },
            { label: "5m", tf: "5m", secs: 300 },
            { label: "15m", tf: "15m", secs: 900 },
            { label: "30m", tf: "30m", secs: 1800 },
          ].map((d) => (
            <button
              disabled={autoTradeEnabled && !isAdmin}
              key={d.tf}
              onClick={() => {
                if (autoTradeEnabled && !isAdmin) return;
                setTimeframe(d.tf);
                setTradeDuration(d.secs);
              }}
              className={cn(
                "py-2 rounded-lg text-xs font-bold transition-all border disabled:opacity-50 disabled:cursor-not-allowed",
                timeframe === d.tf
                  ? "bg-primary/20 text-primary border-primary/50 shadow-sm"
                  : "bg-background text-muted-foreground border-transparent hover:bg-white/5"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="text-[9px] text-muted-foreground mt-1.5 px-0.5">
          Chart shows{" "}
          <span className="text-foreground font-semibold">{timeframe}</span>{" "}
          candles · trade closes at next candle
        </p>
      </div>

      {/* Payout Expectation */}
      <div className="flex items-center justify-between px-1 mb-4">
        <span className="text-xs text-muted-foreground font-semibold">
          Payout (85%)
        </span>
        <span className="text-lg font-bold text-emerald-400">
          +{fmtUsd(tradeAmount * 0.85)}
        </span>
      </div>

      {/* BIG UP / DOWN BUTTONS WITH AI RECOMMENDATIONS */}
      <div className="flex flex-col gap-2 relative">
        <button
          disabled={placeTradePending}
          onClick={() => handlePlaceTrade("BUY")}
          className={cn(
            "group relative h-14 rounded-xl font-bold text-white uppercase overflow-hidden transition-all",
            stableBankDir === "BUY"
              ? "bg-[#0eb977] hover:bg-[#12c481] shadow-[0_0_25px_rgba(16,185,129,0.4)] ring-2 ring-emerald-400 ring-offset-2 ring-offset-background"
              : "bg-[#0eb977]/60 hover:bg-[#0eb977] opacity-80"
          )}
        >
          <div className="flex items-center justify-between px-6 z-10 relative">
            <div className="flex flex-col items-start">
              <span className="text-lg flex items-center gap-2">
                Up
                {stableBankDir === "BUY" && (
                  <span className="text-[9px] bg-black/50 px-2 py-0.5 rounded-full text-emerald-300 font-black border border-emerald-400/50 flex items-center gap-1 animate-pulse">
                    🔥 AI CALL (UP)
                  </span>
                )}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-sm font-black">+{fmtUsd(tradeAmount * 1.85)}</span>
            </div>
          </div>
        </button>

        <button
          disabled={placeTradePending}
          onClick={() => handlePlaceTrade("SELL")}
          className={cn(
            "group relative h-14 rounded-xl font-bold text-white uppercase overflow-hidden transition-all",
            stableBankDir === "SELL"
              ? "bg-[#f43f5e] hover:bg-[#fb4b68] shadow-[0_0_25px_rgba(244,63,94,0.4)] ring-2 ring-rose-400 ring-offset-2 ring-offset-background"
              : "bg-[#f43f5e]/60 hover:bg-[#f43f5e] opacity-80"
          )}
        >
          <div className="flex items-center justify-between px-6 z-10 relative">
            <div className="flex flex-col items-start">
              <span className="text-lg flex items-center gap-2">
                Down
                {stableBankDir === "SELL" && (
                  <span className="text-[9px] bg-black/50 px-2 py-0.5 rounded-full text-rose-300 font-black border border-rose-400/50 flex items-center gap-1 animate-pulse">
                    ⚡ AI PUT (DOWN)
                  </span>
                )}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-sm font-black">+{fmtUsd(tradeAmount * 1.85)}</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default TradingOrderPanel;
