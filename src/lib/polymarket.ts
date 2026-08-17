/**
 * Polymarket public data layer — 100% client-side, no auth, no proxy.
 *
 * Verified endpoints (all send `Access-Control-Allow-Origin: *`):
 *   Gamma events (batched by slug): GET https://gamma-api.polymarket.com/events?slug=a&slug=b...
 *   CLOB order books (batched):     POST https://clob.polymarket.com/books  [{token_id}]
 *
 * Verified slug conventions for crypto "Up or Down" markets:
 *   5m    {sym}-updown-5m-{epochStartSec}      (epoch = window start, 300s grid)
 *   15m   {sym}-updown-15m-{epochStartSec}     (900s grid)
 *   4h    {sym}-updown-4h-{epochStartSec}      (14400s grid)
 *   1h    {name}-up-or-down-{month}-{day}-{year}-{h}{am|pm}-et   (ET start hour)
 *   daily {name}-up-or-down-on-{month}-{day}-{year}
 */

import type { UpDownMarket, CryptoAsset, UpDownTimeframe } from './updownTypes';

const GAMMA = 'https://gamma-api.polymarket.com';
const CLOB = 'https://clob.polymarket.com';

/** ticker symbol used in epoch slugs */
const SYMBOL: Record<CryptoAsset, string> = {
  btc: 'btc', eth: 'eth', sol: 'sol', xrp: 'xrp',
};
/** long name used in human-readable slugs */
const LONG_NAME: Record<CryptoAsset, string> = {
  btc: 'bitcoin', eth: 'ethereum', sol: 'solana', xrp: 'xrp',
};

const EPOCH_INTERVAL: Record<string, number> = { '5m': 300, '15m': 900, '4h': 14400 };

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Calendar parts of a Date in America/New_York (ET), which Polymarket slugs use. */
function etParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month) - 1,
    day: Number(p.day),
    hour: Number(p.hour) % 24,
  };
}

function hourLabel(hour24: number): string {
  const h = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h}${hour24 < 12 ? 'am' : 'pm'}`;
}

export interface SlugTarget {
  slug: string;
  asset: CryptoAsset;
  timeframe: UpDownTimeframe;
}

/**
 * Deterministic slug plan: for every asset build the current + upcoming windows
 * (and a short tail of recent windows for the history panel).
 */
export function buildSlugPlan(
  assets: CryptoAsset[],
  now = new Date(),
  historyWindows = 3,
): SlugTarget[] {
  const out: SlugTarget[] = [];
  const nowSec = Math.floor(now.getTime() / 1000);

  for (const asset of assets) {
    const sym = SYMBOL[asset];
    const name = LONG_NAME[asset];

    // Epoch-grid timeframes
    for (const tf of ['5m', '15m', '4h'] as const) {
      const iv = EPOCH_INTERVAL[tf];
      const current = Math.floor(nowSec / iv) * iv;
      const ahead = tf === '4h' ? 1 : 2;
      const back = tf === '4h' ? 1 : historyWindows;
      for (let i = -back; i <= ahead; i++) {
        out.push({ slug: `${sym}-updown-${tf}-${current + i * iv}`, asset, timeframe: tf });
      }
    }

    // Hourly (human-readable, ET start hour)
    for (let i = -1; i <= 2; i++) {
      const d = new Date(now.getTime() + i * 3600_000);
      const { year, month, day, hour } = etParts(d);
      out.push({
        slug: `${name}-up-or-down-${MONTHS[month]}-${day}-${year}-${hourLabel(hour)}-et`,
        asset,
        timeframe: '1h',
      });
    }

    // Daily (today + yesterday in ET)
    for (let i = 0; i >= -1; i--) {
      const d = new Date(now.getTime() + i * 86400_000);
      const { year, month, day } = etParts(d);
      out.push({
        slug: `${name}-up-or-down-on-${MONTHS[month]}-${day}-${year}`,
        asset,
        timeframe: 'daily',
      });
    }
  }

  return out;
}

async function getJson(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Gamma ${res.status}`);
  return res.json();
}

/** One batched Gamma request for every slug in the plan (chunked to keep URLs sane). */
async function fetchEventsBySlugs(slugs: string[], signal?: AbortSignal): Promise<any[]> {
  const CHUNK = 40;
  const chunks: string[][] = [];
  for (let i = 0; i < slugs.length; i += CHUNK) chunks.push(slugs.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map(chunk => {
      const qs = chunk.map(s => `slug=${encodeURIComponent(s)}`).join('&');
      return getJson(`${GAMMA}/events?limit=${chunk.length}&${qs}`, signal).catch(() => []);
    }),
  );
  return results.flat().filter(Boolean);
}

export interface BookQuote {
  bid: number | null;
  ask: number | null;
  mid: number | null;
}

