/**
 * Post-mortem for finished up/down windows — all real, all public:
 *   • which side won (Gamma outcomePrices on the resolved event)
 *   • how far spot actually travelled inside the window (Coinbase candles)
 *   • the cheapest the winning side ever traded (CLOB prices-history)
 *
 * Endpoint: GET https://clob.polymarket.com/prices-history?market={tokenId}
 *           &startTs=&endTs=&fidelity=1   (CORS-open, no auth)
 */

import type { UpDownMarket, CryptoAsset } from './updownTypes';
import { eventTokenIds } from './polymarket';
import { fetchCandles, ASSET_PRODUCT, TIMEFRAME_SECONDS } from './coinbaseCandles';

const CLOB = 'https://clob.polymarket.com';

export interface PricePointLite { t: number; p: number }

export interface MarketResult {
  eventId: string;
  winner: 'UP' | 'DOWN' | null;
  /** spot at window open (price to beat) */
  open: number | null;
  /** spot at window close */
  close: number | null;
  /** signed move in quote currency */
  moveAbs: number | null;
  movePct: number | null;
  /** cheapest traded price of the winning side, and how long before the close */
  lowPrice: number | null;
  lowSecondsBeforeEnd: number | null;
}

async function fetchPriceHistory(
  tokenId: string,
  startTs: number,
  endTs: number,
  signal?: AbortSignal,
): Promise<PricePointLite[]> {
  const url = `${CLOB}/prices-history?market=${tokenId}&startTs=${startTs}&endTs=${endTs}&fidelity=1`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`prices-history ${res.status}`);
  const json = await res.json();
  const rows = Array.isArray(json?.history) ? json.history : [];
  return rows
    .map((r: any) => ({ t: Number(r.t), p: Number(r.p) }))
    .filter((r: PricePointLite) => Number.isFinite(r.t) && Number.isFinite(r.p));
}

const cacheKey = (id: string) => `updown:result:${id}`;

function readCache(id: string): MarketResult | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(id));
    return raw ? (JSON.parse(raw) as MarketResult) : null;
  } catch { return null; }
}
function writeCache(r: MarketResult) {
  try { sessionStorage.setItem(cacheKey(r.eventId), JSON.stringify(r)); } catch { /* quota */ }
}

function winnerOf(m: UpDownMarket): 'UP' | 'DOWN' | null {
  if (m.outcome === 'Up') return 'UP';
  if (m.outcome === 'Down') return 'DOWN';
  try {
    const prices = JSON.parse(m.markets[0]?.outcomePrices ?? '[]');
    if (parseFloat(prices[0]) > 0.9) return 'UP';
    if (parseFloat(prices[1]) > 0.9) return 'DOWN';
  } catch { /* not settled yet */ }
  return null;
}

/** Build the post-mortem for one finished window. Cached per session. */
export async function fetchMarketResult(
  market: UpDownMarket,
  signal?: AbortSignal,
): Promise<MarketResult> {
  const cached = readCache(market.eventId);
  if (cached) return cached;

  const endSec = Math.floor(new Date(market.endDate).getTime() / 1000);
  const windowSec = TIMEFRAME_SECONDS[market.timeframe as keyof typeof TIMEFRAME_SECONDS] ?? 300;
  const startSec = market.windowStart
    ? Math.floor(new Date(market.windowStart).getTime() / 1000)
    : endSec - windowSec;

  const winner = winnerOf(market);
  const tokens = eventTokenIds(market);
  const winTokenId = winner === 'UP' ? tokens.up : winner === 'DOWN' ? tokens.down : null;

  const granularity = windowSec <= 900 ? 60 : windowSec <= 3600 ? 300 : 900;

  const [candles, history] = await Promise.all([
    fetchCandles(ASSET_PRODUCT[market.asset as CryptoAsset], granularity, startSec - granularity, endSec + granularity, signal)
      .catch(() => []),
    winTokenId
      ? fetchPriceHistory(winTokenId, startSec, endSec, signal).catch(() => [])
      : Promise.resolve([]),
  ]);

  const inWindow = candles.filter(c => c.t >= startSec - granularity && c.t < endSec);
  const open = inWindow.find(c => c.t + granularity > startSec)?.open ?? inWindow[0]?.open ?? null;
  const close = inWindow[inWindow.length - 1]?.close ?? null;

  let lowPrice: number | null = null;
  let lowSecondsBeforeEnd: number | null = null;
  for (const h of history) {
    if (lowPrice == null || h.p < lowPrice) {
      lowPrice = h.p;
      lowSecondsBeforeEnd = Math.max(0, endSec - h.t);
    }
  }

  const moveAbs = open != null && close != null ? close - open : null;
  const result: MarketResult = {
    eventId: market.eventId,
    winner,
    open,
    close,
    moveAbs,
    movePct: moveAbs != null && open ? (moveAbs / open) * 100 : null,
    lowPrice,
    lowSecondsBeforeEnd,
  };

  // Only cache once the window is genuinely settled and complete.
  if (winner && lowPrice != null && close != null) writeCache(result);
  return result;
}
