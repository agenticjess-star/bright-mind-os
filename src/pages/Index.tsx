import { useMemo } from 'react';
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

function extractTargetPrice(title: string): number | null {
  const m = title.match(/\$([0-9,]+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  return isNaN(v) ? null : v;
}

const PRODUCT_LABEL: Record<string, string> = {
  btc: 'BTC-USD', eth: 'ETH-USD', sol: 'SOL-USD', xrp: 'XRP-USD',
};

const Index = () => {
  const upDown = useUpDownMarkets();
  const allPrices = useCoinbasePricesAll();

  const selectedSeries = allPrices.series[upDown.selectedAsset] ?? [];
  const selectedPrice = allPrices.prices[upDown.selectedAsset] ?? null;
  const productId = PRODUCT_LABEL[upDown.selectedAsset];

  const target = upDown.activeMarket ? extractTargetPrice(upDown.activeMarket.eventTitle) : null;
  const signal = useMemo(
    () => computeSmaSignal(selectedSeries, upDown.selectedTimeframe),
    [selectedSeries, upDown.selectedTimeframe]
  );

  return (
    <div className="grid grid-rows-[44px_32px_minmax(0,1fr)] h-screen w-screen overflow-hidden bg-background">
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
      <div className="grid grid-cols-[260px_minmax(0,1fr)] min-h-0 overflow-hidden">
        {/* Left rail */}
        <aside className="border-r border-border flex flex-col min-h-0 min-w-0">
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
        <main className="grid grid-rows-[minmax(0,3fr)_minmax(0,4fr)] gap-3 p-3 min-h-0 min-w-0 overflow-hidden">
          <div className="min-h-0 min-w-0">
            <LivePriceChart
              series={selectedSeries}
              productId={productId}
              targetPrice={target}
              fill
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-3 min-h-0 min-w-0">
            <div className="min-h-0 min-w-0">
              <ClobHeatmap
                allMarkets={upDown.allMarketsRaw}
                seriesByAsset={allPrices.series}
                selectedAsset={upDown.selectedAsset}
                selectedTimeframe={upDown.selectedTimeframe}
                onSelectAsset={upDown.setSelectedAsset}
                onSelectTimeframe={upDown.setSelectedTimeframe}
              />
            </div>
            <div className="min-h-0 min-w-0">
              <SmaSignalCard
                signal={signal}
                upPrice={upDown.activeMarket?.upPrice ?? null}
                downPrice={upDown.activeMarket?.downPrice ?? null}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
