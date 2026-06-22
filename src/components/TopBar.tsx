import { motion } from 'framer-motion';
import { useLiveClock } from '@/hooks/useLiveClock';
import { AnimatedValue } from './AnimatedValue';

interface TopBarProps {
  spotPrice?: number | null;
  spotAsset?: string;
  spotConnected?: boolean;
  clobConnected?: boolean;
}

export function TopBar({ spotPrice, spotAsset, spotConnected, clobConnected }: TopBarProps) {
  const { formatted } = useLiveClock();

  return (
    <header className="h-11 bg-background/80 backdrop-blur-md border-b border-border flex items-center px-4 gap-4 z-50">
      <div className="flex items-center gap-1.5">
        <span className="font-display text-[15px] font-bold tracking-tight text-primary glow-primary-strong">
          α
        </span>
        <span className="font-display text-[13px] font-bold tracking-tight text-foreground">
          GEMINI
        </span>
        <span className="text-[8px] font-mono text-muted-foreground/60 tracking-[1.5px] ml-1">
          UP/DOWN · SMA CROSSOVER
        </span>
      </div>

      <div className="flex gap-2 ml-auto items-center">
        <FeedLed connected={!!spotConnected} label="COINBASE" />
        <FeedLed connected={!!clobConnected} label="CLOB" />
        {spotPrice != null && (
          <div className="text-[9px] px-2 py-1 rounded-md bg-secondary/60 font-mono flex items-center gap-1.5 border border-border/50">
            <span className="text-muted-foreground/60">{spotAsset?.toUpperCase()}</span>
            <AnimatedValue
              value={spotPrice}
              format={(v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              className="text-foreground tabular-nums"
            />
          </div>
        )}
        <motion.span
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-[9px] tracking-wider px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 font-mono"
        >
          ● LIVE
        </motion.span>
        <span className="text-[9px] text-muted-foreground/50 font-mono">
          {formatted}
        </span>
      </div>
    </header>
  );
}

function FeedLed({ connected, label }: { connected: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/60 border border-border/50">
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-chart-up animate-pulse-live' : 'bg-muted-foreground/40'}`} />
      <span className="text-[8px] font-mono text-muted-foreground tracking-[1.5px]">{label}</span>
    </div>
  );
}
