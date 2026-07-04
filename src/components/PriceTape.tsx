import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { CryptoAsset } from '@/lib/updownTypes';
import { CRYPTO_ASSETS } from '@/lib/updownTypes';
import type { PricePoint } from '@/hooks/useCoinbasePrice';

interface PriceTapeProps {
  prices: Record<CryptoAsset, number | null>;
  series: Record<CryptoAsset, PricePoint[]>;
  onSelect?: (a: CryptoAsset) => void;
  selected?: CryptoAsset;
}

function fmtUsd(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

/** Returns 60-second % change based on the buffer. */
function pctChange(points: PricePoint[]): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const cutoff = last.ts - 60_000;
  // find first point >= cutoff
  let anchor = points[0];
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].ts <= cutoff) { anchor = points[i]; break; }
    anchor = points[i];
  }
  if (anchor.price === 0) return null;
  return (last.price - anchor.price) / anchor.price;
}

export function PriceTape({ prices, series, onSelect, selected }: PriceTapeProps) {
  const items = useMemo(() => {
    // Duplicate the list so the marquee loops seamlessly
    const base = CRYPTO_ASSETS.map(a => {
      const price = prices[a.value];
      const change = pctChange(series[a.value] ?? []);
      return { asset: a.value, label: a.label, price, change };
    });
    return [...base, ...base, ...base];
  }, [prices, series]);

  return (
    <div className="relative h-8 border-b border-border bg-card/40 overflow-hidden">
      {/* fade edges */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-l from-background to-transparent" />

      <motion.div
        className="flex items-center gap-6 h-full whitespace-nowrap px-4 will-change-transform"
        animate={{ x: ['0%', '-33.333%'] }}
        transition={{ duration: 40, ease: 'linear', repeat: Infinity }}
      >
        {items.map((it, i) => {
          const trendUp = (it.change ?? 0) >= 0;
          const isSel = selected === it.asset;
          return (
            <button
              key={`${it.asset}-${i}`}
              onClick={() => onSelect?.(it.asset)}
              className={`flex items-center gap-2 shrink-0 group ${isSel ? 'text-primary' : ''}`}
            >
              <span className={`text-[10px] font-mono font-semibold tracking-[1.5px] ${
                isSel ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
              }`}>
                {it.label}
              </span>
              <span className="text-[12px] font-display font-semibold tabular-nums text-foreground">
                {it.price != null ? fmtUsd(it.price) : '—'}
              </span>
              {it.change != null && (
                <span className={`text-[10px] font-mono tabular-nums ${
                  trendUp ? 'text-chart-up' : 'text-destructive'
                }`}>
                  {trendUp ? '▲' : '▼'} {(Math.abs(it.change) * 100).toFixed(2)}%
                </span>
              )}
              <span className="text-muted-foreground/30 text-[10px]">·</span>
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
