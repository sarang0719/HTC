/**
 * HTC Trading Platform — Domain Route Registry
 * Decomposed into modular routers in server/routes/:
 *  - market-data.routes.ts (Catalog, live quotes, candle history)
 *  - ai.routes.ts (Python AI inference proxy, prediction credits)
 *  - orders.routes.ts (Spot orders, time-based binary trades, early sell)
 *  - wallet.routes.ts (Wallets, transactions, Razorpay deposit & plans)
 *  - admin.routes.ts (User control, audit logs, withdrawal moderation)
 *  - misc.routes.ts (Watchlists, portfolios, news, educational materials)
 */

export * from "./routes/index";
