import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUpDownMarkets } from '@/hooks/useUpDownMarkets';
import { useCryptoPrice } from '@/hooks/useCryptoPrice';
import { AnimatedValue } from '@/components/AnimatedValue';
import { TopBar } from '@/components/TopBar';
import { OpportunityCard } from '@/components/OpportunityCard';
import { StealBadge } from '@/components/StealBadge';
import { calculateStealMetrics, extractPriceToBeat } from '@/lib/stealScore';
import type { CryptoAsset, UpDownMarket, UpDownTimeframe } from '@/lib/updownTypes';
import { CRYPTO_ASSETS, UPDOWN_TIMEFRAMES } from '@/lib/updownTypes';

type ViewMode = 'opportunities' | 'timeframe' | 'asset';

const MarketsView = () => {
  const upDown = useUpDownMarkets({ pollInterval: 15000 });
  const [focusAsset, setFocusAsset] = useState<CryptoAsset>('btc');
  const cryptoPrice = useCryptoPrice(focusAsset);
  const [viewMode, setViewMode] = useState<ViewMode>('opportunities');
  const [focusTimeframe, setFocusTimeframe] = useState<UpDownTimeframe>('5m');

  // All active markets
  const activeMarkets = useMemo(() =>
    upDown.allMarketsRaw.filter(m => !m.resolved && m.upPrice !== null),
    [upDown.allMarketsRaw]
  );

  // Get spot prices for each asset (we only have one WS, so approximate for non-focus assets)
  const spotForAsset = (asset: string) => asset === focusAsset ? cryptoPrice.price : null;

  // Calculate steal metrics for all active markets
  const marketsWithMetrics = useMemo(() => {
    return activeMarkets.map(m => ({
      market: m,
      metrics: calculateStealMetrics(
        spotForAsset(m.asset),
        extractPriceToBeat(m.eventTitle),
        m.upPrice,
        m.downPrice,
        m.endDate,
      ),
    }));
  }, [activeMarkets, cryptoPrice.price, focusAsset]);

  // View: OPPORTUNITIES — all markets sorted by steal score (best first)
  const opportunityList = useMemo(() =>
    [...marketsWithMetrics]
      .filter(x => x.metrics.stealScore !== null)
      .sort((a, b) => (b.metrics.stealScore ?? 0) - (a.metrics.stealScore ?? 0)),
    [marketsWithMetrics]
  );

  // View: TIMEFRAME — all coins for a given timeframe
  const timeframeList = useMemo(() =>
    marketsWithMetrics
      .filter(x => x.market.timeframe === focusTimeframe)
      .sort((a, b) => (b.metrics.stealScore ?? 0) - (a.metrics.stealScore ?? 0)),
    [marketsWithMetrics, focusTimeframe]
  );

  // View: ASSET — all timeframes for a given coin
  const assetList = useMemo(() => {
    const TF_ORDER: UpDownTimeframe[] = ['5m', '15m', '1h', '4h', 'daily'];
    return marketsWithMetrics
      .filter(x => x.market.asset === focusAsset)
      .sort((a, b) => TF_ORDER.indexOf(a.market.timeframe as UpDownTimeframe) - TF_ORDER.indexOf(b.market.timeframe as UpDownTimeframe));
  }, [marketsWithMetrics, focusAsset]);

  // Resolved markets for recent results
  const resolvedMarkets = useMemo(() =>
    upDown.allMarketsRaw.filter(m => m.resolved).slice(0, 16),
    [upDown.allMarketsRaw]
  );

  // Stats
  const stealCount = opportunityList.filter(x => x.metrics.stealLabel === 'STEAL').length;
  const valueCount = opportunityList.filter(x => x.metrics.stealLabel === 'VALUE').length;

  const currentList = viewMode === 'opportunities' ? opportunityList
    : viewMode === 'timeframe' ? timeframeList
    : assetList;

  return (
    <div className="grid grid-rows-[44px_1fr] h-screen overflow-hidden">
      <TopBar
        isLive={true}
        brierScore={0}
        nParticles={0}
        spotPrice={cryptoPrice.price}
        spotAsset={focusAsset}
        spotConnected={cryptoPrice.connected}
      />

      <div className="overflow-y-auto scrollbar-thin">
        {/* Header bar */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
          <div className="flex items-center gap-3 px-5 py-2.5">
            {/* View mode tabs */}
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(['opportunities', 'timeframe', 'asset'] as ViewMode[]).map((mode, i) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-[9px] font-mono font-medium transition-all ${i > 0 ? 'border-l border-border' : ''} ${
                    viewMode === mode
                      ? 'bg-primary/15 text-primary'
                      : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mode === 'opportunities' ? 'STEALS' : mode === 'timeframe' ? 'BY TIME' : 'BY COIN'}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-border" />

            {/* Context-specific filters */}
            {viewMode === 'timeframe' && (
              <div className="flex gap-1">
                {UPDOWN_TIMEFRAMES.map(tf => (
                  <button
                    key={tf.value}
                    onClick={() => setFocusTimeframe(tf.value)}
                    className={`px-2 py-1 rounded text-[9px] font-mono font-medium transition-all ${
                      focusTimeframe === tf.value
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : 'bg-secondary/50 text-muted-foreground border border-transparent hover:text-foreground'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            )}

            {(viewMode === 'asset' || viewMode === 'opportunities') && (
              <div className="flex gap-1">
                {CRYPTO_ASSETS.map(a => (
                  <button
                    key={a.value}
                    onClick={() => setFocusAsset(a.value)}
                    className={`px-2 py-1 rounded text-[9px] font-mono font-medium transition-all ${
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

            {/* Stats */}
            <div className="ml-auto flex items-center gap-3">
              {stealCount > 0 && (
                <span className="text-[9px] font-mono text-primary">
                  {stealCount} STEAL{stealCount !== 1 ? 'S' : ''}
                </span>
              )}
              {valueCount > 0 && (
                <span className="text-[9px] font-mono text-chart-up">
                  {valueCount} VALUE
                </span>
              )}
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
              <motion.div className="text-center">
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-[11px] text-muted-foreground font-mono tracking-[2px] block"
                >
                  SCANNING FOR OPPORTUNITIES...
                </motion.span>
              </motion.div>
            </div>
          ) : currentList.length === 0 ? (
            <div className="text-center py-16">
              <span className="text-[11px] text-muted-foreground font-mono">
                NO ACTIVE MARKETS IN THIS VIEW
              </span>
            </div>
          ) : (
            <>
              {/* Section header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[9px] font-mono text-muted-foreground tracking-[1.5px] uppercase">
                  {viewMode === 'opportunities' && `${focusAsset.toUpperCase()} OPPORTUNITIES · SORTED BY STEAL SCORE`}
                  {viewMode === 'timeframe' && `ALL ${focusTimeframe.toUpperCase()} MARKETS · SORTED BY EDGE`}
                  {viewMode === 'asset' && `${focusAsset.toUpperCase()} · ALL TIMEFRAMES`}
                </span>
                {cryptoPrice.price !== null && (
                  <span className="text-[10px] font-mono text-foreground ml-auto">
                    SPOT{' '}
                    <AnimatedValue
                      value={cryptoPrice.price}
                      format={v => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      className="text-primary glow-primary"
                    />
                  </span>
                )}
              </div>

              {/* Cards grid */}
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {currentList.map(({ market, metrics }, i) => (
                    <OpportunityCard
                      key={market.eventId}
                      market={market}
                      metrics={metrics}
                      index={i}
                      showTimeframe={viewMode !== 'timeframe'}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}

          {/* Recent results */}
          {resolvedMarkets.length > 0 && (
            <div className="mt-8">
              <div className="text-[9px] font-mono text-muted-foreground tracking-[1.5px] mb-3 uppercase">
                RECENT RESULTS
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
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

function ResolvedCard({ market }: { market: UpDownMarket }) {
  const upWon = market.outcome === 'Up' || (market.upPrice !== null && market.upPrice > 0.9);
  return (
    <div className={`rounded-lg border p-2 transition-colors ${
      upWon ? 'border-chart-up/15 bg-chart-up/5' : 'border-destructive/15 bg-destructive/5'
    }`}>
      <div className="text-[8px] font-mono text-muted-foreground mb-0.5">
        {market.asset.toUpperCase()} · {market.timeframe}
      </div>
      <div className={`text-[10px] font-display font-bold ${upWon ? 'text-chart-up' : 'text-destructive'}`}>
        {upWon ? '▲ UP' : '▼ DOWN'}
      </div>
      <div className="text-[7px] font-mono text-muted-foreground/40 mt-0.5">
        {market.endDate ? new Date(market.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
      </div>
    </div>
  );
}

export default MarketsView;
