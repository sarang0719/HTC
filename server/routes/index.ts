import type { Express } from "express";
import type { Server } from "http";
import { setupAuth, registerAuthRoutes } from "../auth";
import { requestLogger } from "../middleware/logging";
import { storage } from "../storage";

import marketDataRouter, { metalPriceCache, marketDataCache, fetchBinanceKlinesFast } from "./market-data.routes";
import aiRouter, { handleAiPrediction } from "./ai.routes";
import ordersRouter from "./orders.routes";
import walletRouter from "./wallet.routes";
import adminRouter, { checkAdmin } from "./admin.routes";
import miscRouter from "./misc.routes";

export {
  marketDataRouter,
  aiRouter,
  ordersRouter,
  walletRouter,
  adminRouter,
  miscRouter,
  metalPriceCache,
  marketDataCache,
  fetchBinanceKlinesFast,
  handleAiPrediction,
  checkAdmin,
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // 1. Core Authentication Setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // 2. Structured Logging Middleware
  app.use(requestLogger);

  // 3. Database Seed Initialization
  await storage.seed();

  // 4. Domain-Driven Modular Routers
  app.use(marketDataRouter);
  app.use(aiRouter);
  app.use(ordersRouter);
  app.use(walletRouter);
  app.use(adminRouter);
  app.use(miscRouter);

  return httpServer;
}
