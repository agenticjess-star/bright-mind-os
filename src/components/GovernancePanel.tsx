import { motion } from 'framer-motion';
import type { GovernanceState } from '@/lib/types';

interface GovernancePanelProps {
  governance: GovernanceState;
}

export function GovernancePanel({ governance }: GovernancePanelProps) {
  const progressPercent = Math.min(100, (governance.weeklyProgress / governance.weeklyTarget) * 100);

  return (
    <div className="overflow-y-auto overflow-x-hidden scrollbar-thin min-w-0">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between sticky top-0 bg-background/90 backdrop-blur-sm z-10">
        <span className="text-[9px] tracking-[1.5px] text-muted-foreground/60 uppercase font-medium">
          Governance
        </span>
      </div>

      {/* Critical Number */}
      <div className="p-3 border-b border-border">
        <div className="text-[7px] tracking-wider text-warning/70 mb-1.5 font-mono">
          CRITICAL NUMBER · Q1 2026
        </div>
        <div className="font-display text-[28px] font-bold text-warning leading-none mb-1 glow-warning">
          ${governance.weeklyTarget}
        </div>
        <div className="text-[9px] text-muted-foreground/50">Weekly withdrawal target</div>
        <div className="mt-3 h-[3px] bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-warning rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[8px] text-muted-foreground/50 font-mono">${governance.weeklyProgress.toFixed(0)}</span>
          <span className="text-[8px] text-muted-foreground/50 font-mono">{progressPercent.toFixed(0)}%</span>
        </div>
      </div>

      {/* Decision Log */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between sticky top-[40px] bg-background/90 backdrop-blur-sm z-10">
        <span className="text-[8px] tracking-wider text-muted-foreground/50 font-mono">DECISION LOG</span>
        <span className="text-[8px] px-1.5 py-0.5 bg-secondary/60 text-muted-foreground/60 rounded-md font-mono border border-border/50">
          {governance.decisionLog.length}
        </span>
      </div>

      <div>
        {governance.decisionLog.length === 0 && (
          <div className="px-3 py-6 text-[9px] text-muted-foreground/40 text-center">No decisions logged yet.</div>
        )}
        {governance.decisionLog.map((entry, i) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="px-3 py-2 border-b border-border/30 text-[9px]"
          >
            <div className="text-[7px] text-muted-foreground/40 font-mono mb-0.5">
              {new Date(entry.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false })}
            </div>
            <div className="text-foreground text-[10px] mb-0.5">
              <span className={
                entry.action === 'BUY' ? 'text-primary' :
                entry.action === 'EXIT' ? 'text-destructive' :
                'text-warning'
              }>{entry.action}</span>
              {' · '}<span className="truncate">{entry.market}</span>
            </div>
            <div className="text-muted-foreground/50 text-[9px] truncate">{entry.reason}</div>
          </motion.div>
        ))}
      </div>

      <div className="sticky bottom-0 bg-background/90 backdrop-blur-sm border-t border-border p-3">
        <button className="w-full py-2 rounded-lg bg-destructive/6 border border-destructive/20 text-destructive font-mono text-[9px] tracking-wider uppercase cursor-pointer transition-all hover:bg-destructive/12 hover:border-destructive/30 active:scale-[0.98]">
          ⚠ OVERRIDE
        </button>
      </div>
    </div>
  );
}
