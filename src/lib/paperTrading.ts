/** Paper trading portfolio — simulated trades judged by Jev, persisted locally. */

export type PaperSide = 'up' | 'down';

export interface PaperPosition {
  id: string;           // eventId + openedAt
  eventId: string;
  asset: string;
  timeframe: string;
  side: PaperSide;
  entryAsk: number;     // $ per share paid
  shares: number;
  cost: number;         // entryAsk * shares
  openedAt: number;
  endDate: string;
  conviction: number;   // Jev score 0-4
}

export interface PaperTrade extends PaperPosition {
  closedAt: number;
  exitPrice: number;    // 1 or 0 on resolution, or mark price if early-exited
  pnl: number;
  result: 'win' | 'loss' | 'exit';
}

export interface PaperDecisionLog {
  id: string;
  timestamp: number;
  eventId: string;
  asset: string;
  timeframe: string;
  direction: 'up' | 'down' | 'skip';
  conviction: number;
  acted: boolean;
  note: string;
}

export interface PaperPortfolio {
  startingCash: number;
  cash: number;
  positions: PaperPosition[];
  closed: PaperTrade[];
  log: PaperDecisionLog[];
  realizedPnl: number;
}

export const STARTING_CASH = 1000;
export const POSITION_SIZE = 40;      // $ per trade
export const MAX_OPEN_POSITIONS = 4;
export const MIN_CONVICTION = 2.5;    // Jev score threshold to act

const STORAGE_KEY = 'paper-portfolio-v1';

export function emptyPortfolio(): PaperPortfolio {
  return {
    startingCash: STARTING_CASH,
    cash: STARTING_CASH,
    positions: [],
    closed: [],
    log: [],
    realizedPnl: 0,
  };
}

export function loadPortfolio(): PaperPortfolio {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPortfolio();
    const parsed = JSON.parse(raw) as PaperPortfolio;
    if (typeof parsed.cash !== 'number' || !Array.isArray(parsed.positions)) return emptyPortfolio();
    return { ...emptyPortfolio(), ...parsed };
  } catch {
    return emptyPortfolio();
  }
}

export function savePortfolio(p: PaperPortfolio) {
  try {
    // cap log + closed history so storage stays lean
    const trimmed: PaperPortfolio = {
      ...p,
      log: p.log.slice(-100),
      closed: p.closed.slice(-100),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* storage full / unavailable — non-fatal */ }
}

export function resetPortfolio(): PaperPortfolio {
  const p = emptyPortfolio();
  savePortfolio(p);
  return p;
}

export function openPosition(
  p: PaperPortfolio,
  input: Omit<PaperPosition, 'id' | 'shares' | 'cost' | 'openedAt'>,
): PaperPortfolio {
  const cost = Math.min(POSITION_SIZE, p.cash);
  if (cost <= 0 || input.entryAsk <= 0 || input.entryAsk >= 1) return p;
  const shares = cost / input.entryAsk;
  const position: PaperPosition = {
    ...input,
    id: `${input.eventId}-${Date.now()}`,
    shares,
    cost,
    openedAt: Date.now(),
  };
  return { ...p, cash: p.cash - cost, positions: [...p.positions, position] };
}

export function closePosition(
  p: PaperPortfolio,
  positionId: string,
  exitPrice: number,
  result: PaperTrade['result'],
): PaperPortfolio {
  const pos = p.positions.find(x => x.id === positionId);
  if (!pos) return p;
  const proceeds = pos.shares * exitPrice;
  const trade: PaperTrade = {
    ...pos,
    closedAt: Date.now(),
    exitPrice,
    pnl: proceeds - pos.cost,
    result,
  };
  return {
    ...p,
    cash: p.cash + proceeds,
    positions: p.positions.filter(x => x.id !== positionId),
    closed: [trade, ...p.closed],
    realizedPnl: p.realizedPnl + trade.pnl,
  };
}

export function appendLog(p: PaperPortfolio, entry: Omit<PaperDecisionLog, 'id' | 'timestamp'>): PaperPortfolio {
  return {
    ...p,
    log: [...p.log, { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now() }],
  };
}

/** Mark-to-market equity: cash + open positions valued at current bid (or entry if unknown). */
export function currentEquity(p: PaperPortfolio, marks: Record<string, { upBid?: number | null; downBid?: number | null }>): number {
  let equity = p.cash;
  for (const pos of p.positions) {
    const mark = marks[pos.eventId];
    const px = pos.side === 'up' ? mark?.upBid : mark?.downBid;
    equity += pos.shares * (px != null ? px : pos.entryAsk);
  }
  return equity;
}
