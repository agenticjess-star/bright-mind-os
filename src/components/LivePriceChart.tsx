import { useMemo } from 'react';
import { LineChart, Line, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts';
import type { PricePoint } from '@/hooks/useCoinbasePrice';

interface LivePriceChartProps {
  series: PricePoint[];
  productId: string;
  targetPrice?: number | null;
  height?: number;
}

function fmtUsd(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

export function LivePriceChart({ series, productId, targetPrice, height = 220 }: LivePriceChartProps) {
  const data = useMemo(() => series.map(p => ({ ts: p.ts, price: p.price })), [series]);

  const stats = useMemo(() => {
    if (series.length === 0) return null;
    const first = series[0].price;
    const last = series[series.length - 1].price;
    const change = last - first;
    const pct = first !== 0 ? (change / first) * 100 : 0;
    return { first, last, change, pct };
  }, [series]);

  const trendUp = (stats?.change ?? 0) >= 0;
  const strokeColor = trendUp ? 'hsl(var(--chart-up))' : 'hsl(var(--destructive))';

  if (series.length < 2) {
    return (
      <div
        className="flex items-center justify-center bg-card border border-border rounded-lg"
        style={{ height }}
      >
        <span className="text-[9px] font-mono text-muted-foreground tracking-[1px]">
          BUFFERING {productId} TICKS…
        </span>
      </div>
    );
  }

  // Y-axis padding so the line doesn't kiss the edges
  const prices = series.map(p => p.price);
  const min = Math.min(...prices, targetPrice ?? Infinity);
  const max = Math.max(...prices, targetPrice ?? -Infinity);
  const pad = (max - min) * 0.08 || max * 0.001;

  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] font-mono text-muted-foreground tracking-[1.5px]">
            {productId}
          </span>
          {stats && (
            <span className="text-[18px] font-display font-bold text-foreground tabular-nums">
              {fmtUsd(stats.last)}
            </span>
          )}
        </div>
        {stats && (
          <span
            className={`text-[10px] font-mono tabular-nums ${
              trendUp ? 'text-chart-up' : 'text-destructive'
            }`}
          >
            {trendUp ? '▲' : '▼'} {fmtUsd(Math.abs(stats.change))} ({stats.pct.toFixed(2)}%)
          </span>
        )}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <YAxis
              domain={[min - pad, max + pad]}
              hide
            />
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
            {targetPrice != null && (
              <ReferenceLine
                y={targetPrice}
                stroke="hsl(var(--warning))"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{
                  value: `TARGET ${fmtUsd(targetPrice)}`,
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
