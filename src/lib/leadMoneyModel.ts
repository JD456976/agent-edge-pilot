/**
 * Lead Money Model
 * 
 * Estimates personal commission potential from leads using
 * conservative defaults from user commission settings.
 * 
 * Powers the Opportunities Heating Up panel.
 */

import type { Lead } from '@/types';
import { clampNumber } from '@/lib/commissionResolver';
import { computeTagScoreAdjustment } from '@/lib/scoring';

// ── Types ────────────────────────────────────────────────────────────

export type LeadConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface LeadCommissionEstimate {
  estimatedPersonalCommission: number;
  confidence: LeadConfidence;
  inputsUsed: {
    assumedPrice?: number;
    assumedRate?: number;
    assumedSplit?: number;
  };
  warnings: string[];
}

export interface UserCommissionDefaults {
  typicalCommissionRate?: number;
  typicalSplitPct?: number;
  typicalReferralFeePct?: number;
  typicalPriceMid?: number;
}

export interface OpportunityHeatResult {
  leadId: string;
  opportunityScore: number;
  heatLevel: 'hot' | 'warm' | 'watch';
  estimate: LeadCommissionEstimate;
  opportunityValue: number;
  reasonPrimary: string;
  reasons: string[];
}

// ── Lead Commission Estimate ─────────────────────────────────────────

/**
 * Estimate commission for a lead. If a FUB preApprovalAmount is provided,
 * it's used as a stronger price signal than generic defaults — a pre-approved
 * buyer has bank-verified purchasing power.
 */
export function estimateLeadCommission(
  lead: Lead,
  userDefaults?: UserCommissionDefaults,
  fubPreApprovalAmount?: number | null,
): LeadCommissionEstimate {
  const warnings: string[] = [];
  let confidence: LeadConfidence = 'HIGH';
  let assumedPrice: number | undefined;
  let assumedRate: number | undefined;
  let assumedSplit: number | undefined;

  // Determine price — priority: explicit > preApproval > userDefault
  const explicitPrice = (lead as any).estimatedPrice ?? (lead as any).priceRangeMid ?? null;
  if (explicitPrice && explicitPrice > 0) {
    assumedPrice = explicitPrice;
  } else if (fubPreApprovalAmount && fubPreApprovalAmount > 0) {
    // Pre-approval is a bank-verified price signal — stronger than user defaults
    assumedPrice = fubPreApprovalAmount;
    confidence = 'MEDIUM';
    warnings.push(`Using FUB pre-approval amount ($${Math.round(fubPreApprovalAmount / 1000)}K)`);
  } else if (userDefaults?.typicalPriceMid && userDefaults.typicalPriceMid > 0) {
    assumedPrice = userDefaults.typicalPriceMid;
    confidence = 'MEDIUM';
  } else {
    warnings.push('No price estimate available');
    confidence = 'LOW';
    return {
      estimatedPersonalCommission: 0,
      confidence,
      inputsUsed: {},
      warnings,
    };
  }

  // Determine rate
  assumedRate = userDefaults?.typicalCommissionRate ?? 3;
  if (!userDefaults?.typicalCommissionRate) {
    warnings.push('Using default 3% commission rate');
  }

  // Determine split
  assumedSplit = userDefaults?.typicalSplitPct ?? 100;
  if (!userDefaults?.typicalSplitPct) {
    warnings.push('Using default 100% split');
  }

  const estimated = clampNumber(
    Math.round(assumedPrice * (assumedRate / 100) * (assumedSplit / 100))
  );

  return {
    estimatedPersonalCommission: estimated,
    confidence,
    inputsUsed: { assumedPrice, assumedRate, assumedSplit },
    warnings,
  };
}

// ── Opportunity Heat Score ────────────────────────────────────────────

