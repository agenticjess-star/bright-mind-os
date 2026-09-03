import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UpDownMarket, CryptoAsset, UpDownTimeframe } from '@/lib/updownTypes';
import { CRYPTO_ASSETS, UPDOWN_TIMEFRAMES } from '@/lib/updownTypes';
import { computeSmaSignal, type Lean } from '@/lib/smaSignal';
import type { PricePoint } from '@/hooks/useCoinbasePrice';

type Axis = 'coin' | 'timeframe';
type SideFilter = 'auto' | 'UP' | 'DOWN';

interface ClobHeatmapProps {
  allMarkets: UpDownMarket[];
  seriesByAsset: Record<CryptoAsset, PricePoint[]>;
  /** spot price at the contract's window open, keyed by eventId */
  strikes: Record<string, number>;
  spotByAsset: Record<CryptoAsset, number | null>;
  selectedAsset: CryptoAsset;
  selectedTimeframe: UpDownTimeframe;
  onSelectAsset: (a: CryptoAsset) => void;
  onSelectTimeframe: (t: UpDownTimeframe) => void;
}

interface Row {
  key: string;
  label: string;
  asset: CryptoAsset;
  timeframe: UpDownTimeframe;
  upPrice: number | null;
  downPrice: number | null;
  lean: Lean;
  leanProb: number;
  /** side this row is judged on: the SMA lean, or the forced filter */
  side: Lean;
  alignedPrice: number | null; // price on the side being judged
  /** % move still needed for that side to win (0 = already winning), null = unknown */
  needPct: number | null;
  strike: number | null;
  spot: number | null;
  ready: boolean;
}

export function ClobHeatmap({
  allMarkets,
  seriesByAsset,
  strikes,
  spotByAsset,
  selectedAsset,
  selectedTimeframe,
  onSelectAsset,
  onSelectTimeframe,
}: ClobHeatmapProps) {
  const [axis, setAxis] = useState<Axis>('coin');
  const [side, setSide] = useState<SideFilter>('auto');

  const rows = useMemo<Row[]>(() => {
    const ctx = { allMarkets, seriesByAsset, strikes, spotByAsset, side };
    if (axis === 'coin') {
      return UPDOWN_TIMEFRAMES.map(tf => buildRow(selectedAsset, tf.value, tf.label, ctx));
    }
    return CRYPTO_ASSETS.map(a => buildRow(a.value, selectedTimeframe, a.label, ctx));
  }, [axis, allMarkets, seriesByAsset, strikes, spotByAsset, side, selectedAsset, selectedTimeframe]);

  // Best value = cheapest contract per unit of work required.
  // score = ask price × (1 + % move still needed) → low price AND short distance wins.
  const bestKey = useMemo(() => {
    const candidates = rows.filter(r => r.alignedPrice != null && r.side !== 'NEUTRAL');
    if (candidates.length === 0) return null;
    const score = (r: Row) => r.alignedPrice! * (1 + Math.max(r.needPct ?? 0, 0));
    return candidates.reduce((best, r) => (score(r) < score(best) ? r : best), candidates[0]).key;
  }, [rows]);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2 shrink-0">
        <span className="text-[9px] font-mono text-muted-foreground tracking-[1.5px]">
          CLOB PRICES · % MOVE NEEDED TO BEAT
        </span>
        <div className="flex gap-1">
          <AxisToggle active={axis === 'coin'} onClick={() => setAxis('coin')}>BY COIN</AxisToggle>
          <AxisToggle active={axis === 'timeframe'} onClick={() => setAxis('timeframe')}>BY TIMEFRAME</AxisToggle>
        </div>
      </div>

      {/* Selector pill row + side filter */}
      <div className="px-3 py-2 border-b border-border flex flex-wrap items-center gap-1 shrink-0">
        {axis === 'coin'
          ? CRYPTO_ASSETS.map(a => (
              <Pill key={a.value} active={selectedAsset === a.value} onClick={() => onSelectAsset(a.value)}>
                {a.label}
              </Pill>
            ))
          : UPDOWN_TIMEFRAMES.map(tf => (
              <Pill key={tf.value} active={selectedTimeframe === tf.value} onClick={() => onSelectTimeframe(tf.value)}>
                {tf.label}
              </Pill>
            ))}
        <span className="ml-auto flex items-center gap-1">
          <span className="text-[8px] font-mono text-muted-foreground tracking-[1.5px]">SIDE</span>
          {(['auto', 'UP', 'DOWN'] as SideFilter[]).map(s => (
            <Pill key={s} active={side === s} onClick={() => setSide(s)}>
              {s === 'auto' ? 'SMA' : s}
            </Pill>
          ))}
        </span>
      </div>

      {/* Header */}
      <div className="grid grid-cols-[64px_1fr_1fr_92px_60px] px-3 py-1.5 border-b border-border text-[8px] font-mono text-muted-foreground tracking-[1.5px] shrink-0">
        <span>{axis === 'coin' ? 'TF' : 'ASSET'}</span>
        <span className="text-center">UP ¢</span>
        <span className="text-center">DOWN ¢</span>
        <span className="text-right">% TO BEAT</span>
        <span className="text-right">LEAN</span>
      </div>

      {/* Rows — flex to fill remaining space */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin divide-y divide-border">
        <AnimatePresence initial={false}>
          {rows.map(row => (
            <HeatRow key={row.key} row={row} isBest={row.key === bestKey} />
          ))}
        </AnimatePresence>
      </div>

      <div className="px-3 py-2 border-t border-border flex items-center gap-3 text-[8px] font-mono text-muted-foreground tracking-[1.5px] shrink-0">
        <LegendDot className="bg-chart-up/70" /> ALIGNED
        <LegendDot className="bg-amber-400/80 ring-1 ring-amber-300/60" /> BEST · PRICE × DISTANCE
      </div>
    </div>
  );
}

