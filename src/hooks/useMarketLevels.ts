import { useEffect, useMemo, useRef, useState } from 'react';
import type { UpDownMarket, CryptoAsset, UpDownTimeframe } from '@/lib/updownTypes';
import {
  fetchWindowOpens,
  fetchLevelCandles,
  computeLevels,
  type Levels,
  type Candle,
} from '@/lib/coinbaseCandles';

/**
 * Resolves the "price to beat" (spot at window open) for every live up/down
 * market, keyed by eventId. Values are real Coinbase opens, cached per session.
 */
export function useWindowStrikes(markets: UpDownMarket[]): Record<string, number> {
  const [strikes, setStrikes] = useState<Record<string, number>>({});

  // (asset, windowStart) pairs for live markets only
  const plan = useMemo(() => {
    const byAsset: Record<string, Set<number>> = {};
    const idToTs: Record<string, { asset: CryptoAsset; ts: number }> = {};
    for (const m of markets) {
      if (m.resolved || !m.windowStart) continue;
      const ts = Math.floor(new Date(m.windowStart).getTime() / 1000);
      if (!Number.isFinite(ts) || ts <= 0) continue;
      (byAsset[m.asset] ??= new Set()).add(ts);
      idToTs[m.eventId] = { asset: m.asset as CryptoAsset, ts };
    }
    return { byAsset, idToTs };
  }, [markets]);

  const planKey = useMemo(
    () => Object.entries(plan.byAsset)
      .map(([a, set]) => `${a}:${[...set].sort().join(',')}`)
      .sort()
      .join('|'),
    [plan],
  );

  useEffect(() => {
    if (!planKey) return;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        Object.entries(plan.byAsset).map(async ([asset, set]) => {
          const opens = await fetchWindowOpens(asset as CryptoAsset, [...set], controller.signal);
          return [asset, opens] as const;
        }),
      );
      if (cancelled) return;
      const opensByAsset = Object.fromEntries(entries);
      const next: Record<string, number> = {};
      for (const [eventId, { asset, ts }] of Object.entries(plan.idToTs)) {
        const price = opensByAsset[asset]?.[ts];
        if (price != null) next[eventId] = price;
      }
      setStrikes(next);
    })();

    return () => { cancelled = true; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  return strikes;
}

/**
 * Support / resistance pivots for the selected asset + timeframe, refreshed
 * while the tab is visible.
 */
export function useSupportResistance(
  asset: CryptoAsset,
  timeframe: UpDownTimeframe,
  price: number | null,
  refreshMs = 60_000,
): Levels {
  const [candles, setCandles] = useState<Candle[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setCandles([]);
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const c = await fetchLevelCandles(asset, timeframe, controller.signal);
        if (!controller.signal.aborted) setCandles(c);
      } catch { /* keep last known levels */ }
    };

    const start = () => {
      if (timer) return;
      load();
      timer = setInterval(load, refreshMs);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
      abortRef.current?.abort();
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
  }, [asset, timeframe, refreshMs]);

  return useMemo(
    () => (price == null
      ? { support: null, resistance: null, samples: candles.length }
      : computeLevels(candles, price)),
    [candles, price],
  );
}
