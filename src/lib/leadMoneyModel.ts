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

export function estimateLeadCommission(
  lead: Lead,
  userDefaults?: UserCommissionDefaults,
): LeadCommissionEstimate {
  const warnings: string[] = [];
  let confidence: LeadConfidence = 'HIGH';
  let assumedPrice: number | undefined;
  let assumedRate: number | undefined;
  let assumedSplit: number | undefined;

  // Determine price
  const explicitPrice = (lead as any).estimatedPrice ?? (lead as any).priceRangeMid ?? null;
  if (explicitPrice && explicitPrice > 0) {
    assumedPrice = explicitPrice;
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

export function computeOpportunityHeatScore(
  lead: Lead,
  hasUpcomingTask: boolean,
  hasDriftSignal: boolean = false,
  now: Date = new Date(),
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Intent: temperature
  if (lead.leadTemperature === 'hot') {
    score += 30;
    reasons.push('Hot lead');
  } else if (lead.leadTemperature === 'warm') {
    score += 15;
    reasons.push('Warm lead');
  }

  // Intent: new lead
  const daysSinceCreated = daysSince(lead.createdAt, now);
  if (daysSinceCreated < 2) {
    score += 20;
    reasons.push('New lead (< 48h)');
  }

  // Intent: engagement
  if (lead.engagementScore > 0) {
    score += 15;
    reasons.push('Engagement signals present');
  }

  // Intent: returning activity
  const daysSinceActivity = daysSince(lead.lastActivityAt, now);
  const daysSinceContact = daysSince(lead.lastContactAt, now);
  if (daysSinceActivity < 1 && daysSinceContact > 5) {
    score += 15;
    reasons.push(`Returned after ${Math.round(daysSinceContact)} days`);
  }

  // Responsiveness gap
  if (!hasUpcomingTask) {
    const touchDays = Math.min(daysSinceActivity, daysSinceContact);
    if (touchDays > 5) {
      score += 25;
      reasons.push(`No follow-up, ${Math.round(touchDays)}d since contact`);
    } else if (touchDays > 2) {
      score += 15;
      reasons.push('No upcoming task scheduled');
    }
  }

  // Drift signal
  if (hasDriftSignal) {
    score += 20;
    reasons.push('New data available from CRM');
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
    const { score, reasons } = computeOpportunityHeatScore(lead, hasTask, false, now);
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
