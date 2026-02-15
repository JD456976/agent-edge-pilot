import type { Deal, DealParticipant } from '@/types';

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

export function computePersonalCommissionTotal(
  deal: Deal,
  participants: DealParticipant[],
  userId: string,
): { total: number; hasParticipant: boolean; splitWarning: boolean } {
  const myParticipant = participants.find(p => p.dealId === deal.id && p.userId === userId);

  if (!myParticipant) {
    return { total: 0, hasParticipant: false, splitWarning: false };
  }

  // Check total splits
  const dealParticipants = participants.filter(p => p.dealId === deal.id);
  const totalSplit = dealParticipants.reduce((s, p) => s + (p.splitPercent ?? 0), 0);
  const splitWarning = totalSplit > 100;

  // Override takes precedence
  if (myParticipant.commissionOverride !== undefined && myParticipant.commissionOverride !== null) {
    return { total: clampMoney(myParticipant.commissionOverride), hasParticipant: true, splitWarning };
  }

  const splitPct = myParticipant.splitPercent ?? 0;
  if (splitPct <= 0) {
    return { total: 0, hasParticipant: true, splitWarning };
  }

  // Gross commission
  const grossCommission = deal.commission || 0;
  const referralFeePct = deal.referralFeePercent ?? 0;
  const netAfterReferral = grossCommission * (1 - referralFeePct / 100);
  const personal = netAfterReferral * (splitPct / 100);

  return { total: clampMoney(Math.round(personal)), hasParticipant: true, splitWarning };
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

export function computeRiskScore(
  deal: Deal,
  now: Date = new Date(),
): { score: number; reasons: MoneyReasonCode[]; reasonPrimary: string } {
  let score = 0;
  const reasons: MoneyReasonCode[] = [];
  const explanations: string[] = [];

  // Inactivity
  const touchDate = deal.lastTouchedAt || deal.createdAt;
  if (touchDate) {
    const days = daysBetween(now, new Date(touchDate));
    if (days > 7) {
      score += 40;
      reasons.push('no_activity_7d');
      explanations.push(`No activity ${Math.round(days)} days`);
    } else if (days > 3) {
      score += 20;
      reasons.push('no_activity_3d');
      explanations.push(`No activity ${Math.round(days)} days`);
    }
  } else {
    // No timestamps at all — very stale
    score += 40;
    reasons.push('no_activity_7d');
    explanations.push('No activity timestamps available');
  }

  // Close proximity
  if (deal.closeDate) {
    const daysToClose = daysBetween(new Date(deal.closeDate), now);
    if (daysToClose >= 0 && daysToClose <= 3) {
      score += 30;
      reasons.push('close_3d');
      explanations.push(`Closing in ${Math.round(daysToClose)} days`);
    } else if (daysToClose > 3 && daysToClose <= 7) {
      score += 20;
      reasons.push('close_7d');
      explanations.push(`Closing in ${Math.round(daysToClose)} days`);
    }
  }

  // Milestone uncertainty
  const ms = deal.milestoneStatus;
  if (ms) {
    if (ms.inspection === 'unknown' || ms.inspection === 'scheduled') {
      score += 20;
      reasons.push('inspection_unresolved');
      explanations.push('Inspection unresolved');
    }
    if (ms.financing === 'unknown' || ms.financing === 'preapproved') {
      score += 20;
      reasons.push('financing_unresolved');
      explanations.push('Financing unresolved');
    }
    if (ms.appraisal === 'unknown') {
      score += 20;
      reasons.push('appraisal_unknown');
      explanations.push('Appraisal unknown');
    }
  }

  // Drift conflict (check riskFlags for drift indicators)
  const driftFlags = (deal.riskFlags || []).some(f =>
    f.toLowerCase().includes('drift') || f.toLowerCase().includes('conflict')
  );
  if (driftFlags) {
    score += 30;
    reasons.push('drift_conflict');
    explanations.push('Drift conflict detected');
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
): MoneyModelResult {
  const { total, hasParticipant, splitWarning } = computePersonalCommissionTotal(deal, allParticipants, userId);
  const stageProbability = computeStageProbability(deal, now);
  const expectedPersonalCommission = clampMoney(Math.round(total * stageProbability));
  const { score: riskScore, reasons, reasonPrimary } = computeRiskScore(deal, now);
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
): MoneyModelResult[] {
  return deals.map(deal => {
    const key = cacheKey(deal, allParticipants, userId);
    const cached = cache.get(deal.id);
    if (cached && cached.key === key) return cached.result;

    const result = computeMoneyModel(deal, allParticipants, userId, now);
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
