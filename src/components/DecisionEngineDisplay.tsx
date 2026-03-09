import { motion } from 'framer-motion';
import type { Decision } from '@/lib/types';

interface DecisionEngineDisplayProps {
  decision: Decision;
}

export function DecisionEngineDisplay({ decision }: DecisionEngineDisplayProps) {
  const actionClass =
    decision.action === 'BUY' ? 'border-primary/30 bg-primary/[0.04]' :
    decision.action === 'EXIT' ? 'border-destructive/30 bg-destructive/[0.04]' :
    'border-warning/30 bg-warning/[0.04]';

  const actionColor =
    decision.action === 'BUY' ? 'text-primary glow-primary' :
    decision.action === 'EXIT' ? 'text-destructive glow-destructive' :
    'text-warning glow-warning';

  return (
    <motion.div
      className={`border rounded-lg p-4 ${actionClass}`}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className={`font-display text-[30px] tracking-[3px] mb-2 font-bold ${actionColor}`}>
        {decision.action}
      </div>
      <div className="text-[11px] text-muted-foreground leading-[1.6] font-body mb-3">
        {decision.reason}
      </div>
      <div className="flex flex-col gap-1.5">
        {decision.conditions.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`text-[10px] flex items-center gap-2 ${
              c.met ? 'text-foreground' : 'text-muted-foreground/60'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              c.met ? 'bg-primary' : 'bg-destructive/60'
            }`} />
            {c.name}: {c.value}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
