import React, { useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface CandleTimerProps {
  interval: string;
}

export const CandleTimer: React.FC<CandleTimerProps> = ({ interval }) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    let secondsPerCandle = 60;
    const match = interval.match(/^(\d+)([a-zA-Z]+)$/);
    if (match) {
      const val = parseInt(match[1]);
      const unit = match[2];
      if (unit === "m") secondsPerCandle = val * 60;
      else if (unit === "h" || unit === "H") secondsPerCandle = val * 3600;
      else if (unit === "d" || unit === "D") secondsPerCandle = val * 86400;
      else if (unit === "w" || unit === "W") secondsPerCandle = val * 604800;
      else if (unit === "M") secondsPerCandle = val * 2592000;
    }

    const timer = setInterval(() => {
      const ms = Date.now();
      const secondsCurrent = Math.floor(ms / 1000);
      const remainder = secondsCurrent % secondsPerCandle;
      const remaining = secondsPerCandle - remainder;
      
      if (remaining >= 3600) {
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;
        setTimeLeft(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
      } else {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        setTimeLeft(`${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [interval]);

  return (
    <div className="absolute right-14 bottom-[80px] z-[25] pointer-events-none">
      <div className="bg-background/90 backdrop-blur-md border border-border/60 text-muted-foreground px-2 py-1 rounded shadow-sm text-[11px] font-mono flex items-center gap-1.5 transition-all">
        <Clock className="w-3 h-3 text-primary animate-pulse" />
        <span>Candle close:</span>
        <span className="font-bold text-primary">{timeLeft}</span>
      </div>
    </div>
  );
};

interface ActiveTradeTimerProps {
  expiresAt: string | Date;
}

export const ActiveTradeTimer: React.FC<ActiveTradeTimerProps> = ({ expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const expiresMs = new Date(expiresAt).getTime();
    
    const updateTimer = () => {
      const now = Date.now();
      const remSec = Math.max(0, Math.ceil((expiresMs - now) / 1000));
      if (remSec <= 0) {
        setTimeLeft("Expiring...");
        return;
      }
      const m = Math.floor(remSec / 60);
      const s = remSec % 60;
      setTimeLeft(`${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return (
    <span className="font-mono text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-gray-300 flex items-center gap-1.5 shrink-0 select-none">
      <Clock className="w-3.5 h-3.5 text-primary animate-pulse" />
      {timeLeft}
    </span>
  );
};
