/**
 * Personal Commission Resolution Engine
 *
 * Computes the agent's actual personal commission per deal using the
 * Deal Commission Editor data and participant system.
 *
 * Calculation order:
 *   1. Determine commission base (percentage / flat / custom)
 *   2. Side logic (informational only for v1)
 *   3. Participant splits
 *   4. Referral adjustments (out / in)
 *   5. Team split
 *   6. Flat override
 */

import type { Deal, DealParticipant } from '@/types';

// ── Types ────────────────────────────────────────────────────────────

export type ResolutionConfidence = 'high' | 'medium' | 'low';

export interface CalculationStep {
  label: string;
  value: number;
  note?: string;
}

export interface CommissionResolution {
  personalCommissionTotal: number;
  confidenceLevel: ResolutionConfidence;
  warnings: string[];
  calculationDetails: CalculationStep[];
  hasParticipant: boolean;
  splitWarning: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

function clamp(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, v);
}

// ── Main Resolution Function ─────────────────────────────────────────

export function resolvePersonalCommission(
  deal: Deal,
  allParticipants: DealParticipant[],
  currentUserId: string,
): CommissionResolution {
  const warnings: string[] = [];
  const steps: CalculationStep[] = [];
  let confidenceMissing = 0;

  // ── Step 1: Determine commission base ──────────────────────────────

  // Infer commission type from deal data:
  //   - If commissionRate is set and > 0, treat as percentage
  //   - Otherwise use flat commission_amount
  const hasRate = deal.commissionRate !== undefined && deal.commissionRate !== null && deal.commissionRate > 0;
  let baseCommission: number;
  let commissionTypeLabel: string;

  if (hasRate) {
    baseCommission = clamp(Math.round(deal.price * (deal.commissionRate! / 100)));
    commissionTypeLabel = `${deal.commissionRate}% of $${deal.price.toLocaleString()}`;
  } else if (deal.commission > 0) {
    baseCommission = clamp(deal.commission);
    commissionTypeLabel = 'Flat / stored amount';
  } else {
    baseCommission = 0;
    commissionTypeLabel = 'Unknown — no rate or amount';
    confidenceMissing++;
    warnings.push('Base commission unknown — neither rate nor amount set');
  }

  steps.push({ label: 'Base commission', value: baseCommission, note: commissionTypeLabel });

  // ── Step 2: Side logic (informational only) ────────────────────────

  const side = (deal as any).side || 'buy';
  steps.push({ label: 'Side', value: baseCommission, note: `${side} side (informational)` });

  // ── Step 3: Participant splits ─────────────────────────────────────

  const dealParticipants = allParticipants.filter(p => p.dealId === deal.id);
  const myParticipant = dealParticipants.find(p => p.userId === currentUserId);
  const totalSplit = dealParticipants.reduce((s, p) => s + (p.splitPercent ?? 0), 0);
  const splitWarning = totalSplit > 100;

  if (splitWarning) {
    warnings.push(`Total participant splits exceed 100% (${totalSplit}%)`);
    confidenceMissing++;
  }

  let userShare: number;

  if (!myParticipant) {
    userShare = 0;
    warnings.push('No participant entry for agent');
    steps.push({ label: 'User split', value: 0, note: 'No participant entry' });
  } else {
    const splitPct = myParticipant.splitPercent ?? 0;
    if (splitPct <= 0 && (myParticipant.commissionOverride === undefined || myParticipant.commissionOverride === null)) {
      userShare = 0;
      warnings.push('Agent split is 0%');
      steps.push({ label: 'User split', value: 0, note: '0% split' });
    } else {
      userShare = baseCommission * (splitPct / 100);
      steps.push({ label: 'User split', value: clamp(Math.round(userShare)), note: `${splitPct}% of base` });
    }
  }

  // ── Step 4: Referral adjustments ───────────────────────────────────

  const referralOutPct = deal.referralFeePercent ?? 0;
  if (referralOutPct > 0) {
    const deduction = baseCommission * (referralOutPct / 100);
    userShare -= deduction;
    steps.push({ label: 'Referral out', value: clamp(Math.round(userShare)), note: `-${referralOutPct}% of base ($${Math.round(deduction).toLocaleString()})` });
  }

  // Referral in — not stored on deal yet, but support if present
  const referralInPct = (deal as any).referralInPercent ?? 0;
  if (referralInPct > 0) {
    const addition = baseCommission * (referralInPct / 100);
    userShare += addition;
    steps.push({ label: 'Referral in', value: clamp(Math.round(userShare)), note: `+${referralInPct}% of base ($${Math.round(addition).toLocaleString()})` });
  }

  userShare = clamp(userShare);

  // ── Step 5: Team split ─────────────────────────────────────────────

  const teamSplitPct = (deal as any).teamSplitPercent ?? 0;
  if (teamSplitPct > 0) {
    userShare *= (1 - teamSplitPct / 100);
    userShare = clamp(userShare);
    steps.push({ label: 'After team split', value: Math.round(userShare), note: `-${teamSplitPct}% team` });
  }

  // ── Step 6: Flat override ──────────────────────────────────────────

  if (myParticipant?.commissionOverride !== undefined && myParticipant.commissionOverride !== null && myParticipant.commissionOverride > 0) {
    userShare = myParticipant.commissionOverride;
    steps.push({ label: 'Flat override applied', value: clamp(Math.round(userShare)), note: `Override: $${myParticipant.commissionOverride.toLocaleString()}` });
  }

  const personalCommissionTotal = clamp(Math.round(userShare));
  steps.push({ label: 'Personal commission', value: personalCommissionTotal });

  // ── Step 7: Confidence ─────────────────────────────────────────────

  let confidenceLevel: ResolutionConfidence;
  const hasParticipant = !!myParticipant;

  if (!hasParticipant) {
    confidenceLevel = 'low';
  } else {
    // Check for missing data
    if (!deal.lastTouchedAt && !deal.createdAt) confidenceMissing++;
    const ms = deal.milestoneStatus;
    if (!ms || (ms.inspection === 'unknown' && ms.financing === 'unknown' && ms.appraisal === 'unknown')) confidenceMissing++;

    if (confidenceMissing === 0) confidenceLevel = 'high';
    else if (confidenceMissing === 1) confidenceLevel = 'medium';
    else confidenceLevel = 'low';
  }

  return {
    personalCommissionTotal,
    confidenceLevel,
    warnings,
    calculationDetails: steps,
    hasParticipant,
    splitWarning,
  };
}

// ── Memoized batch resolution ────────────────────────────────────────

const resolutionCache = new Map<string, { result: CommissionResolution; key: string }>();

function resolutionCacheKey(deal: Deal, participants: DealParticipant[], userId: string): string {
  const pKey = participants
    .filter(p => p.dealId === deal.id)
    .map(p => `${p.id}:${p.splitPercent}:${p.commissionOverride ?? ''}:${p.role}`)
    .join('|');
  return `${deal.id}:${deal.commission}:${deal.commissionRate ?? ''}:${deal.referralFeePercent ?? ''}:${deal.price}:${pKey}:${userId}`;
}

export function resolvePersonalCommissionCached(
  deal: Deal,
  allParticipants: DealParticipant[],
  userId: string,
): CommissionResolution {
  const key = resolutionCacheKey(deal, allParticipants, userId);
  const cached = resolutionCache.get(deal.id);
  if (cached && cached.key === key) return cached.result;

  const result = resolvePersonalCommission(deal, allParticipants, userId);
  resolutionCache.set(deal.id, { result, key });
  return result;
}
