import { motion, AnimatePresence } from 'framer-motion';
import type { UpDownMarket } from '@/lib/updownTypes';
import { AnimatedPrice, AnimatedValue } from './AnimatedValue';

interface UpDownDisplayProps {
  market: UpDownMarket | null;
  loading: boolean;
  error: string | null;
  liveSpotPrice: number | null;
  spotConnected: boolean;
  clobConnected?: boolean;
  clobLastUpdate?: number | null;
}

export function UpDownDisplay({ market, loading, error, liveSpotPrice, spotConnected, clobConnected, clobLastUpdate }: UpDownDisplayProps) {
  if (loading) {
    return (
      <div className="px-3 py-4 text-center">
        <motion.span
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-[9px] text-muted-foreground font-mono tracking-[1px]"
        >
          DISCOVERING MARKETS...
        </motion.span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-3">
        <span className="text-[9px] text-destructive font-mono">{error}</span>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="px-3 py-4 text-center">
        <span className="text-[9px] text-muted-foreground font-mono">
          NO ACTIVE MARKET FOUND
        </span>
      </div>
    );
  }

  const expiresIn = market.endDate ? getTimeRemaining(market.endDate) : null;
  const priceToBeat = extractPriceToBeat(market.eventTitle);
  const spotAbove = liveSpotPrice !== null && priceToBeat !== null
    ? liveSpotPrice >= priceToBeat
    : null;

  return (
    <motion.div
      className="px-3 py-2.5 border-b border-border"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Title + Status LEDs */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="text-[10px] text-foreground font-medium leading-[1.3] line-clamp-2 flex-1">
          {market.eventTitle}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusLed connected={spotConnected} label="SPOT" />
          <StatusLed connected={!!clobConnected} label="CLOB" />
        </div>
      </div>

      {/* Live Spot Price */}
      <AnimatePresence>
        {liveSpotPrice !== null && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`rounded-lg px-2.5 py-2 mb-2.5 border transition-colors duration-500 ${
              spotAbove === true
                ? 'bg-chart-up/8 border-chart-up/25'
                : spotAbove === false
                ? 'bg-destructive/8 border-destructive/25'
                : 'bg-secondary/50 border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[7px] text-muted-foreground font-mono tracking-wider">LIVE SPOT</span>
              {priceToBeat !== null && (
                <span className="text-[7px] text-muted-foreground font-mono">
                  TARGET ${priceToBeat.toLocaleString()}
                </span>
              )}
            </div>
            <div className={`text-[20px] font-display font-bold leading-none ${
              spotAbove === true ? 'text-chart-up' :
              spotAbove === false ? 'text-destructive' :
              'text-foreground'
            }`}>
              <AnimatedValue
                value={liveSpotPrice}
                format={(v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              />
              {spotAbove !== null && (
                <span className="text-[9px] ml-1.5 font-mono opacity-80">
                  {spotAbove ? '▲ ABOVE' : '▼ BELOW'}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Up / Down prices */}
      <div className="grid grid-cols-2 gap-2 mb-2.5">
        <div className="bg-chart-up/8 rounded-lg px-2.5 py-2 text-center border border-chart-up/15">
          <div className="text-[7px] text-muted-foreground font-mono mb-1 tracking-wider">UP</div>
          <AnimatedPrice
            value={market.upPrice}
            className="text-[18px] font-display font-bold text-chart-up"
          />
        </div>
        <div className="bg-destructive/8 rounded-lg px-2.5 py-2 text-center border border-destructive/15">
          <div className="text-[7px] text-muted-foreground font-mono mb-1 tracking-wider">DOWN</div>
          <AnimatedPrice
            value={market.downPrice}
            className="text-[18px] font-display font-bold text-destructive"
          />
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between">
        {expiresIn && (
          <span className="text-[8px] text-muted-foreground font-mono">{expiresIn}</span>
        )}
        <a
          href={`https://polymarket.com/event/${market.eventSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[8px] text-primary/70 hover:text-primary font-mono transition-colors"
        >
          VIEW ON POLYMARKET ↗
        </a>
      </div>
    </motion.div>
  );
}

function StatusLed({ connected, label }: { connected: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1" title={`${label} feed`}>
      <span className={`w-1.5 h-1.5 rounded-full transition-colors ${
        connected ? 'bg-primary animate-pulse-live' : 'bg-muted-foreground/40'
      }`} />
      <span className="text-[7px] text-muted-foreground/60 font-mono">{label}</span>
    </div>
  );
}

function getTimeRemaining(endDate: string): string {
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return 'EXPIRED';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m left`;
  const days = Math.floor(hrs / 24);
  return `${days}d left`;
}

function extractPriceToBeat(title: string): number | null {
  const match = title.match(/\$([0-9,]+(?:\.\d+)?)/);
  if (!match) return null;
  const cleaned = match[1].replace(/,/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}
