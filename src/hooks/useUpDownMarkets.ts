import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { UpDownMarket, CryptoAsset, UpDownTimeframe } from '@/lib/updownTypes';
import { useClobWebSocket } from './useClobWebSocket';

interface UseUpDownMarketsOptions {
  pollInterval?: number;
}

const CACHE_KEY = 'updown:markets:v1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const PREF_KEY = 'updown:pref:v1';

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

export function useUpDownMarkets({ pollInterval = 120000 }: UseUpDownMarketsOptions = {}) {
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
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/crypto-updown-discovery?assets=btc,eth,sol,xrp&timeframe=5m,15m,1h,4h,daily`,
        {
          signal: controller.signal,
          headers: {
            'apikey': anonKey,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!res.ok) throw new Error(`Discovery error: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        // Merge: preserve existing WS-sourced prices — don't let REST overwrite
        // with stale 1¢ values from low-liquidity snapshots
        setAllMarkets(prev => {
          const prevPriceMap = new Map<string, { up: number | null; down: number | null }>();
          for (const m of prev) {
            if (m.upPrice != null && m.upPrice > 0.02) {
              prevPriceMap.set(m.eventSlug, { up: m.upPrice, down: m.downPrice });
            }
          }
          const next = data.map((m: any) => {
            const cached = prevPriceMap.get(m.eventSlug);
            if (cached && (!m.upPrice || m.upPrice <= 0.02)) {
              return { ...m, upPrice: cached.up, downPrice: cached.down };
            }
            return m;
          });
          saveCache(next);
          return next;
        });
        setError(null);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let lastFetch = 0;

    const start = () => {
      if (interval) return;
      // Only fetch on (re)start if enough time has elapsed
      if (Date.now() - lastFetch > pollInterval) {
        fetchAll();
        lastFetch = Date.now();
      }
      interval = setInterval(() => {
        fetchAll();
        lastFetch = Date.now();
      }, pollInterval);
    };
    const stop = () => {
      if (interval) { clearInterval(interval); interval = null; }
      abortRef.current?.abort();
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
  }, [fetchAll, pollInterval]);

  // Extract all clobTokenIds for WebSocket subscription
  const allTokenIds = useMemo(() => {
    const ids: string[] = [];
    for (const mkt of allMarkets) {
      for (const m of mkt.markets) {
        if (m.clobTokenIds) {
          try {
            const parsed = typeof m.clobTokenIds === 'string'
              ? JSON.parse(m.clobTokenIds)
              : m.clobTokenIds;
            if (Array.isArray(parsed)) {
              ids.push(...parsed.filter((id: string) => typeof id === 'string' && id.length > 0));
            }
          } catch { /* ignore */ }
        }
      }
    }
    return ids;
  }, [allMarkets]);

  const handleNewMarket = useCallback((event: any) => {
    console.log('[UpDown] New market event received, triggering re-discovery', event);
    fetchAll();
  }, [fetchAll]);

  const clobWs = useClobWebSocket(allTokenIds, { onNewMarket: handleNewMarket });

  // Merge WebSocket prices into discovered markets
  const marketsWithLivePrices = useMemo(() => {
    if (Object.keys(clobWs.prices).length === 0) return allMarkets;

    return allMarkets.map(mkt => {
      const firstMarket = mkt.markets[0];
      if (!firstMarket?.clobTokenIds) return mkt;

      try {
        const tokenIds = typeof firstMarket.clobTokenIds === 'string'
          ? JSON.parse(firstMarket.clobTokenIds)
          : firstMarket.clobTokenIds;

        if (!Array.isArray(tokenIds) || tokenIds.length < 2) return mkt;

        const wsUpPrice = clobWs.prices[tokenIds[0]];
        const wsDownPrice = clobWs.prices[tokenIds[1]];

        return {
          ...mkt,
          upPrice: wsUpPrice ?? mkt.upPrice,
          downPrice: wsDownPrice ?? mkt.downPrice,
        };
      } catch {
        return mkt;
      }
    });
  }, [allMarkets, clobWs.prices]);

  // Filter markets for current selection
  const filteredMarkets = marketsWithLivePrices.filter(
    m => m.asset === selectedAsset && m.timeframe === selectedTimeframe
  );

  // Get the active (non-resolved) market for current selection
  const activeMarket = filteredMarkets.find(m => !m.resolved) || null;

  // Get counts per asset
  const assetCounts = marketsWithLivePrices.reduce((acc, m) => {
    acc[m.asset] = (acc[m.asset] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Auto-rotation: when active market expires, trigger re-discovery
  useEffect(() => {
    if (!activeMarket?.endDate) return;
    const endMs = new Date(activeMarket.endDate).getTime();
    const now = Date.now();
    const msUntilExpiry = endMs - now;
    if (msUntilExpiry <= 0) {
      // Already expired — refetch immediately
      fetchAll();
      return;
    }
    // Schedule a refetch 2s after expiry to pick up the next market
    const timer = setTimeout(() => {
      console.log('[UpDown] Market expired, auto-rotating...');
      fetchAll();
    }, msUntilExpiry + 2000);
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
