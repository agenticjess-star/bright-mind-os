import { useMemo } from 'react';
import type { UpDownMarket } from '@/lib/updownTypes';
import type { MarketResult } from '@/lib/marketResults';

interface RecentResultsProps {
  markets: UpDownMarket[];
  results: Record<string, MarketResult>;
  limit?: number;
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (abs >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function fmtLeft(s: number | null): string {
  if (s == null) return '—';
  if (s >= 60) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

function endLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * The last few settled windows: who won, how much ground price actually
 * covered, and the cheapest the winning side ever traded (with how long was
 * left when it printed). Real settled data — the fastest read on whether a
 * window's required move is realistic.
 */
export function RecentResults({ markets, results, limit = 8 }: RecentResultsProps) {
  const rows = useMemo(() => {
    const now = Date.now();
    return markets
      .filter(m => m.resolved || (m.endDate && new Date(m.endDate).getTime() <= now))
      .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())
      .slice(0, limit);
  }, [markets, limit]);

  if (rows.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <span className="text-[9px] font-mono text-muted-foreground tracking-[1px]">
          NO SETTLED WINDOWS YET
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-w-0">
      <div className="px-3 py-1.5 border-b border-border sticky top-0 bg-background z-10 flex items-center justify-between">
        <span className="text-[8px] tracking-[1.5px] text-muted-foreground font-mono uppercase">
          LAST RESULTS · MOVE COVERED · CHEAPEST WINNER
        </span>
        <span className="text-[8px] font-mono text-muted-foreground/60">{rows.length}</span>
      </div>

      {rows.map(m => {
        const r = results[m.eventId];
        const winner = r?.winner ?? (m.outcome === 'Up' ? 'UP' : m.outcome === 'Down' ? 'DOWN' : null);
        const win = winner === 'UP';
        return (
          <div key={m.eventId} className="px-3 py-2 border-b border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded tracking-[1px] ${
                  winner == null
                    ? 'bg-secondary text-muted-foreground'
                    : win
                      ? 'bg-chart-up/15 text-chart-up'
                      : 'bg-destructive/15 text-destructive'
                }`}
              >
                {winner == null ? 'PENDING' : win ? 'UP ✓' : 'DOWN ✓'}
              </span>
              <span className="text-[8px] font-mono text-muted-foreground uppercase">
                {m.asset.toUpperCase()} · {m.timeframe}
              </span>
              <span className="text-[8px] font-mono text-muted-foreground ml-auto">
                {endLabel(m.endDate)}
              </span>
              <a
                href={`https://polymarket.com/event/${m.eventSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] text-muted-foreground hover:text-primary transition-colors"
              >↗</a>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Cell
                label="COVERED"
                value={
                  r?.moveAbs != null
                    ? `${r.moveAbs >= 0 ? '+' : '−'}${fmtUsd(Math.abs(r.moveAbs))}`
                    : '—'
                }
                sub={r?.movePct != null ? `${r.movePct >= 0 ? '+' : ''}${r.movePct.toFixed(3)}%` : '—'}
                className={
                  r?.moveAbs == null ? undefined : r.moveAbs >= 0 ? 'text-chart-up' : 'text-destructive'
                }
              />
              <Cell
                label="LOW"
                value={r?.lowPrice != null ? `${(r.lowPrice * 100).toFixed(0)}¢` : '—'}
                sub={r?.lowPrice != null ? `${fmtLeft(r.lowSecondsBeforeEnd)} left` : '—'}
                className="text-warning"
              />
              <Cell
                label="BEAT"
                value={r?.open != null ? fmtUsd(r.open) : '—'}
                sub={r?.close != null ? `→ ${fmtUsd(r.close)}` : '—'}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cell({
  label, value, sub, className,
}: { label: string; value: string; sub: string; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] font-mono text-muted-foreground tracking-[1px]">{label}</div>
      <div className={`text-[12px] font-display font-bold tabular-nums leading-tight ${className ?? 'text-foreground'}`}>
        {value}
      </div>
      <div className="text-[8px] font-mono text-muted-foreground tabular-nums truncate">{sub}</div>
    </div>
  );
}
