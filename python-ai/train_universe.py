#!/usr/bin/env python3
"""
TRAIN UNIVERSE: High-Precision Candle Direction & Profit Optimization Engine
Retrains all canonical models with:
- Directional Candle Expansion Target (Green / Red)
- 2.0:1 Institutional Reward:Risk Target & SL Calibration
- Profit-weighted Sample Expansion Weights
- Multi-Tree Calibrated Soft Ensemble
"""

import sys
import os
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

from train import run_training

MODELS_TO_TRAIN = [
    # Bitcoin Core (BTCUSD / BTCUSDT)
    ("BTCUSDT", "1m", 20000, 0.30),
    ("BTCUSDT", "3m", 20000, 0.28),
    ("BTCUSDT", "5m", 20000, 0.28),
    ("BTCUSDT", "15m", 20000, 0.25),
    ("BTCUSDT", "30m", 20000, 0.25),
    ("BTCUSDT", "1h", 20000, 0.22),
    
    # Gold Core (XAUUSD / PAXGUSDT)
    ("PAXGUSDT", "1m", 20000, 0.30),
    ("PAXGUSDT", "3m", 20000, 0.28),
    ("PAXGUSDT", "5m", 20000, 0.28),
    ("PAXGUSDT", "15m", 20000, 0.25),
    ("PAXGUSDT", "30m", 20000, 0.25),
    ("PAXGUSDT", "1h", 20000, 0.22),
]

def main():
    print("=" * 80)
    print("  🚀 TRAINING THE COMPLETE AI CANDLE PREDICTION UNIVERSE")
    print(f"  Target Models: {len(MODELS_TO_TRAIN)} across Crypto, Gold, Forex")
    print(f"  Target: Profit-Optimized Candle Expansion (Green/Red) | 2.0:1 R:R")
    print("=" * 80)

    total_start = time.time()
    trained = 0
    errors = 0

    for sym, tf, limit, k in MODELS_TO_TRAIN:
        print(f"\n[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] ---> Ingesting & Training {sym} [{tf}]...")
        t0 = time.time()
        try:
            m = run_training(sym, tf, limit=limit, k_factor=k)
            if m is not None:
                trained += 1
                print(f"  [✓] {sym}_{tf} completed in {time.time()-t0:.1f}s")
            else:
                errors += 1
                print(f"  [-] {sym}_{tf} returned None")
        except Exception as e:
            errors += 1
            print(f"  [X] Error training {sym}_{tf}: {e}")

    elapsed = time.time() - total_start
    print("\n" + "=" * 80)
    print(f"  ✨ UNIVERSE TRAINING COMPLETE: {trained}/{len(MODELS_TO_TRAIN)} models trained in {elapsed/60:.1f} minutes ({errors} errors).")
    print("=" * 80)

if __name__ == "__main__":
    main()
