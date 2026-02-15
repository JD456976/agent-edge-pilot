import type { Deal, DealParticipant } from '@/types';
import { resolvePersonalCommissionCached } from '@/lib/commissionResolver';

// ── Types ────────────────────────────────────────────────────────────

export type MoneyConfidence = 'high' | 'medium' | 'low';

export type MoneyReasonCode =
  | 'no_participant'
  | 'split_zero'
  | 'split_over_100'
  | 'no_activity_3d'
  | 'no_activity_7d'
  | 'close_7d'
  | 'close_3d'
  | 'inspection_unresolved'
  | 'financing_unresolved'
  | 'appraisal_unknown'
  | 'drift_conflict'
  | 'missing_timestamps'
  | 'missing_commission_details'
  | 'missing_milestones'
  | 'stage_unknown';

export interface MoneyModelResult {
  dealId: string;
  personalCommissionTotal: number;
  stageProbability: number;
  expectedPersonalCommission: number;
  riskScore: number;
  personalCommissionAtRisk: number;
  confidence: MoneyConfidence;
  reasonPrimary: string;
  reasonCodes: MoneyReasonCode[];
  splitWarning: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

export function clampMoney(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, v);
}

export function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

// ── 1) Personal Commission Total ─────────────────────────────────────
// Delegates to the Commission Resolution Engine for accurate computation.

export function computePersonalCommissionTotal(
  deal: Deal,
  participants: DealParticipant[],
  userId: string,
): { total: number; hasParticipant: boolean; splitWarning: boolean } {
  const resolution = resolvePersonalCommissionCached(deal, participants, userId);
  return {
    total: resolution.personalCommissionTotal,
    hasParticipant: resolution.hasParticipant,
    splitWarning: resolution.splitWarning,
  };
}

// ── 2) Stage Probability ─────────────────────────────────────────────

const STAGE_PROB: Record<string, number> = {
  lead: 0.05,
  appointment: 0.15,
  active: 0.20,
  offer: 0.35,
  offer_accepted: 0.60,
  pending: 0.80,
  closing: 0.90,
};

export function computeStageProbability(deal: Deal, now: Date = new Date()): number {
  // If closing within 7 days, treat as 0.90
  if (deal.closeDate) {
    const daysToClose = daysBetween(new Date(deal.closeDate), now);
    if (daysToClose >= 0 && daysToClose <= 7) return 0.90;
  }

  const prob = STAGE_PROB[deal.stage];
  if (prob !== undefined) return prob;

  // Unknown stage default
  return 0.20;
}

// ── 4) Risk Score ────────────────────────────────────────────────────

export interface RiskScoringWeights {
  inactivity_3d_points?: number;
  inactivity_7d_points?: number;
  closing_7d_points?: number;
  closing_3d_points?: number;
  milestone_points?: number;
  drift_conflict_points?: number;
}

export function computeRiskScore(
  deal: Deal,
  now: Date = new Date(),
  weights?: RiskScoringWeights,
): { score: number; reasons: MoneyReasonCode[]; reasonPrimary: string } {
  let score = 0;
  const reasons: MoneyReasonCode[] = [];
  const explanations: string[] = [];

  const w = {
    inactivity_3d: weights?.inactivity_3d_points ?? 20,
    inactivity_7d: weights?.inactivity_7d_points ?? 40,
    closing_7d: weights?.closing_7d_points ?? 20,
    closing_3d: weights?.closing_3d_points ?? 30,
    milestone: weights?.milestone_points ?? 20,
    drift_conflict: weights?.drift_conflict_points ?? 30,
  };

  // Inactivity
  const touchDate = deal.lastTouchedAt || deal.createdAt;
  if (touchDate) {
    const days = daysBetween(now, new Date(touchDate));
    if (days > 7) {
      score += w.inactivity_7d;
      reasons.push('no_activity_7d');
      explanations.push(`No activity ${Math.round(days)} days (+${w.inactivity_7d})`);
    } else if (days > 3) {
      score += w.inactivity_3d;
      reasons.push('no_activity_3d');
      explanations.push(`No activity ${Math.round(days)} days (+${w.inactivity_3d})`);
    }
  } else {
    score += w.inactivity_7d;
    reasons.push('no_activity_7d');
    explanations.push('No activity timestamps available');
  }

  // Close proximity
  if (deal.closeDate) {
    const daysToClose = daysBetween(new Date(deal.closeDate), now);
    if (daysToClose >= 0 && daysToClose <= 3) {
      score += w.closing_3d;
      reasons.push('close_3d');
      explanations.push(`Closing in ${Math.round(daysToClose)} days (+${w.closing_3d})`);
    } else if (daysToClose > 3 && daysToClose <= 7) {
      score += w.closing_7d;
      reasons.push('close_7d');
      explanations.push(`Closing in ${Math.round(daysToClose)} days (+${w.closing_7d})`);
    }
  }

  // Milestone uncertainty
  const ms = deal.milestoneStatus;
  if (ms) {
    if (ms.inspection === 'unknown' || ms.inspection === 'scheduled') {
      score += w.milestone;
      reasons.push('inspection_unresolved');
      explanations.push(`Inspection unresolved (+${w.milestone})`);
    }
    if (ms.financing === 'unknown' || ms.financing === 'preapproved') {
      score += w.milestone;
      reasons.push('financing_unresolved');
      explanations.push(`Financing unresolved (+${w.milestone})`);
    }
    if (ms.appraisal === 'unknown') {
      score += w.milestone;
      reasons.push('appraisal_unknown');
      explanations.push(`Appraisal unknown (+${w.milestone})`);
    }
  }

  // Drift conflict
  const driftFlags = (deal.riskFlags || []).some(f =>
    f.toLowerCase().includes('drift') || f.toLowerCase().includes('conflict')
  );
  if (driftFlags) {
    score += w.drift_conflict;
    reasons.push('drift_conflict');
    explanations.push(`Drift conflict detected (+${w.drift_conflict})`);
  }

  const clamped = clampScore(score);
  return {
    score: clamped,
    reasons,
    reasonPrimary: explanations[0] || 'No specific risk identified',
  };
}

