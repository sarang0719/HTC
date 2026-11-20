import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: number;
}

interface OrderBookData {
  symbol: string;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  timestamp: number;
}

interface TradeData {
  symbol: string;
  price: number;
  quantity: number;
  side: "BUY" | "SELL";
  timestamp: number;
}

export function useRealtimeMarketData(symbols: string[]) {
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [orderBook, setOrderBook] = useState<Record<string, OrderBookData>>({});
  const [recentTrades, setRecentTrades] = useState<Record<string, TradeData[]>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<any>(null);
  const reconnectRef = useRef<any>(null);

  const connectWebSocket = useCallback(() => {
    if (typeof window === "undefined") return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      // Subscribe to symbols
      wsRef.current?.send(JSON.stringify({
        type: "subscribe",
        symbols: symbols
      }));

      // Periodic heartbeat
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          try { wsRef.current.send(JSON.stringify({ type: "ping" })); } catch {}
        }
      }, 15000);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ping") {
          wsRef.current?.send(JSON.stringify({ type: "pong" }));
          return;
        }
        
        switch (data.type) {
          case "market_data":
            setMarketData(prev => ({
              ...prev,
              [data.symbol]: data.data
            }));
            break;
            
          case "order_book":
            setOrderBook(prev => ({
              ...prev,
              [data.symbol]: data.data
            }));
            break;
            
          case "trade":
            setRecentTrades(prev => ({
              ...prev,
              [data.symbol]: [
                data.data,
                ...(prev[data.symbol] || []).slice(0, 49) // Keep last 50 trades
              ]
            }));
            break;
            
          case "error":
            break;
        }
      } catch (error) {
      }
    };

    wsRef.current.onerror = () => {
    };

    wsRef.current.onclose = () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(connectWebSocket, 3000);
    };
  }, [symbols]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current) {
        const socket = wsRef.current;
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.onopen = () => {
            try { socket.close(); } catch {}
          };
        } else if (socket.readyState === WebSocket.OPEN) {
          try { socket.close(); } catch {}
        }
        wsRef.current = null;
      }
    };
  }, [connectWebSocket]);

  return {
    marketData,
    orderBook,
    recentTrades,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN
  };
}

export function useMarketData(symbol: string) {
  const { data: staticData } = useQuery({
    queryKey: ["market-data", symbol],
    queryFn: async () => {
      const response = await fetch(`/api/instruments/${symbol}/data`);
      if (!response.ok) throw new Error("Failed to fetch market data");
      return response.json();
    },
    refetchInterval: 30000, // Refresh static data every 30 seconds
  });

  const { marketData, isConnected } = useRealtimeMarketData([symbol]);

  return {
    ...staticData,
    realTimeData: marketData[symbol],
    isConnected
  };
}

export function useOrderBook(symbol: string) {
  const { orderBook, isConnected } = useRealtimeMarketData([symbol]);
  
  return {
    orderBook: orderBook[symbol],
    isConnected
  };
}

export function useRecentTrades(symbol: string) {
  const { recentTrades, isConnected } = useRealtimeMarketData([symbol]);
  
  return {
    trades: recentTrades[symbol] || [],
    isConnected
  };
}
