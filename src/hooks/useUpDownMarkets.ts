import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { UpDownMarket, CryptoAsset, UpDownTimeframe } from '@/lib/updownTypes';
import { CRYPTO_ASSETS } from '@/lib/updownTypes';
import { discoverUpDownMarkets, eventTokenIds } from '@/lib/polymarket';
import { useClobWebSocket } from './useClobWebSocket';

interface UseUpDownMarketsOptions {
  /** How often to re-run slug discovery. Live prices come from the socket. */
  pollInterval?: number;
}

const CACHE_KEY = 'updown:markets:v2';
const PREF_KEY = 'updown:pref:v1';
const ASSETS = CRYPTO_ASSETS.map(a => a.value);

function loadCache(): { data: UpDownMarket[]; ts: number } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
    return parsed;
  } catch { return null; }
}
function saveCache(data: UpDownMarket[]) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
}
function loadPref(): { asset?: CryptoAsset; timeframe?: UpDownTimeframe } {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
}
function savePref(p: { asset: CryptoAsset; timeframe: UpDownTimeframe }) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function useUpDownMarkets({ pollInterval = 60000 }: UseUpDownMarketsOptions = {}) {
  const cached = typeof window !== 'undefined' ? loadCache() : null;
  const pref = typeof window !== 'undefined' ? loadPref() : {};

  const [allMarkets, setAllMarkets] = useState<UpDownMarket[]>(cached?.data ?? []);
  const [selectedAsset, setSelectedAssetState] = useState<CryptoAsset>(pref.asset ?? 'btc');
  const [selectedTimeframe, setSelectedTimeframeState] = useState<UpDownTimeframe>(pref.timeframe ?? '5m');
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const setSelectedAsset = useCallback((a: CryptoAsset) => {
    setSelectedAssetState(a);
    savePref({ asset: a, timeframe: selectedTimeframe });
  }, [selectedTimeframe]);
  const setSelectedTimeframe = useCallback((t: UpDownTimeframe) => {
    setSelectedTimeframeState(t);
    savePref({ asset: selectedAsset, timeframe: t });
  }, [selectedAsset]);

  const fetchAll = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await discoverUpDownMarkets(ASSETS, controller.signal);
      if (controller.signal.aborted) return;
      setAllMarkets(data);
      saveCache(data);
      setError(data.length === 0 ? 'No live up/down markets found' : null);
    } catch (err: any) {
      if (err?.name !== 'AbortError') setError(err?.message ?? 'Discovery failed');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Poll discovery only while the tab is visible.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let lastFetch = cached?.ts ?? 0;

    const run = () => { fetchAll(); lastFetch = Date.now(); };
    const start = () => {
      if (interval) return;
      if (Date.now() - lastFetch > pollInterval) run();
      interval = setInterval(run, pollInterval);
    };
    const stop = () => {
      if (interval) { clearInterval(interval); interval = null; }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAll, pollInterval]);

  // Subscribe the socket to every live market's Up/Down tokens.
  const liveTokenIds = useMemo(() => {
    const ids: string[] = [];
    for (const m of allMarkets) {
      if (m.resolved) continue;
      const { up, down } = eventTokenIds(m);
      if (up) ids.push(up);
      if (down) ids.push(down);
    }
    return ids;
  }, [allMarkets]);

  const clobWs = useClobWebSocket(liveTokenIds);

  // Overlay socket quotes on the discovered markets.
  const marketsWithLivePrices = useMemo(() => {
    if (Object.keys(clobWs.quotes).length === 0) return allMarkets;
    return allMarkets.map(m => {
      if (m.resolved) return m;
      const { up, down } = eventTokenIds(m);
      const upQ = up ? clobWs.quotes[up] : undefined;
      const downQ = down ? clobWs.quotes[down] : undefined;
      if (!upQ && !downQ) return m;
      return {
        ...m,
        upPrice: upQ?.ask ?? m.upPrice,
        downPrice: downQ?.ask ?? m.downPrice,
        upBid: upQ?.bid ?? m.upBid ?? null,
        downBid: downQ?.bid ?? m.downBid ?? null,
      };
    });
  }, [allMarkets, clobWs.quotes]);

  const filteredMarkets = useMemo(
    () => marketsWithLivePrices.filter(m => m.asset === selectedAsset && m.timeframe === selectedTimeframe),
    [marketsWithLivePrices, selectedAsset, selectedTimeframe],
  );

  const activeMarket = useMemo(
    () => filteredMarkets.find(m => !m.resolved) ?? null,
    [filteredMarkets],
  );

  const assetCounts = useMemo(
    () => marketsWithLivePrices.reduce((acc, m) => {
      if (!m.resolved) acc[m.asset] = (acc[m.asset] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    [marketsWithLivePrices],
  );

  // When the active window expires, re-discover to roll into the next one.
  useEffect(() => {
    if (!activeMarket?.endDate) return;
    const msUntilExpiry = new Date(activeMarket.endDate).getTime() - Date.now();
    if (msUntilExpiry <= 0) { fetchAll(); return; }
    const timer = setTimeout(fetchAll, msUntilExpiry + 2000);
    return () => clearTimeout(timer);
  }, [activeMarket?.eventId, activeMarket?.endDate, fetchAll]);

  return {
    allMarkets: filteredMarkets,
    allMarketsRaw: marketsWithLivePrices,
    activeMarket,
    selectedAsset,
    selectedTimeframe,
    setSelectedAsset,
    setSelectedTimeframe,
    loading,
    error,
    assetCounts,
    refetch: fetchAll,
    clobConnected: clobWs.connected,
    clobLastUpdate: clobWs.lastUpdate,
  };
}
