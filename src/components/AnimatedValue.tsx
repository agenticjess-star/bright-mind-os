import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

interface AnimatedValueProps {
  value: number;
  format?: (v: number) => string;
  className?: string;
}

export function AnimatedValue({ value, format, className }: AnimatedValueProps) {
  const spring = useSpring(value, { stiffness: 120, damping: 20, mass: 0.5 });
  const display = useTransform(spring, (v) => format ? format(v) : v.toFixed(1));

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span className={className}>{display}</motion.span>;
}

interface AnimatedPriceProps {
  value: number | null;
  suffix?: string;
  className?: string;
}

export function AnimatedPrice({ value, suffix = '¢', className }: AnimatedPriceProps) {
  if (value === null) return <span className={className}>—</span>;

  return (
    <AnimatedValue
      value={value * 100}
      format={(v) => `${v.toFixed(1)}${suffix}`}
      className={className}
    />
  );
}