function daysSince(dateStr: string | undefined | null, now: Date): number {
  if (!dateStr) return Infinity;
  return (now.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

export interface OpportunityScoringWeights {
  lead_hot_points?: number;
  lead_warm_points?: number;
  lead_new_48h_points?: number;
  engagement_points?: number;
  gap_2d_points?: number;
  gap_5d_points?: number;
  drift_new_lead_points?: number;
}

export function computeOpportunityHeatScore(
  lead: Lead,
  hasUpcomingTask: boolean,
  hasDriftSignal: boolean = false,
  now: Date = new Date(),
  weights?: OpportunityScoringWeights,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const w = {
    hot: weights?.lead_hot_points ?? 30,
    warm: weights?.lead_warm_points ?? 15,
    new48h: weights?.lead_new_48h_points ?? 20,
    engagement: weights?.engagement_points ?? 15,
    gap2d: weights?.gap_2d_points ?? 15,
    gap5d: weights?.gap_5d_points ?? 25,
    drift: weights?.drift_new_lead_points ?? 20,
  };

  // Intent: temperature
  if (lead.leadTemperature === 'hot') {
    score += w.hot;
    reasons.push(`Hot lead (+${w.hot})`);
  } else if (lead.leadTemperature === 'warm') {
    score += w.warm;
    reasons.push(`Warm lead (+${w.warm})`);
  }

  // FUB tag-based intent boost (if tags available on lead via statusTags)
  if (lead.statusTags && lead.statusTags.length > 0) {
    const { adjustment, matchedTags } = computeTagScoreAdjustment(lead.statusTags);
    if (adjustment !== 0) {
      score += adjustment;
      reasons.push(`FUB tags: ${matchedTags.join(', ')} (${adjustment > 0 ? '+' : ''}${adjustment})`);
    }
  }

  // Intent: new lead
  const daysSinceCreated = daysSince(lead.createdAt, now);
  if (daysSinceCreated < 2) {
    score += w.new48h;
    reasons.push(`New lead (< 48h) (+${w.new48h})`);
  }

  // Intent: engagement
  if (lead.engagementScore > 0) {
    score += w.engagement;
    reasons.push(`Engagement signals present (+${w.engagement})`);
  }

  // Intent: returning activity
  const daysSinceActivity = daysSince(lead.lastActivityAt, now);
  const daysSinceContact = daysSince(lead.lastContactAt, now);
  if (daysSinceActivity < 1 && daysSinceContact > 5) {
    score += w.engagement;
    reasons.push(`Returned after ${Math.round(daysSinceContact)} days`);
  }

  // Responsiveness gap
  if (!hasUpcomingTask) {
    const touchDays = Math.min(daysSinceActivity, daysSinceContact);
    if (touchDays > 5) {
      score += w.gap5d;
      reasons.push(`No follow-up, ${Math.round(touchDays)}d since contact (+${w.gap5d})`);
    } else if (touchDays > 2) {
      score += w.gap2d;
      reasons.push(`No upcoming task scheduled (+${w.gap2d})`);
    }
  }

  // Drift signal
  if (hasDriftSignal) {
    score += w.drift;
    reasons.push(`New data available from CRM (+${w.drift})`);
  }

  // Recent touch boost (within 24h adds +10)
  const lastTouched = (lead as any).lastTouchedAt;
  if (lastTouched) {
    const hoursSinceTouch = (now.getTime() - new Date(lastTouched).getTime()) / (1000 * 60 * 60);
    if (hoursSinceTouch <= 24) {
      score += 10;
      reasons.push('Recent touch within 24h (+10)');
    }
  }

  return {
    score: clampNumber(score, 0, 100),
    reasons,
  };
}

// ── Opportunity Heat Level ───────────────────────────────────────────

export function heatLevel(score: number): 'hot' | 'warm' | 'watch' {
  if (score >= 60) return 'hot';
  if (score >= 30) return 'warm';
  return 'watch';
}

// ── Batch computation ────────────────────────────────────────────────

export function computeOpportunityBatch(
  leads: Lead[],
  tasks: { relatedLeadId?: string; completedAt?: string }[],
  userDefaults?: UserCommissionDefaults,
  now: Date = new Date(),
  weights?: OpportunityScoringWeights,
): OpportunityHeatResult[] {
  // Build set of leads with upcoming tasks
  const leadsWithTasks = new Set<string>();
  tasks.forEach(t => {
    if (t.relatedLeadId && !t.completedAt) {
      leadsWithTasks.add(t.relatedLeadId);
    }
  });

  return leads.map(lead => {
    const hasTask = leadsWithTasks.has(lead.id);
    const { score, reasons } = computeOpportunityHeatScore(lead, hasTask, false, now, weights);
    const estimate = estimateLeadCommission(lead, userDefaults);
    const opportunityValue = clampNumber(
      Math.round(estimate.estimatedPersonalCommission * (score / 100))
    );

    return {
      leadId: lead.id,
      opportunityScore: score,
      heatLevel: heatLevel(score),
      estimate,
      opportunityValue,
      reasonPrimary: reasons[0] || 'Opportunity detected',
      reasons,
    };
  })
  .sort((a, b) => {
    if (b.opportunityValue !== a.opportunityValue) return b.opportunityValue - a.opportunityValue;
    if (b.opportunityScore !== a.opportunityScore) return b.opportunityScore - a.opportunityScore;
    return 0;
  });
}
