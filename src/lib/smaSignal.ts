import type { PricePoint } from '@/hooks/useCoinbasePrice';
import type { UpDownTimeframe } from './updownTypes';

export type Lean = 'UP' | 'DOWN' | 'NEUTRAL';

export interface SmaWindows {
  fast: number;
  slow: number;
}

/**
 * SMA window sizes per Polymarket timeframe.
 * Tighter windows for shorter contracts so the crossover is responsive
 * to the price action that will actually resolve the market.
 */
export const SMA_WINDOWS: Record<UpDownTimeframe, SmaWindows> = {
  '5m':   { fast: 8,  slow: 24 },
  '15m':  { fast: 12, slow: 36 },
  '1h':   { fast: 20, slow: 60 },
  '4h':   { fast: 30, slow: 90 },
  'daily':{ fast: 40, slow: 120 },
};

export interface SmaSignal {
  fast: number | null;
  slow: number | null;
  spread: number | null;       // fast - slow, in price units
  spreadPct: number | null;    // (fast - slow) / slow
  lean: Lean;
  /** ms timestamp of the most recent fast/slow crossover, or null */
  lastCrossTs: number | null;
  lastCrossDir: Lean | null;
  /** rough probability prior derived from spread (0-1) */
  leanProb: number;
  /** how many points went into the slow average */
  samples: number;
  windows: SmaWindows;
}

function smaAt(series: PricePoint[], endIdx: number, window: number): number | null {
  if (endIdx + 1 < window) return null;
  let sum = 0;
  for (let i = endIdx - window + 1; i <= endIdx; i++) sum += series[i].price;
  return sum / window;
}

/**
 * Compute SMA crossover signal over the rolling price series.
 * Lean is derived from the sign of (fast - slow). leanProb maps |spreadPct|
 * through a bounded logistic so larger separations push closer to 0/1.
 */
export function computeSmaSignal(series: PricePoint[], timeframe: UpDownTimeframe): SmaSignal {
  const windows = SMA_WINDOWS[timeframe];
  const n = series.length;
  const base: SmaSignal = {
    fast: null,
    slow: null,
    spread: null,
    spreadPct: null,
    lean: 'NEUTRAL',
    lastCrossTs: null,
    lastCrossDir: null,
    leanProb: 0.5,
    samples: n,
    windows,
  };
  if (n < windows.slow) return base;

  const lastIdx = n - 1;
  const fast = smaAt(series, lastIdx, windows.fast)!;
  const slow = smaAt(series, lastIdx, windows.slow)!;
  const spread = fast - slow;
  const spreadPct = slow !== 0 ? spread / slow : 0;

  // Walk backwards to find the most recent sign change of (fast - slow)
  let lastCrossTs: number | null = null;
  let lastCrossDir: Lean | null = null;
  let prevSign = Math.sign(spread);
  for (let i = lastIdx - 1; i >= windows.slow - 1; i--) {
    const f = smaAt(series, i, windows.fast);
    const s = smaAt(series, i, windows.slow);
    if (f == null || s == null) break;
    const sign = Math.sign(f - s);
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) {
      lastCrossTs = series[i + 1].ts;
      lastCrossDir = prevSign > 0 ? 'UP' : 'DOWN';
      break;
    }
    if (sign !== 0) prevSign = sign;
  }

  // Lean classification: require a minimum spread to call non-NEUTRAL
  const minPct = 0.0005; // 5 bps
  let lean: Lean = 'NEUTRAL';
  if (spreadPct > minPct) lean = 'UP';
  else if (spreadPct < -minPct) lean = 'DOWN';

  // Map spreadPct to a probability prior via a bounded logistic.
  // k tuned so a 0.5% spread yields ~0.62, a 2% spread ~0.88.
  const k = 80;
  const leanProb = 1 / (1 + Math.exp(-k * spreadPct));

  return {
    fast,
    slow,
    spread,
    spreadPct,
    lean,
    lastCrossTs,
    lastCrossDir,
    leanProb,
    samples: n,
    windows,
  };
}

/**
 * Compare the SMA lean against the live contract's implied Up probability.
 * Returns the signed edge: lean_prob - implied_up_prob.
 *  > 0 → SMA thinks Up is undervalued by the market
 *  < 0 → SMA thinks Up is overvalued by the market
 */
export function computeEdge(signal: SmaSignal, upPrice: number | null): number | null {
  if (upPrice == null) return null;
  return signal.leanProb - upPrice;
}

export function agreement(signal: SmaSignal, upPrice: number | null): 'AGREE' | 'DISAGREE' | 'NEUTRAL' {
  if (upPrice == null || signal.lean === 'NEUTRAL') return 'NEUTRAL';
  const marketLean: Lean = upPrice > 0.55 ? 'UP' : upPrice < 0.45 ? 'DOWN' : 'NEUTRAL';
  if (marketLean === 'NEUTRAL') return 'NEUTRAL';
  return marketLean === signal.lean ? 'AGREE' : 'DISAGREE';
}
