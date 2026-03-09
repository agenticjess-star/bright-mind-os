import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUpDownMarkets } from '@/hooks/useUpDownMarkets';
import { useCryptoPrice } from '@/hooks/useCryptoPrice';
import { AnimatedPrice, AnimatedValue } from '@/components/AnimatedValue';
import { TopBar } from '@/components/TopBar';
import { SparklineChart } from '@/components/SparklineChart';
import type { CryptoAsset, UpDownMarket, UpDownTimeframe } from '@/lib/updownTypes';
import { CRYPTO_ASSETS, UPDOWN_TIMEFRAMES } from '@/lib/updownTypes';

type ViewMode = 'timeframe' | 'asset';

const MarketsView = () => {
  const upDown = useUpDownMarkets({ pollInterval: 15000 });
  const cryptoPrice = useCryptoPrice(upDown.selectedAsset);
  const [viewMode, setViewMode] = useState<ViewMode>('timeframe');
  const [focusAsset, setFocusAsset] = useState<CryptoAsset>('btc');
  const [focusTimeframe, setFocusTimeframe] = useState<UpDownTimeframe>('5m');

  // All active (non-resolved) markets across everything
  const activeMarkets = useMemo(() =>
    upDown.allMarketsRaw.filter(m => !m.resolved && m.upPrice !== null),
    [upDown.allMarketsRaw]
  );

  // Timeframe view: all coins for a given timeframe, sorted by implied probability
  const timeframeMarkets = useMemo(() =>
    activeMarkets
      .filter(m => m.timeframe === focusTimeframe)
      .sort((a, b) => Math.abs((b.upPrice ?? 0.5) - 0.5) - Math.abs((a.upPrice ?? 0.5) - 0.5)),
    [activeMarkets, focusTimeframe]
  );

  // Asset view: all timeframes for a given coin
  const assetMarkets = useMemo(() => {
    const TF_ORDER: UpDownTimeframe[] = ['5m', '15m', '1h', '4h', 'daily'];
    return activeMarkets
      .filter(m => m.asset === focusAsset)
      .sort((a, b) => TF_ORDER.indexOf(a.timeframe as UpDownTimeframe) - TF_ORDER.indexOf(b.timeframe as UpDownTimeframe));
  }, [activeMarkets, focusAsset]);

  // Resolved markets for win/loss tracking
  const resolvedMarkets = useMemo(() =>
    upDown.allMarketsRaw.filter(m => m.resolved).slice(0, 20),
    [upDown.allMarketsRaw]
  );

  return (
    <div className="grid grid-rows-[44px_1fr] h-screen overflow-hidden">
      <TopBar
        isLive={true}
        brierScore={0}
        nParticles={0}
        spotPrice={cryptoPrice.price}
        spotAsset={upDown.selectedAsset}
        spotConnected={cryptoPrice.connected}
      />

      <div className="overflow-y-auto scrollbar-thin">
        {/* View toggle + filters */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
          <div className="flex items-center gap-3 px-5 py-3">
            <div className="flex rounded-lg overflow-hidden border border-border">
              <button
                onClick={() => setViewMode('timeframe')}
                className={`px-3 py-1.5 text-[10px] font-mono font-medium transition-all ${
                  viewMode === 'timeframe'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                BY TIMEFRAME
              </button>
              <button
                onClick={() => setViewMode('asset')}
                className={`px-3 py-1.5 text-[10px] font-mono font-medium transition-all border-l border-border ${
                  viewMode === 'asset'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                BY COIN
              </button>
            </div>

            <div className="h-4 w-px bg-border" />

            {viewMode === 'timeframe' ? (
              <div className="flex gap-1">
                {UPDOWN_TIMEFRAMES.map(tf => (
                  <button
                    key={tf.value}
                    onClick={() => setFocusTimeframe(tf.value)}
                    className={`px-2.5 py-1 rounded text-[10px] font-mono font-medium transition-all ${
                      focusTimeframe === tf.value
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : 'bg-secondary/50 text-muted-foreground border border-transparent hover:text-foreground'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex gap-1">
                {CRYPTO_ASSETS.map(a => (
                  <button
                    key={a.value}
                    onClick={() => setFocusAsset(a.value)}
                    className={`px-2.5 py-1 rounded text-[10px] font-mono font-medium transition-all ${
                      focusAsset === a.value
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : 'bg-secondary/50 text-muted-foreground border border-transparent hover:text-foreground'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${upDown.clobConnected ? 'bg-primary animate-pulse-live' : 'bg-muted-foreground/40'}`} />
              <span className="text-[8px] font-mono text-muted-foreground">
                {activeMarkets.length} ACTIVE
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {upDown.loading ? (
            <div className="flex items-center justify-center py-20">
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-[11px] text-muted-foreground font-mono tracking-[2px]"
              >
                DISCOVERING MARKETS...
              </motion.span>
            </div>
          ) : viewMode === 'timeframe' ? (
            <TimeframeView markets={timeframeMarkets} timeframe={focusTimeframe} spotPrice={cryptoPrice.price} />
          ) : (
            <AssetView markets={assetMarkets} asset={focusAsset} spotPrice={cryptoPrice.price} />
          )}

          {/* Recent results */}
          {resolvedMarkets.length > 0 && (
            <div className="mt-8">
              <div className="text-[9px] font-mono text-muted-foreground tracking-[1.5px] mb-3 uppercase">
                RECENT RESULTS
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {resolvedMarkets.map(m => (
                  <ResolvedCard key={m.eventId} market={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function TimeframeView({ markets, timeframe, spotPrice }: { markets: UpDownMarket[]; timeframe: string; spotPrice: number | null }) {
  if (markets.length === 0) {
    return (
      <div className="text-center py-16">
        <span className="text-[11px] text-muted-foreground font-mono">NO ACTIVE {timeframe.toUpperCase()} MARKETS</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[9px] font-mono text-muted-foreground tracking-[1.5px] mb-1 uppercase">
        ALL {timeframe.toUpperCase()} MARKETS · SORTED BY EDGE
      </div>
      <div className="grid gap-3">
        <AnimatePresence mode="popLayout">
          {markets.map((m, i) => (
            <MarketCard key={m.eventId} market={m} index={i} spotPrice={spotPrice} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AssetView({ markets, asset, spotPrice }: { markets: UpDownMarket[]; asset: string; spotPrice: number | null }) {
  if (markets.length === 0) {
    return (
      <div className="text-center py-16">
        <span className="text-[11px] text-muted-foreground font-mono">NO ACTIVE {asset.toUpperCase()} MARKETS</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-[9px] font-mono text-muted-foreground tracking-[1.5px] uppercase">
          {asset.toUpperCase()} · ALL TIMEFRAMES
        </span>
        {spotPrice !== null && (
          <span className="text-[11px] font-mono text-foreground">
            SPOT <AnimatedValue
              value={spotPrice}
              format={v => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              className="text-primary"
            />
          </span>
        )}
      </div>
      <div className="grid gap-3">
        <AnimatePresence mode="popLayout">
          {markets.map((m, i) => (
            <MarketCard key={m.eventId} market={m} index={i} spotPrice={spotPrice} showTimeframe />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function MarketCard({ market, index, spotPrice, showTimeframe }: {
  market: UpDownMarket;
  index: number;
  spotPrice: number | null;
  showTimeframe?: boolean;
}) {
  const priceToBeat = extractPriceToBeat(market.eventTitle);
  const distance = spotPrice !== null && priceToBeat !== null
    ? ((spotPrice - priceToBeat) / priceToBeat * 100)
    : null;
  const spotAbove = distance !== null ? distance >= 0 : null;
  const expiresIn = market.endDate ? getTimeRemaining(market.endDate) : null;
  const upPct = market.upPrice ?? 0.5;
  const downPct = market.downPrice ?? 0.5;
  const barWidth = Math.max(5, Math.min(95, upPct * 100));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="bg-card border border-border rounded-lg overflow-hidden hover:border-primary/20 transition-colors group"
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-mono text-muted-foreground uppercase">
                {market.asset.toUpperCase()}
                {showTimeframe && <span className="text-primary/70 ml-1">{market.timeframe}</span>}
              </span>
              {expiresIn && (
                <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
                  expiresIn === 'EXPIRED' ? 'bg-destructive/15 text-destructive' : 'bg-secondary text-muted-foreground'
                }`}>
                  {expiresIn}
                </span>
              )}
            </div>
            <div className="text-[11px] text-foreground font-medium leading-tight line-clamp-1">
              {market.eventTitle}
            </div>
          </div>
          <a
            href={`https://polymarket.com/event/${market.eventSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[8px] text-muted-foreground hover:text-primary transition-colors font-mono shrink-0"
          >
            ↗
          </a>
        </div>

        {/* Price bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono text-chart-up">UP</span>
              <AnimatedPrice value={market.upPrice} className="text-[16px] font-display font-bold text-chart-up" />
            </div>
            <div className="flex items-center gap-1.5">
              <AnimatedPrice value={market.downPrice} className="text-[16px] font-display font-bold text-destructive" />
              <span className="text-[8px] font-mono text-destructive">DOWN</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden flex">
            <motion.div
              className="h-full bg-gradient-to-r from-chart-up to-chart-up/70 rounded-l-full"
              animate={{ width: `${barWidth}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
            <motion.div
              className="h-full bg-gradient-to-l from-destructive to-destructive/70 rounded-r-full flex-1"
            />
          </div>
        </div>

        {/* Spot + distance */}
        {priceToBeat !== null && (
          <div className={`rounded-md px-3 py-2 border transition-colors ${
            spotAbove === true
              ? 'bg-chart-up/5 border-chart-up/20'
              : spotAbove === false
              ? 'bg-destructive/5 border-destructive/20'
              : 'bg-secondary/50 border-border'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[7px] font-mono text-muted-foreground mb-0.5 tracking-wider">PRICE TO BEAT</div>
                <span className="text-[13px] font-display font-bold text-foreground">
                  ${priceToBeat.toLocaleString()}
                </span>
              </div>
              {distance !== null && (
                <div className="text-right">
                  <div className="text-[7px] font-mono text-muted-foreground mb-0.5 tracking-wider">DISTANCE</div>
                  <span className={`text-[13px] font-display font-bold ${
                    distance >= 0 ? 'text-chart-up' : 'text-destructive'
                  }`}>
                    {distance >= 0 ? '+' : ''}{distance.toFixed(3)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sparkline */}
      <SparklineChart
        upPrice={market.upPrice}
        downPrice={market.downPrice}
        height={40}
      />
    </motion.div>
  );
}

function ResolvedCard({ market }: { market: UpDownMarket }) {
  const upWon = market.outcome === 'Up' || (market.upPrice !== null && market.upPrice > 0.9);
  return (
    <div className={`rounded-lg border p-2.5 transition-colors ${
      upWon ? 'border-chart-up/20 bg-chart-up/5' : 'border-destructive/20 bg-destructive/5'
    }`}>
      <div className="text-[8px] font-mono text-muted-foreground mb-1">
        {market.asset.toUpperCase()} · {market.timeframe}
      </div>
      <div className={`text-[11px] font-display font-bold ${upWon ? 'text-chart-up' : 'text-destructive'}`}>
        {upWon ? '▲ UP' : '▼ DOWN'}
      </div>
      <div className="text-[7px] font-mono text-muted-foreground/60 mt-0.5">
        {market.endDate ? new Date(market.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
      </div>
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
  return `${Math.floor(hrs / 24)}d left`;
}

function extractPriceToBeat(title: string): number | null {
  const match = title.match(/\$([0-9,]+(?:\.\d+)?)/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(/,/g, ''));
  return isNaN(val) ? null : val;
}

export default MarketsView;
