import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { api } from "@shared/routes";
import { z } from "zod";

const router = Router();

// ── STANDARD SPOT ORDERS ────────────────────────────────────
router.get(api.orders.list.path, isAuthenticated, async (req: any, res: Response) => {
  const userId = req.user.claims?.sub || req.user.id;
  const list = await storage.listOrders(userId);
  res.json(list);
});

router.post(api.orders.create.path, isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims?.sub || req.user.id;
    const input = api.orders.create.input.parse(req.body);
    const order = await storage.createOrder(userId, input as any);
    res.status(201).json(order);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0]?.message ?? "Invalid request",
        field: err.errors[0]?.path?.join("."),
      });
    }
    throw err;
  }
});

router.post(api.orders.cancel.path, isAuthenticated, async (req: any, res: Response) => {
  const userId = req.user.claims?.sub || req.user.id;
  const id = Number(req.params.id);
  const updated = await storage.cancelOrder(userId, id);
  if (!updated) return res.status(404).json({ message: "Order not found" });
  res.json(updated);
});

// ── TIME-BASED BINARY TRADES ────────────────────────────────
router.get(api.timeTrades.list.path, isAuthenticated, async (req: any, res: Response) => {
  const userId = req.user.claims?.sub || req.user.id;
  const list = await storage.listTimeBasedOrders(userId);
  res.json(list);
});

router.post(api.timeTrades.create.path, isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims?.sub || req.user.id;
    const input = api.timeTrades.create.input.parse(req.body);

    const user = await storage.getUser(userId);
    const amountStr = input.amount as unknown as string;
    const amount = parseFloat(amountStr);
    const mode = user?.tradeMode ?? "DEMO";

    if (mode === "REAL") {
      // Real mode: deduct from realBalance
      if (!user || parseFloat(user.walletBalance as string) < amount) {
        return res.status(400).json({ message: "Insufficient Real Wallet Balance. Deposit funds to trade real markets!" });
      }
      await storage.updateWalletBalance(userId, -amount);
      const order = await storage.createTimeBasedOrder(userId, input as any);
      await storage.createWalletTransaction({
        userId, type: "TRADE_DEDUCTION", amount: String(amount),
        status: "SUCCESS", referenceId: String(order.id), mode: "REAL"
      } as any);
      res.status(201).json(order);
    } else {
      // Demo mode: deduct from demoBalance
      if (!user || parseFloat(user.demoBalance as string) < amount) {
        return res.status(400).json({ message: "Insufficient Demo Balance. Reset demo account to get $10,000 again!" });
      }
      await storage.updateDemoBalance(userId, -amount);
      const order = await storage.createTimeBasedOrder(userId, input as any);
      await storage.createWalletTransaction({
        userId, type: "TRADE_DEDUCTION", amount: String(amount),
        status: "SUCCESS", referenceId: String(order.id), mode: "DEMO"
      } as any);
      res.status(201).json(order);
    }
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      console.error("ZOD ERROR in /api/time-trades:", JSON.stringify(err.errors, null, 2));
      return res.status(400).json({
        message: err.errors[0]?.message ?? "Invalid request",
        field: err.errors[0]?.path?.join("."),
      });
    }
    console.error("OTHER ERROR in /api/time-trades:", err);
    return res.status(400).json({ message: err.message || "Invalid request" });
  }
});

// ── EARLY SELL / SETTLEMENT ─────────────────────────────────
router.post("/api/timeTrades/:id/sell", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims?.sub || req.user.id;
    const orderId = Number(req.params.id);

    const orders = await storage.getActiveTimeBasedOrders();
    const trade = orders.find(o => o.id === orderId && String(o.userId) === userId);

    if (!trade) {
      return res.status(404).json({ message: "Active trade not found for immediate sale." });
    }

    const { db } = await import("../db");
    const { latestPrices } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const [priceRow] = await db.select().from(latestPrices).where(eq(latestPrices.instrumentId, trade.instrumentId));
    if (!priceRow || !priceRow.price) return res.status(400).json({ message: "No current price available." });

    const currentPrice = parseFloat(priceRow.price as string);
    const strike = parseFloat(trade.strikePrice as string);
    let isWin = false;

    if (trade.side === "BUY") isWin = currentPrice > strike;
    if (trade.side === "SELL") isWin = currentPrice < strike;

    const parsedAmount = parseFloat(trade.amount as string);
    const payout = parseFloat(trade.payoutRatio || "0.85");
    let returnAmount = 0;
    let status = "LOSS";

    if (Math.abs(currentPrice - strike) < 0.0001) {
      status = "TIE";
      returnAmount = parsedAmount;
    } else if (isWin) {
      returnAmount = parsedAmount + (parsedAmount * payout);
      status = "WIN";
    }

    await storage.updateTimeBasedOrder(trade.id, {
      status: status as any,
      settlePrice: currentPrice.toString(),
    });

    if ((status === "WIN" || status === "TIE") && returnAmount > 0) {
      const txs = await storage.getWalletTransactions(userId);
      const deductTx = txs.find(t => t.referenceId === String(trade.id) && t.type === "TRADE_DEDUCTION");
      const tradeMode = (deductTx as any)?.mode ?? "REAL";

      if (tradeMode === "DEMO") {
        await storage.updateDemoBalance(userId, returnAmount);
      } else {
        await storage.updateWalletBalance(userId, returnAmount);
      }

      const txType = status === "TIE" ? "TRADE_REFUND" : "TRADE_WIN";
      await storage.createWalletTransaction({
        userId, type: txType, amount: String(returnAmount),
        status: "SUCCESS", referenceId: String(trade.id), mode: tradeMode
      } as any);
    }

    res.json({ message: "Trade settled immediately.", status, returnAmount });
  } catch (err: any) {
    console.error("Manual Sell Error:", err);
    res.status(500).json({ message: "Failed to settle early." });
  }
});

export default router;
