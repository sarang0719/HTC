#!/usr/bin/env python3
"""
train_deep_models.py
Trains the Deep Sequential Transformer-BiLSTM Neural Network across 4 timeframes
(1m, 5m, 15m, 1h) for both BTCUSD (Bitcoin) and XAUUSD (Gold).
Uses Apple Metal GPU (MPS) acceleration and saves checkpoints to saved_models/.
"""

import os
import sys
import time
import shutil
import requests
from datetime import datetime, timezone
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))

from dataset import load_cached_data, fetch_historical_data
from feature_engine import generate_features
from deep_sequential_model import train_deep_sequence_model

ASSETS = [
    ("BTCUSDT", "BTCUSD", "Bitcoin"),
    ("PAXGUSDT", "XAUUSD", "Gold"),
]

TIMEFRAMES = [
    ("1m",  35000),
    ("5m",  35000),
    ("15m", 35000),
    ("1h",  35000),
]

def run_deep_training():
    print("=" * 100)
    print("  🧠 TRAINING DEEP SEQUENTIAL TRANSFORMER-BiLSTM NEURAL NETWORK")
    print("  Architecture: 10-Candle Sequences | Bidirectional LSTM + Multi-Head Self-Attention")
    print("  Timeframes: 1m, 5m, 15m, 1h | Assets: BTCUSD & XAUUSD")
    print("=" * 100)

    model_dir = os.path.join(os.path.dirname(__file__), "saved_models")
    os.makedirs(model_dir, exist_ok=True)
    summary_report = {}

    for raw_symbol, display_symbol, asset_name in ASSETS:
        print(f"\n" + "#" * 90)
        print(f"  ASSET: {display_symbol} ({asset_name}) — Deep Sequential Neural Network Training")
        print("#" * 90)

        asset_results = []

        for tf, limit in TIMEFRAMES:
            print(f"\n[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] ---> Loading {display_symbol} [{tf}] data...")
            df = load_cached_data(raw_symbol, tf)
            if df is None or len(df) < 500:
                try:
                    df = fetch_historical_data(raw_symbol, tf, limit=limit, use_cache=True)
                except Exception as e:
                    print(f"[-] Data fetch error for {display_symbol} {tf}: {e}")
                    continue

            if df is None or len(df) < 200:
                print(f"[-] Insufficient data for {display_symbol} {tf}")
                continue

            print(f"  [+] Ingested {len(df):,} candles ({df['timestamp'].min()} to {df['timestamp'].max()})")
            print("  [*] Generating stationary features, SMC liquidity indicators & regimes...")
            df_feat = generate_features(df, drop_warmup=True)

            print(f"  [*] Training PyTorch Transformer-BiLSTM on {display_symbol} [{tf}]...")
            model, best_acc, meta = train_deep_sequence_model(
                df=df_feat,
                symbol=raw_symbol,
                timeframe=tf,
                epochs=25,
                batch_size=128,
                lr=1.2e-3,
                save_dir=model_dir
            )

            # Copy checkpoint to display symbol alias (e.g., BTCUSDT_1m_deep.pt -> BTCUSD_1m_deep.pt)
            if display_symbol != raw_symbol:
                for suffix in ["_deep.pt", "_deep_meta.json"]:
                    src = os.path.join(model_dir, f"{raw_symbol}_{tf}{suffix}")
                    dst = os.path.join(model_dir, f"{display_symbol}_{tf}{suffix}")
                    if os.path.exists(src):
                        shutil.copy2(src, dst)

            res = {
                "symbol": display_symbol,
                "timeframe": tf,
                "oos_accuracy_pct": round(best_acc * 100.0, 2),
                "tier_results": meta.get("tier_results", {})
            }
            asset_results.append(res)

        summary_report[display_symbol] = asset_results

    print("\n" + "=" * 100)
    print("  🏆 DEEP SEQUENTIAL TRANSFORMER-BiLSTM NEURAL NETWORKS TRAINED SUCCESSFULLY")
    print("=" * 100)
    for asset, r_list in summary_report.items():
        print(f"\n  Asset: {asset}")
        for r in r_list:
            print(f"    [{r['timeframe']:>3}]: OOS Accuracy: {r['oos_accuracy_pct']}% | High-Conviction Tiers: {r['tier_results']}")
    print("=" * 100)

    # Hot-reload in FastAPI inference engine
    print("\n[*] Hot-reloading models into live FastAPI engine...")
    try:
        resp = requests.post("http://127.0.0.1:8008/api/reload-models", timeout=5)
        if resp.status_code == 200:
            print("  [✓] Live FastAPI prediction engine reloaded and synchronized with Deep Sequence Models!")
    except Exception as e:
        print(f"  [-] Reload notice: {e}")

    return summary_report

if __name__ == "__main__":
    run_deep_training()