interface RowCtx {
  allMarkets: UpDownMarket[];
  seriesByAsset: Record<CryptoAsset, PricePoint[]>;
  strikes: Record<string, number>;
  spotByAsset: Record<CryptoAsset, number | null>;
  side: SideFilter;
}

function buildRow(
  asset: CryptoAsset,
  timeframe: UpDownTimeframe,
  label: string,
  ctx: RowCtx,
): Row {
  const mkt = ctx.allMarkets.find(m => m.asset === asset && m.timeframe === timeframe && !m.resolved)
    ?? ctx.allMarkets.find(m => m.asset === asset && m.timeframe === timeframe)
    ?? null;
  const signal = computeSmaSignal(ctx.seriesByAsset[asset] ?? [], timeframe);
  const upPrice = mkt?.upPrice ?? null;
  const downPrice = mkt?.downPrice ?? null;

  const side: Lean = ctx.side === 'auto' ? signal.lean : ctx.side;
  const alignedPrice = side === 'UP' ? upPrice : side === 'DOWN' ? downPrice : null;

  const strike = mkt ? ctx.strikes[mkt.eventId] ?? null : null;
  const spot = ctx.spotByAsset[asset] ?? null;
  // Signed distance from spot to the strike, in %. Positive = spot below strike.
  const gapPct = strike != null && spot != null && spot !== 0 ? ((strike - spot) / spot) * 100 : null;
  let needPct: number | null = null;
  if (gapPct != null && side !== 'NEUTRAL') {
    needPct = side === 'UP' ? Math.max(gapPct, 0) : Math.max(-gapPct, 0);
  }

  return {
    key: `${asset}-${timeframe}`,
    label,
    asset,
    timeframe,
    upPrice,
    downPrice,
    lean: signal.lean,
    leanProb: signal.leanProb,
    side,
    alignedPrice,
    needPct,
    strike,
    spot,
    ready: signal.fast != null,
  };
}

function HeatRow({ row, isBest }: { row: Row; isBest: boolean }) {
  const upAligned = row.lean === 'UP';
  const downAligned = row.lean === 'DOWN';

  return (
    <motion.div
      layout
      className={`grid grid-cols-[64px_1fr_1fr_92px_60px] px-3 py-2 items-center transition-colors ${
        isBest ? 'bg-amber-400/[0.07]' : 'hover:bg-secondary/30'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-display font-semibold uppercase">{row.label}</span>
        {isBest && (
          <span className="text-[7px] font-mono px-1 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 tracking-[1px]">
            BEST
          </span>
        )}
      </div>

      <PriceCell
        price={row.upPrice}
        aligned={upAligned}
        isBest={isBest && upAligned}
        side="up"
      />
      <PriceCell
        price={row.downPrice}
        aligned={downAligned}
        isBest={isBest && downAligned}
        side="down"
      />

      <div className="text-right">
        {row.lean === 'NEUTRAL' || !row.ready ? (
          <span className="text-[9px] font-mono text-muted-foreground/60 tracking-[1px]">
            {row.ready ? '—' : '…'}
          </span>
        ) : (
          <span
            className={`text-[10px] font-mono font-semibold tracking-[1px] ${
              row.lean === 'UP' ? 'text-chart-up' : 'text-destructive'
            }`}
          >
            {row.lean === 'UP' ? '▲' : '▼'} {(row.leanProb * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </motion.div>
  );
}

function PriceCell({
  price, aligned, isBest, side,
}: { price: number | null; aligned: boolean; isBest: boolean; side: 'up' | 'down' }) {
  const sideColor = side === 'up' ? 'text-chart-up' : 'text-destructive';
  const bg = isBest
    ? 'bg-amber-400/15 border-amber-400/50 ring-1 ring-amber-300/40'
    : aligned
      ? side === 'up'
        ? 'bg-chart-up/12 border-chart-up/35'
        : 'bg-destructive/12 border-destructive/35'
      : 'bg-secondary/20 border-transparent';
  return (
    <div className={`mx-1 rounded border px-2 py-1 text-center ${bg}`}>
      <motion.div
        key={price ?? 'na'}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className={`text-[13px] font-display font-bold tabular-nums ${aligned ? sideColor : 'text-muted-foreground'}`}
      >
        {price != null ? `${(price * 100).toFixed(1)}¢` : '—'}
      </motion.div>
    </div>
  );
}

function AxisToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-[1.5px] border transition-colors ${
        active
          ? 'bg-primary/15 text-primary border-primary/40'
          : 'bg-secondary/40 text-muted-foreground border-transparent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors ${
        active
          ? 'bg-primary/15 text-primary border-primary/40'
          : 'bg-secondary/50 text-muted-foreground border-transparent hover:bg-secondary hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function LegendDot({ className }: { className: string }) {
  return <span className={`inline-block w-2 h-2 rounded-sm ${className}`} />;
}