// ── 6) Confidence ────────────────────────────────────────────────────

export function computeConfidence(
  deal: Deal,
  hasParticipant: boolean,
  splitWarning: boolean,
): MoneyConfidence {
  if (!hasParticipant) return 'low';

  let missing = 0;

  // Check timestamps
  if (!deal.lastTouchedAt && !deal.createdAt) missing++;

  // Check commission details
  if (!deal.commission && !deal.commissionRate) missing++;

  // Check milestones
  const ms = deal.milestoneStatus;
  if (!ms || (ms.inspection === 'unknown' && ms.financing === 'unknown' && ms.appraisal === 'unknown')) missing++;

  // Degrade for split warning
  if (splitWarning) missing++;

  if (missing === 0) return 'high';
  if (missing === 1) return 'medium';
  return 'low';
}

// ── Main: Compute Money Model ────────────────────────────────────────

export function computeMoneyModel(
  deal: Deal,
  allParticipants: DealParticipant[],
  userId: string,
  now: Date = new Date(),
  riskWeights?: RiskScoringWeights,
): MoneyModelResult {
  const { total, hasParticipant, splitWarning } = computePersonalCommissionTotal(deal, allParticipants, userId);
  const stageProbability = computeStageProbability(deal, now);
  const expectedPersonalCommission = clampMoney(Math.round(total * stageProbability));
  const { score: riskScore, reasons, reasonPrimary } = computeRiskScore(deal, now, riskWeights);
  const personalCommissionAtRisk = clampMoney(Math.round(expectedPersonalCommission * (riskScore / 100)));

  let confidence = computeConfidence(deal, hasParticipant, splitWarning);

  // Additional reason codes
  const reasonCodes: MoneyReasonCode[] = [...reasons];
  if (!hasParticipant) {
    reasonCodes.push('no_participant');
  }
  const myP = allParticipants.find(p => p.dealId === deal.id && p.userId === userId);
  if (myP && (myP.splitPercent ?? 0) <= 0 && myP.commissionOverride === undefined) {
    reasonCodes.push('split_zero');
  }
  if (splitWarning) {
    reasonCodes.push('split_over_100');
  }

  // Unknown stage
  if (!STAGE_PROB[deal.stage]) {
    reasonCodes.push('stage_unknown');
    if (confidence === 'high') confidence = 'medium';
  }

  const finalReasonPrimary = !hasParticipant
    ? 'No personal commission assigned'
    : reasonPrimary;

  return {
    dealId: deal.id,
    personalCommissionTotal: total,
    stageProbability,
    expectedPersonalCommission,
    riskScore,
    personalCommissionAtRisk,
    confidence,
    reasonPrimary: finalReasonPrimary,
    reasonCodes,
    splitWarning,
  };
}

// ── Batch + Memoization ──────────────────────────────────────────────

const cache = new Map<string, { result: MoneyModelResult; key: string }>();

function cacheKey(deal: Deal, participants: DealParticipant[], userId: string): string {
  const pKey = participants
    .filter(p => p.dealId === deal.id)
    .map(p => `${p.id}:${p.splitPercent}:${p.commissionOverride ?? ''}`)
    .join('|');
  return `${deal.id}:${deal.lastTouchedAt || ''}:${deal.stage}:${deal.commission}:${pKey}:${userId}`;
}

export function computeMoneyModelBatch(
  deals: Deal[],
  allParticipants: DealParticipant[],
  userId: string,
  now: Date = new Date(),
  riskWeights?: RiskScoringWeights,
): MoneyModelResult[] {
  return deals.map(deal => {
    const key = cacheKey(deal, allParticipants, userId);
    const cached = cache.get(deal.id);
    if (cached && cached.key === key) return cached.result;

    const result = computeMoneyModel(deal, allParticipants, userId, now, riskWeights);
    cache.set(deal.id, { result, key });
    return result;
  });
}

// ── Suggested Action Text ────────────────────────────────────────────

export function suggestAction(result: MoneyModelResult, deal: Deal): { title: string; type: string } {
  if (result.reasonCodes.includes('inspection_unresolved')) {
    return { title: `Follow up on inspection — ${deal.title}`, type: 'follow_up' };
  }
  if (result.reasonCodes.includes('financing_unresolved')) {
    return { title: `Check financing status — ${deal.title}`, type: 'follow_up' };
  }
  if (result.reasonCodes.includes('no_activity_7d') || result.reasonCodes.includes('no_activity_3d')) {
    return { title: `Touch base on ${deal.title} — no recent activity`, type: 'call' };
  }
  if (result.reasonCodes.includes('close_3d') || result.reasonCodes.includes('close_7d')) {
    return { title: `Pre-closing check — ${deal.title}`, type: 'closing' };
  }
  if (result.reasonCodes.includes('drift_conflict')) {
    return { title: `Resolve drift conflict — ${deal.title}`, type: 'follow_up' };
  }
  return { title: `Review deal status — ${deal.title}`, type: 'follow_up' };
}
