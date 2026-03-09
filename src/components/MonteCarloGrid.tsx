import { motion } from 'framer-motion';

interface MonteCarloGridProps {
  samples: boolean[];
}

export function MonteCarloGrid({ samples }: MonteCarloGridProps) {
  const cells = samples.slice(0, 100);
  while (cells.length < 100) cells.push(false);

  return (
    <div className="grid grid-cols-[repeat(20,1fr)] gap-[2px]">
      {cells.map((hit, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: hit ? 0.75 : 0.2, scale: 1 }}
          transition={{ delay: i * 0.003, duration: 0.2 }}
          className={`h-[7px] rounded-sm ${
            hit ? 'bg-primary' : 'bg-destructive'
          }`}
        />
      ))}
    </div>
  );
}
