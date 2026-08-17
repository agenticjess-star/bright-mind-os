/** Discovered up/down market from Gamma search + CLOB pricing */
export interface UpDownMarket {
  asset: string;       // btc, eth, sol, xrp
  timeframe: string;   // 5m, 15m, 1h, 4h, daily
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  endDate: string;
  /** best ASK for the Up outcome — what it costs to buy Up */
  upPrice: number | null;
  /** best ASK for the Down outcome */
  downPrice: number | null;
  /** best BID (what you'd receive selling) */
  upBid?: number | null;
  downBid?: number | null;

  resolved?: boolean;
  outcome?: string | null; // 'Up' | 'Down' | null
  markets: {
    id: string;
    question: string;
    slug: string;
    outcomePrices: string;
    clobTokenIds: string;
    conditionId: string;
    active: boolean;
    closed: boolean;
    volume: string;
    liquidity: string;
  }[];
}

export type CryptoAsset = 'btc' | 'eth' | 'sol' | 'xrp';
export type UpDownTimeframe = '5m' | '15m' | '1h' | '4h' | 'daily';

export const CRYPTO_ASSETS: { label: string; value: CryptoAsset }[] = [
  { label: 'BTC', value: 'btc' },
  { label: 'ETH', value: 'eth' },
  { label: 'SOL', value: 'sol' },
  { label: 'XRP', value: 'xrp' },
];

export const UPDOWN_TIMEFRAMES: { label: string; value: UpDownTimeframe }[] = [
  { label: '5M', value: '5m' },
  { label: '15M', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: 'D', value: 'daily' },
];
