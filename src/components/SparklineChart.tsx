import { useMemo, useRef, useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface SparklineChartProps {
  upPrice: number | null;
  downPrice: number | null;
  height?: number;
}

/**
 * Minimal sparkline bar that animates the up/down probability split.
 * Uses a canvas-free approach with pure CSS gradients for buttery performance.
 */
export function SparklineChart({ upPrice, downPrice, height = 40 }: SparklineChartProps) {
  const up = upPrice ?? 0.5;
  const down = downPrice ?? 0.5;
  const upSpring = useSpring(up * 100, { stiffness: 80, damping: 18 });
  const downSpring = useSpring(down * 100, { stiffness: 80, damping: 18 });

  useEffect(() => {
    upSpring.set(up * 100);
    downSpring.set(down * 100);
  }, [up, down, upSpring, downSpring]);

  const upHeight = useTransform(upSpring, v => `${Math.max(2, v)}%`);
  const downHeight = useTransform(downSpring, v => `${Math.max(2, v)}%`);

  return (
    <div className="flex gap-px px-4 pb-2" style={{ height }}>
      <div className="flex-1 flex items-end">
        <motion.div
          className="w-full rounded-t-sm bg-gradient-to-t from-chart-up/40 to-chart-up/10"
          style={{ height: upHeight }}
        />
      </div>
      <div className="flex-1 flex items-end">
        <motion.div
          className="w-full rounded-t-sm bg-gradient-to-t from-destructive/40 to-destructive/10"
          style={{ height: downHeight }}
        />
      </div>
    </div>
  );
}
