import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart, Line, YAxis, XAxis, ResponsiveContainer, ReferenceLine, Tooltip,
} from 'recharts';
import type { PricePoint } from '@/hooks/useCoinbasePrice';
import type { CryptoAsset, UpDownTimeframe } from '@/lib/updownTypes';
import { fetchChartHistory, type Candle, type WindowMove, coverageFor } from '@/lib/coinbaseCandles';

interface LivePriceChartProps {
  series: PricePoint[];
  productId: string;
  asset: CryptoAsset;
  timeframe: UpDownTimeframe;
  /** spot price at the contract's window open — the price to beat */
  strikePrice?: number | null;
  support?: number | null;
  resistance?: number | null;
  /** ISO close of the live window, for the countdown */
  endDate?: string | null;
  /** completed windows of the same length over the trailing days */
  moves?: WindowMove[];
  moveDays?: number;
  height?: number;
  fill?: boolean;
}

const WINDOWS: { label: string; sec: number }[] = [
  { label: '5M', sec: 300 },
  { label: '15M', sec: 900 },
  { label: '1H', sec: 3600 },
  { label: '4H', sec: 14400 },
  { label: '1D', sec: 86400 },
];

function fmtUsd(v: number): string {
  if (Math.abs(v) >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (Math.abs(v) >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}
function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(3)}%`;
}
function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Candle backfill so every lookback window has real history behind it. */
function useChartHistory(asset: CryptoAsset, spanSec: number): Candle[] {
  const [candles, setCandles] = useState<Candle[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setCandles([]);
    let cancelled = false;

    const load = () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetchChartHistory(asset, spanSec, controller.signal)
        .then(c => { if (!cancelled && !controller.signal.aborted) setCandles(c); })
        .catch(() => { /* keep last known history */ });
    };

    if (document.visibilityState === 'visible') load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 60_000);

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [asset, spanSec]);

  return candles;
}

function useCountdown(endDate?: string | null): number | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!endDate) return;
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [endDate]);
  if (!endDate) return null;
  const ms = new Date(endDate).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : null;
}

export function LivePriceChart({
  series,
  productId,
  asset,
  timeframe,
  strikePrice,
  support,
  resistance,
  endDate,
  moves = [],
  moveDays = 3,
  height = 220,
  fill = false,
}: LivePriceChartProps) {
  const [spanSec, setSpanSec] = useState<number>(900);
  const history = useChartHistory(asset, spanSec);
  const secondsLeft = useCountdown(endDate);

  /** candle backfill + live ticks, clipped to the selected lookback */
  const data = useMemo(() => {
    const cutoff = Date.now() - spanSec * 1000;
    const pts: { ts: number; price: number }[] = history
      .filter(c => c.t * 1000 >= cutoff)
      .map(c => ({ ts: c.t * 1000, price: c.close }));
    const lastHist = pts.length ? pts[pts.length - 1].ts : 0;
    // One point per second keeps the live edge fluid without drawing every
    // websocket micro-update as a jagged segment.
    const liveBySecond = new Map<number, number>();
    for (const p of series) {
      if (p.ts > lastHist && p.ts >= cutoff) liveBySecond.set(Math.floor(p.ts / 1000) * 1000, p.price);
    }
    for (const [ts, price] of liveBySecond) pts.push({ ts, price });
    return pts.sort((a, b) => a.ts - b.ts);
  }, [history, series, spanSec]);

  const spot = series.length ? series[series.length - 1].price : data[data.length - 1]?.price ?? null;

  const stats = useMemo(() => {
    if (data.length === 0 || spot == null) return null;
    const first = data[0].price;
    return { first, last: spot, change: spot - first, pct: first ? ((spot - first) / first) * 100 : 0 };
  }, [data, spot]);

  const trendUp = (stats?.change ?? 0) >= 0;
  const strokeColor = trendUp ? 'hsl(var(--chart-up))' : 'hsl(var(--destructive))';

  /** signed % move still required for spot to cross the strike (positive = must rise) */
  const gapPct = spot != null && strikePrice != null && spot !== 0
    ? ((strikePrice - spot) / spot) * 100
    : null;
  const gapAbs = spot != null && strikePrice != null ? strikePrice - spot : null;
  const needSide: 'up' | 'down' = (gapPct ?? 0) > 0 ? 'up' : 'down';
  const coverage = useMemo(
    () => (gapPct == null ? null : coverageFor(moves, Math.abs(gapPct), needSide)),
    [moves, gapPct, needSide],
  );
  const distTo = (level: number | null | undefined) =>
    spot != null && level != null && spot !== 0 ? ((level - spot) / spot) * 100 : null;

  if (data.length < 2) {
    return (
      <div
        className={`flex items-center justify-center bg-card border border-border rounded-lg ${fill ? 'h-full w-full' : ''}`}
        style={fill ? undefined : { height }}
      >
        <span className="text-[9px] font-mono text-muted-foreground tracking-[1px]">
          LOADING {productId} HISTORY…
        </span>
      </div>
    );
  }

  const prices = data.map(p => p.price);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const span = Math.max(rawMax - rawMin, rawMax * 0.0004);
  const structureLevels = [support, resistance].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  // Support/resistance are contextual only when close to the visible action.
  // The contract strike is always admitted so its distance remains truthful.
  const near = structureLevels.filter(v => v > rawMin - span && v < rawMax + span);
  const contractLevel = typeof strikePrice === 'number' && Number.isFinite(strikePrice) ? [strikePrice] : [];
  const min = Math.min(rawMin, ...near, ...contractLevel);
  const max = Math.max(rawMax, ...near, ...contractLevel);
  const pad = (max - min) * 0.12 || max * 0.0005;
  const firstTs = data[0].ts;
  const lastTs = data[data.length - 1].ts;

  const inMoney =
    gapPct == null ? null : gapPct <= 0 ? 'UP' : 'DOWN';

  return (
    <div className={`bg-card border border-border rounded-lg p-3 flex flex-col ${fill ? 'h-full w-full min-h-0' : ''}`}>
      {/* Header: price + lookback */}
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[9px] font-mono text-muted-foreground tracking-[1.5px]">{productId}</span>
          {stats && (
            <span className="text-[20px] font-display font-bold text-foreground tabular-nums leading-none">
              {fmtUsd(stats.last)}
            </span>
          )}
          {stats && (
            <span className={`text-[10px] font-mono tabular-nums ${trendUp ? 'text-chart-up' : 'text-destructive'}`}>
              {trendUp ? '▲' : '▼'} {stats.pct.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex gap-0.5 bg-secondary/40 rounded p-0.5 shrink-0">
          {WINDOWS.map(w => (
            <button
              key={w.label}
              onClick={() => setSpanSec(w.sec)}
              className={`px-1.5 py-1 rounded text-[9px] font-mono tracking-[1px] transition-colors ${
                spanSec === w.sec ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Decision strip: how far, how long, how often */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Metric
          label="TIME LEFT"
          value={secondsLeft != null ? fmtClock(secondsLeft) : '—'}
          sub={`${timeframe.toUpperCase()} WINDOW`}
          className={
            secondsLeft == null ? undefined
              : secondsLeft <= 30 ? 'text-destructive'
                : secondsLeft <= 120 ? 'text-warning' : 'text-foreground'
          }
        />
        <Metric
          label={gapPct == null ? 'DISTANCE' : gapPct > 0 ? 'UP NEEDS' : 'DOWN NEEDS'}
          value={gapPct == null ? '—' : `${Math.abs(gapPct).toFixed(3)}%`}
          sub={gapAbs == null ? '—' : `${fmtUsd(Math.abs(gapAbs))} · beat ${strikePrice != null ? fmtUsd(strikePrice) : '—'}`}
          className={gapPct == null ? undefined : 'text-warning'}
        />
        <Metric
          label={`COVERED ${moveDays}D`}
          value={coverage?.rate != null ? `${(coverage.rate * 100).toFixed(0)}%` : '—'}
          sub={
            coverage?.total
              ? `${coverage.hits}/${coverage.total} ${timeframe} windows`
              : 'loading windows…'
          }
          className={
            coverage?.rate == null ? undefined
              : coverage.rate >= 0.6 ? 'text-chart-up'
                : coverage.rate >= 0.3 ? 'text-warning' : 'text-destructive'
          }
        />
      </div>

      {inMoney && (
        <div className="mb-2 text-[9px] font-mono tracking-[1px] text-muted-foreground">
          {inMoney === 'UP' ? (
            <span className="text-chart-up">UP IS IN THE MONEY BY {fmtPct(-(gapPct ?? 0))}</span>
          ) : (
            <span className="text-destructive">DOWN IS IN THE MONEY BY {fmtPct(gapPct ?? 0)}</span>
          )}
          <span className="ml-3">
            SUP {support != null ? fmtUsd(support) : '—'}
            {distTo(support) != null && ` (${fmtPct(distTo(support) ?? 0)})`}
          </span>
          <span className="ml-3">
            RES {resistance != null ? fmtUsd(resistance) : '—'}
            {distTo(resistance) != null && ` (${fmtPct(distTo(resistance) ?? 0)})`}
          </span>
        </div>
      )}

      <div className={fill ? 'flex-1 min-h-0' : ''} style={fill ? undefined : { height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="ts" type="number" domain={[firstTs, lastTs]} hide />
            <YAxis domain={[min - pad, max + pad]} hide allowDataOverflow />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--border))' }}
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                color: 'hsl(var(--foreground))',
              }}
              labelFormatter={(ts: number) => new Date(ts).toLocaleTimeString()}
              formatter={(v: number) => [fmtUsd(v), 'Price']}
            />

            {resistance != null && near.includes(resistance) && (
              <ReferenceLine
                y={resistance}
                stroke="hsl(var(--destructive))"
                strokeDasharray="3 5"
                strokeOpacity={0.3}
                strokeWidth={1}
              />
            )}
            {support != null && near.includes(support) && (
              <ReferenceLine
                y={support}
                stroke="hsl(var(--chart-up))"
                strokeDasharray="3 5"
                strokeOpacity={0.3}
                strokeWidth={1}
              />
            )}
            {strikePrice != null && (
              <ReferenceLine
                y={strikePrice}
                stroke="hsl(var(--warning))"
                strokeDasharray="4 3"
                strokeWidth={1.25}
                label={{
                  value: `TO BEAT ${fmtUsd(strikePrice)}`,
                  position: 'insideTopRight',
                  fill: 'hsl(var(--warning))',
                  fontSize: 9,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            )}
            <Line
              type="monotoneX"
              dataKey="price"
              stroke={strokeColor}
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Metric({
  label, value, sub, className,
}: { label: string; value: string; sub: string; className?: string }) {
  return (
    <div className="bg-secondary/25 border border-border/60 rounded px-2 py-1.5 min-w-0">
      <div className="text-[8px] font-mono text-muted-foreground tracking-[1.5px]">{label}</div>
      <div className={`text-[17px] font-display font-bold tabular-nums leading-tight ${className ?? 'text-foreground'}`}>
        {value}
      </div>
      <div className="text-[8px] font-mono text-muted-foreground tabular-nums truncate">{sub}</div>
    </div>
  );
}
