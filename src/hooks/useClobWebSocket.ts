import { useEffect, useRef, useCallback, useState } from 'react';

const CLOB_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const CLOB_PING_INTERVAL = 10000; // 10s heartbeat per docs

export interface ClobPriceUpdate {
  tokenId: string;
  price: number;
  timestamp: number;
}

export interface ClobWebSocketState {
  connected: boolean;
  prices: Record<string, number>;
  lastUpdate: number | null;
}

interface UseClobWebSocketOptions {
  onNewMarket?: (event: any) => void;
}

/**
 * Polymarket CLOB Market WebSocket — v3
 * - PING heartbeat every 10s (required by docs)
 * - best_bid_ask event support for cleaner price feed
 * - Dynamic subscribe/unsubscribe without reconnecting
 */
export function useClobWebSocket(tokenIds: string[], options?: UseClobWebSocketOptions) {
  const [state, setState] = useState<ClobWebSocketState>({
    connected: false,
    prices: {},
    lastUpdate: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTokenIds = useRef<string[]>([]);
  const reconnectAttempts = useRef(0);
  const onNewMarketRef = useRef(options?.onNewMarket);
  onNewMarketRef.current = options?.onNewMarket;
  const maxReconnectDelay = 30000;

  const stopPing = useCallback(() => {
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    }
  }, []);

  const startPing = useCallback((ws: WebSocket) => {
    stopPing();
    pingTimer.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('PING');
      }
    }, CLOB_PING_INTERVAL);
  }, [stopPing]);

  const subscribe = useCallback((ws: WebSocket, ids: string[]) => {
    if (ids.length === 0 || ws.readyState !== WebSocket.OPEN) return;
    const msg = {
      assets_ids: ids,
      type: 'market',
      custom_feature_enabled: true,
    };
    console.log('[CLOB-WS] Subscribing to', ids.length, 'tokens');
    ws.send(JSON.stringify(msg));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopPing();

    const ws = new WebSocket(CLOB_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[CLOB-WS] Connected');
      reconnectAttempts.current = 0;
      setState(prev => ({ ...prev, connected: true }));
      subscribe(ws, currentTokenIds.current);
      startPing(ws);
    };

    ws.onmessage = (event) => {
      // Ignore PONG
      if (event.data === 'PONG') return;

      try {
        const msgs = JSON.parse(event.data);
        const updates = Array.isArray(msgs) ? msgs : [msgs];

        setState(prev => {
          let changed = false;
          const newPrices = { ...prev.prices };

          for (const msg of updates) {
            // ONLY use best_bid_ask — the cleanest, most reliable price source.
            // price_change and last_trade_price can carry misleading 1¢ values
            // from micro-trades or stale order books.
            if (msg.event_type === 'best_bid_ask' && msg.asset_id && msg.best_bid != null) {
              const price = typeof msg.best_bid === 'string' ? parseFloat(msg.best_bid) : msg.best_bid;
              if (!isNaN(price) && price > 0.01) {
                newPrices[msg.asset_id] = price;
                changed = true;
              }
            }

            // new_market event
            if (msg.event_type === 'new_market') {
              console.log('[CLOB-WS] New market detected:', msg);
              onNewMarketRef.current?.(msg);
            }
          }

          if (!changed) return prev;
          return { ...prev, prices: newPrices, lastUpdate: Date.now() };
        });
      } catch {
        // ignore non-JSON
      }
    };

    ws.onerror = () => {
      console.warn('[CLOB-WS] Error');
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, connected: false }));
      stopPing();
      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, maxReconnectDelay);
      reconnectAttempts.current++;
      console.log(`[CLOB-WS] Reconnecting in ${delay}ms`);
      reconnectTimer.current = setTimeout(connect, delay);
    };
  }, [subscribe, startPing, stopPing]);

  // Dynamic subscribe/unsubscribe when tokenIds change (no reconnect needed)
  useEffect(() => {
    const prev = currentTokenIds.current;
    const next = tokenIds.filter(Boolean);

    const same = prev.length === next.length && prev.every((id, i) => id === next[i]);
    if (same) return;

    currentTokenIds.current = next;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      subscribe(wsRef.current, next);
    }
  }, [tokenIds, subscribe]);

  // Connect on mount, disconnect on unmount, pause on hidden tab
  useEffect(() => {
    currentTokenIds.current = tokenIds.filter(Boolean);

    const start = () => { if (!wsRef.current) connect(); };
    const stop = () => {
      stopPing();
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      if (wsRef.current) {
        try { wsRef.current.onclose = null; wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
      setState(prev => ({ ...prev, connected: false }));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, []); // connect once

  return state;
}
