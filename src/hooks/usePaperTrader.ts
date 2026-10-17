import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { UpDownMarket } from '@/lib/updownTypes';
import { computeSmaSignal, type SmaSignal } from '@/lib/smaSignal';
import {
  appendLog,
  closePosition,
  currentEquity,
  loadPortfolio,
  openPosition,
  resetPortfolio,
  savePortfolio,
  MAX_OPEN_POSITIONS,
  MIN_CONVICTION,
  type PaperPortfolio,
} from '@/lib/paperTrading';

const EVAL_INTERVAL_MS = 45_000;
const MAX_CANDIDATES = 8;

interface UsePaperTraderArgs {
  allMarkets: UpDownMarket[];
  strikes: Record<string, number>;
  spotByAsset: Record<string, number | null>;
  seriesByAsset: Record<string, { t: number; p: number }[]>;
  enabled: boolean;
}

export interface PaperTraderState {
  portfolio: PaperPortfolio;
  equity: number;
  running: boolean;
  evaluating: boolean;
  lastEvalAt: number | null;
  lastError: string | null;
  toggle: () => void;
  reset: () => void;
}

function pctToBeat(spot: number | null, strike: number | undefined): { up: number | null; down: number | null } {
  if (spot == null || strike == null || strike <= 0) return { up: null, down: null };
  const diff = ((strike - spot) / strike) * 100;
  return { up: diff, down: -diff };
}