/** Batched CLOB order books → best bid / best ask per token. */
export async function fetchBooks(
  tokenIds: string[],
  signal?: AbortSignal,
): Promise<Record<string, BookQuote>> {
  const out: Record<string, BookQuote> = {};
  if (tokenIds.length === 0) return out;

  const CHUNK = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < tokenIds.length; i += CHUNK) chunks.push(tokenIds.slice(i, i + CHUNK));

  await Promise.all(chunks.map(async chunk => {
    try {
      const res = await fetch(`${CLOB}/books`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk.map(token_id => ({ token_id }))),
      });
      if (!res.ok) return;
      const books = await res.json();
      if (!Array.isArray(books)) return;
      for (const b of books) {
        if (!b?.asset_id) continue;
        out[b.asset_id] = quoteFromBook(b.bids, b.asks);
      }
    } catch { /* offline / rate limited — keep previous prices */ }
  }));

  return out;
}

/** CLOB books: bids ascending (last = best bid), asks descending (last = best ask). */
export function quoteFromBook(bids: any[], asks: any[]): BookQuote {
  const bid = bestLevel(bids, 'max');
  const ask = bestLevel(asks, 'min');
  const mid = bid != null && ask != null ? (bid + ask) / 2 : (ask ?? bid);
  return { bid, ask, mid };
}

function bestLevel(levels: any[] | undefined, kind: 'max' | 'min'): number | null {
  if (!Array.isArray(levels) || levels.length === 0) return null;
  let best: number | null = null;
  for (const l of levels) {
    const p = typeof l?.price === 'string' ? parseFloat(l.price) : Number(l?.price);
    const size = typeof l?.size === 'string' ? parseFloat(l.size) : Number(l?.size);
    if (!Number.isFinite(p) || !(size > 0)) continue;
    if (best == null || (kind === 'max' ? p > best : p < best)) best = p;
  }
  return best;
}

function parseTokenIds(raw: unknown): string[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && !!x) : [];
  } catch {
    return [];
  }
}

/** Token ids for the Up (index 0) and Down (index 1) outcomes of an event. */
export function eventTokenIds(market: UpDownMarket): { up: string | null; down: string | null } {
  const ids = parseTokenIds(market.markets[0]?.clobTokenIds);
  return { up: ids[0] ?? null, down: ids[1] ?? null };
}

function toMarket(event: any, target: SlugTarget, now: number): UpDownMarket {
  const endMs = new Date(event.endDate || event.end_date || 0).getTime();
  const resolved = !!event.closed || (Number.isFinite(endMs) && endMs <= now);
  const markets = Array.isArray(event.markets) ? event.markets : [];

  let outcome: string | null = null;
  if (resolved) {
    try {
      const prices = JSON.parse(markets[0]?.outcomePrices ?? '[]');
      if (parseFloat(prices[0]) > 0.9) outcome = 'Up';
      else if (parseFloat(prices[1]) > 0.9) outcome = 'Down';
    } catch { /* unresolved */ }
  }

  return {
    asset: target.asset,
    timeframe: target.timeframe,
    eventId: String(event.id ?? ''),
    eventSlug: event.slug ?? target.slug,
    eventTitle: event.title ?? '',
    endDate: event.endDate ?? event.end_date ?? '',
    upPrice: null,
    downPrice: null,
    upBid: null,
    downBid: null,
    resolved,
    outcome,
    markets: markets.map((m: any) => ({
      id: String(m.id ?? ''),
      question: m.question ?? '',
      slug: m.slug ?? '',
      outcomePrices: m.outcomePrices ?? '',
      clobTokenIds: m.clobTokenIds ?? '',
      conditionId: m.conditionId ?? '',
      active: m.active ?? true,
      closed: m.closed ?? false,
      volume: String(m.volume ?? '0'),
      liquidity: String(m.liquidity ?? '0'),
    })),
  };
}

/**
 * Discover every live (and recently closed) up/down market for the given assets
 * and seed it with real CLOB best bid / best ask. Two network requests total.
 */
export async function discoverUpDownMarkets(
  assets: CryptoAsset[],
  signal?: AbortSignal,
): Promise<UpDownMarket[]> {
  const plan = buildSlugPlan(assets);
  const bySlug = new Map(plan.map(t => [t.slug, t]));

  const events = await fetchEventsBySlugs(plan.map(t => t.slug), signal);
  const now = Date.now();

  const markets: UpDownMarket[] = [];
  for (const ev of events) {
    const target = bySlug.get(ev?.slug);
    if (!target) continue;
    markets.push(toMarket(ev, target, now));
  }

  // Price only the live markets — resolved ones have no book worth reading.
  const live = markets.filter(m => !m.resolved);
  const tokenIds: string[] = [];
  for (const m of live) {
    const { up, down } = eventTokenIds(m);
    if (up) tokenIds.push(up);
    if (down) tokenIds.push(down);
  }

  const books = await fetchBooks(tokenIds, signal);
  for (const m of live) {
    const { up, down } = eventTokenIds(m);
    const upQ = up ? books[up] : undefined;
    const downQ = down ? books[down] : undefined;
    m.upPrice = upQ?.ask ?? null;
    m.downPrice = downQ?.ask ?? null;
    m.upBid = upQ?.bid ?? null;
    m.downBid = downQ?.bid ?? null;
  }

  markets.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  return markets;
}
