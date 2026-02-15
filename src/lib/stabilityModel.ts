/**
 * Stability Score Model
 *
 * Computes operational health score (0-100) from existing data signals.
 * No new scoring systems — uses tasks, touches, forecast, and money-at-risk.
 */

import { clampScore, clampMoney } from '@/lib/moneyModel';

// ── Types ────────────────────────────────────────────────────────────

export type StabilityBand = 'Stable' | 'Watch' | 'Needs Attention';

export interface StabilityFactor {
  label: string;
  penalty: number;
}

export interface StabilityResult {
  score: number;
  band: StabilityBand;
  factors: StabilityFactor[];
  topReasons: string[];
  suggestedAction: { title: string; type: 'overdue' | 'touches' | 'concentration' | 'general' } | null;
}

export interface StabilityInputs {
  overdueTasksCount: number;
  dueSoonCount: number; // due within 48h
  missedTouchesCount: number; // high-opp leads untouched
  forecast30: number;
  topDealExpected: number; // highest single deal in 30-day forecast
  moneyAtRiskTotal: number;
  momentum: 'Improving' | 'Stable' | 'Declining';
}

// ── Compute ──────────────────────────────────────────────────────────

export function computeStabilityScore(inputs: StabilityInputs): StabilityResult {
  const factors: StabilityFactor[] = [];
  let score = 100;

  // Overdue tasks (cap 30)
  const overduePenalty = Math.min(30, inputs.overdueTasksCount * 6);
  if (overduePenalty > 0) {
    factors.push({ label: `${inputs.overdueTasksCount} overdue task${inputs.overdueTasksCount !== 1 ? 's' : ''}`, penalty: overduePenalty });
    score -= overduePenalty;
  }

  // Due soon (cap 20)
  const dueSoonPenalty = Math.min(20, inputs.dueSoonCount * 4);
  if (dueSoonPenalty > 0) {
    factors.push({ label: `${inputs.dueSoonCount} task${inputs.dueSoonCount !== 1 ? 's' : ''} due within 48h`, penalty: dueSoonPenalty });
    score -= dueSoonPenalty;
  }

  // Missed touches (cap 25)
  const touchPenalty = Math.min(25, inputs.missedTouchesCount * 5);
  if (touchPenalty > 0) {
    factors.push({ label: `${inputs.missedTouchesCount} hot lead${inputs.missedTouchesCount !== 1 ? 's' : ''} untouched`, penalty: touchPenalty });
    score -= touchPenalty;
  }

  // Pipeline concentration
  if (inputs.forecast30 > 0 && inputs.topDealExpected > 0) {
    const topDealShare = inputs.topDealExpected / inputs.forecast30;
    if (topDealShare > 0.6) {
      factors.push({ label: 'Income concentrated in one deal', penalty: 20 });
      score -= 20;
    } else if (topDealShare > 0.4) {
      factors.push({ label: 'Income moderately concentrated', penalty: 10 });
      score -= 10;
    }
  }

  // Money at risk relative to forecast
  if (inputs.forecast30 > 0 && inputs.moneyAtRiskTotal > 0) {
    const riskRatio = inputs.moneyAtRiskTotal / inputs.forecast30;
    if (riskRatio > 0.5) {
      factors.push({ label: 'High money at risk this month', penalty: 20 });
      score -= 20;
    } else if (riskRatio > 0.25) {
      factors.push({ label: 'Elevated money at risk', penalty: 10 });
      score -= 10;
    }
  }

  // Momentum
  if (inputs.momentum === 'Declining') {
    factors.push({ label: 'Declining momentum', penalty: 5 });
    score -= 5;
  }

  const clamped = clampScore(score);
  const band = getBand(clamped);
  const topReasons = factors
    .sort((a, b) => b.penalty - a.penalty)
    .slice(0, 2)
    .map(f => f.label);

  // Suggested action
  let suggestedAction: StabilityResult['suggestedAction'] = null;
  if (inputs.overdueTasksCount > 0) {
    suggestedAction = { title: `Clear overdue tasks (top ${Math.min(3, inputs.overdueTasksCount)})`, type: 'overdue' };
  } else if (inputs.missedTouchesCount > 0) {
    suggestedAction = { title: `Log touches on top ${Math.min(3, inputs.missedTouchesCount)} warm/hot leads`, type: 'touches' };
  } else if (factors.some(f => f.label.includes('concentrated'))) {
    suggestedAction = { title: 'Create backup opportunity this week', type: 'concentration' };
  } else if (clamped < 80) {
    suggestedAction = { title: 'Review and address outstanding items', type: 'general' };
  }

  return { score: clamped, band, factors, topReasons, suggestedAction };
}

function getBand(score: number): StabilityBand {
  if (score >= 80) return 'Stable';
  if (score >= 55) return 'Watch';
  return 'Needs Attention';
}
