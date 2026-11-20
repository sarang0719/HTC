import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { z } from "zod";
import crypto from "crypto";

const router = Router();

// AI PREDICTION PLANS
const AI_PLANS: Record<string, { credits: number; amountPaise: number; label: string }> = {
  starter: { credits: 4, amountPaise: 50000, label: "₹500 – 4 AI Predictions" },
  pro: { credits: 10, amountPaise: 100000, label: "₹1000 – 10 AI Predictions" },
};

// ── GET WALLET INFO ─────────────────────────────────────────
router.get("/api/wallet/info", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims?.sub || req.user.id;
    const info = await storage.getWalletInfo(userId);
    res.json(info ?? { realBalance: "0.00", demoBalance: "10000.00", tradeMode: "DEMO" });
  } catch {
    res.status(500).json({ realBalance: "0.00", demoBalance: "10000.00", tradeMode: "DEMO" });
  }
});

// Legacy /api/wallet endpoint
router.get("/api/wallet", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims?.sub || req.user.id;
    const user = await storage.getUser(userId);
    res.json({ balance: user?.walletBalance || "0.00" });
  } catch {
    res.status(500).json({ balance: "0.00" });
  }
});

router.get("/api/wallet/transactions", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims?.sub || req.user.id;
    const txs = await storage.getWalletTransactions(userId);
    res.json(txs);
  } catch {
    res.status(500).json([]);
  }
});

// ── SWITCH TRADE MODE: DEMO <-> REAL ────────────────────────
router.post("/api/wallet/mode", isAuthenticated, async (req: any, res: Response) => {
  try {
    const { mode } = z.object({ mode: z.enum(["DEMO", "REAL"]) }).parse(req.body);
    const userId = req.user.claims?.sub || req.user.id;
    const updated = await storage.setTradeMode(userId, mode);
    return res.json({ tradeMode: updated.tradeMode, realBalance: updated.walletBalance, demoBalance: updated.demoBalance });
  } catch (e: any) {
    return res.status(400).json({ message: e.message });
  }
});

