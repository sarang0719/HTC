import React from "react";
import { Clock, History, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculatePnL } from "@/lib/pnl";
import { ActiveTradeTimer } from "./MarketTimers";
import type { TimeBasedOrder } from "@shared/schema";

interface ActiveTradesListProps {
  activeTrades: TimeBasedOrder[];
  displayPrice: number;
  onSellEarly: (tradeId: number) => Promise<void>;
}

export const ActiveTradesList: React.FC<ActiveTradesListProps> = ({
  activeTrades,
  displayPrice,
  onSellEarly,
}) => {
  if (activeTrades.length === 0) return null;

  return (
    <div className="p-4 border-b border-border/20">
      <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" /> Active Trades
      </h3>
      <div className="space-y-2">
        {activeTrades.map((trade) => {
          const strike = parseFloat(trade.strikePrice as string);
          const amount = parseFloat(trade.amount as string);
          const current = displayPrice;

          const { isWin, pnl } = calculatePnL(trade, current);
          const pnlStr = isWin ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;

          return (
            <div
              key={trade.id}
              className="bg-background rounded-xl p-3 border border-border/10 relative overflow-hidden"
            >
              <div
                className={cn(
                  "absolute left-0 top-0 bottom-0 w-1",
                  trade.side === "BUY" ? "bg-emerald-500" : "bg-rose-500"
                )}
              />
              <div className="flex items-center justify-between text-xs font-bold mb-1.5 ml-1">
                <span className="text-white">
                  ${amount.toFixed(2)} {trade.side}
                </span>
                <div
                  className={cn(
                    "px-2 py-0.5 rounded font-mono flex items-center gap-2",
                    isWin
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-rose-500/10 text-rose-400"
                  )}
                >
                  {pnlStr}
                  <button
                    onClick={() => onSellEarly(trade.id)}
                    className="bg-white/10 hover:bg-white/20 text-white rounded px-2 py-0.5 text-[10px] ml-1 uppercase transition-colors"
                  >
                    Sell
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground ml-1">
                <span>
                  Entry: {strike.toFixed(2)} | Current: {current.toFixed(2)}
                </span>
                <ActiveTradeTimer expiresAt={trade.expiresAt} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface TradeHistoryListProps {
  pastTrades: TimeBasedOrder[];
}

export const TradeHistoryList: React.FC<TradeHistoryListProps> = ({ pastTrades }) => {
  return (
    <div
      className="shrink-0 flex flex-col border-t border-border/20 bg-card"
      style={{ minHeight: "200px", maxHeight: "38%" }}
    >
      <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3 shrink-0 px-4 pt-4">
        <History className="w-3.5 h-3.5 inline mr-1" /> History
      </h3>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        {pastTrades.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-6">
            No recent trades.
          </div>
        ) : (
          <div className="space-y-2">
            {pastTrades.slice(0, 50).map((trade) => {
              const isWin = trade.status === "WIN";
              const isLoss = trade.status === "LOSS";
              const strike = parseFloat(trade.strikePrice as string);
              const settle = parseFloat(trade.settlePrice as string);
              return (
                <div
                  key={trade.id}
                  className="bg-background rounded-xl p-3 border border-border/10"
                >
                  <div className="flex items-center justify-between text-xs font-bold mb-1">
                    <span className="flex items-center gap-1.5">
                      {isWin ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      ) : isLoss ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-yellow-400" />
                      )}
                      {trade.side}
                    </span>
                    <span
                      className={
                        isWin
                          ? "text-emerald-400"
                          : isLoss
                          ? "text-rose-400"
                          : ""
                      }
                    >
                      {isWin
                        ? `+$${(parseFloat(trade.amount as string) * 0.85).toFixed(2)}`
                        : isLoss
                        ? `-$${parseFloat(trade.amount as string).toFixed(2)}`
                        : "TIE"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                      {strike.toFixed(2)} ➔ {settle ? settle.toFixed(2) : "..."}
                    </span>
                    <span>
                      {new Date(trade.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export const ActiveTradeHistory: React.FC<{
  activeTrades: TimeBasedOrder[];
  pastTrades: TimeBasedOrder[];
  displayPrice: number;
  onSellEarly: (tradeId: number) => Promise<void>;
}> = ({ activeTrades, pastTrades, displayPrice, onSellEarly }) => {
  return (
    <>
      <ActiveTradesList
        activeTrades={activeTrades}
        displayPrice={displayPrice}
        onSellEarly={onSellEarly}
      />
      <TradeHistoryList pastTrades={pastTrades} />
    </>
  );
};

export default ActiveTradeHistory;
