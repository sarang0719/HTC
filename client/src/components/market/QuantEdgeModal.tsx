import React from "react";
import {
  BrainCircuit,
  Volume2,
  VolumeX,
  RefreshCw,
  Plus,
  Sparkles,
  TrendingUp,
  Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuantEdgeModalProps {
  showAiBotPopup: boolean;
  setShowAiBotPopup: (open: boolean) => void;
  isSoundEnabled: boolean;
  setIsSoundEnabled: (enabled: boolean) => void;
  handleTestAudioSound: (dir: "BUY" | "SELL", force?: boolean) => void;
  triggerAiRefresh: (force?: boolean) => void;
  isAiRefreshing: boolean;
  prediction: any;
  liveVolatility: any;
  trendAnalysis: { macroTrend: string; microTrend: string };
  aiConfluenceState: any;
  bankerPanel: any;
  spikeAlert: any;
  hasHighImpactNews: boolean;
  tpSlLevels: any;
  setBankSweepDetails: (details: any) => void;
  setBankPopUpOpen: (open: boolean) => void;
  isTraining: boolean;
  trainingProgress: number;
  handleTrainAI: () => void;
  timeframe: string;
  setTimeframe: (tf: string) => void;
  setShowPaymentModal: (open: boolean) => void;
  totalRemaining: number | string;
  toast: any;
  persistentMtfDetails?: Record<string, { signal: "BUY" | "SELL", predicted_color: "GREEN" | "RED", confidence: number }>;
}

export const QuantEdgeModal: React.FC<QuantEdgeModalProps> = ({
  showAiBotPopup,
  setShowAiBotPopup,
  isSoundEnabled,
  setIsSoundEnabled,
  handleTestAudioSound,
  triggerAiRefresh,
  isAiRefreshing,
  prediction,
  liveVolatility,
  trendAnalysis,
  aiConfluenceState,
  bankerPanel,
  spikeAlert,
  hasHighImpactNews,
  tpSlLevels,
  setBankSweepDetails,
  setBankPopUpOpen,
  isTraining,
  trainingProgress,
  handleTrainAI,
  timeframe,
  setTimeframe,
  setShowPaymentModal,
  totalRemaining,
  toast,
  persistentMtfDetails,
}) => {
  if (!showAiBotPopup) return null;

  const {
    currentTfDir,
    isBuy,
    isSell,
    isVolShock,
    isNoTrade,
    dualEngineAgreed,
    has3PointConfirmation,
    mtfDir,
    isTargetTfOpposed,
    mtfTfs,
    conf,
    score,
    displayedTfSigs,
    mtfForeCastDir,
    mtfForeCastCount,
    mtfBadgeColor,
    isMtfConflict,
  } = aiConfluenceState;

  const { macroTrend, microTrend } = trendAnalysis;

  return (
    <div className="bg-background/95 backdrop-blur-2xl border-2 border-primary/40 p-3.5 rounded-2xl shadow-2xl w-[540px] max-w-[96vw] sm:w-[560px] max-h-[85vh] overflow-y-auto custom-scrollbar pr-2 mb-1 animate-in fade-in zoom-in-95 duration-200 font-sans">
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 animate-pulse text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">
            QUANTEDGE V12.5 · BI-LSTM ATTENTION
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              const nextState = !isSoundEnabled;
              setIsSoundEnabled(nextState);
              localStorage.setItem("quantedge_sound_enabled", String(nextState));
              if (nextState) {
                handleTestAudioSound("BUY", true);
              }
              toast({
                title: nextState ? "🔊 Audio Alerts Enabled" : "🔇 Audio Alerts Muted",
                description: nextState
                  ? "Trade signal sound alerts are now active."
                  : "Trade signal sound alerts are muted.",
              });
            }}
            className={cn(
              "text-[8px] font-mono px-2 py-0.5 rounded border uppercase font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-sm",
              isSoundEnabled
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                : "bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30"
            )}
            title={isSoundEnabled ? "Click to Mute Audio Alerts" : "Click to Enable Audio Alerts"}
          >
            {isSoundEnabled ? (
              <Volume2 className="w-3 h-3 text-emerald-400 animate-pulse" />
            ) : (
              <VolumeX className="w-3 h-3 text-rose-400" />
            )}
            {isSoundEnabled ? "SOUND ON" : "SOUND OFF"}
          </button>
          {isSoundEnabled && (
            <button
              onClick={() => handleTestAudioSound("BUY", true)}
              className="text-[8px] font-mono bg-white/10 text-white hover:bg-white/20 px-1.5 py-0.5 rounded border border-white/20 uppercase font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
              title="Click to test audio alert sound"
            >
              TEST
            </button>
          )}
          <button
            onClick={() => triggerAiRefresh(false)}
            disabled={isAiRefreshing}
            className={cn(
              "text-[8px] font-mono px-2 py-0.5 rounded border uppercase font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-sm",
              isAiRefreshing
                ? "bg-sky-500/30 text-sky-200 border-sky-400/50"
                : "bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30 hover:text-white"
            )}
            title="Click to automatically refresh AI predictions & candle data"
          >
            <RefreshCw className={cn("w-3 h-3 text-sky-400", isAiRefreshing && "animate-spin")} />
            {isAiRefreshing ? "REFRESHING..." : "REFRESH"}
          </button>
          <span className="text-[8px] font-mono bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase font-bold">
            Next Candle
          </span>
          <button
            onClick={() => setShowAiBotPopup(false)}
            className="text-muted-foreground hover:text-white"
          >
            <Plus className="w-4 h-4 rotate-45" />
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {/* Model Confluence Header */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-xl flex items-center justify-between shadow-inner">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wide">
              {prediction?.modelVersion ? `MODEL: ${prediction.modelVersion}` : "CANONICAL AI ENGINE"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded border border-primary/30">
              {prediction?.marketRegime ? `REGIME: ${prediction.marketRegime}` : `ATR: $${liveVolatility?.atrValue}`}
            </span>
            <span className="text-[11px] font-black font-mono text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-lg border border-emerald-500/30">
              {conf}% {prediction?.confidenceBucket ? `(${prediction.confidenceBucket})` : "PROB"}
            </span>
          </div>
        </div>

        {/* Dual Market Trend Breakdown Card */}
        <div className="bg-slate-900/90 border border-slate-700/60 p-2.5 rounded-xl space-y-1.5 font-mono shadow-md">
          <div className="flex items-center justify-between border-b border-white/10 pb-1">
            <div className="flex items-center gap-1.5 text-[8.5px] font-bold text-muted-foreground uppercase">
              <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
              <span>LIVE MARKET TREND ANALYSIS</span>
            </div>
            <span className="text-[7.5px] font-bold bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded border border-sky-500/30">
              {`MTF: ${aiConfluenceState?.mtfForeCastCount || 2}/4`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[8px]">
            {/* Macro Trend */}
            <div
              className={cn(
                "p-1.5 rounded-lg border flex flex-col gap-0.5 shadow-sm",
                macroTrend === "UP"
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                  : macroTrend === "DOWN"
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                  : "bg-amber-500/15 border-amber-500/40 text-amber-300"
              )}
            >
              <span className="text-[7.5px] font-bold text-muted-foreground uppercase">
                🌐 OVERALL MACRO TREND (1H):
              </span>
              <span className="font-black uppercase text-[9px]">
                {macroTrend === "UP"
                  ? "🚀 UP (BULLISH MACRO)"
                  : macroTrend === "DOWN"
                  ? "🔻 DOWN (BEARISH MACRO)"
                  : "↔️ SIDEWAYS RANGE"}
              </span>
            </div>

            {/* Micro Trend */}
            <div
              className={cn(
                "p-1.5 rounded-lg border flex flex-col gap-0.5 shadow-sm",
                microTrend === "UP"
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                  : microTrend === "DOWN"
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                  : "bg-amber-500/15 border-amber-500/40 text-amber-300"
              )}
            >
              <span className="text-[7.5px] font-bold text-muted-foreground uppercase">
                ⚡ CURRENT MICRO TREND ({timeframe.toUpperCase()}):
              </span>
              <span className="font-black uppercase text-[9px]">
                {microTrend === "UP"
                  ? "🚀 UP (MICRO RALLY)"
                  : microTrend === "DOWN"
                  ? "🔻 DOWN (MICRO DIP)"
                  : "↔️ SIDEWAYS CHOP"}
              </span>
            </div>
          </div>
        </div>

        {/* Status Banner */}
        <div
          className={cn(
            "p-2.5 rounded-xl border flex flex-col gap-1.5 font-mono transition-all shadow-md",
            isVolShock
              ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
              : isBuy
              ? "bg-emerald-500/25 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.2)]"
              : "bg-rose-500/25 border-rose-500/50 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.25)]"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full",
                  isVolShock
                    ? "bg-amber-400 animate-ping"
                    : isBuy
                    ? "bg-emerald-400 animate-ping"
                    : "bg-rose-400 animate-ping"
                )}
              />
              <span className="text-[10px] font-black uppercase tracking-wider">
                LIVE STATUS [{timeframe}]
              </span>
            </div>
            <span className="text-[11px] font-black uppercase tracking-tight">
              {isVolShock
                ? `🔴 DO NOT TRADE (VOLATILITY SPIKE ACTIVE)`
                : isBuy
                ? isNoTrade
                  ? `🟢 CALL / BUY LEAN (${prediction?.marketRegime || "TREND"} · ACCUMULATION)`
                  : aiConfluenceState.mtfConfluence?.alignedCount >= 3 && aiConfluenceState.mtfConfluence?.direction === "BUY"
                  ? "🟢 CALL / BUY NOW (DUAL-ENGINE 100% PERFECT CONFLUENCE)"
                  : "🟢 CALL / BUY SIGNAL (ACTIVE MOMENTUM)"
                : isNoTrade
                ? `🔻 PUT / SELL LEAN (${prediction?.marketRegime || "TREND"} · DISTRIBUTION)`
                : aiConfluenceState.mtfConfluence?.alignedCount >= 3 && aiConfluenceState.mtfConfluence?.direction === "SELL"
                ? "🔻 PUT / SELL NOW (DUAL-ENGINE 100% PERFECT CONFLUENCE)"
                : "🔻 PUT / SELL SIGNAL (ACTIVE MOMENTUM)"}
            </span>
          </div>

          <div className="text-[8.5px] font-bold pt-1 border-t border-white/10 flex items-center justify-between opacity-95">
            <span className="text-white/80">🏦 BANKER & RETAIL FLOW:</span>
            <span className="font-black uppercase text-amber-200">
              {prediction?.isHighVolatility || hasHighImpactNews
                ? "⚡ BANKERS EXECUTING NEWS ORDERS | 👤 RETAIL WHIPSAW RISK"
                : isBuy
                ? "🏦 BANK ACCUMULATION CONFIRMED (100% BUY ALIGNED) | 👤 RETAIL TRAPPED SHORTING"
                : isSell
                ? "🏦 BANK DISTRIBUTION CONFIRMED (100% SELL ALIGNED) | 👤 RETAIL TRAPPED BUYING"
                : !dualEngineAgreed && has3PointConfirmation
                ? `⌛ MTF IS ${mtfDir} — STANDBY UNTIL ML MODEL CONFIRMS ${mtfDir}`
                : isTargetTfOpposed
                ? `⌛ MACRO IS ${mtfDir} — WAIT FOR ${timeframe.toUpperCase()} TO TURN ${mtfDir} BEFORE ENTERING`
                : isMtfConflict
                ? "🔍 BANKERS COLLECTING STOP LOSS | 👤 RETAIL PANIC SELLING"
                : "⌛ BANKERS BUILDING POSITION | 👤 RETAIL NOISE"}
            </span>
          </div>
        </div>

        {/* Institutional Sniper Confluence & Profit Sizing Gate */}
        {(() => {
          const isSniper = conf >= 75 && mtfForeCastCount >= 3 && !isVolShock;
          const isModerate = conf >= 68 && mtfForeCastCount >= 2 && !isVolShock;
          return (
            <div
              className={cn(
                "p-2 rounded-xl border flex items-center justify-between font-mono shadow-sm transition-all",
                isSniper
                  ? "bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-emerald-500/20 border-emerald-400/60 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.25)]"
                  : isModerate
                  ? "bg-sky-500/15 border-sky-400/40 text-sky-300"
                  : "bg-slate-800/80 border-slate-700/60 text-amber-300"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full", isSniper ? "bg-emerald-400 animate-ping" : isModerate ? "bg-sky-400" : "bg-amber-400")} />
                <div className="flex flex-col">
                  <span className="text-[8.5px] font-black uppercase tracking-wider">
                    {isSniper
                      ? "🎯 HIGH-PROFIT SNIPER SETUP"
                      : isModerate
                      ? "⚡ SELECTIVE MOMENTUM SETUP"
                      : "🛡️ CHOP FILTER ACTIVE (PRESERVE CAPITAL)"}
                  </span>
                  <span className="text-[7.5px] text-muted-foreground">
                    {isSniper
                      ? "Deep Bi-LSTM + 3/4 MTF Confluence · High Probability"
                      : isModerate
                      ? "Moderate Confluence · Trade cautiously"
                      : "Consolidation or conflicting timeframes · Stand aside"}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[7.5px] font-bold uppercase block text-muted-foreground">
                  REC. RISK
                </span>
                <span
                  className={cn(
                    "text-[10px] font-black px-1.5 py-0.5 rounded border inline-block",
                    isSniper
                      ? "bg-emerald-500/30 text-emerald-200 border-emerald-400"
                      : isModerate
                      ? "bg-sky-500/20 text-sky-200 border-sky-400/40"
                      : "bg-amber-500/20 text-amber-200 border-amber-400/40"
                  )}
                >
                  {isSniper ? "2.5% BALANCE" : isModerate ? "1.0% BALANCE" : "0% (WAIT)"}
                </span>
              </div>
            </div>
          );
        })()}

        {/* 4-Timeframe AI Candle Direction Matrix Card */}
        <div className="bg-slate-900/90 border border-slate-700/60 p-2.5 rounded-xl space-y-2 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BrainCircuit className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[9px] font-black text-sky-300 uppercase tracking-wider">
                4-TIMEFRAMES AI CANDLE PREDICTIONS
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono font-bold bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded border border-sky-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" /> Auto-Sync (Live)
              </span>
              <span
                className={cn(
                  "text-[9px] font-black px-1.5 py-0.5 rounded uppercase border font-mono",
                  mtfBadgeColor === "emerald"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : mtfBadgeColor === "amber"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                )}
              >
                {mtfForeCastCount}/4 ALIGNED
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {mtfTfs.map((tf: string) => {
              const sig = displayedTfSigs[tf];
              const tfKeyLower = tf.toLowerCase();
              const mtfDetail = persistentMtfDetails?.[tfKeyLower] ||
                                persistentMtfDetails?.[tf] ||
                                aiConfluenceState?.displayedTfDetails?.[tf] ||
                                aiConfluenceState?.displayedTfDetails?.[tfKeyLower] ||
                                (prediction as any)?.mtf_details?.[tfKeyLower] ||
                                (prediction as any)?.mtf_details?.[tf];
              const predictedColor = mtfDetail?.predicted_color || (sig === "BUY" ? "GREEN" : "RED");
              const tfConf = mtfDetail?.confidence;
              const isActiveTF =
                timeframe.toLowerCase() === tf.toLowerCase() ||
                (tf === "15m" && timeframe.toLowerCase() === "30m") ||
                (tf === "1H" &&
                  (timeframe.toLowerCase() === "60m" || timeframe.toLowerCase() === "4h"));
              return (
                <div
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={cn(
                    "p-1.5 rounded-lg border text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-0.5",
                    isActiveTF
                      ? "ring-2 ring-sky-400 font-bold scale-[1.03] shadow-md shadow-sky-500/20"
                      : "opacity-85 hover:opacity-100 hover:scale-[1.01]",
                    predictedColor === "GREEN"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-rose-500/15 border-rose-500/40 text-rose-300"
                  )}
                >
                  <span className="text-[8px] font-black uppercase text-muted-foreground">{tf}</span>
                  <span className="text-[9.5px] font-black font-mono">
                    {sig === "BUY" ? "🟢 BUY" : "🔴 SELL"}
                  </span>
                  <span
                    className={cn(
                      "text-[7px] font-black uppercase tracking-tight px-1 py-0.5 rounded border leading-none",
                      predictedColor === "GREEN"
                        ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/40"
                        : "bg-rose-500/25 text-rose-300 border-rose-500/40"
                    )}
                  >
                    {predictedColor} CANDLE {tfConf ? `${Math.round(tfConf)}%` : ""}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            className={cn(
              "p-2 rounded-lg border text-center font-mono uppercase shadow-inner flex flex-col gap-0.5 transition-all",
              mtfForeCastDir === "BUY"
                ? "bg-emerald-500/25 border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.2)]"
                : "bg-rose-500/25 border-rose-500/50 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
            )}
          >
            <span className="text-[7.5px] font-bold tracking-wider opacity-80">
              MULTI-TIMEFRAME CONFLUENCE FORECAST
            </span>
            <span className="text-[10px] font-black tracking-tight">
              {mtfForeCastCount === 2
                ? (currentTfDir === "BUY"
                    ? `🟢 2/4 TIMEFRAMES BALANCED · ACTIVE [${timeframe.toUpperCase()}] BUY BIAS`
                    : `🔻 2/4 TIMEFRAMES BALANCED · ACTIVE [${timeframe.toUpperCase()}] SELL BIAS`)
                : (mtfForeCastDir === "BUY"
                    ? `🟢 ${mtfForeCastCount}/4 TIMEFRAMES ALIGNED IN BUY DIRECTION`
                    : `🔻 ${mtfForeCastCount}/4 TIMEFRAMES ALIGNED IN SELL DIRECTION`)}
            </span>
          </div>
        </div>

        {/* Banker vs Retailer Order Flow Panel */}
        {(() => {
          const { bankerDir, bankPct, retailPct, bankStatus, detail, actionCardClass } = bankerPanel;
          return (
            <div className="bg-slate-900/90 border border-amber-500/40 p-3 rounded-xl space-y-2.5 shadow-md font-mono">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[9px] font-black text-amber-300 uppercase tracking-wider">
                    BANKER VS RETAILER PANEL
                  </span>
                </div>
                <span className="text-[8px] font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                  LIVE ORDER FLOW
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[8.5px] font-black uppercase">
                  <span className={bankerDir === "SELL" ? "text-rose-400" : "text-emerald-400"}>
                    🏦 BANKERS / INSTITUTIONS: {bankPct}%
                  </span>
                  <span className="text-sky-400">👤 RETAILERS: {retailPct}%</span>
                </div>
                <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden flex p-0.5 border border-white/10 shadow-inner">
                  <div
                    className={cn(
                      "h-full rounded-l-full transition-all duration-500",
                      bankerDir === "SELL"
                        ? "bg-gradient-to-r from-rose-500 to-amber-500"
                        : "bg-gradient-to-r from-emerald-500 to-amber-400"
                    )}
                    style={{ width: `${bankPct}%` }}
                  />
                  <div
                    className="h-full bg-sky-500/70 rounded-r-full transition-all duration-500"
                    style={{ width: `${retailPct}%` }}
                  />
                </div>
              </div>

              <div className={cn("p-2 rounded-lg space-y-0.5 shadow-sm", actionCardClass)}>
                <div className="text-[8.5px] font-black uppercase">{bankStatus}</div>
                <div className="text-[8px] opacity-90 font-medium">{detail}</div>
              </div>
            </div>
          );
        })()}

        {/* Real-time ATR Card */}
        <div
          className={cn(
            "p-2.5 rounded-xl border flex items-center justify-between transition-all shadow-sm",
            liveVolatility?.isHigh
              ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          )}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
              REAL-TIME MARKET ATR
            </span>
            <span className="text-[11px] font-black font-mono text-white">
              ${liveVolatility?.atrValue}{" "}
              <span className="text-[8px] font-normal text-muted-foreground">
                (7-Period Fast ATR)
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-black">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                liveVolatility?.isHigh ? "bg-amber-400 animate-ping" : "bg-emerald-400"
              )}
            />
            {liveVolatility?.label}
          </div>
        </div>

        {/* Spike Warning */}
        {spikeAlert?.active && (
          <div
            className={cn(
              "p-2.5 rounded-xl flex items-center justify-between shadow-lg animate-pulse border-2",
              spikeAlert.type === "DROP" || spikeAlert.type === "IMMINENT"
                ? "bg-rose-500/25 border-rose-500 text-rose-200"
                : "bg-emerald-500/25 border-emerald-500 text-emerald-200"
            )}
          >
            <div className="flex items-center gap-1.5 font-mono text-[9px] font-black uppercase">
              <span
                className={cn(
                  "w-2 h-2 rounded-full animate-ping",
                  spikeAlert.type === "DROP" || spikeAlert.type === "IMMINENT"
                    ? "bg-rose-400"
                    : "bg-emerald-400"
                )}
              />
              <span>{spikeAlert.message}</span>
            </div>
            <span
              className={cn(
                "text-[8px] font-black font-mono px-2 py-0.5 rounded uppercase",
                spikeAlert.type === "DROP" || spikeAlert.type === "IMMINENT"
                  ? "bg-rose-600 text-white"
                  : "bg-emerald-600 text-white"
              )}
            >
              {spikeAlert.type === "IMMINENT" ? "AVOID TRADE" : "VOLATILITY"}
            </span>
          </div>
        )}

        {/* News Event Alert */}
        {hasHighImpactNews && (
          <div className="bg-amber-500/15 border border-amber-500/40 p-2 rounded-xl flex items-center justify-between text-amber-300 shadow-sm transition-all animate-pulse">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="text-[9px] font-black uppercase tracking-wider">⚠️ NEWS EVENT ALERT</span>
            </div>
            <button
              onClick={() =>
                toast({
                  title: "🚨 HIGH-IMPACT NEWS EVENT DETECTED",
                  description:
                    "High Volatility Economic Event (CPI / NFP / FOMC) detected in news feed. Avoid entering short-term trades during high volatility news windows.",
                  variant: "destructive",
                })
              }
              className="text-[9px] font-black uppercase font-mono bg-amber-500 text-black px-2 py-0.5 rounded hover:bg-amber-400 transition-all shadow cursor-pointer active:scale-95"
            >
              HIGH VOLATILITY WARNING
            </button>
          </div>
        )}

        {/* TP/SL Levels with Bank Sweep Trigger */}
        {(() => {
          const { symUpper, epVal, tpVal, slVal, slPtsStr, slPipsStr, tpPtsStr, tpPipsStr } = tpSlLevels;
          return (
            <div className="space-y-2">
              <div
                onClick={() => {
                  setBankSweepDetails({
                    symbol: symUpper,
                    direction: isBuy ? "BUY" : "SELL",
                    entryPrice: epVal,
                    stopLoss: slVal,
                    takeProfit: tpVal,
                    supLevel: prediction?.orderBlock?.bottom ?? slVal,
                    resLevel: prediction?.orderBlock?.top ?? slVal,
                    sweptLo: isBuy,
                    sweptHi: !isBuy,
                    time: Math.floor(Date.now() / 1000),
                  });
                  setBankPopUpOpen(true);
                }}
                className="bg-gradient-to-r from-amber-500/25 via-zinc-950 to-amber-500/15 border-2 border-amber-500/50 hover:border-amber-400 cursor-pointer transition-all rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-amber-300 shadow-xl shadow-amber-500/10 group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                  </span>
                  <div>
                    <div className="font-black text-xs tracking-tight flex items-center gap-1.5 text-amber-300 group-hover:text-amber-200">
                      ⚡ LIVE ALERT: BANK ENTERING TO COLLECT STOP-LOSS
                    </div>
                    <div className="text-[10px] text-amber-400/90 font-medium">
                      Institutional Entry:{" "}
                      <span className="font-mono font-bold text-amber-200">${epVal.toLocaleString()}</span> · Bias:{" "}
                      <span className={cn("font-bold", isBuy ? "text-emerald-300" : "text-rose-400")}>
                        {isBuy ? "BUY (UP)" : "SELL (DOWN)"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-[10px] font-mono font-black bg-amber-500/20 text-amber-200 px-2.5 py-1 rounded-lg border border-amber-500/40">
                    Collected: -{slPtsStr} ({slPipsStr})
                  </div>
                  <span className="text-[9px] bg-amber-500/30 text-amber-300 font-bold px-2 py-1 rounded-lg group-hover:bg-amber-500/50 transition-all">
                    Breakdown →
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-sky-500/10 border border-sky-500/20 p-2 rounded-xl text-center">
                  <span className="text-[7.5px] font-bold text-sky-400 uppercase block tracking-wider">
                    📍 Entry Price (EP)
                  </span>
                  <span className="text-[11px] font-black font-mono text-sky-300">
                    {epVal > 0 ? `$${epVal.toFixed(2)}` : "..."}
                  </span>
                  <span className="text-[8.5px] font-semibold text-sky-400/80 block mt-0.5">Signal Base</span>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-xl text-center relative overflow-hidden">
                  <span className="absolute top-0.5 right-0.5 text-[6px] font-black bg-emerald-500/30 text-emerald-300 px-1 rounded uppercase">
                    +{tpPtsStr}
                  </span>
                  <span className="text-[7.5px] font-bold text-emerald-400 uppercase block tracking-wider">
                    🎯 Target (TP)
                  </span>
                  <span className="text-[11px] font-black font-mono text-emerald-300">
                    {tpVal > 0 ? `$${tpVal.toFixed(2)}` : "..."}
                  </span>
                  <span className="text-[8.5px] font-bold text-emerald-400 block mt-0.5">
                    +{tpPtsStr}{" "}
                    <span className="text-[7.5px] text-emerald-400/70 font-normal">({tpPipsStr})</span>
                  </span>
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 p-2 rounded-xl text-center relative overflow-hidden">
                  <span className="absolute top-0.5 right-0.5 text-[6px] font-black bg-rose-500/30 text-rose-300 px-1 rounded uppercase">
                    -{slPtsStr}
                  </span>
                  <span className="text-[7.5px] font-bold text-rose-400 uppercase block tracking-wider">
                    🛡️ Stop Loss (SL)
                  </span>
                  <span className="text-[11px] font-black font-mono text-rose-300">
                    {slVal > 0 ? `$${slVal.toFixed(2)}` : "..."}
                  </span>
                  <span className="text-[8.5px] font-bold text-rose-400 block mt-0.5">
                    -{slPtsStr}{" "}
                    <span className="text-[7.5px] text-rose-400/70 font-normal">({slPipsStr})</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Confluence meter */}
        <div className="space-y-1">
          <div className="flex justify-between text-[9px] font-bold uppercase">
            <span className="text-muted-foreground">Current Confluence</span>
            <span className="text-emerald-400">{conf}% SCORE</span>
          </div>
          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
            <div
              className={cn(
                "h-full transition-all duration-700 rounded-full",
                isBuy
                  ? "bg-gradient-to-r from-emerald-500 to-teal-300 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : "bg-gradient-to-r from-rose-500 to-orange-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
              )}
              style={{ width: `${conf}%` }}
            />
          </div>
        </div>

        {/* Train AI Predictor Controls */}
        <div className="pt-1">
          {isTraining ? (
            <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl text-center space-y-2">
              <div className="flex items-center justify-between text-[8px] font-black text-primary uppercase">
                <span>Optimizing Confluence Matrix...</span>
                <span className="animate-pulse">{trainingProgress}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-300 rounded-full"
                  style={{ width: `${trainingProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={handleTrainAI}
              className="w-full py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl text-[9px] font-black uppercase text-primary tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md shadow-primary/5 active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
              Train Predictor Weights (Maximize Accuracy)
            </button>
          )}
        </div>
      </div>

      <Button
        size="sm"
        className="w-full h-8 text-[10px] font-black uppercase mt-4 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
        onClick={() => setShowPaymentModal(true)}
      >
        Institutional Credits: {totalRemaining} Remaining
      </Button>
    </div>
  );
};

export default QuantEdgeModal;
