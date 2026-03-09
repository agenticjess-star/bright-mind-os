import { motion } from 'framer-motion';
import type { StealMetrics } from '@/lib/stealScore';

interface StealBadgeProps {
  metrics: StealMetrics;
  size?: 'sm' | 'md';
}

const LABEL_STYLES: Record<string, string> = {
  STEAL: 'bg-primary/15 text-primary border-primary/30 glow-primary-box',
  VALUE: 'bg-chart-up/10 text-chart-up border-chart-up/25',
  FAIR: 'bg-secondary text-muted-foreground border-border',
  AVOID: 'bg-destructive/10 text-destructive border-destructive/25',
};

export function StealBadge({ metrics, size = 'sm' }: StealBadgeProps) {
  if (!metrics.stealLabel || metrics.stealScore === null) return null;

  const style = LABEL_STYLES[metrics.stealLabel] || LABEL_STYLES.FAIR;
  const fontSize = size === 'sm' ? 'text-[8px]' : 'text-[10px]';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`${fontSize} font-mono font-bold ${padding} rounded border ${style} inline-flex items-center gap-1`}
    >
      {metrics.stealLabel}
      <span className="opacity-60 font-normal">{Math.round(metrics.stealScore)}</span>
    </motion.span>
  );
}
