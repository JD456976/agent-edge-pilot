/**
 * Prepared Actions Engine — proactively generates execution-ready action
 * packages from intelligence signals. Read-only, deterministic, null-safe.
 * Does NOT auto-send anything; everything requires agent confirmation.
 */

import type { Deal, Lead, Task, TaskType } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import {
  buildExecutionContext,
  composeCommunication,
  generateCallBrief,
  anticipateObjections,
  detectStagnation,
  detectRelationshipOpportunities,
  type ExecutionContext,
  type CommunicationDraft,
  type CallBrief,
  type ObjectionEntry,
  type ConfidenceLevel,
} from '@/lib/executionEngine';

// ── Types ────────────────────────────────────────────────────────────

export type AutonomyLevel = 'minimal' | 'balanced' | 'aggressive';

export type PackageType = 'call' | 'text' | 'email' | 'follow_up' | 'recovery';

export interface PreparedAction {
  id: string;
  entityId: string;
  entityType: 'deal' | 'lead';
  entityName: string;
  packageType: PackageType;
  recommendedAction: string;
  reason: string;
  confidence: ConfidenceLevel;
  timeSensitivity: 'urgent' | 'today' | 'this_week';
  signals: string[];
  value: number;
  executionContext: ExecutionContext;
  draft: CommunicationDraft;
  callBrief: CallBrief | null;
  objections: ObjectionEntry[];
}

