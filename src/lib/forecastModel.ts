/**
 * Income Forecast Model
 *
 * Computes expected personal commission across time windows
 * using existing Money Model stage probabilities and deal data.
 */

import type { Deal, DealParticipant } from '@/types';
import { computePersonalCommissionTotal, computeStageProbability, clampMoney } from '@/lib/moneyModel';

// ── Types ────────────────────────────────────────────────────────────

export type ForecastConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ForecastDealResult {
  dealId: string;
  dealTitle: string;
  stage: string;
  closeDate: string | null;
  daysToClose: number | null;
  personalCommissionTotal: number;
  stageProbability: number;
  expectedPersonalCommission: number;
  confidence: ForecastConfidence;
  windows: { w7: boolean; w30: boolean; w90: boolean };
}

export interface ForecastSummary {
  next7: number;
  next30: number;
  next90: number;
  confidence30: ForecastConfidence;
  topContributors: ForecastDealResult[];
  explanation: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function computeDealConfidence(deal: Deal, hasParticipant: boolean): ForecastConfidence {
  let missing = 0;
  if (!hasParticipant) return 'LOW';
  if (!deal.commission && !deal.commissionRate) missing++;
  if (!deal.stage) missing++;
  if (!deal.closeDate) missing++;
  if (missing === 0) return 'HIGH';
  if (missing === 1) return 'MEDIUM';
  return 'LOW';
}

// ── Compute ──────────────────────────────────────────────────────────

export function computeForecastBatch(
  deals: Deal[],
  allParticipants: DealParticipant[],
  userId: string,
  now: Date = new Date(),
): ForecastSummary {
  const activeDeals = deals.filter(d => d.stage !== 'closed');

  const results: ForecastDealResult[] = activeDeals.map(deal => {
    const { total, hasParticipant } = computePersonalCommissionTotal(deal, allParticipants, userId);
    const stageProbability = computeStageProbability(deal, now);
    const expected = clampMoney(Math.round(total * stageProbability));
    const confidence = computeDealConfidence(deal, hasParticipant);

    let daysToClose: number | null = null;
    const w = { w7: false, w30: false, w90: false };

    if (deal.closeDate) {
      daysToClose = Math.ceil(daysBetween(new Date(deal.closeDate), now));
      if (daysToClose >= 0 && daysToClose <= 7) { w.w7 = true; w.w30 = true; w.w90 = true; }
      else if (daysToClose > 7 && daysToClose <= 30) { w.w30 = true; w.w90 = true; }
      else if (daysToClose > 30 && daysToClose <= 90) { w.w90 = true; }
      // Past close dates or >90 days — only include in 90 if close is past (still active)
      if (daysToClose < 0) { w.w30 = true; w.w90 = true; } // overdue deal
    } else {
      // No close date — low confidence, 90-day bucket only
      w.w90 = true;
    }

    return {
      dealId: deal.id,
      dealTitle: deal.title,
      stage: deal.stage,
      closeDate: deal.closeDate || null,
      daysToClose,
      personalCommissionTotal: total,
      stageProbability,
      expectedPersonalCommission: expected,
      confidence,
      windows: w,
    };
  });

  const next7 = clampMoney(results.filter(r => r.windows.w7).reduce((s, r) => s + r.expectedPersonalCommission, 0));
  const next30 = clampMoney(results.filter(r => r.windows.w30).reduce((s, r) => s + r.expectedPersonalCommission, 0));
  const next90 = clampMoney(results.filter(r => r.windows.w90).reduce((s, r) => s + r.expectedPersonalCommission, 0));

  // Confidence for 30-day: worst of top contributors in 30d window
  const in30 = results.filter(r => r.windows.w30 && r.expectedPersonalCommission > 0);
  let confidence30: ForecastConfidence = 'HIGH';
  if (in30.length === 0) {
    confidence30 = 'LOW';
  } else if (in30.some(r => r.confidence === 'LOW')) {
    confidence30 = 'LOW';
  } else if (in30.some(r => r.confidence === 'MEDIUM')) {
    confidence30 = 'MEDIUM';
  }

  // Top 5 contributors by expected commission
  const topContributors = [...results]
    .filter(r => r.expectedPersonalCommission > 0)
    .sort((a, b) => b.expectedPersonalCommission - a.expectedPersonalCommission)
    .slice(0, 5);

  // Explanation
  const closingsIn7 = results.filter(r => r.windows.w7 && r.expectedPersonalCommission > 0).length;
  let explanation: string;
  if (closingsIn7 >= 2) {
    explanation = `Driven mostly by ${closingsIn7} closings in the next 7 days`;
  } else if (closingsIn7 === 1) {
    explanation = `One closing expected this week`;
  } else if (next30 > 0 && next30 >= next90 * 0.5) {
    explanation = `Solid pipeline within 30 days`;
  } else if (next90 > 0) {
    explanation = `Most income is beyond 30 days — push pipeline forward`;
  } else {
    explanation = `No expected income from current pipeline`;
  }

  return { next7, next30, next90, confidence30, topContributors, explanation };
}
