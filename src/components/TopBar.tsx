import { motion } from 'framer-motion';
import { useLiveClock } from '@/hooks/useLiveClock';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { AnimatedValue } from './AnimatedValue';

interface TopBarProps {
  isLive: boolean;
  brierScore: number;
  nParticles: number;
  spotPrice?: number | null;
  spotAsset?: string;
  spotConnected?: boolean;
  rightCollapsed?: boolean;
  onToggleRight?: () => void;
}

export function TopBar({ isLive, brierScore, nParticles, spotPrice, spotAsset, spotConnected, rightCollapsed, onToggleRight }: TopBarProps) {
  const { formatted } = useLiveClock();

  return (
    <header className="h-11 bg-background/80 backdrop-blur-md border-b border-border flex items-center px-4 gap-4 z-50">
      <span className="font-display text-[15px] font-bold tracking-tight text-primary glow-primary-strong">
        TRADING OS
      </span>
      <span className="text-[9px] text-muted-foreground/30 font-mono">×</span>
      <span className="text-[9px] text-muted-foreground/50 tracking-wider font-mono">POLYMARKET</span>

      <div className="flex gap-2 ml-auto items-center">
        {spotPrice != null && (
          <div className="text-[9px] px-2 py-1 rounded-md bg-secondary/60 font-mono flex items-center gap-1.5 border border-border/50">
            <span className={`w-1.5 h-1.5 rounded-full ${spotConnected ? 'bg-chart-up animate-pulse-live' : 'bg-muted-foreground/40'}`} />
            <span className="text-muted-foreground/60">{spotAsset?.toUpperCase()}</span>
            <AnimatedValue
              value={spotPrice}
              format={(v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              className="text-foreground"
            />
          </div>
        )}
        {isLive && (
          <motion.span
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-[9px] tracking-wider px-2 py-1 rounded-md bg-primary/8 text-primary border border-primary/20 font-mono"
          >
            ● LIVE
          </motion.span>
        )}
        <span className="text-[9px] px-2 py-1 rounded-md bg-secondary/60 text-muted-foreground font-mono border border-border/50">
          BRIER {brierScore.toFixed(3)}
        </span>
        <span className="text-[9px] px-2 py-1 rounded-md bg-secondary/60 text-muted-foreground font-mono border border-border/50">
          N={nParticles.toLocaleString()}
        </span>
        <span className="text-[9px] text-muted-foreground/50 font-mono">
          {formatted}
        </span>
        {onToggleRight && (
          <button
            onClick={onToggleRight}
            className="ml-1 p-1.5 rounded-md hover:bg-secondary text-muted-foreground/50 hover:text-foreground transition-colors"
            title={rightCollapsed ? 'Show governance panel' : 'Hide governance panel'}
          >
            {rightCollapsed ? <PanelRightOpen className="w-3.5 h-3.5" /> : <PanelRightClose className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </header>
  );
}
