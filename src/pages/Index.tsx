import { useMemo, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { CryptoQuickSelect } from '@/components/CryptoQuickSelect';
import { UpDownDisplay } from '@/components/UpDownDisplay';
import { EventHistory } from '@/components/EventHistory';
import { LivePriceChart } from '@/components/LivePriceChart';
import { SmaSignalCard } from '@/components/SmaSignalCard';
import { ClobHeatmap } from '@/components/ClobHeatmap';
import { PriceTape } from '@/components/PriceTape';
import { useUpDownMarkets } from '@/hooks/useUpDownMarkets';
import { useCoinbasePricesAll } from '@/hooks/useCoinbasePricesAll';
import { computeSmaSignal } from '@/lib/smaSignal';
import { useWindowStrikes, useSupportResistance } from '@/hooks/useMarketLevels';
import { useWindowMoves } from '@/hooks/useMarketStats';

const PRODUCT_LABEL: Record<string, string> = {
  btc: 'BTC-USD', eth: 'ETH-USD', sol: 'SOL-USD', xrp: 'XRP-USD',
};

type Tab = 'grid' | 'chart' | 'markets';
const TABS: { label: string; value: Tab }[] = [
  { label: 'GRID', value: 'grid' },
  { label: 'CHART', value: 'chart' },
  { label: 'MARKETS', value: 'markets' },
];

const Index = () => {
  const [tab, setTab] = useState<Tab>('grid');
  const upDown = useUpDownMarkets();
  const allPrices = useCoinbasePricesAll();

  const selectedSeries = allPrices.series[upDown.selectedAsset] ?? [];
  const selectedPrice = allPrices.prices[upDown.selectedAsset] ?? null;
  const productId = PRODUCT_LABEL[upDown.selectedAsset];

  const strikes = useWindowStrikes(upDown.allMarketsRaw);
  const levels = useSupportResistance(upDown.selectedAsset, upDown.selectedTimeframe, selectedPrice);
  const windowMoves = useWindowMoves(upDown.selectedAsset, upDown.selectedTimeframe);
  const strikePrice = upDown.activeMarket ? strikes[upDown.activeMarket.eventId] ?? null : null;
  const signal = useMemo(
    () => computeSmaSignal(selectedSeries, upDown.selectedTimeframe),
    [selectedSeries, upDown.selectedTimeframe]
  );

  return (
    <div className="grid grid-rows-[44px_32px_minmax(0,1fr)_auto] md:grid-rows-[44px_32px_minmax(0,1fr)] h-[100dvh] w-full overflow-hidden bg-background">
      <TopBar
        spotPrice={selectedPrice}
        spotAsset={upDown.selectedAsset}
        spotConnected={allPrices.connected}
        clobConnected={upDown.clobConnected}
      />

      <PriceTape
        prices={allPrices.prices}
        series={allPrices.series}
        selected={upDown.selectedAsset}
        onSelect={upDown.setSelectedAsset}
      />

      {/* Main grid: left rail + workspace, both flex to fill */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] min-h-0 overflow-hidden">
        {/* Left rail */}
        <aside
          className={`border-b md:border-b-0 md:border-r border-border flex-col min-h-0 min-w-0 ${
            tab === 'markets' ? 'flex' : 'hidden'
          } md:flex`}
        >
          <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
            <span className="text-[9px] tracking-[1.5px] text-muted-foreground uppercase font-medium">
              UP / DOWN MARKETS
            </span>
            <span className="text-[9px] px-1 py-0.5 bg-secondary text-muted-foreground rounded font-mono">
              {upDown.allMarkets.length}
            </span>
          </div>

          <div className="shrink-0">
            <CryptoQuickSelect
              activeAsset={upDown.selectedAsset}
              activeTimeframe={upDown.selectedTimeframe}
              onAssetChange={upDown.setSelectedAsset}
              onTimeframeChange={upDown.setSelectedTimeframe}
              assetCounts={upDown.assetCounts}
            />
          </div>

          <div className="shrink-0">
            <UpDownDisplay
              market={upDown.activeMarket}
              loading={upDown.loading}
              error={upDown.error}
              liveSpotPrice={selectedPrice}
              spotConnected={allPrices.connected}
              clobConnected={upDown.clobConnected}
              clobLastUpdate={upDown.clobLastUpdate}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            <EventHistory
              allMarkets={upDown.allMarkets}
              activeMarketId={upDown.activeMarket?.eventId || null}
            />
          </div>
        </aside>

        {/* Workspace: chart on top, heatmap + SMA on bottom */}
        <main className="flex flex-col md:grid md:grid-rows-[minmax(0,3fr)_minmax(0,4fr)] gap-3 p-2 md:p-3 min-h-0 min-w-0 overflow-hidden">
          <div className={`min-h-[200px] md:min-h-0 min-w-0 ${tab === 'chart' ? 'flex-1' : 'hidden'} md:block`}>
            <LivePriceChart
              series={selectedSeries}
              productId={productId}
              asset={upDown.selectedAsset}
              timeframe={upDown.selectedTimeframe}
              strikePrice={strikePrice}
              support={levels.support}
              resistance={levels.resistance}
              endDate={upDown.activeMarket?.endDate ?? null}
              moves={windowMoves}
              fill
            />
          </div>

          <div
            className={`flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_320px] lg:md:grid-cols-[minmax(0,1fr)_360px] gap-3 min-h-0 min-w-0 ${
              tab === 'grid' ? 'flex' : 'hidden'
            } md:grid`}
          >
            <div className="flex-1 md:flex-none min-h-0 min-w-0">
              <ClobHeatmap
                allMarkets={upDown.allMarketsRaw}
                seriesByAsset={allPrices.series}
                strikes={strikes}
                spotByAsset={allPrices.prices}
                selectedAsset={upDown.selectedAsset}
                selectedTimeframe={upDown.selectedTimeframe}
                onSelectAsset={upDown.setSelectedAsset}
                onSelectTimeframe={upDown.setSelectedTimeframe}
              />
            </div>
            <div className="shrink-0 md:min-h-0 min-w-0">
              <SmaSignalCard
                signal={signal}
                upPrice={upDown.activeMarket?.upPrice ?? null}
                downPrice={upDown.activeMarket?.downPrice ?? null}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile tab bar */}
      <nav className="md:hidden grid grid-cols-3 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`py-3 text-[10px] font-mono tracking-[1.5px] transition-colors ${
              tab === t.value
                ? 'text-primary border-t-2 border-primary -mt-px'
                : 'text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Index;
