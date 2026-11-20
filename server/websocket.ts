import { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { db } from "./db";
import { instruments, latestPrices } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

interface Client {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  lastPing: number;
}

interface MarketDataUpdate {
  type: "market_data";
  symbol: string;
  data: {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    timestamp: number;
  };
}

interface OrderBookUpdate {
  type: "order_book";
  symbol: string;
  data: {
    symbol: string;
    bids: Array<[number, number]>;
    asks: Array<[number, number]>;
    timestamp: number;
  };
}

interface TradeUpdate {
  type: "trade";
  symbol: string;
  data: {
    symbol: string;
    price: number;
    quantity: number;
    side: "BUY" | "SELL";
    timestamp: number;
  };
}

type WSMessage = MarketDataUpdate | OrderBookUpdate | TradeUpdate | { type: "error"; message: string };

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  private orderBookData: Map<string, { bids: Array<[number, number]>; asks: Array<[number, number]> }> = new Map();

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({ 
      noServer: true
    });

    this.setupWebSocketServer();
    this.startPriceUpdates();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      const client: Client = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        lastPing: Date.now()
      };

      this.clients.set(clientId, client);
      console.log(`[WS] Client connected: ${clientId} (${this.clients.size} total)`);

      // Send initial connection message
      this.sendToClient(client, {
        type: "connected",
        clientId: clientId,
        timestamp: Date.now()
      });

      // Handle messages from client
      ws.on('message', (data: Buffer) => {
        client.lastPing = Date.now();
        this.handleClientMessage(client, data.toString());
      });

      // Handle client disconnection
      ws.on('close', (code: number, reason: Buffer) => {
        this.clients.delete(clientId);
        console.log(`[WS] Client disconnected: ${clientId} (${this.clients.size} total)`);
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        console.error(`[WS] Error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });

      // Set up ping/pong for connection health
      ws.on('pong', () => {
        client.lastPing = Date.now();
      });
    });

    // Set up ping interval to detect dead connections
    setInterval(() => {
      this.pingClients();
    }, 30000); // Ping every 30 seconds
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private async handleClientMessage(client: Client, message: string) {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'subscribe':
          await this.handleSubscription(client, data.symbols);
          break;
          
        case 'unsubscribe':
          await this.handleUnsubscription(client, data.symbols);
          break;
          
        case 'pong':
          client.lastPing = Date.now();
          break;

        case 'ping':
          client.lastPing = Date.now();
          this.sendToClient(client, { type: 'pong', timestamp: Date.now() });
          break;
          
        default:
          this.sendError(client, `Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error(`[WS] Error handling message from ${client.id}:`, error);
      this.sendError(client, 'Invalid message format');
    }
  }

  private validSymbolsCache = new Set<string>();
  private lastSymbolsCacheTime = 0;

  private async getValidSymbolsSet(): Promise<Set<string>> {
    const now = Date.now();
    // Cache valid instruments in memory for 60 seconds
    if (this.validSymbolsCache.size > 0 && now - this.lastSymbolsCacheTime < 60000) {
      return this.validSymbolsCache;
    }
    const allInst = await db.select({ symbol: instruments.symbol }).from(instruments);
    this.validSymbolsCache = new Set(allInst.map((i: any) => i.symbol));
    this.lastSymbolsCacheTime = now;
    return this.validSymbolsCache;
  }

  private async handleSubscription(client: Client, symbols: string[]) {
    // Validate symbols exist in database via ultra-fast in-memory cache
    const validSymbols = await this.validateSymbols(symbols);
    
    validSymbols.forEach(symbol => {
      client.subscriptions.add(symbol);
    });

    // Send current data for subscribed symbols in a single batched query
    if (validSymbols.length > 0) {
      const marketDataList = await this.getBatchMarketData(validSymbols);
      for (const marketData of marketDataList) {
        if (marketData && marketData.price > 0) {
          this.sendMarketData(client, marketData);
        }
      }
    }

    console.log(`[WS] Client ${client.id} subscribed to: ${validSymbols.join(', ')}`);
  }

  private async handleUnsubscription(client: Client, symbols: string[]) {
    symbols.forEach(symbol => {
      client.subscriptions.delete(symbol);
    });

    console.log(`[WS] Client ${client.id} unsubscribed from: ${symbols.join(', ')}`);
  }

  private async validateSymbols(symbols: string[]): Promise<string[]> {
    if (!symbols || symbols.length === 0) return [];
    const validSet = await this.getValidSymbolsSet();
    return symbols.filter(s => validSet.has(s));
  }

  private async getBatchMarketData(symbols: string[]) {
    if (!symbols || symbols.length === 0) return [];

    const results = await db
      .select({
        symbol: instruments.symbol,
        price: latestPrices.price,
        changeAbs: latestPrices.changeAbs,
        changePct: latestPrices.changePct,
        asOf: latestPrices.asOf
      })
      .from(instruments)
      .leftJoin(latestPrices, eq(instruments.id, latestPrices.instrumentId))
      .where(inArray(instruments.symbol, symbols));

    const now = Date.now();
    return results.map((r: any) => ({
      symbol: r.symbol,
      price: parseFloat(r.price?.toString() || '0'),
      change: parseFloat(r.changeAbs?.toString() || '0'),
      changePercent: parseFloat(r.changePct?.toString() || '0'),
      volume: Math.floor(Math.random() * 1000000), // Mock volume
      timestamp: r.asOf?.getTime() || now
    }));
  }

  private async getCurrentMarketData(symbol: string) {
    const list = await this.getBatchMarketData([symbol]);
    return list.length > 0 ? list[0] : null;
  }

  private startPriceUpdates() {
    // Update prices every 1 second for subscribed symbols
    this.priceUpdateInterval = setInterval(async () => {
      await this.updatePrices();
    }, 1000);
  }

  private async updatePrices() {
    // Get all subscribed symbols
    const allSubscriptions = new Set<string>();
    Array.from(this.clients.values()).forEach(client => {
      Array.from(client.subscriptions.values()).forEach(symbol => {
        allSubscriptions.add(symbol);
      });
    });

    const symbolsList = Array.from(allSubscriptions);
    if (symbolsList.length === 0) return;

    // Single batched query across all active subscriptions
    const batchData = await this.getBatchMarketData(symbolsList);
    const now = Date.now();

    for (const currentData of batchData) {
      if (!currentData || !currentData.price) continue;

      const updatedData = {
        ...currentData,
        timestamp: now
      };

      // Broadcast to all subscribed clients
      this.broadcastToSubscribers(currentData.symbol, {
        type: 'market_data',
        symbol: currentData.symbol,
        data: updatedData
      } as MarketDataUpdate);

      // Occasionally generate institutional trade volume updates
      if (Math.random() < 0.15) {
        this.generateTradeUpdate(currentData.symbol, updatedData.price);
      }
    }
  }

  private generateTradeUpdate(symbol: string, price: number) {
    const trade: TradeUpdate = {
      type: 'trade',
      symbol,
      data: {
        symbol,
        price,
        quantity: Math.floor(Math.random() * 1000) + 100,
        side: Math.random() > 0.5 ? 'BUY' : 'SELL',
        timestamp: Date.now()
      }
    };

    this.broadcastToSubscribers(symbol, trade);
  }

  private broadcastToSubscribers(symbol: string, message: WSMessage) {
    const payloadStr = JSON.stringify(message);
    for (const client of Array.from(this.clients.values())) {
      if (client.subscriptions.has(symbol) && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(payloadStr);
        } catch (error) {
          console.error(`[WS] Error sending to client ${client.id}:`, error);
        }
      }
    }
  }

  private sendMarketData(client: Client, data: any) {
    this.sendToClient(client, {
      type: 'market_data',
      symbol: data.symbol,
      data
    } as MarketDataUpdate);
  }

  private sendToClient(client: Client, message: any) {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[WS] Error sending to client ${client.id}:`, error);
      }
    }
  }

  private sendError(client: Client, message: string) {
    this.sendToClient(client, {
      type: 'error',
      message
    });
  }

  private pingClients() {
    const now = Date.now();
    Array.from(this.clients.entries()).forEach(([clientId, client]) => {
      // Allow 120 seconds of silence before clean closure
      if (now - client.lastPing > 120000) {
        console.log(`[WS] Gracefully closing inactive client: ${clientId}`);
        try {
          client.ws.close(1000, "Inactivity timeout");
        } catch {
          try { client.ws.terminate(); } catch {}
        }
        this.clients.delete(clientId);
      } else if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.ping();
          this.sendToClient(client, { type: 'ping', timestamp: now });
        } catch {}
      }
    });
  }

  public getStats() {
    return {
      connectedClients: this.clients.size,
      totalSubscriptions: Array.from(this.clients.values())
        .reduce((total, client) => total + Array.from(client.subscriptions).length, 0)
    };
  }

  public broadcastPrice(symbol: string, price: number, changeAbs: number = 0, changePct: number = 0) {
    if (!symbol || !price || isNaN(price) || price <= 0) return;
    const now = Date.now();
    this.broadcastToSubscribers(symbol, {
      type: 'market_data',
      symbol,
      data: {
        symbol,
        price,
        change: changeAbs,
        changePercent: changePct,
        timestamp: now
      }
    } as MarketDataUpdate);
  }

  public shutdown() {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
    }
    
    Array.from(this.clients.values()).forEach(client => {
      client.ws.close();
    });
    
    this.wss.close();
  }
  public handleUpgrade(req: any, socket: any, head: any) {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }
}

export let globalWsManager: WebSocketManager | null = null;

export function broadcastPriceTick(symbol: string, price: number, changeAbs: number = 0, changePct: number = 0) {
  if (globalWsManager) {
    globalWsManager.broadcastPrice(symbol, price, changeAbs, changePct);
  }
}

export function setupWebSocket(server: HTTPServer) {
  globalWsManager = new WebSocketManager(server);
  return globalWsManager;
}
