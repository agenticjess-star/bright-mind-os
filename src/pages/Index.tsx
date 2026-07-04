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
import { useCoinbasePrice } from '@/hooks/useCoinbasePrice';
import { useCoinbasePricesAll } from '@/hooks/useCoinbasePricesAll';
import { computeSmaSignal } from '@/lib/smaSignal';

function extractTargetPrice(title: string): number | null {
  const m = title.match(/\$([0-9,]+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  return isNaN(v) ? null : v;
}

const Index = () => {
  const upDown = useUpDownMarkets({ pollInterval: 20000 });
  const coinbase = useCoinbasePrice(upDown.selectedAsset);
  const allPrices = useCoinbasePricesAll();

  const target = upDown.activeMarket ? extractTargetPrice(upDown.activeMarket.eventTitle) : null;
  const signal = useMemo(
    () => computeSmaSignal(coinbase.series, upDown.selectedTimeframe),
    [coinbase.series, upDown.selectedTimeframe]
  );

  return (
    <div className="grid grid-rows-[44px_32px_1fr] h-screen overflow-hidden">
      <TopBar
        spotPrice={coinbase.price}
        spotAsset={upDown.selectedAsset}
        spotConnected={coinbase.connected}
        clobConnected={upDown.clobConnected}
      />

      <PriceTape
        prices={allPrices.prices}
        series={allPrices.series}
        selected={upDown.selectedAsset}
        onSelect={upDown.setSelectedAsset}
      />

      <div className="grid grid-cols-[240px_1fr] overflow-hidden">
        {/* Left: market discovery (kept — it works) */}
        <aside className="border-r border-border overflow-y-auto overflow-x-hidden scrollbar-thin flex flex-col min-w-0">
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between sticky top-0 bg-background z-20">
            <span className="text-[9px] tracking-[1.5px] text-muted-foreground uppercase font-medium">
              UP/DOWN
            </span>
            <span className="text-[9px] px-1 py-0.5 bg-secondary text-muted-foreground rounded font-mono">
              {upDown.allMarkets.length}
            </span>
          </div>

          <CryptoQuickSelect
            activeAsset={upDown.selectedAsset}
            activeTimeframe={upDown.selectedTimeframe}
            onAssetChange={upDown.setSelectedAsset}
            onTimeframeChange={upDown.setSelectedTimeframe}
            assetCounts={upDown.assetCounts}
          />

          <UpDownDisplay
            market={upDown.activeMarket}
            loading={upDown.loading}
            error={upDown.error}
            liveSpotPrice={coinbase.price}
            spotConnected={coinbase.connected}
            clobConnected={upDown.clobConnected}
            clobLastUpdate={upDown.clobLastUpdate}
          />

          <EventHistory
            allMarkets={upDown.allMarkets}
            activeMarketId={upDown.activeMarket?.eventId || null}
          />
        </aside>

        {/* Center: live coin chart, SMA signal, contract chart */}
        <main className="overflow-y-auto scrollbar-thin p-4 grid grid-cols-[1fr_360px] gap-4 auto-rows-min">
          <div className="col-span-2">
            <LivePriceChart
              series={coinbase.series}
              productId={coinbase.productId}
              targetPrice={target}
              height={260}
            />
          </div>

          <div className="col-span-2 lg:col-span-1">
            <ClobHeatmap
              allMarkets={upDown.allMarketsRaw}
              seriesByAsset={allPrices.series}
              selectedAsset={upDown.selectedAsset}
              selectedTimeframe={upDown.selectedTimeframe}
              onSelectAsset={upDown.setSelectedAsset}
              onSelectTimeframe={upDown.setSelectedTimeframe}
            />
          </div>

          <div className="col-span-2 lg:col-span-1">
            <SmaSignalCard
              signal={signal}
              upPrice={upDown.activeMarket?.upPrice ?? null}
              downPrice={upDown.activeMarket?.downPrice ?? null}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
