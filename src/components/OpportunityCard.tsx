import { motion } from 'framer-motion';
import { AnimatedPrice, AnimatedValue } from './AnimatedValue';
import { StealBadge } from './StealBadge';
import { SparklineChart } from './SparklineChart';
import type { UpDownMarket } from '@/lib/updownTypes';
import type { StealMetrics } from '@/lib/stealScore';
import { formatTimeRemaining } from '@/lib/stealScore';
import { useEffect, useState } from 'react';

interface OpportunityCardProps {
  market: UpDownMarket;
  metrics: StealMetrics;
  index: number;
  showTimeframe?: boolean;
  expanded?: boolean;
}

export function OpportunityCard({ market, metrics, index, showTimeframe, expanded }: OpportunityCardProps) {
  const [timeLeft, setTimeLeft] = useState(metrics.timeRemainingSeconds ?? 0);

  // Live countdown
  useEffect(() => {
    if (metrics.timeRemainingSeconds === null) return;
    setTimeLeft(metrics.timeRemainingSeconds);
    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [metrics.timeRemainingSeconds]);

  const isExpiring = timeLeft > 0 && timeLeft < 60;
  const isExpired = timeLeft <= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className={`bg-card border rounded-lg overflow-hidden transition-all group ${
        metrics.stealLabel === 'STEAL'
          ? 'border-primary/25 glow-primary-box'
          : metrics.stealLabel === 'VALUE'
          ? 'border-chart-up/15'
          : 'border-border hover:border-primary/15'
      }`}
    >
      <div className="p-4">
        {/* Top row: asset label, steal badge, timer, link */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-foreground">
              {market.asset.toUpperCase()}
            </span>
            {showTimeframe && (
              <span className="text-[9px] font-mono text-primary/70">{market.timeframe.toUpperCase()}</span>
            )}
            <StealBadge metrics={metrics} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors ${
              isExpired
                ? 'bg-destructive/15 text-destructive'
                : isExpiring
                ? 'bg-warning/15 text-warning animate-pulse-live'
                : 'bg-secondary text-muted-foreground'
            }`}>
              {formatTimeRemaining(timeLeft)}
            </span>
            <a
              href={`https://polymarket.com/event/${market.eventSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[8px] text-muted-foreground/50 hover:text-primary transition-colors font-mono"
            >
              ↗
            </a>
          </div>
        </div>

        {/* Contract prices: UP vs DOWN */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="text-center">
            <div className="text-[7px] font-mono text-muted-foreground/60 mb-0.5 tracking-widest">UP</div>
            <AnimatedPrice value={market.upPrice} className="text-[20px] font-display font-bold text-chart-up" />
          </div>
          <div className="text-center">
            <div className="text-[7px] font-mono text-muted-foreground/60 mb-0.5 tracking-widest">DOWN</div>
            <AnimatedPrice value={market.downPrice} className="text-[20px] font-display font-bold text-destructive" />
          </div>
        </div>

        {/* Probability bar */}
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden flex mb-3">
          <motion.div
            className="h-full bg-gradient-to-r from-chart-up to-chart-up/60 rounded-l-full"
            animate={{ width: `${Math.max(3, (market.upPrice ?? 0.5) * 100)}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
          <div className="h-full bg-gradient-to-l from-destructive to-destructive/60 rounded-r-full flex-1" />
        </div>

        {/* Distance metrics — the core value prop */}
        {metrics.priceToBeat !== null && (
          <div className={`rounded-md px-3 py-2.5 border transition-colors ${
            metrics.spotAboveTarget === true
              ? 'bg-chart-up/5 border-chart-up/15'
              : metrics.spotAboveTarget === false
              ? 'bg-destructive/5 border-destructive/15'
              : 'bg-secondary/50 border-border'
          }`}>
            <div className="grid grid-cols-3 gap-2">
              {/* Target */}
              <div>
                <div className="text-[6px] font-mono text-muted-foreground/50 mb-0.5 tracking-widest">TARGET</div>
                <span className="text-[12px] font-display font-bold text-foreground">
                  ${metrics.priceToBeat.toLocaleString()}
                </span>
              </div>
              {/* Distance */}
              {metrics.distanceDollars !== null && (
                <div className="text-center">
                  <div className="text-[6px] font-mono text-muted-foreground/50 mb-0.5 tracking-widest">DISTANCE</div>
                  <span className={`text-[12px] font-display font-bold ${
                    metrics.spotAboveTarget ? 'text-chart-up' : 'text-destructive'
                  }`}>
                    {metrics.spotAboveTarget ? '+' : ''}${Math.abs(metrics.distanceDollars).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {/* % Move Required */}
              {metrics.pctMoveRequired !== null && (
                <div className="text-right">
                  <div className="text-[6px] font-mono text-muted-foreground/50 mb-0.5 tracking-widest">% MOVE REQ</div>
                  <span className={`text-[12px] font-display font-bold ${
                    metrics.spotAboveTarget ? 'text-chart-up' : 'text-foreground'
                  }`}>
                    {metrics.spotAboveTarget ? '✓ ABOVE' : `${Math.abs(metrics.pctMoveRequired).toFixed(3)}%`}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sparkline footer */}
      <SparklineChart upPrice={market.upPrice} downPrice={market.downPrice} height={32} />
    </motion.div>
  );
}
