/**
 * Coinbase Exchange public candle API (CORS-open, no auth).
 *   GET https://api.exchange.coinbase.com/products/{id}/candles?granularity=&start=&end=
 * Response rows: [ time, low, high, open, close, volume ] — newest first.
 *
 * Used for two real, non-derived things:
 *   1. The "price to beat" of an up/down window = the spot price at window open.
 *   2. Support / resistance pivots from recent completed candles.
 */

import type { CryptoAsset, UpDownTimeframe } from './updownTypes';

const API = 'https://api.exchange.coinbase.com';

export const ASSET_PRODUCT: Record<CryptoAsset, string> = {
  btc: 'BTC-USD', eth: 'ETH-USD', sol: 'SOL-USD', xrp: 'XRP-USD',
};

/** Window length in seconds per Polymarket timeframe. */
export const TIMEFRAME_SECONDS: Record<UpDownTimeframe, number> = {
  '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, daily: 86400,
};

/** Candle granularity used for the support/resistance study of a timeframe. */
const LEVEL_GRANULARITY: Record<UpDownTimeframe, number> = {
  '5m': 60, '15m': 60, '1h': 300, '4h': 900, daily: 3600,
};

export interface Candle {
  t: number;   // unix seconds, candle open
  low: number;
  high: number;
  open: number;
  close: number;
}

export async function fetchCandles(
  product: string,
  granularity: number,
  startSec: number,
  endSec: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const url = `${API}/products/${product}/candles?granularity=${granularity}&start=${startSec}&end=${endSec}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`candles ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r: number[]) => ({ t: r[0], low: r[1], high: r[2], open: r[3], close: r[4] }))
    .filter(c => Number.isFinite(c.t) && Number.isFinite(c.open))
    .sort((a, b) => a.t - b.t);
}

/* ---------------- window-open ("price to beat") cache ---------------- */

const openKey = (product: string, ts: number) => `cb:open:${product}:${ts}`;

function cachedOpen(product: string, ts: number): number | null {
  try {
    const v = sessionStorage.getItem(openKey(product, ts));
    return v ? Number(v) : null;
  } catch { return null; }
}
function cacheOpen(product: string, ts: number, price: number) {
  try { sessionStorage.setItem(openKey(product, ts), String(price)); } catch { /* quota */ }
}

/**
 * Resolve the spot price at each given window-open timestamp (unix seconds).
 * Recent opens use 1-minute candles, older ones hourly candles; each asset
 * needs at most two requests and every resolved value is cached for the session.
 */
export async function fetchWindowOpens(
  asset: CryptoAsset,
  timestamps: number[],
  signal?: AbortSignal,
): Promise<Record<number, number>> {
  const product = ASSET_PRODUCT[asset];
  const out: Record<number, number> = {};
  const missing: number[] = [];

  for (const ts of new Set(timestamps)) {
    const hit = cachedOpen(product, ts);
    if (hit != null && Number.isFinite(hit)) out[ts] = hit;
    else missing.push(ts);
  }
  if (missing.length === 0) return out;

  const now = Math.floor(Date.now() / 1000);
  const recent = missing.filter(ts => now - ts <= 4 * 3600);
  const older = missing.filter(ts => now - ts > 4 * 3600);

  const jobs: Promise<void>[] = [];

  const run = (granularity: number, targets: number[]) => {
    if (targets.length === 0) return;
    const start = Math.min(...targets) - granularity;
    jobs.push(
      fetchCandles(product, granularity, start, now, signal)
        .then(candles => {
          for (const ts of targets) {
            // candle whose interval contains ts (candles are ascending)
            let match: Candle | null = null;
            for (const c of candles) {
              if (c.t <= ts && ts < c.t + granularity) { match = c; break; }
            }
            const price = match?.open;
            if (price != null && Number.isFinite(price)) {
              out[ts] = price;
              cacheOpen(product, ts, price);
            }
          }
        })
        .catch(() => { /* offline / rate limited — leave unresolved */ }),
    );
  };

  run(60, recent);
  run(3600, older);
  await Promise.all(jobs);
  return out;
}

/* ---------------- support / resistance ---------------- */

export interface Levels {
  support: number | null;
  resistance: number | null;
  /** candles the levels were derived from */
  samples: number;
}

/**
 * Pivot-based levels: a pivot high is a candle whose high exceeds its k
 * neighbours on both sides (mirror for lows). Resistance = the nearest pivot
 * high above the current price, support = the nearest pivot low below it.
 */
export function computeLevels(candles: Candle[], price: number, k = 2): Levels {
  if (candles.length < 2 * k + 3 || !Number.isFinite(price)) {
    return { support: null, resistance: null, samples: candles.length };
  }
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push(candles[i].high);
    if (isLow) lows.push(candles[i].low);
  }

  const above = highs.filter(h => h > price).sort((a, b) => a - b);
  const below = lows.filter(l => l < price).sort((a, b) => b - a);

  return {
    support: below[0] ?? (lows.length ? Math.min(...lows) : null),
    resistance: above[0] ?? (highs.length ? Math.max(...highs) : null),
    samples: candles.length,
  };
}

/** Fetch the candle history used for a timeframe's support/resistance study. */
export async function fetchLevelCandles(
  asset: CryptoAsset,
  timeframe: UpDownTimeframe,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const granularity = LEVEL_GRANULARITY[timeframe];
  const now = Math.floor(Date.now() / 1000);
  const start = now - granularity * 150;
  return fetchCandles(ASSET_PRODUCT[asset], granularity, start, now, signal);
}
