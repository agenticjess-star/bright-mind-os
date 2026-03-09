import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Market, ParticleFilterState, MonteCarloResult, BrierState, Decision } from '@/lib/types';
import { ParticleCanvas } from './ParticleCanvas';
import { MonteCarloGrid } from './MonteCarloGrid';
import { BrierScoreDisplay } from './BrierScoreDisplay';
import { ConfidenceStrip } from './ConfidenceStrip';
import { DecisionEngineDisplay } from './DecisionEngineDisplay';
import { PriceChart } from './PriceChart';
import { TimeframeSelector } from './TimeframeSelector';
import { AnimatedValue } from './AnimatedValue';

interface ProbabilityEngineProps {
  market: Market | null;
  pfState: ParticleFilterState;
  mcResult: MonteCarloResult;
  brierState: BrierState;
  decision: Decision;
  getParticles: () => Float64Array;
  liveSpotPrice?: number | null;
  spotAsset?: string;
}

export function ProbabilityEngine({
  market, pfState, mcResult, brierState, decision, getParticles, liveSpotPrice, spotAsset
}: ProbabilityEngineProps) {
  const [timeframe, setTimeframe] = useState('1H');
  const probPercent = pfState.estimate * 100;
  const probColor =
    pfState.estimate >= 0.6 ? 'text-primary glow-primary' :
    pfState.estimate >= 0.4 ? 'text-warning glow-warning' :
    'text-destructive glow-destructive';

  const ci = pfState.credibleInterval;
  const daysToExpiry = market?.endDate
    ? Math.max(0, Math.ceil((new Date(market.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const polymarketUrl = market?.slug ? `https://polymarket.com/event/${market.slug}` : null;

  return (
    <div>
      {/* Hero Probability */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] tracking-wider text-muted-foreground font-mono flex items-center gap-2">
            <span className="text-primary/60">◈</span>
            <span>FILTERED ESTIMATE</span>
            {polymarketUrl && (
              <a href={polymarketUrl} target="_blank" rel="noopener noreferrer"
                className="text-primary/40 hover:text-primary transition-colors">
                ↗ Polymarket
              </a>
            )}
          </div>
          <TimeframeSelector active={timeframe} onChange={setTimeframe} />
        </div>

        <div className="text-[11px] text-foreground/70 font-medium mb-3 leading-snug line-clamp-2">
          {market?.question || 'Select a market to begin analysis'}
        </div>

        <ConfidenceStrip ci={ci} estimate={pfState.estimate} />

        <div className="flex items-baseline gap-1">
          {market ? (
            <AnimatedValue
              value={probPercent}
              format={(v) => v.toFixed(0)}
              className={`font-display text-[60px] leading-none font-bold tracking-tight transition-colors duration-500 ${probColor}`}
            />
          ) : (
            <span className="font-display text-[60px] leading-none font-bold text-muted-foreground">--</span>
          )}
          <span className="text-[24px] text-muted-foreground/50 font-display">%</span>
        </div>

        <div className="grid grid-cols-5 gap-4 mt-4 pt-3 border-t border-border/50">
          {[
            { label: 'MARKET', value: market ? (market.yesPrice * 100).toFixed(1) + '¢' : '--' },
            { label: 'EDGE', value: market ? (decision.edge > 0 ? '+' : '') + (decision.edge * 100).toFixed(1) + '%' : '--', color: decision.edge >= 0 ? 'text-primary' : 'text-destructive' },
            { label: '95% CI', value: market ? `${(ci[0] * 100).toFixed(0)}–${(ci[1] * 100).toFixed(0)}%` : '--' },
            { label: 'ESS', value: market ? pfState.ess.toFixed(0) : '--' },
            { label: 'EXPIRES', value: daysToExpiry !== null ? `${daysToExpiry}D` : '--' },
          ].map(stat => (
            <div key={stat.label}>
              <div className="text-[7px] text-muted-foreground/60 tracking-wider mb-1 font-mono">{stat.label}</div>
              <div className={`text-[12px] font-mono font-semibold ${stat.color || 'text-foreground'}`}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Price Chart */}
      <div className="px-5 py-4 border-b border-border">
        <SectionHeader icon="◇" label="PROBABILITY TRAJECTORY · FILTERED vs MARKET" />
        <PriceChart
          history={pfState.history}
          marketPrice={market?.yesPrice ?? 0.5}
          height={150}
        />
      </div>

      {/* Particle Filter */}
      <div className="px-5 py-4 border-b border-border">
        <SectionHeader icon="⊡" label="PARTICLE DISTRIBUTION" />
        <ParticleCanvas
          particles={pfState.logitParticles}
          weights={pfState.weights}
          height={56}
        />
        <div className="flex gap-4 mt-2 flex-wrap">
          {[
            { label: 'UPDATES', value: pfState.updateCount },
            { label: 'σ_proc', value: '3%' },
            { label: 'σ_obs', value: '2%' },
            { label: 'LAST', value: pfState.lastObservation !== null ? (pfState.lastObservation * 100).toFixed(1) + '¢' : '--' },
          ].map(s => (
            <span key={s.label} className="text-[8px] text-muted-foreground/60 font-mono">
              {s.label}: <span className="text-foreground/80">{s.value}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Monte Carlo */}
      <div className="px-5 py-4 border-b border-border">
        <SectionHeader icon="⊞" label={`MONTE CARLO · N=${mcResult.nPaths}`} />
        <MonteCarloGrid samples={mcResult.samples} />
      </div>

      {/* Brier Score */}
      <div className="px-5 py-4 border-b border-border">
        <SectionHeader icon="◎" label="BRIER SCORE" />
        <BrierScoreDisplay state={brierState} />
      </div>

      {/* Decision Engine */}
      <div className="px-5 py-4 border-b border-border">
        <SectionHeader icon="⚡" label="DECISION ENGINE" />
        <DecisionEngineDisplay decision={decision} />
      </div>
    </div>
  );
}

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="text-[8px] tracking-wider text-muted-foreground/50 mb-3 font-mono flex items-center gap-1.5">
      <span className="text-primary/40">{icon}</span>
      {label}
    </div>
  );
}
