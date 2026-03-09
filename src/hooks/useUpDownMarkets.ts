import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { UpDownMarket, CryptoAsset, UpDownTimeframe } from '@/lib/updownTypes';
import { useClobWebSocket } from './useClobWebSocket';

interface UseUpDownMarketsOptions {
  pollInterval?: number;
}

export function useUpDownMarkets({ pollInterval = 60000 }: UseUpDownMarketsOptions = {}) {
  const [allMarkets, setAllMarkets] = useState<UpDownMarket[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<CryptoAsset>('btc');
  const [selectedTimeframe, setSelectedTimeframe] = useState<UpDownTimeframe>('5m');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
          return data.map((m: any) => {
            const cached = prevPriceMap.get(m.eventSlug);
            if (cached && (!m.upPrice || m.upPrice <= 0.02)) {
              return { ...m, upPrice: cached.up, downPrice: cached.down };
            }
            return m;
          });
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
    fetchAll();
    const interval = setInterval(fetchAll, pollInterval);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
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
