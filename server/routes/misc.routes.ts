import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { api } from "@shared/routes";
import { z } from "zod";

const router = Router();

// ── WATCHLISTS ──────────────────────────────────────────────
router.get(api.watchlists.list.path, isAuthenticated, async (req: any, res: Response) => {
  const userId = req.user.claims?.sub || req.user.id;
  const watchlists = await storage.listWatchlists(userId);
  res.json(watchlists);
});

router.post(api.watchlists.create.path, isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims?.sub || req.user.id;
    const input = api.watchlists.create.input.parse(req.body);
    const id = await storage.createWatchlist(userId, input as any);
    res.status(201).json({ id });
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

router.get(api.watchlists.get.path, isAuthenticated, async (req: any, res: Response) => {
  const userId = req.user.claims?.sub || req.user.id;
  const id = Number(req.params.id);
  const wl = await storage.getWatchlistDetail(userId, id);
  if (!wl) return res.status(404).json({ message: "Watchlist not found" });
  res.json(wl);
});

router.post(api.watchlists.addItem.path, isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims?.sub || req.user.id;
    const watchlistId = Number(req.params.id);
    const input = api.watchlists.addItem.input.parse(req.body);
    await storage.addWatchlistItem(userId, watchlistId, input as any);
    res.status(201).json({ ok: true });
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

router.delete(api.watchlists.removeItem.path, isAuthenticated, async (req: any, res: Response) => {
  const userId = req.user.claims?.sub || req.user.id;
  const watchlistId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  await storage.removeWatchlistItem(userId, watchlistId, itemId);
  res.status(204).send();
});

// ── PORTFOLIO ───────────────────────────────────────────────
router.get(api.portfolio.summary.path, isAuthenticated, async (req: any, res: Response) => {
  const userId = req.user.claims?.sub || req.user.id;
  const summary = await storage.getPortfolioSummary(userId);
  res.json(summary);
});

router.post(api.portfolio.create.path, isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims?.sub || req.user.id;
    const input = api.portfolio.create.input.parse(req.body);
    const id = await storage.createPortfolio(userId, input as any);
    res.status(201).json({ id });
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

// ── NEWS & EDUCATION ────────────────────────────────────────
router.get(api.market.news.path, async (_req: Request, res: Response) => {
  const news = await storage.getNews();
  res.json(news);
});

router.get(api.learn.list.path, async (_req: Request, res: Response) => {
  const learn = await storage.listLearn();
  res.json(learn);
});

router.get(api.learn.get.path, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const article = await storage.getLearn(id);
  if (!article) return res.status(404).json({ message: "Article not found" });
  res.json(article);
});

// ── USER SETTINGS & AGREEMENTS ──────────────────────────────
router.post("/api/user/commission-agreement", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims?.sub || req.user.id;
    const updated = await storage.updateUser(userId, { commissionAgreed: true });
    return res.json({ commissionAgreed: updated.commissionAgreed });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

router.patch("/api/user/settings", async (req: Request, res: Response) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) return res.sendStatus(401);
  try {
    const { phoneNumber } = z.object({ phoneNumber: z.string().max(20) }).parse(req.body);
    const userId = (req.user as any).id || (req.user as any).claims?.sub;
    const updated = await storage.updateUser(userId, { phoneNumber });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
