import type { SmaSignal } from '@/lib/smaSignal';
import { computeEdge } from '@/lib/smaSignal';

interface TrendBarProps {
  signal: SmaSignal;
  upPrice: number | null;
  downPrice: number | null;
  asset: string;
  timeframe: string;
}

function agoLabel(ts: number | null): string {
  if (ts == null) return '—';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

/**
 * One-line trend + bias readout: SMA lean, how strongly it leans, what the
 * market implies, and the resulting edge. Replaces the old full-height card.
 */
export function TrendBar({ signal, upPrice, downPrice, asset, timeframe }: TrendBarProps) {
  const ready = signal.fast != null;
  const lean = signal.lean;
  const leanPct = signal.leanProb * 100;
  const edge = computeEdge(signal, upPrice);

  const leanColor =
    lean === 'UP' ? 'text-chart-up' : lean === 'DOWN' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-3 overflow-x-auto scrollbar-thin">
      <span className="text-[9px] font-mono text-muted-foreground tracking-[1.5px] shrink-0">
        {asset.toUpperCase()} · {timeframe.toUpperCase()} TREND
      </span>

      <span className={`text-[12px] font-display font-bold tracking-tight shrink-0 ${leanColor}`}>
        {!ready ? '…' : lean === 'UP' ? '▲ UP' : lean === 'DOWN' ? '▼ DOWN' : '— FLAT'}
      </span>

      {/* Bias meter: 0% (all down) → 100% (all up) */}
      <div className="relative h-1.5 flex-1 min-w-[90px] rounded-full bg-secondary/60 overflow-hidden shrink">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <div
          className={`absolute inset-y-0 ${lean === 'DOWN' ? 'bg-destructive/70' : 'bg-chart-up/70'}`}
          style={
            leanPct >= 50
              ? { left: '50%', width: `${Math.min(leanPct - 50, 50)}%` }
              : { right: '50%', width: `${Math.min(50 - leanPct, 50)}%` }
          }
        />
      </div>

      <Stat label="LEAN" value={ready ? `${leanPct.toFixed(0)}%` : '—'} className={leanColor} />
      <Stat
        label="SPREAD"
        value={signal.spreadPct != null ? `${(signal.spreadPct * 100).toFixed(3)}%` : '—'}
      />
      <Stat
        label="MKT UP"
        value={upPrice != null ? `${(upPrice * 100).toFixed(1)}¢` : '—'}
        className="text-chart-up"
      />
      <Stat
        label="MKT DN"
        value={downPrice != null ? `${(downPrice * 100).toFixed(1)}¢` : '—'}
        className="text-destructive"
      />
      <Stat
        label="EDGE"
        value={edge != null ? `${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}¢` : '—'}
        className={edge == null ? undefined : edge >= 0 ? 'text-chart-up' : 'text-destructive'}
      />
      <Stat label="CROSS" value={agoLabel(signal.lastCrossTs)} />
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline gap-1 shrink-0">
      <span className="text-[8px] font-mono text-muted-foreground tracking-[1px]">{label}</span>
      <span className={`text-[11px] font-mono font-semibold tabular-nums ${className ?? 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}
