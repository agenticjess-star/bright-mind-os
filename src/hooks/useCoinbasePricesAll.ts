import { useEffect, useRef, useState, useCallback } from 'react';
import type { CryptoAsset } from '@/lib/updownTypes';
import type { PricePoint } from './useCoinbasePrice';

const WS_URL = 'wss://advanced-trade-ws.coinbase.com';
const MAX_POINTS = 1500;
const FLUSH_MS = 50;

const ASSETS: CryptoAsset[] = ['btc', 'eth', 'sol', 'xrp'];
const ASSET_TO_PRODUCT: Record<CryptoAsset, string> = {
  btc: 'BTC-USD',
  eth: 'ETH-USD',
  sol: 'SOL-USD',
  xrp: 'XRP-USD',
};
const PRODUCT_TO_ASSET: Record<string, CryptoAsset> = Object.fromEntries(
  ASSETS.map(a => [ASSET_TO_PRODUCT[a], a])
) as Record<string, CryptoAsset>;

export interface MultiPriceState {
  series: Record<CryptoAsset, PricePoint[]>;
  prices: Record<CryptoAsset, number | null>;
  connected: boolean;
}

const emptyState = (): MultiPriceState => ({
  series: { btc: [], eth: [], sol: [], xrp: [] },
  prices: { btc: null, eth: null, sol: null, xrp: null },
  connected: false,
});

/**
 * Subscribes to all 4 Coinbase tickers over a single WebSocket so we can
 * compute SMA leans across the entire heatmap grid simultaneously.
 */
export function useCoinbasePricesAll(): MultiPriceState {
  const [state, setState] = useState<MultiPriceState>(emptyState);
  const wsRef = useRef<WebSocket | null>(null);
  const buffersRef = useRef<Record<CryptoAsset, PricePoint[]>>({ btc: [], eth: [], sol: [], xrp: [] });
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    flushTimerRef.current = null;
    const buffers = buffersRef.current;
    const hasAny = ASSETS.some(a => buffers[a].length > 0);
    if (!hasAny) return;
    const batches: Record<CryptoAsset, PricePoint[]> = { btc: [], eth: [], sol: [], xrp: [] };
    for (const a of ASSETS) {
      batches[a] = buffers[a];
      buffers[a] = [];
    }
    setState(prev => {
      const series = { ...prev.series };
      const prices = { ...prev.prices };
      for (const a of ASSETS) {
        if (batches[a].length === 0) continue;
        const merged = [...series[a], ...batches[a]].slice(-MAX_POINTS);
        series[a] = merged;
        prices[a] = merged[merged.length - 1].price;
      }
      return { ...prev, series, prices };
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(flush, FLUSH_MS);
  }, [flush]);

  const connect = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(prev => ({ ...prev, connected: true }));
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'ticker',
        product_ids: ASSETS.map(a => ASSET_TO_PRODUCT[a]),
      }));
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
          const asset = PRODUCT_TO_ASSET[pid];
          if (!asset) continue;
          const price = parseFloat(t.price);
          const ts = t.time ? Date.parse(t.time) : Date.now();
          if (Number.isFinite(price) && price > 0) {
            buffersRef.current[asset].push({ ts, price });
          }
        }
      }
      scheduleFlush();
    };

    ws.onerror = () => { /* close handles reconnect */ };
    ws.onclose = () => {
      setState(prev => ({ ...prev, connected: false }));
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, [scheduleFlush]);

  useEffect(() => {
    const start = () => { if (!wsRef.current) connect(); };
    const stop = () => {
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
