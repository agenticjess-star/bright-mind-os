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
  onOpenRow?: (asset: CryptoAsset, timeframe: UpDownTimeframe) => void;
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
  /** % move still required for UP to finish in the money (0 = already clear) */
  needUp: number | null;
  /** % move still required for DOWN to finish in the money */
  needDown: number | null;
  strike: number | null;
  spot: number | null;
  secondsLeft: number | null;
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
  onOpenRow,
}: ClobHeatmapProps) {
  const [axis, setAxis] = useState<Axis>('coin');
  const [side, setSide] = useState<SideFilter>('auto');

  const rows = useMemo<Row[]>(() => {
    const ctx = { allMarkets, seriesByAsset, strikes, spotByAsset };
    if (axis === 'coin') {
      return UPDOWN_TIMEFRAMES.map(tf => buildRow(selectedAsset, tf.value, tf.label, ctx));
    }
    return CRYPTO_ASSETS.map(a => buildRow(a.value, selectedTimeframe, a.label, ctx));
  }, [axis, allMarkets, seriesByAsset, strikes, spotByAsset, selectedAsset, selectedTimeframe]);

  /**
   * Best value = cheapest ask per unit of work still required.
   *   score = ask × (1 + % move needed)
   * SIDE=SMA judges each row on its own momentum lean (both sides when the lean
   * is neutral); SIDE=UP/DOWN forces the comparison onto one side.
   */
  const best = useMemo(() => {
    let bestKey: string | null = null;
    let bestSide: 'UP' | 'DOWN' | null = null;
    let bestScore = Infinity;
    for (const r of rows) {
      const sides: ('UP' | 'DOWN')[] =
        side === 'auto'
          ? r.lean === 'NEUTRAL' ? ['UP', 'DOWN'] : [r.lean as 'UP' | 'DOWN']
          : [side];
      for (const s of sides) {
        const price = s === 'UP' ? r.upPrice : r.downPrice;
        const need = s === 'UP' ? r.needUp : r.needDown;
        if (price == null || need == null) continue;
        const score = price * (1 + Math.max(need, 0));
        if (score < bestScore) { bestScore = score; bestKey = r.key; bestSide = s; }
      }
    }
    return { key: bestKey, side: bestSide };
  }, [rows, side]);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2 shrink-0">
        <span className="text-[9px] font-mono text-muted-foreground tracking-[1.5px]">
          CLOB ASKS · % MOVE TO BEAT
        </span>
        <div className="flex gap-1">
          <AxisToggle active={axis === 'coin'} onClick={() => setAxis('coin')}>BY COIN</AxisToggle>
          <AxisToggle active={axis === 'timeframe'} onClick={() => setAxis('timeframe')}>BY TF</AxisToggle>
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
          <span className="text-[8px] font-mono text-muted-foreground tracking-[1.5px] hidden sm:inline">SIDE</span>
          {(['auto', 'UP', 'DOWN'] as SideFilter[]).map(s => (
            <Pill key={s} active={side === s} onClick={() => setSide(s)}>
              {s === 'auto' ? 'SMA' : s}
            </Pill>
          ))}
        </span>
      </div>

      {/* Header */}
      <div className="grid grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)_56px] px-3 py-1.5 border-b border-border text-[8px] font-mono text-muted-foreground tracking-[1.5px] shrink-0">
        <span>{axis === 'coin' ? 'TF · BEAT' : 'ASSET · BEAT'}</span>
        <span className="text-center">UP ¢ / NEED</span>
        <span className="text-center">DOWN ¢ / NEED</span>
        <span className="text-right">LEAN</span>
      </div>

      {/* Rows — flex to fill remaining space */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin divide-y divide-border">
        <AnimatePresence initial={false}>
          {rows.map(row => (
            <HeatRow
              key={row.key}
              row={row}
              bestSide={best.key === row.key ? best.side : null}
              onClick={() => onOpenRow?.(row.asset, row.timeframe)}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="px-3 py-1.5 border-t border-border flex items-center gap-3 text-[8px] font-mono text-muted-foreground tracking-[1.5px] shrink-0">
        <LegendDot className="bg-chart-up/70" /> SMA ALIGNED
        <LegendDot className="bg-amber-400/80 ring-1 ring-amber-300/60" /> BEST · ASK × DISTANCE
      </div>
    </div>
  );
}

interface RowCtx {
  allMarkets: UpDownMarket[];
  seriesByAsset: Record<CryptoAsset, PricePoint[]>;
  strikes: Record<string, number>;
  spotByAsset: Record<CryptoAsset, number | null>;
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

  const strike = mkt ? ctx.strikes[mkt.eventId] ?? null : null;
  const spot = ctx.spotByAsset[asset] ?? null;
  // Signed distance from spot to the strike, in %. Positive = spot is below strike.
  const gapPct = strike != null && spot != null && spot !== 0 ? ((strike - spot) / spot) * 100 : null;
  const endMs = mkt?.endDate ? new Date(mkt.endDate).getTime() : NaN;

  return {
    key: `${asset}-${timeframe}`,
    label,
    asset,
    timeframe,
    upPrice: mkt?.upPrice ?? null,
    downPrice: mkt?.downPrice ?? null,
    lean: signal.lean,
    leanProb: signal.leanProb,
    needUp: gapPct == null ? null : Math.max(gapPct, 0),
    needDown: gapPct == null ? null : Math.max(-gapPct, 0),
    strike,
    spot,
    secondsLeft: Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - Date.now()) / 1000)) : null,
    ready: signal.fast != null,
  };
}

