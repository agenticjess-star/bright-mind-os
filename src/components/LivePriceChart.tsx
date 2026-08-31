import { useMemo, useState } from 'react';
import { LineChart, Line, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts';
import type { PricePoint } from '@/hooks/useCoinbasePrice';

interface LivePriceChartProps {
  series: PricePoint[];
  productId: string;
  /** spot price at the contract's window open — the price to beat */
  strikePrice?: number | null;
  support?: number | null;
  resistance?: number | null;
  height?: number;
  fill?: boolean;
}

const WINDOWS: { label: string; ms: number | null }[] = [
  { label: '30S', ms: 30_000 },
  { label: '1M', ms: 60_000 },
  { label: '5M', ms: 300_000 },
  { label: '15M', ms: 900_000 },
  { label: 'ALL', ms: null },
];

function fmtUsd(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(3)}%`;
}

export function LivePriceChart({
  series,
  productId,
  strikePrice,
  support,
  resistance,
  height = 220,
  fill = false,
}: LivePriceChartProps) {
  const [windowMs, setWindowMs] = useState<number | null>(60_000);

  const windowed = useMemo(() => {
    if (windowMs == null || series.length === 0) return series;
    const cutoff = series[series.length - 1].ts - windowMs;
    let i = 0;
    while (i < series.length && series[i].ts < cutoff) i++;
    return series.slice(Math.max(0, i - 1));
  }, [series, windowMs]);

  const data = useMemo(() => windowed.map(p => ({ ts: p.ts, price: p.price })), [windowed]);

  const stats = useMemo(() => {
    if (windowed.length === 0) return null;
    const first = windowed[0].price;
    const last = windowed[windowed.length - 1].price;
    const change = last - first;
    const pct = first !== 0 ? (change / first) * 100 : 0;
    return { first, last, change, pct };
  }, [windowed]);

  const trendUp = (stats?.change ?? 0) >= 0;
  const strokeColor = trendUp ? 'hsl(var(--chart-up))' : 'hsl(var(--destructive))';

  const spot = stats?.last ?? null;
  /** signed % move still required for the price to cross the strike (positive = must rise) */
  const gapPct = spot != null && strikePrice != null && spot !== 0
    ? ((strikePrice - spot) / spot) * 100
    : null;
  const distTo = (level: number | null | undefined) =>
    spot != null && level != null && spot !== 0 ? ((level - spot) / spot) * 100 : null;

  if (series.length < 2) {
    return (
      <div
        className={`flex items-center justify-center bg-card border border-border rounded-lg ${fill ? 'h-full w-full' : ''}`}
        style={fill ? undefined : { height }}
      >
        <span className="text-[9px] font-mono text-muted-foreground tracking-[1px]">
          BUFFERING {productId} TICKS…
        </span>
      </div>
    );
  }

  const prices = windowed.map(p => p.price);
  const extras = [strikePrice, support, resistance].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  // Only stretch the axis for levels that are actually near the visible action.
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const span = Math.max(rawMax - rawMin, rawMax * 0.0004);
  const near = extras.filter(v => v > rawMin - span * 3 && v < rawMax + span * 3);
  const min = Math.min(rawMin, ...near);
  const max = Math.max(rawMax, ...near);
  const pad = (max - min) * 0.08 || max * 0.001;

  return (
    <div className={`bg-card border border-border rounded-lg p-3 flex flex-col ${fill ? 'h-full w-full min-h-0' : ''}`}>
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[9px] font-mono text-muted-foreground tracking-[1.5px]">
            {productId}
          </span>
          {stats && (
            <span className="text-[20px] font-display font-bold text-foreground tabular-nums leading-none">
              {fmtUsd(stats.last)}
            </span>
          )}
          {stats && (
            <span
              className={`text-[10px] font-mono tabular-nums ${
                trendUp ? 'text-chart-up' : 'text-destructive'
              }`}
            >
              {trendUp ? '▲' : '▼'} {stats.pct.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex gap-0.5 bg-secondary/40 rounded p-0.5 shrink-0">
          {WINDOWS.map(w => (
            <button
              key={w.label}
              onClick={() => setWindowMs(w.ms)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono tracking-[1px] transition-colors ${
                windowMs === w.ms
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Level strip: price to beat + the distance still to cover */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[9px] font-mono tracking-[1px]">
        {strikePrice != null ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground">TO BEAT</span>
            <span className="text-warning tabular-nums">{fmtUsd(strikePrice)}</span>
            {gapPct != null && (
              <span
                className={`px-1 py-0.5 rounded tabular-nums ${
                  gapPct > 0
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-chart-up/15 text-chart-up'
                }`}
                title={gapPct > 0 ? 'Up needs this much of a rally' : 'Up is already clear by this much'}
              >
                {gapPct > 0 ? `UP NEEDS ${fmtPct(gapPct)}` : `UP CLEAR BY ${fmtPct(-gapPct)}`}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground/60">TO BEAT —</span>
        )}
        <div className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground">RES</span>
          <span className="text-foreground/80 tabular-nums">
            {resistance != null ? fmtUsd(resistance) : '—'}
          </span>
          {distTo(resistance) != null && (
            <span className="text-muted-foreground tabular-nums">{fmtPct(distTo(resistance)!)}</span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground">SUP</span>
          <span className="text-foreground/80 tabular-nums">
            {support != null ? fmtUsd(support) : '—'}
          </span>
          {distTo(support) != null && (
            <span className="text-muted-foreground tabular-nums">{fmtPct(distTo(support)!)}</span>
          )}
        </div>
      </div>

      <div className={fill ? 'flex-1 min-h-0' : ''} style={fill ? undefined : { height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <YAxis domain={[min - pad, max + pad]} hide />
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
                strokeDasharray="2 4"
                strokeOpacity={0.6}
                strokeWidth={1}
                label={{
                  value: `RES ${fmtUsd(resistance)}`,
                  position: 'insideTopLeft',
                  fill: 'hsl(var(--destructive))',
                  fontSize: 9,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            )}
            {support != null && near.includes(support) && (
              <ReferenceLine
                y={support}
                stroke="hsl(var(--chart-up))"
                strokeDasharray="2 4"
                strokeOpacity={0.6}
                strokeWidth={1}
                label={{
                  value: `SUP ${fmtUsd(support)}`,
                  position: 'insideBottomLeft',
                  fill: 'hsl(var(--chart-up))',
                  fontSize: 9,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            )}
            {strikePrice != null && (
              <ReferenceLine
                y={strikePrice}
                stroke="hsl(var(--warning))"
                strokeDasharray="3 3"
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
              type="monotone"
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