export function usePaperTrader({ allMarkets, strikes, spotByAsset, seriesByAsset, enabled }: UsePaperTraderArgs): PaperTraderState {
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(() => loadPortfolio());
  const [running, setRunning] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [lastEvalAt, setLastEvalAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const dataRef = useRef({ allMarkets, strikes, spotByAsset, seriesByAsset });
  dataRef.current = { allMarkets, strikes, spotByAsset, seriesByAsset };
  const portfolioRef = useRef(portfolio);
  portfolioRef.current = portfolio;
  const inFlight = useRef(false);

  const persist = useCallback((next: PaperPortfolio) => {
    setPortfolio(next);
    savePortfolio(next);
  }, []);

  // Resolve positions whose markets have settled.
  useEffect(() => {
    const byEvent = new Map(allMarkets.map(m => [m.eventId, m]));
    let p = portfolioRef.current;
    let changed = false;
    for (const pos of [...p.positions]) {
      const m = byEvent.get(pos.eventId);
      const ended = new Date(pos.endDate).getTime() <= Date.now();
      if (m?.resolved && m.outcome) {
        const won = m.outcome.toLowerCase() === pos.side;
        p = closePosition(p, pos.id, won ? 1 : 0, won ? 'win' : 'loss');
        p = appendLog(p, {
          eventId: pos.eventId, asset: pos.asset, timeframe: pos.timeframe,
          direction: pos.side, conviction: pos.conviction, acted: false,
          note: `Resolved ${won ? 'WIN' : 'LOSS'} — ${pos.side.toUpperCase()} @ ${pos.entryAsk.toFixed(2)}`,
        });
        changed = true;
      } else if (ended && !m) {
        // market gone and ended without known outcome — exit at entry (no P&L) to avoid fake results
        p = closePosition(p, pos.id, pos.entryAsk, 'exit');
        p = appendLog(p, {
          eventId: pos.eventId, asset: pos.asset, timeframe: pos.timeframe,
          direction: pos.side, conviction: pos.conviction, acted: false,
          note: 'Exited at cost — outcome unavailable',
        });
        changed = true;
      }
    }
    if (changed) persist(p);
  }, [allMarkets, persist]);

  const evaluate = useCallback(async () => {
    if (inFlight.current) return;
    const { allMarkets: markets, strikes: sk, spotByAsset: spots, seriesByAsset: series } = dataRef.current;
    const p = portfolioRef.current;

    const openEventIds = new Set(p.positions.map(x => x.eventId));
    const now = Date.now();

    const candidates = markets
      .filter(m => !m.resolved && !openEventIds.has(m.eventId))
      .map(m => {
        const minutesLeft = (new Date(m.endDate).getTime() - now) / 60000;
        return { m, minutesLeft };
      })
      .filter(x => x.minutesLeft > 0.5 && x.minutesLeft < 60 * 24)
      .filter(x => (x.m.upPrice != null && x.m.upPrice > 0.02 && x.m.upPrice < 0.98) ||
                   (x.m.downPrice != null && x.m.downPrice > 0.02 && x.m.downPrice < 0.98))
      .slice(0, MAX_CANDIDATES);

    if (candidates.length === 0) return;

    inFlight.current = true;
    setEvaluating(true);
    setLastError(null);
    try {
      const payload = candidates.map(({ m, minutesLeft }) => {
        const spot = spots[m.asset] ?? null;
        const strike = sk[m.eventId];
        const beat = pctToBeat(spot, strike);
        const sig: SmaSignal = computeSmaSignal(series[m.asset] ?? [], m.timeframe as never);
        return {
          id: m.eventId,
          asset: m.asset,
          timeframe: m.timeframe,
          spotPrice: spot ?? 0,
          strikePrice: strike ?? null,
          pctToBeatUp: beat.up,
          pctToBeatDown: beat.down,
          minutesLeft: Math.round(minutesLeft * 10) / 10,
          upAsk: m.upPrice,
          downAsk: m.downPrice,
          smaSignal: sig.direction,
          smaSpreadPct: sig.spreadPct,
          lastCrossAgoMin: sig.lastCrossAgoMin,
        };
      });

      const { data, error } = await supabase.functions.invoke('jev-paper-trade', {
        body: { candidates: payload },
      });
      if (error) throw new Error(error.message);
      const decisions = (data?.decisions ?? {}) as Record<string, { direction: string; conviction: number }>;

      let next = portfolioRef.current;
      for (const { m } of candidates) {
        const d = decisions[m.eventId];
        if (!d) continue;
        const direction = d.direction as 'up' | 'down' | 'skip';
        const ask = direction === 'up' ? m.upPrice : direction === 'down' ? m.downPrice : null;
        const canAct =
          direction !== 'skip' &&
          d.conviction >= MIN_CONVICTION &&
          ask != null && ask > 0.02 && ask < 0.98 &&
          next.positions.length < MAX_OPEN_POSITIONS &&
          next.cash > 1;

        if (canAct) {
          next = openPosition(next, {
            eventId: m.eventId,
            asset: m.asset,
            timeframe: m.timeframe,
            side: direction as 'up' | 'down',
            entryAsk: ask!,
            endDate: m.endDate,
            conviction: d.conviction,
          });
        }
        next = appendLog(next, {
          eventId: m.eventId,
          asset: m.asset,
          timeframe: m.timeframe,
          direction,
          conviction: d.conviction,
          acted: canAct,
          note: canAct
            ? `Bought ${direction.toUpperCase()} @ ${ask!.toFixed(2)} (conviction ${d.conviction.toFixed(1)})`
            : `${direction.toUpperCase()} — conviction ${d.conviction.toFixed(1)}`,
        });
      }
      persist(next);
      setLastEvalAt(Date.now());
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'evaluation failed');
    } finally {
      inFlight.current = false;
      setEvaluating(false);
    }
  }, [persist]);

  // Visibility-gated evaluation loop.
  useEffect(() => {
    if (!running || !enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => { if (document.visibilityState === 'visible') evaluate(); };
    timer = setInterval(tick, EVAL_INTERVAL_MS);
    tick();
    return () => { if (timer) clearInterval(timer); };
  }, [running, enabled, evaluate]);

  const marks: Record<string, { upBid?: number | null; downBid?: number | null }> = {};
  for (const m of allMarkets) marks[m.eventId] = { upBid: m.upBid, downBid: m.downBid };

  return {
    portfolio,
    equity: currentEquity(portfolio, marks),
    running,
    evaluating,
    lastEvalAt,
    lastError,
    toggle: () => setRunning(r => !r),
    reset: () => persist(resetPortfolio()),
  };
}
