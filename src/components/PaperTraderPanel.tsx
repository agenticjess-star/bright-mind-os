import { Bot, Play, Square, RotateCcw, Loader2 } from 'lucide-react';
import type { PaperTraderState } from '@/hooks/usePaperTrader';

const fmt$ = (v: number) => `$${v.toFixed(2)}`;
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

export function PaperTraderPanel({ trader }: { trader: PaperTraderState }) {
  const { portfolio, equity, running, evaluating, lastError, toggle, reset } = trader;
  const pnl = equity - portfolio.startingCash;
  const pnlPct = (pnl / portfolio.startingCash) * 100;
  const wins = portfolio.closed.filter(t => t.result === 'win').length;
  const losses = portfolio.closed.filter(t => t.result === 'loss').length;

  return (
    <div className="flex flex-col h-full min-h-0 bg-card">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <Bot className="size-3.5 text-primary" />
          <span className="text-[9px] tracking-[1.5px] text-muted-foreground uppercase font-medium">
            JEV PAPER TRADER
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={reset}
            title="Reset portfolio"
            className="size-7 grid place-items-center rounded-md bg-secondary/60 border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="size-3" />
          </button>
          <button
            onClick={toggle}
            className={`h-7 px-2.5 rounded-md border text-[9px] font-mono tracking-wider flex items-center gap-1.5 transition-colors ${
              running
                ? 'bg-destructive/15 border-destructive/30 text-destructive'
                : 'bg-primary/15 border-primary/30 text-primary'
            }`}
          >
            {running ? <Square className="size-2.5" /> : <Play className="size-2.5" />}
            {running ? 'STOP' : 'START'}
          </button>
        </div>
      </div>

      {/* Equity summary */}
      <div className="grid grid-cols-3 gap-px bg-border/50 border-b border-border shrink-0">
        <div className="bg-card px-3 py-2">
          <div className="text-[8px] font-mono tracking-[1.5px] text-muted-foreground/70">EQUITY</div>
          <div className="font-mono text-sm font-semibold text-foreground tabular-nums">{fmt$(equity)}</div>
        </div>
        <div className="bg-card px-3 py-2">
          <div className="text-[8px] font-mono tracking-[1.5px] text-muted-foreground/70">P&L</div>
          <div className={`font-mono text-sm font-semibold tabular-nums ${pnl >= 0 ? 'text-chart-up' : 'text-chart-down'}`}>
            {fmt$(pnl)} <span className="text-[10px]">({fmtPct(pnlPct)})</span>
          </div>
        </div>
        <div className="bg-card px-3 py-2">
          <div className="text-[8px] font-mono tracking-[1.5px] text-muted-foreground/70">RECORD</div>
          <div className="font-mono text-sm font-semibold text-foreground tabular-nums">
            <span className="text-chart-up">{wins}W</span>
            <span className="text-muted-foreground/50"> / </span>
            <span className="text-chart-down">{losses}L</span>
          </div>
        </div>
      </div>

      {lastError && (
        <div className="px-3 py-1.5 text-[9px] font-mono text-destructive border-b border-border shrink-0">
          {lastError}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {/* Open positions */}
        <div className="px-3 pt-2 pb-1 text-[8px] font-mono tracking-[1.5px] text-muted-foreground/70 flex items-center gap-1.5">
          OPEN POSITIONS ({portfolio.positions.length})
          {evaluating && <Loader2 className="size-2.5 animate-spin text-primary" />}
        </div>
        {portfolio.positions.length === 0 ? (
          <div className="px-3 pb-2 text-[10px] text-muted-foreground/60 font-mono">
            {running ? 'Scanning for setups…' : 'Press START to let Jev trade.'}
          </div>
        ) : (
          <div className="px-2 pb-2 space-y-1">
            {portfolio.positions.map(pos => (
              <div
                key={pos.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/40 border border-border/40"
              >
                <span className="font-mono text-[10px] font-semibold text-foreground uppercase w-8">
                  {pos.asset}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground uppercase">{pos.timeframe}</span>
                <span
                  className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${
                    pos.side === 'up' ? 'bg-chart-up/15 text-chart-up' : 'bg-chart-down/15 text-chart-down'
                  }`}
                >
                  {pos.side.toUpperCase()} @ {pos.entryAsk.toFixed(2)}
                </span>
                <span className="ml-auto font-mono text-[9px] text-muted-foreground tabular-nums">
                  {fmt$(pos.cost)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Decision log */}
        <div className="px-3 pt-1 pb-1 text-[8px] font-mono tracking-[1.5px] text-muted-foreground/70">
          JEV DECISION LOG
        </div>
        <div className="px-2 pb-3 space-y-0.5">
          {portfolio.log.length === 0 && (
            <div className="px-1 text-[10px] text-muted-foreground/60 font-mono">No decisions yet.</div>
          )}
          {[...portfolio.log].reverse().slice(0, 40).map(entry => (
            <div key={entry.id} className="flex items-center gap-2 px-1 py-1 text-[9px] font-mono">
              <span className="text-muted-foreground/50 tabular-nums shrink-0">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-foreground uppercase shrink-0">{entry.asset} {entry.timeframe}</span>
              <span
                className={`shrink-0 ${
                  entry.direction === 'up' ? 'text-chart-up' : entry.direction === 'down' ? 'text-chart-down' : 'text-muted-foreground'
                }`}
              >
                {entry.direction.toUpperCase()}
              </span>
              <span className={`truncate ${entry.acted ? 'text-foreground' : 'text-muted-foreground/70'}`}>
                {entry.note}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
