import { motion } from 'framer-motion';

interface ConfidenceStripProps {
  ci: [number, number];
  estimate: number;
}

export function ConfidenceStrip({ ci, estimate }: ConfidenceStripProps) {
  const width = ci[1] - ci[0];
  const segments = 24;

  return (
    <div className="flex h-[3px] gap-[2px] mb-3">
      {Array.from({ length: segments }, (_, i) => {
        const pos = i / segments;
        const inRange = pos >= ci[0] && pos <= ci[1];
        const nearCenter = Math.abs(pos - estimate) < 0.04;

        let bg = 'bg-secondary';
        if (nearCenter) bg = 'bg-primary';
        else if (inRange && width < 0.15) bg = 'bg-primary/70';
        else if (inRange) bg = 'bg-warning/60';

        return (
          <motion.div
            key={i}
            className={`flex-1 rounded-full ${bg}`}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.01 }}
          />
        );
      })}
    </div>
  );
}
