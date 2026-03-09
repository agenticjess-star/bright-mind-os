/**
 * Alpha Gemini — Market Steal Score Engine
 * 
 * Identifies "Market Steals" where the implied probability from contract pricing
 * diverges from the spot price momentum toward the target.
 * 
 * steal_score = (1 - implied_up_prob) * proximity_factor
 * 
 * When spot is CLOSE to target but UP contract is cheap → high steal score.
 * When spot is FAR from target and UP contract is expensive → negative steal (avoid).
 */

export interface StealMetrics {
  /** The target price extracted from the market title */
  priceToBeat: number | null;
  /** Current live spot price */
  spotPrice: number | null;
  /** Raw distance: spot - target */
  distanceDollars: number | null;
  /** Percentage move required to hit target from current spot */
  pctMoveRequired: number | null;
  /** Whether spot is currently above target */
  spotAboveTarget: boolean | null;
  /** Implied probability of UP outcome (from contract price) */
  impliedUpProb: number | null;
  /** 0-100 steal score. Higher = more attractive opportunity */
  stealScore: number | null;
  /** Human label for the steal quality */
  stealLabel: 'STEAL' | 'VALUE' | 'FAIR' | 'AVOID' | null;
  /** Time remaining in seconds */
  timeRemainingSeconds: number | null;
}

export function calculateStealMetrics(
  spotPrice: number | null,
  priceToBeat: number | null,
  upPrice: number | null,
  downPrice: number | null,
  endDate: string | null,
): StealMetrics {
  const base: StealMetrics = {
    priceToBeat,
    spotPrice,
    distanceDollars: null,
    pctMoveRequired: null,
    spotAboveTarget: null,
    impliedUpProb: null,
    stealScore: null,
    stealLabel: null,
    timeRemainingSeconds: null,
  };

  if (endDate) {
    base.timeRemainingSeconds = Math.max(0, (new Date(endDate).getTime() - Date.now()) / 1000);
  }

  if (spotPrice === null || priceToBeat === null || priceToBeat === 0) return base;

  base.distanceDollars = spotPrice - priceToBeat;
  base.pctMoveRequired = ((priceToBeat - spotPrice) / spotPrice) * 100;
  base.spotAboveTarget = spotPrice >= priceToBeat;

  if (upPrice === null) return base;

  base.impliedUpProb = upPrice;

  // Proximity factor: how close is spot to target? (0 = far, 1 = at target or above)
  const absPctDistance = Math.abs(base.pctMoveRequired);
  // Decay function: proximity = e^(-k * |pct_distance|) where k controls sensitivity
  const k = 8; // steep decay — 1% move = significant
  const proximityFactor = Math.exp(-k * (absPctDistance / 100));

  // If spot is ABOVE target, proximity = 1 (already there)
  const effectiveProximity = base.spotAboveTarget ? 1 : proximityFactor;

  // Steal score: high when contract is cheap but proximity is high
  // score = (1 - impliedUpProb) * proximityFactor * 100
  // This means: if UP is priced at 20¢ but spot is right at target → (1 - 0.2) * 1.0 * 100 = 80 (STEAL)
  // If UP is priced at 80¢ and spot is at target → (1 - 0.8) * 1.0 * 100 = 20 (FAIR/AVOID)
  const rawScore = (1 - upPrice) * effectiveProximity * 100;

  // For DOWN contracts: if spot is below target, calculate inverse steal
  // We want to also flag when DOWN is underpriced
  const downSteal = downPrice !== null
    ? (1 - downPrice) * (1 - effectiveProximity) * 100
    : 0;

  // Take the max of up-steal and down-steal
  base.stealScore = Math.max(rawScore, downSteal);

  // Label
  if (base.stealScore >= 60) base.stealLabel = 'STEAL';
  else if (base.stealScore >= 35) base.stealLabel = 'VALUE';
  else if (base.stealScore >= 15) base.stealLabel = 'FAIR';
  else base.stealLabel = 'AVOID';

  return base;
}

/** Extract price-to-beat from a market title like "Bitcoin Up or Down - ... $85,000" */
export function extractPriceToBeat(title: string): number | null {
  const match = title.match(/\$([0-9,]+(?:\.\d+)?)/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(/,/g, ''));
  return isNaN(val) ? null : val;
}

/** Format seconds remaining into human-readable */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'EXPIRED';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${Math.floor(seconds % 60)}s`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d`;
}