function fmtStrike(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function fmtLeft(s: number | null): string | null {
  if (s == null) return null;
  if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  if (s >= 60) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`;
  return `${s}s`;
}

function HeatRow({
  row, bestSide, onClick,
}: { row: Row; bestSide: 'UP' | 'DOWN' | null; onClick: () => void }) {
  const left = fmtLeft(row.secondsLeft);
  return (
    <motion.div
      layout
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onClick(); }}
      className={`grid grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)_56px] px-3 py-2 items-center cursor-pointer transition-colors ${
        bestSide ? 'bg-amber-400/[0.07]' : 'hover:bg-secondary/30'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-display font-semibold uppercase leading-none">{row.label}</span>
          {left && <span className="text-[8px] font-mono text-muted-foreground leading-none">{left}</span>}
        </div>
        <div className="text-[8px] font-mono text-muted-foreground tabular-nums truncate leading-tight mt-0.5">
          {row.strike != null ? fmtStrike(row.strike) : '—'}
        </div>
      </div>

      <PriceCell
        price={row.upPrice}
        need={row.needUp}
        aligned={row.lean === 'UP'}
        isBest={bestSide === 'UP'}
        side="up"
      />
      <PriceCell
        price={row.downPrice}
        need={row.needDown}
        aligned={row.lean === 'DOWN'}
        isBest={bestSide === 'DOWN'}
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
  price, need, aligned, isBest, side,
}: {
  price: number | null;
  need: number | null;
  aligned: boolean;
  isBest: boolean;
  side: 'up' | 'down';
}) {
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
        className={`text-[13px] font-display font-bold tabular-nums leading-none ${aligned ? sideColor : 'text-muted-foreground'}`}
      >
        {price != null ? `${(price * 100).toFixed(1)}¢` : '—'}
      </motion.div>
      <div
        className={`text-[8px] font-mono tabular-nums leading-none mt-1 ${
          need == null
            ? 'text-muted-foreground/50'
            : need === 0
              ? 'text-chart-up'
              : 'text-muted-foreground'
        }`}
      >
        {need == null ? '—' : need === 0 ? 'IN MONEY' : `+${need.toFixed(3)}%`}
      </div>
    </div>
  );
}

function AxisToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-[9px] font-mono tracking-[1.5px] border transition-colors ${
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
      className={`px-2.5 py-1.5 rounded text-[10px] font-mono font-medium border transition-colors ${
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
