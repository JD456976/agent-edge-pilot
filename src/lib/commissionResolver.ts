/**
 * Personal Commission Resolution Engine (Money Brain)
 *
 * Computes the agent's actual personal commission per deal using the
 * Deal Commission Editor data and participant system.
 *
 * Calculation order (deterministic):
 *   1. Determine commission base (percentage / flat / custom)
 *   2. Side logic (informational only for v1)
 *   3. Participant splits
 *   4. Referral adjustments (out then in)
 *   5. Team split multiplier
 *   6. Flat / commission override (highest priority)
 *
 * Example cases (inline):
 *   - $500K deal, 3% rate, 60% split → base $15K, user $9K
 *   - Same deal with 25% referral out → $9K - $3.75K = $5.25K
 *   - Same with 80% team split → $5.25K × 0.80 = $4.2K
 *   - Flat override $3K → final $3K regardless
 */

import type { Deal, DealParticipant } from '@/types';

// ── Types ────────────────────────────────────────────────────────────

export type ResolutionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type CommissionType = 'percentage' | 'flat' | 'custom';

export interface CommissionResolutionDetails {
  baseCommission: number;
  commissionType: CommissionType;
  dealPrice?: number;
  commissionRate?: number;
  flatAmount?: number;
  customAmount?: number;
  userSplitPct?: number;
  referralOutPct?: number;
  referralInPct?: number;
  teamSplitPct?: number;
  flatOverride?: number;
  appliedSteps: string[];
}

