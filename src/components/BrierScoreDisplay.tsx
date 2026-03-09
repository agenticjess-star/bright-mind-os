import { motion } from 'framer-motion';
import type { BrierState } from '@/lib/types';
import { AnimatedValue } from './AnimatedValue';

interface BrierScoreDisplayProps {
  state: BrierState;
}

export function BrierScoreDisplay({ state }: BrierScoreDisplayProps) {
  const calibColor =
    state.calibrationLabel === 'EXCELLENT' ? 'text-primary' :
    state.calibrationLabel === 'GOOD' ? 'text-primary' :
    state.calibrationLabel === 'FAIR' ? 'text-warning' :
    'text-destructive';

  return (
    <div className="flex items-center gap-4 py-1">
      <AnimatedValue
        value={state.score}
        format={(v) => v.toFixed(2)}
        className="text-[28px] font-display font-bold text-primary glow-primary"
      />
      <div>
        <div className="text-[8px] text-muted-foreground/50 tracking-wider leading-[1.5] font-mono mb-1">
          CALIBRATION
        </div>
        <div className="text-[8px] space-y-0.5 font-mono">
          <div className="text-muted-foreground/40">EXCELLENT &lt;0.10</div>
          <div className="text-muted-foreground/40">GOOD &lt;0.20</div>
          <motion.div
            className={`font-bold ${calibColor}`}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            YOU: {state.calibrationLabel}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
