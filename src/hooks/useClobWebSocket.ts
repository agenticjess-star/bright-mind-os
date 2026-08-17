import { useEffect, useRef, useCallback, useState } from 'react';
import { quoteFromBook, type BookQuote } from '@/lib/polymarket';

const CLOB_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const PING_INTERVAL = 10000; // required heartbeat
const FLUSH_MS = 150;        // batch state updates

export interface ClobWebSocketState {
  connected: boolean;
  /** best bid / ask / mid per CLOB token id */
  quotes: Record<string, BookQuote>;
  lastUpdate: number | null;
}

/**
 * Polymarket CLOB market channel (public, no auth).
 *
 * Real event types on this socket (verified live):
 *   `book`         — full order-book snapshot on subscribe / large change
 *   `price_change` — { price_changes: [{ asset_id, best_bid, best_ask, ... }] }
 *   `last_trade_price`
 *
 * We maintain best bid/ask per token from those two, batched to one state
 * update every 150ms so heavy books don't thrash React.
 */
export function useClobWebSocket(tokenIds: string[]) {
  const [state, setState] = useState<ClobWebSocketState>({
    connected: false,
    quotes: {},
    lastUpdate: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, BookQuote>>({});
  const currentTokenIds = useRef<string[]>([]);
  const reconnectAttempts = useRef(0);

  const flush = useCallback(() => {
    flushTimer.current = null;
    const batch = pending.current;
    pending.current = {};
    if (Object.keys(batch).length === 0) return;
    setState(prev => ({ ...prev, quotes: { ...prev.quotes, ...batch }, lastUpdate: Date.now() }));
  }, []);

  const queue = useCallback((tokenId: string, quote: BookQuote) => {
    pending.current[tokenId] = quote;
    if (!flushTimer.current) flushTimer.current = setTimeout(flush, FLUSH_MS);
  }, [flush]);

  const stopPing = useCallback(() => {
    if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }
  }, []);

  const subscribe = useCallback((ws: WebSocket, ids: string[]) => {
    if (ids.length === 0 || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ assets_ids: ids, type: 'market' }));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) { try { wsRef.current.close(); } catch { /* noop */ } }
    stopPing();

    const ws = new WebSocket(CLOB_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      setState(prev => ({ ...prev, connected: true }));
      subscribe(ws, currentTokenIds.current);
      stopPing();
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('PING');
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      if (event.data === 'PONG') return;
      let msgs: any;
      try { msgs = JSON.parse(event.data); } catch { return; }

      for (const msg of Array.isArray(msgs) ? msgs : [msgs]) {
        if (msg?.event_type === 'book' && msg.asset_id) {
          queue(msg.asset_id, quoteFromBook(msg.bids, msg.asks));
        } else if (msg?.event_type === 'price_change' && Array.isArray(msg.price_changes)) {
          for (const pc of msg.price_changes) {
            if (!pc?.asset_id) continue;
            const bid = pc.best_bid != null ? parseFloat(pc.best_bid) : null;
            const ask = pc.best_ask != null ? parseFloat(pc.best_ask) : null;
            const okBid = Number.isFinite(bid as number) ? (bid as number) : null;
            const okAsk = Number.isFinite(ask as number) ? (ask as number) : null;
            if (okBid == null && okAsk == null) continue;
            queue(pc.asset_id, {
              bid: okBid,
              ask: okAsk,
              mid: okBid != null && okAsk != null ? (okBid + okAsk) / 2 : (okAsk ?? okBid),
            });
          }
        }
      }
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, connected: false }));
      stopPing();
      if (document.visibilityState !== 'visible') return;
      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
      reconnectAttempts.current++;
      reconnectTimer.current = setTimeout(connect, delay);
    };
  }, [subscribe, stopPing, queue]);

  // Re-subscribe in place when the token set changes (no reconnect).
  useEffect(() => {
    const next = Array.from(new Set(tokenIds.filter(Boolean)));
    const prev = currentTokenIds.current;
    if (prev.length === next.length && prev.every((id, i) => id === next[i])) return;
    currentTokenIds.current = next;
    if (wsRef.current?.readyState === WebSocket.OPEN) subscribe(wsRef.current, next);
  }, [tokenIds, subscribe]);

  // Connect while the tab is visible; fully disconnect when hidden.
  useEffect(() => {
    const start = () => { if (!wsRef.current) connect(); };
    const stop = () => {
      stopPing();
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
      if (wsRef.current) {
        try { wsRef.current.onclose = null; wsRef.current.close(); } catch { /* noop */ }
        wsRef.current = null;
      }
      setState(prev => ({ ...prev, connected: false }));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start(); else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