export interface CommissionResolution {
  personalCommissionTotal: number;
  confidence: ResolutionConfidence;
  warnings: string[];
  details: CommissionResolutionDetails;
  /** @deprecated Use `confidence` instead */
  confidenceLevel: ResolutionConfidence;
  /** @deprecated Use `details.appliedSteps` instead */
  calculationDetails: { label: string; value: number; note?: string }[];
  hasParticipant: boolean;
  splitWarning: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

export function clampNumber(
  n: number,
  min: number = 0,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isFinite(n) || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// ── Main Resolution Function ─────────────────────────────────────────

export function resolvePersonalCommission(
  deal: Deal,
  allParticipants: DealParticipant[],
  currentUserId: string,
): CommissionResolution {
  const warnings: string[] = [];
  const steps: { label: string; value: number; note?: string }[] = [];
  const appliedSteps: string[] = [];
  let confidenceDowngrades = 0;

  // ── Step 1: Determine commission base ──────────────────────────────

  const hasRate = deal.commissionRate !== undefined && deal.commissionRate !== null && deal.commissionRate > 0;
  let baseCommission: number;
  let commissionType: CommissionType;
  let detailRate: number | undefined;
  let detailFlat: number | undefined;
  let detailCustom: number | undefined;

  if (hasRate) {
    commissionType = 'percentage';
    detailRate = deal.commissionRate!;
    if (!deal.price || deal.price <= 0) {
      warnings.push('Missing deal price for percentage commission');
      confidenceDowngrades++;
    }
    baseCommission = clampNumber(Math.round((deal.price || 0) * (deal.commissionRate! / 100)));
    appliedSteps.push(`Base = ${deal.price} × ${deal.commissionRate}% = ${baseCommission}`);
    steps.push({ label: 'Base commission', value: baseCommission, note: `${deal.commissionRate}% of $${(deal.price || 0).toLocaleString()}` });
  } else if (deal.commission > 0) {
    commissionType = 'flat';
    detailFlat = deal.commission;
    baseCommission = clampNumber(deal.commission);
    appliedSteps.push(`Base = flat $${baseCommission}`);
    steps.push({ label: 'Base commission', value: baseCommission, note: 'Flat / stored amount' });
  } else {
    commissionType = 'percentage'; // default assumption
    baseCommission = 0;
    confidenceDowngrades++;
    warnings.push('Commission base is $0');
    appliedSteps.push('Base = $0 (no rate or amount set)');
    steps.push({ label: 'Base commission', value: 0, note: 'Unknown — no rate or amount' });
  }

  baseCommission = clampNumber(baseCommission);

  // ── Step 2: Side logic (informational only) ────────────────────────

  const side = (deal as any).side || 'buy';
  appliedSteps.push(`Side: ${side} (informational)`);
  steps.push({ label: 'Side', value: baseCommission, note: `${side} side (informational)` });

  // ── Step 3: Find participant + apply splits ────────────────────────

  const dealParticipants = allParticipants.filter(p => p.dealId === deal.id);
  const myParticipant = dealParticipants.find(p => p.userId === currentUserId);
  const totalSplit = dealParticipants.reduce((s, p) => s + (p.splitPercent ?? 0), 0);
  const splitWarning = totalSplit > 100;

  if (splitWarning) {
    warnings.push(`Total participant splits exceed 100% (${totalSplit}%)`);
    confidenceDowngrades++;
  }

  let userShare: number;
  let userSplitPct: number | undefined;

  if (!myParticipant) {
    userShare = 0;
    warnings.push('No participant entry for this agent');
    appliedSteps.push('No participant entry → $0');
    steps.push({ label: 'User split', value: 0, note: 'No participant entry' });

    // Return early with LOW confidence
    const details: CommissionResolutionDetails = {
      baseCommission,
      commissionType,
      dealPrice: deal.price || undefined,
      commissionRate: detailRate,
      flatAmount: detailFlat,
      customAmount: detailCustom,
      appliedSteps,
    };
    const result: CommissionResolution = {
      personalCommissionTotal: 0,
      confidence: 'LOW',
      confidenceLevel: 'LOW',
      warnings,
      details,
      calculationDetails: steps,
      hasParticipant: false,
      splitWarning,
    };
    return result;
  }

  const splitPct = myParticipant.splitPercent ?? 0;
  userSplitPct = splitPct;

  if (splitPct === null || splitPct === undefined || splitPct <= 0) {
    if ((myParticipant.commissionOverride === undefined || myParticipant.commissionOverride === null) || myParticipant.commissionOverride <= 0) {
      userShare = 0;
      warnings.push('Agent split is 0% (no personal commission assigned)');
      confidenceDowngrades++;
      appliedSteps.push('Split 0% → $0');
      steps.push({ label: 'User split', value: 0, note: '0% split' });
    } else {
      userShare = 0; // will be overridden below
      warnings.push('Missing split percent for agent');
      confidenceDowngrades++;
      appliedSteps.push('Split missing, override will apply');
      steps.push({ label: 'User split', value: 0, note: 'Missing split, override pending' });
    }
  } else {
    userShare = baseCommission * (splitPct / 100);
    appliedSteps.push(`Split: ${baseCommission} × ${splitPct}% = ${Math.round(userShare)}`);
    steps.push({ label: 'User split', value: clampNumber(Math.round(userShare)), note: `${splitPct}% of base` });
  }

  // ── Step 4: Referral adjustments ───────────────────────────────────

  const referralOutPct = deal.referralFeePercent ?? 0;
  let detailRefOut: number | undefined;
  let detailRefIn: number | undefined;

  if (referralOutPct > 0) {
    detailRefOut = referralOutPct;
    const deduction = baseCommission * (referralOutPct / 100);
    userShare -= deduction;
    userShare = clampNumber(userShare);
    appliedSteps.push(`Referral out: -${referralOutPct}% of base ($${Math.round(deduction)})`);
    steps.push({ label: 'Referral out', value: clampNumber(Math.round(userShare)), note: `-${referralOutPct}% of base ($${Math.round(deduction).toLocaleString()})` });
  }

  const referralInPct = (deal as any).referralInPercent ?? 0;
  if (referralInPct > 0) {
    detailRefIn = referralInPct;
    const addition = baseCommission * (referralInPct / 100);
    userShare += addition;
    userShare = clampNumber(userShare);
    appliedSteps.push(`Referral in: +${referralInPct}% of base ($${Math.round(addition)})`);
    steps.push({ label: 'Referral in', value: clampNumber(Math.round(userShare)), note: `+${referralInPct}% of base ($${Math.round(addition).toLocaleString()})` });
  }

  // ── Step 5: Team split ─────────────────────────────────────────────

  const teamSplitPct = (deal as any).teamSplitPercent ?? 0;
  let detailTeam: number | undefined;

  if (teamSplitPct > 0 && teamSplitPct < 100) {
    detailTeam = teamSplitPct;
    userShare *= (teamSplitPct / 100);
    userShare = clampNumber(userShare);
    appliedSteps.push(`Team split: × ${teamSplitPct}% = $${Math.round(userShare)}`);
    steps.push({ label: 'After team split', value: Math.round(userShare), note: `${teamSplitPct}% team` });
  }

  // ── Step 6: Overrides (highest priority) ───────────────────────────

  let detailFlatOverride: number | undefined;

  if (myParticipant.commissionOverride !== undefined && myParticipant.commissionOverride !== null && myParticipant.commissionOverride > 0) {
    detailFlatOverride = myParticipant.commissionOverride;
    userShare = myParticipant.commissionOverride;
    appliedSteps.push(`Override applied: $${myParticipant.commissionOverride}`);
    steps.push({ label: 'Override applied', value: clampNumber(Math.round(userShare)), note: `Override: $${myParticipant.commissionOverride.toLocaleString()}` });
  }

  const personalCommissionTotal = clampNumber(Math.round(userShare));
  appliedSteps.push(`Final: $${personalCommissionTotal}`);
  steps.push({ label: 'Personal commission', value: personalCommissionTotal });

  // ── Step 7: Confidence ─────────────────────────────────────────────

  let confidence: ResolutionConfidence;

  if (confidenceDowngrades === 0) {
    confidence = 'HIGH';
  } else if (confidenceDowngrades === 1) {
    confidence = 'MEDIUM';
  } else {
    confidence = 'LOW';
  }

  // Build details
  const details: CommissionResolutionDetails = {
    baseCommission,
    commissionType,
    dealPrice: deal.price || undefined,
    commissionRate: detailRate,
    flatAmount: detailFlat,
    customAmount: detailCustom,
    userSplitPct,
    referralOutPct: detailRefOut,
    referralInPct: detailRefIn,
    teamSplitPct: detailTeam,
    flatOverride: detailFlatOverride,
    appliedSteps,
  };

  return {
    personalCommissionTotal,
    confidence,
    confidenceLevel: confidence, // deprecated alias
    warnings,
    details,
    calculationDetails: steps, // deprecated alias
    hasParticipant: true,
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
