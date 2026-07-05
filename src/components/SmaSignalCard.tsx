import { motion } from 'framer-motion';
import type { SmaSignal } from '@/lib/smaSignal';
import { agreement, computeEdge } from '@/lib/smaSignal';

interface SmaSignalCardProps {
  signal: SmaSignal;
  upPrice: number | null;
  downPrice: number | null;
}

function fmtUsd(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function timeAgo(ts: number | null): string {
  if (ts == null) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function SmaSignalCard({ signal, upPrice, downPrice }: SmaSignalCardProps) {
  const edge = computeEdge(signal, upPrice);
  const agree = agreement(signal, upPrice);

  const leanColor =
    signal.lean === 'UP' ? 'text-chart-up' :
    signal.lean === 'DOWN' ? 'text-destructive' :
    'text-muted-foreground';

  const leanBg =
    signal.lean === 'UP' ? 'bg-chart-up/10 border-chart-up/30' :
    signal.lean === 'DOWN' ? 'bg-destructive/10 border-destructive/30' :
    'bg-secondary/60 border-border';

  const agreeColor =
    agree === 'AGREE' ? 'text-chart-up' :
    agree === 'DISAGREE' ? 'text-warning' :
    'text-muted-foreground';

  const ready = signal.fast != null && signal.slow != null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2 h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-muted-foreground tracking-[1.5px]">
          SMA CROSSOVER SIGNAL
        </span>
        <span className="text-[8px] font-mono text-muted-foreground/60">
          {signal.windows.fast}/{signal.windows.slow} · {signal.samples}pts
        </span>
      </div>

      {!ready ? (
        <div className="py-4 text-center">
          <motion.span
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-[10px] font-mono text-muted-foreground tracking-[1px]"
          >
            COLLECTING TICKS… {signal.samples}/{signal.windows.slow}
          </motion.span>
        </div>
      ) : (
        <>
          <div className={`rounded-md border px-3 py-2 flex items-center justify-between ${leanBg}`}>
            <div>
              <div className="text-[8px] font-mono text-muted-foreground tracking-[1.5px] mb-0.5">
                CURRENT LEAN
              </div>
              <div className={`text-[20px] font-display font-bold leading-none ${leanColor}`}>
                {signal.lean === 'UP' ? '▲ LEAN UP' : signal.lean === 'DOWN' ? '▼ LEAN DOWN' : '— NEUTRAL'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[8px] font-mono text-muted-foreground tracking-[1.5px] mb-0.5">
                LEAN PROB
              </div>
              <div className={`text-[16px] font-display font-bold tabular-nums ${leanColor}`}>
                {(signal.leanProb * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="FAST SMA" value={fmtUsd(signal.fast)} />
            <Stat label="SLOW SMA" value={fmtUsd(signal.slow)} />
            <Stat
              label="SPREAD"
              value={`${signal.spreadPct != null ? (signal.spreadPct * 100).toFixed(3) : '—'}%`}
              valueClass={signal.spreadPct != null && signal.spreadPct >= 0 ? 'text-chart-up' : 'text-destructive'}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <Stat
              label="LAST CROSS"
              value={signal.lastCrossDir ? `${signal.lastCrossDir === 'UP' ? '▲' : '▼'} ${timeAgo(signal.lastCrossTs)}` : 'NONE IN WINDOW'}
              valueClass={
                signal.lastCrossDir === 'UP' ? 'text-chart-up' :
                signal.lastCrossDir === 'DOWN' ? 'text-destructive' :
                'text-muted-foreground'
              }
            />
            <Stat
              label="VS MARKET"
              value={agree === 'NEUTRAL' ? '—' : agree}
              valueClass={agreeColor}
            />
          </div>

          <div className="border-t border-border pt-2 grid grid-cols-3 gap-2 text-center">
            <Stat
              label="UP PRICE"
              value={upPrice != null ? `${(upPrice * 100).toFixed(1)}¢` : '—'}
              valueClass="text-chart-up"
            />
            <Stat
              label="DOWN PRICE"
              value={downPrice != null ? `${(downPrice * 100).toFixed(1)}¢` : '—'}
              valueClass="text-destructive"
            />
            <Stat
              label="EDGE (LEAN−MKT)"
              value={edge != null ? `${(edge * 100 >= 0 ? '+' : '')}${(edge * 100).toFixed(1)}¢` : '—'}
              valueClass={edge != null && edge >= 0 ? 'text-chart-up' : 'text-destructive'}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, valueClass = 'text-foreground' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-secondary/40 border border-border rounded px-2 py-1.5">
      <div className="text-[7px] font-mono text-muted-foreground tracking-[1.5px] mb-0.5">{label}</div>
      <div className={`text-[12px] font-display font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}
