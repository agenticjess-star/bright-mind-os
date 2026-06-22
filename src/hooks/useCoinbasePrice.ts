import { useEffect, useRef, useState, useCallback } from 'react';
import type { CryptoAsset } from '@/lib/updownTypes';

const WS_URL = 'wss://advanced-trade-ws.coinbase.com';
const MAX_POINTS = 600;
const FLUSH_MS = 100;

const ASSET_TO_PRODUCT: Record<CryptoAsset, string> = {
  btc: 'BTC-USD',
  eth: 'ETH-USD',
  sol: 'SOL-USD',
  xrp: 'XRP-USD',
};

export interface PricePoint {
  ts: number;
  price: number;
}

export interface CoinbasePriceState {
  productId: string;
  series: PricePoint[];
  price: number | null;
  connected: boolean;
}

/**
 * Single persistent WebSocket to Coinbase Advanced Trade.
 * Dynamic asset switching subscribes/unsubscribes without reconnecting.
 * Updates are batched (FLUSH_MS) to keep React renders smooth.
 */
export function useCoinbasePrice(asset: CryptoAsset): CoinbasePriceState {
  const productId = ASSET_TO_PRODUCT[asset];
  const [state, setState] = useState<CoinbasePriceState>({
    productId,
    series: [],
    price: null,
    connected: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const currentProductRef = useRef<string>(productId);
  const bufferRef = useRef<PricePoint[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    flushTimerRef.current = null;
    if (bufferRef.current.length === 0) return;
    const batch = bufferRef.current;
    bufferRef.current = [];
    setState(prev => {
      if (batch[0] && prev.productId !== currentProductRef.current) return prev;
      const merged = [...prev.series, ...batch].slice(-MAX_POINTS);
      return {
        ...prev,
        series: merged,
        price: merged[merged.length - 1]?.price ?? prev.price,
      };
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(flush, FLUSH_MS);
  }, [flush]);

  const send = useCallback((type: 'subscribe' | 'unsubscribe', product: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, channel: 'ticker', product_ids: [product] }));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(prev => ({ ...prev, connected: true }));
      send('subscribe', currentProductRef.current);
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.channel !== 'ticker') return;
      const events = msg.events || [];
      for (const event of events) {
        const tickers = event.tickers || [];
        for (const t of tickers) {
          const pid = (t.product_id || '').toUpperCase();
          if (pid !== currentProductRef.current) continue;
          const price = parseFloat(t.price);
          const ts = t.time ? Date.parse(t.time) : Date.now();
          if (Number.isFinite(price) && price > 0) {
            bufferRef.current.push({ ts, price });
          }
        }
      }
      if (bufferRef.current.length > 0) scheduleFlush();
    };

    ws.onerror = () => { /* let onclose handle reconnect */ };

    ws.onclose = () => {
      setState(prev => ({ ...prev, connected: false }));
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, [send, scheduleFlush]);

  // Mount: open the socket once
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Asset change: swap subscription, reset series
  useEffect(() => {
    const prev = currentProductRef.current;
    const next = productId;
    if (prev === next) return;
    currentProductRef.current = next;
    bufferRef.current = [];
    setState({ productId: next, series: [], price: null, connected: wsRef.current?.readyState === WebSocket.OPEN });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      send('unsubscribe', prev);
      send('subscribe', next);
    }
  }, [productId, send]);

  return state;
}
