import { Router, type Request, type Response, type NextFunction } from "express";
import { storage } from "../storage";
import { z } from "zod";

const router = Router();

// ── ADMIN PRIVILEGE CHECK MIDDLEWARE ────────────────────────
export const checkAdmin = (req: any, res: Response, next: NextFunction) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    const email = ((req.user as any).email || "").toLowerCase();
    const role = (req.user as any).role || "";
    const adminEmails = ["saran123@gmail.com", "htctrade123@gmail.com"];
    if (adminEmails.includes(email) || role === "ADMIN_1" || role === "ADMIN_2") {
      return next();
    }
  }
  return res.status(403).json({ message: "Access Denied: Admin privileges required." });
};

// 1. List all users with basic info
router.get("/api/admin/users", checkAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await storage.getAllUsers();
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// 2. Comprehensive User Profile / Monitoring
router.get("/api/admin/users/:id/monitoring", checkAdmin, async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id);
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const loginHistory = await storage.getLoginHistory(userId);
    const activities = await storage.getUserActivities(userId);

    const orders = await storage.listOrders(userId);
    const timeTrades = await storage.listTimeBasedOrders(userId);
    const transactions = await storage.getWalletTransactions(userId);

    res.json({
      user,
      loginHistory,
      activities,
      trades: {
        standard: orders,
        timeBased: timeTrades
      },
      transactions,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// 3. User Control: Block / Unblock / Restrict AI
router.patch("/api/admin/users/:id/control", checkAdmin, async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id);
    const { isBlocked, isAIBlocked } = z.object({
      isBlocked: z.boolean().optional(),
      isAIBlocked: z.boolean().optional(),
    }).parse(req.body);

    const updated = await storage.updateUserAdminFlags(userId, { isBlocked, isAIBlocked });

    if (isBlocked !== undefined) {
      await storage.logActivity(userId, isBlocked ? "BLOCKED" : "UNBLOCKED", "Status changed by administrator");
    }
    if (isAIBlocked !== undefined) {
      await storage.logActivity(userId, isAIBlocked ? "AI_RESTRICTED" : "AI_ENABLED", "AI access changed by administrator");
    }

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// 4. Withdrawal Management
router.get("/api/admin/withdrawals", checkAdmin, async (_req: Request, res: Response) => {
  try {
    const list = await storage.getAllWithdrawalRequests();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/admin/withdrawals/:id/status", checkAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { status, adminNotes } = z.object({
      status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]),
      adminNotes: z.string().optional()
    }).parse(req.body);

    const currentReq = (await storage.getAllWithdrawalRequests()).find(r => r.id === id);
    if (!currentReq) return res.status(404).json({ message: "Request not found" });

    if (status === "REJECTED" && currentReq.status === "PENDING") {
      // Refund the amount if rejected
      await storage.updateWalletBalance(currentReq.userId, parseFloat(currentReq.amount));
      await storage.logActivity(currentReq.userId, "WITHDRAWAL_REJECTED", `Refunded ₹${currentReq.amount} due to rejection`);
    }

    const updated = await storage.updateWithdrawalStatus(id, status, adminNotes);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
