import type { CryptoAsset, UpDownTimeframe } from '@/lib/updownTypes';
import { CRYPTO_ASSETS, UPDOWN_TIMEFRAMES } from '@/lib/updownTypes';

interface CryptoQuickSelectProps {
  activeAsset: CryptoAsset;
  activeTimeframe: UpDownTimeframe;
  onAssetChange: (asset: CryptoAsset) => void;
  onTimeframeChange: (tf: UpDownTimeframe) => void;
  assetCounts: Record<string, number>;
}

export function CryptoQuickSelect({
  activeAsset, activeTimeframe,
  onAssetChange, onTimeframeChange,
  assetCounts,
}: CryptoQuickSelectProps) {
  return (
    <div className="px-3 py-2 border-b border-border space-y-1.5">
      {/* Asset row */}
      <div className="flex gap-1 flex-wrap">
        {CRYPTO_ASSETS.map(a => {
          const isActive = activeAsset === a.value;
          const count = assetCounts[a.value] ?? 0;
          return (
            <button
              key={a.value}
              onClick={() => onAssetChange(a.value)}
              className={`px-2.5 py-1.5 rounded text-[10px] font-mono font-medium transition-all ${
                isActive
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'bg-secondary/50 text-muted-foreground border border-transparent hover:bg-secondary hover:text-foreground'
              }`}
            >
              {a.label}
              {count > 0 && (
                <span className="ml-1 text-[8px] opacity-60">{count}</span>
              )}
            </button>
          );
        })}
      </div>
      {/* Timeframe row */}
      <div className="flex gap-1">
        {UPDOWN_TIMEFRAMES.map(tf => {
          const isActive = activeTimeframe === tf.value;
          return (
            <button
              key={tf.value}
              onClick={() => onTimeframeChange(tf.value)}
              className={`px-2.5 py-1.5 rounded text-[10px] font-mono font-medium transition-all ${
                isActive
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'bg-secondary/50 text-muted-foreground border border-transparent hover:bg-secondary hover:text-foreground'
              }`}
            >
              {tf.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