// ── RESET DEMO ACCOUNT ──────────────────────────────────────
router.post("/api/wallet/demo/reset", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims?.sub || req.user.id;
    const updated = await storage.resetDemoBalance(userId);
    await storage.createWalletTransaction({
      userId, type: "DEMO_RESET" as any, amount: "10000.00",
      status: "SUCCESS", mode: "DEMO"
    } as any);
    return res.json({ demoBalance: updated.demoBalance, message: "Demo balance reset to $10,000" });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

// ── WITHDRAWALS ─────────────────────────────────────────────
router.post("/api/wallet/withdraw", isAuthenticated, async (req: any, res: Response) => {
  try {
    const body = req.body;
    const userId = req.user.claims?.sub || req.user.id;

    // Support both simple amount number and detailed method/details schema
    if (typeof body.amount === "number") {
      const { amount } = z.object({ amount: z.number().min(10) }).parse(body);
      const user = await storage.getUser(userId);
      if (!user || parseFloat(user.walletBalance as string) < amount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      const updatedUser = await storage.updateWalletBalance(userId, -amount);
      const tx = await storage.createWalletTransaction({
        userId, type: "WITHDRAW", amount: String(amount), status: "SUCCESS", mode: "REAL"
      } as any);

      return res.json({ message: "Withdrawal successful", transaction: tx, newBalance: updatedUser.walletBalance });
    }

    const { amount, method, details } = z.object({
      amount: z.string(),
      method: z.string(),
      details: z.string(),
    }).parse(body);

    const amountVal = parseFloat(amount);
    const walletInfo = await storage.getWalletInfo(userId);

    if (!walletInfo || parseFloat(walletInfo.realBalance) < amountVal) {
      return res.status(400).json({ message: "Insufficient balance for withdrawal" });
    }

    // Freeze funds and create pending withdrawal
    await storage.updateWalletBalance(userId, -amountVal);

    const request = await storage.createWithdrawalRequest({
      userId,
      amount,
      method,
      details,
      status: "PENDING"
    });

    await storage.createWalletTransaction({
      userId,
      type: "WITHDRAW",
      amount: String(-amountVal),
      status: "PENDING",
      mode: "REAL",
      referenceId: `WD-${request.id}`
    } as any);

    await storage.logActivity(userId, "WITHDRAWAL_REQUEST", `Requested ₹${amount} via ${method}`);
    res.json(request);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/api/wallet/withdrawals", isAuthenticated, async (req: any, res: Response) => {
  const userId = req.user.claims?.sub || req.user.id;
  const list = await storage.getUserWithdrawalRequests(userId);
  res.json(list);
});

// ── RAZORPAY WALLET DEPOSITS ────────────────────────────────
router.post("/api/wallet/deposit/create-order", isAuthenticated, async (req: any, res: Response) => {
  try {
    const { amount } = z.object({ amount: z.number().min(50) }).parse(req.body);
    const Razorpay = (await import("razorpay")).default;
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_SYjafmuTvifatp",
      key_secret: process.env.RAZORPAY_KEY_SECRET || "kqh3FVifvQJFCkfcv056TS6d"
    });
    const userId = req.user.claims?.sub || req.user.id;
    const order = await rzp.orders.create({
      amount: Math.round(amount * 100), currency: "INR",
      notes: { userId, type: "WALLET_DEPOSIT" }
    });
    return res.json({ orderId: order.id, amount: amount * 100, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_SYjafmuTvifatp" });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

router.post("/api/wallet/deposit/verify", isAuthenticated, async (req: any, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
    const secret = process.env.RAZORPAY_KEY_SECRET || "kqh3FVifvQJFCkfcv056TS6d";
    const expected = crypto.createHmac("sha256", secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (expected !== razorpay_signature) return res.status(400).json({ message: "Signature mismatch" });

    const userId = req.user.claims?.sub || req.user.id;
    // Check idempotency: don't double-credit same payment
    const existing = await storage.getWalletTransactions(userId);
    if (existing.some(t => t.referenceId === razorpay_payment_id)) {
      return res.status(409).json({ message: "Payment already processed" });
    }

    const updatedUser = await storage.updateWalletBalance(userId, amount);
    await storage.createWalletTransaction({
      userId, type: "DEPOSIT", amount: String(amount), status: "SUCCESS",
      referenceId: razorpay_payment_id, mode: "REAL"
    } as any);

    res.json({ success: true, newBalance: updatedUser.walletBalance });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

// ── RAZORPAY WEBHOOK ────────────────────────────────────────
router.post("/api/razorpay/webhook", async (req: any, res: Response) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
    const signature = req.headers["x-razorpay-signature"] as string;

    if (webhookSecret) {
      const body = JSON.stringify(req.body);
      const expected = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");
      if (expected !== signature) {
        return res.status(400).json({ message: "Invalid webhook signature" });
      }
    }

    const event = req.body;
    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity;
      if (!payment) return res.status(200).json({ ok: true });

      const userId = payment.notes?.userId;
      const type = payment.notes?.type;
      if (!userId || type !== "WALLET_DEPOSIT") return res.status(200).json({ ok: true });

      const existing = await storage.getWalletTransactions(userId);
      if (existing.some(t => t.referenceId === payment.id)) {
        return res.status(200).json({ ok: true, message: "Already processed" });
      }

      const amountInRupees = payment.amount / 100;
      await storage.updateWalletBalance(userId, amountInRupees);
      await storage.createWalletTransaction({
        userId, type: "DEPOSIT", amount: String(amountInRupees),
        status: "SUCCESS", referenceId: payment.id, mode: "REAL"
      } as any);

      console.log(`[Webhook] Credited ₹${amountInRupees} to user ${userId}`);
    }
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[Webhook] Error:", e.message);
    return res.status(500).json({ message: e.message });
  }
});

// ── RAZORPAY AI PLAN PURCHASE ───────────────────────────────
router.post("/api/razorpay/create-order", isAuthenticated, async (req: any, res: Response) => {
  try {
    const { planId } = z.object({ planId: z.string() }).parse(req.body);
    const plan = AI_PLANS[planId];
    if (!plan) return res.status(400).json({ message: "Invalid plan" });
    const Razorpay = (await import("razorpay")).default;
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_SYjafmuTvifatp",
      key_secret: process.env.RAZORPAY_KEY_SECRET || "kqh3FVifvQJFCkfcv056TS6d",
    });
    const userId = req.user.claims?.sub || req.user.id;
    const order = await rzp.orders.create({
      amount: plan.amountPaise, currency: "INR",
      notes: { planId, userId },
    });
    return res.json({
      orderId: order.id, amount: plan.amountPaise, currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_SYjafmuTvifatp",
      planLabel: plan.label, credits: plan.credits
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to create order" });
  }
});

router.post("/api/razorpay/verify", isAuthenticated, async (req: any, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } =
      z.object({
        razorpay_order_id: z.string(), razorpay_payment_id: z.string(),
        razorpay_signature: z.string(), planId: z.string()
      }).parse(req.body);

    const secret = process.env.RAZORPAY_KEY_SECRET || "kqh3FVifvQJFCkfcv056TS6d";
    const expected = crypto.createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (expected !== razorpay_signature)
      return res.status(400).json({ message: "Payment signature mismatch" });
    const plan = AI_PLANS[planId];
    if (!plan) return res.status(400).json({ message: "Invalid plan" });
    const userId = req.user.claims?.sub || req.user.id;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const newPaid = (user.paidCredits ?? 0) + plan.credits;
    await storage.updateAiCredits(userId, { paidCredits: newPaid });
    return res.json({ success: true, creditsAdded: plan.credits, totalPaidCredits: newPaid });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || "Verification failed" });
  }
});

export default router;