export interface PreparedActionFeedback {
  actionId: string;
  rating: 'yes' | 'somewhat' | 'no';
  timestamp: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function daysSince(dateStr: string | undefined | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function makeId(entityType: string, entityId: string, pkg: string): string {
  return `prep-${entityType}-${entityId}-${pkg}`;
}

// ── Core Generator ───────────────────────────────────────────────────

export function generatePreparedActions(
  deals: Deal[],
  leads: Lead[],
  tasks: Task[],
  moneyResults: MoneyModelResult[],
  opportunityResults: OpportunityHeatResult[],
  autonomyLevel: AutonomyLevel = 'balanced',
): PreparedAction[] {
  const actions: PreparedAction[] = [];

  // ── Deals at risk → Recovery packages
  const activeDeals = deals.filter(d => d.stage !== 'closed');
  for (const deal of activeDeals) {
    const mr = moneyResults.find(r => r.dealId === deal.id);
    if (!mr) continue;

    const isUrgent = mr.riskScore >= 70;
    const isModerate = mr.riskScore >= 40;

    if (autonomyLevel === 'minimal' && !isUrgent) continue;
    if (autonomyLevel === 'balanced' && !isModerate) continue;

    const ctx = buildExecutionContext(deal, 'deal', mr, null, tasks);
    const contextDetails = ctx.riskSignals.length > 0
      ? `Current concerns: ${ctx.riskSignals.join(', ')}`
      : `Stage: ${deal.stage}`;
    const draft = composeCommunication(ctx.intent, ctx.entityName, contextDetails);
    const brief = generateCallBrief(deal, 'deal', mr, null);
    const objs = anticipateObjections(deal, 'deal');

    const signals: string[] = [];
    if (mr.riskScore >= 70) signals.push('High risk score');
    if (deal.riskFlags?.length) signals.push(...deal.riskFlags.slice(0, 2));
    if (deal.milestoneStatus?.inspection === 'unknown') signals.push('Inspection not scheduled');
    if (deal.milestoneStatus?.financing === 'unknown') signals.push('Financing unknown');

    const stagnant = daysSince(deal.lastTouchedAt);
    if (stagnant >= 7) signals.push(`No contact in ${stagnant} days`);

    actions.push({
      id: makeId('deal', deal.id, isUrgent ? 'recovery' : 'follow_up'),
      entityId: deal.id,
      entityType: 'deal',
      entityName: deal.title,
      packageType: isUrgent ? 'recovery' : 'follow_up',
      recommendedAction: isUrgent
        ? `Generate recovery plan for ${deal.title}`
        : `Follow up on ${deal.title}`,
      reason: mr.reasonPrimary || 'Deal needs attention',
      confidence: ctx.confidence.level,
      timeSensitivity: isUrgent ? 'urgent' : 'today',
      signals,
      value: mr.personalCommissionAtRisk,
      executionContext: ctx,
      draft,
      callBrief: brief,
      objections: objs,
    });
  }

  // ── Hot/warm leads → Engagement packages
  for (const lead of leads) {
    const opp = opportunityResults.find(r => r.leadId === lead.id);
    const isHot = lead.leadTemperature === 'hot';
    const isWarm = lead.leadTemperature === 'warm';
    const stagnant = daysSince(lead.lastTouchedAt || lead.lastContactAt);

    if (autonomyLevel === 'minimal' && !isHot) continue;
    if (autonomyLevel === 'balanced' && !isHot && !isWarm) continue;

    const needsAction = (isHot && stagnant >= 2) || (isWarm && stagnant >= 5) ||
      (autonomyLevel === 'aggressive' && stagnant >= 3);

    if (!needsAction) continue;

    const ctx = buildExecutionContext(lead, 'lead', null, opp, tasks);
    const contextDetails = opp?.reasonPrimary || `Last contact: ${stagnant} days ago`;
    const draft = composeCommunication(ctx.intent, ctx.entityName, contextDetails);
    const brief = generateCallBrief(lead, 'lead', null, opp);
    const objs = anticipateObjections(lead, 'lead');

    const signals: string[] = [];
    if (isHot) signals.push('Hot lead');
    if (isWarm) signals.push('Warm lead');
    if (stagnant >= 5) signals.push(`No contact in ${stagnant} days`);
    if (lead.engagementScore >= 60) signals.push('High engagement');
    if (lead.source?.toLowerCase().includes('referral')) signals.push('Referral source');

    const pkgType: PackageType = isHot ? 'call' : stagnant >= 7 ? 'email' : 'text';

    actions.push({
      id: makeId('lead', lead.id, pkgType),
      entityId: lead.id,
      entityType: 'lead',
      entityName: lead.name,
      packageType: pkgType,
      recommendedAction: isHot
        ? `Call ${lead.name} — hot lead re-engaged`
        : `Send follow-up to ${lead.name}`,
      reason: isHot
        ? `Hot lead with ${stagnant}-day gap`
        : opp?.reasonPrimary || `No contact in ${stagnant} days`,
      confidence: ctx.confidence.level,
      timeSensitivity: isHot ? 'urgent' : stagnant >= 7 ? 'today' : 'this_week',
      signals,
      value: opp?.opportunityValue ?? 0,
      executionContext: ctx,
      draft,
      callBrief: brief,
      objections: objs,
    });
  }

  // ── Income protection: dormant leads (aggressive only)
  if (autonomyLevel === 'aggressive') {
    const dormant = detectRelationshipOpportunities(leads);
    for (const opp of dormant.slice(0, 3)) {
      const lead = leads.find(l => l.id === opp.leadId);
      if (!lead) continue;
      // Skip if already prepared above
      if (actions.some(a => a.entityId === lead.id)) continue;

      const ctx = buildExecutionContext(lead, 'lead', null, null, tasks);
      const draft = composeCommunication('stabilize_relationship', lead.name, opp.reason);

      actions.push({
        id: makeId('lead', lead.id, 'email'),
        entityId: lead.id,
        entityType: 'lead',
        entityName: lead.name,
        packageType: 'email',
        recommendedAction: `Re-engage ${lead.name}`,
        reason: opp.reason,
        confidence: 'LOW',
        timeSensitivity: 'this_week',
        signals: [`No contact in ${opp.lastContactDays} days`, 'Dormant relationship'],
        value: 0,
        executionContext: ctx,
        draft,
        callBrief: null,
        objections: [],
      });
    }
  }

  // Sort: urgent first, then by value
  return actions.sort((a, b) => {
    const urgencyOrder = { urgent: 0, today: 1, this_week: 2 };
    const urgDiff = urgencyOrder[a.timeSensitivity] - urgencyOrder[b.timeSensitivity];
    if (urgDiff !== 0) return urgDiff;
    return b.value - a.value;
  });
}

// ── Feedback persistence (localStorage) ──────────────────────────────

const FEEDBACK_KEY = 'dp-prepared-action-feedback';
const DISMISSED_KEY = 'dp-prepared-action-dismissed';
const AUTONOMY_KEY = 'dp-autonomy-level';

export function saveFeedback(feedback: PreparedActionFeedback): void {
  try {
    const existing: PreparedActionFeedback[] = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]');
    existing.push(feedback);
    // Keep last 100
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(existing.slice(-100)));
  } catch { }
}

export function getFeedbackStats(): { total: number; positive: number; neutral: number; negative: number } {
  try {
    const items: PreparedActionFeedback[] = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]');
    return {
      total: items.length,
      positive: items.filter(f => f.rating === 'yes').length,
      neutral: items.filter(f => f.rating === 'somewhat').length,
      negative: items.filter(f => f.rating === 'no').length,
    };
  } catch {
    return { total: 0, positive: 0, neutral: 0, negative: 0 };
  }
}

export function dismissAction(actionId: string): void {
  try {
    const dismissed: string[] = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    if (!dismissed.includes(actionId)) {
      dismissed.push(actionId);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed.slice(-200)));
    }
  } catch { }
}

export function getDismissedIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function getAutonomyLevel(): AutonomyLevel {
  try {
    const v = localStorage.getItem(AUTONOMY_KEY);
    if (v === 'minimal' || v === 'balanced' || v === 'aggressive') return v;
  } catch { }
  return 'balanced';
}

export function setAutonomyLevel(level: AutonomyLevel): void {
  localStorage.setItem(AUTONOMY_KEY, level);
}
