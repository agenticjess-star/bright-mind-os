import { useEffect, useMemo, useState } from 'react';
import type { UpDownMarket, CryptoAsset, UpDownTimeframe } from '@/lib/updownTypes';
import { fetchMarketResult, type MarketResult } from '@/lib/marketResults';
import { fetchWindowMoves, coverageFor, type WindowMove, type Coverage } from '@/lib/coinbaseCandles';

/** Post-mortems (winner, distance travelled, cheapest winning price) per event. */
export function useMarketResults(markets: UpDownMarket[]): Record<string, MarketResult> {
  const [results, setResults] = useState<Record<string, MarketResult>>({});

  const ids = useMemo(
    () => markets.map(m => m.eventId).sort().join(','),
    [markets],
  );

  useEffect(() => {
    if (markets.length === 0) return;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        markets.map(async m => {
          try {
            return [m.eventId, await fetchMarketResult(m, controller.signal)] as const;
          } catch { return null; }
        }),
      );
      if (cancelled) return;
      setResults(prev => {
        const next = { ...prev };
        for (const e of entries) if (e) next[e[0]] = e[1];
        return next;
      });
    })();

    return () => { cancelled = true; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return results;
}

/**
 * Completed windows of the selected timeframe over the trailing `days`, used
 * to score how often price actually covers a required distance in time.
 */
export function useWindowMoves(
  asset: CryptoAsset,
  timeframe: UpDownTimeframe,
  days = 3,
): WindowMove[] {
  const [moves, setMoves] = useState<WindowMove[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setMoves([]);

    const load = () => {
      fetchWindowMoves(asset, timeframe, days, controller.signal)
        .then(w => { if (!cancelled) setMoves(w); })
        .catch(() => { /* keep last known */ });
    };

    if (document.visibilityState === 'visible') load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    // windows only complete on the timeframe cadence — a slow refresh is enough
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 5 * 60_000);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [asset, timeframe, days]);

  return moves;
}

/** How often the trailing windows covered `needPct` in the given direction. */
export function useCoverage(
  moves: WindowMove[],
  needPct: number | null,
  direction: 'up' | 'down',
): Coverage {
  return useMemo(
    () => (needPct == null
      ? { rate: null, hits: 0, total: moves.length, medianReachPct: null }
      : coverageFor(moves, Math.max(needPct, 0), direction)),
    [moves, needPct, direction],
  );
}
