/**
 * Execution Engine — generates drafts, call briefs, objections, follow-ups,
 * momentum signals, and relationship opportunities from existing data.
 * Read-only, deterministic, null-safe. No model modifications.
 */

import type { Deal, Lead, Task, TaskType } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';

// ── Types ────────────────────────────────────────────────────────────

export type ActionIntent =
  | 'reengage_lead'
  | 'follow_up_deal'
  | 'recover_client'
  | 'advance_opportunity'
  | 'stabilize_relationship'
  | 'schedule_showing'
  | 'price_discussion'
  | 'inspection_followup';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CommunicationDraft {
  sms: string;
  email: { subject: string; body: string };
  callPoints: string[];
}

export interface CallBrief {
  who: string;
  status: string;
  whyNow: string;
  keyRisks: string[];
  desiredOutcome: string;
  conversationFlow: string[];
}

export interface ObjectionEntry {
  objection: string;
  response: string;
  confidence: ConfidenceLevel;
}

export interface FollowUpSuggestion {
  contactType: TaskType;
  timing: string;
  dueAt: string;
  title: string;
  draft: string;
}

export interface MomentumSignal {
  entityId: string;
  entityType: 'deal' | 'lead';
  title: string;
  signal: string;
  suggestedAction: string;
  daysStagnant: number;
}

export interface RelationshipOpportunity {
  leadId: string;
  name: string;
  reason: string;
  suggestedMessage: string;
  lastContactDays: number;
}

export interface ExecutionConfidence {
  level: ConfidenceLevel;
  reason: string;
  upside: number;
}

export interface ExecutionContext {
  intent: ActionIntent;
  entityName: string;
  entityType: 'deal' | 'lead';
  entityId: string;
  urgency: 'high' | 'medium' | 'low';
  value: number;
  stage?: string;
  riskSignals: string[];
  recentActivity?: string;
  temperature?: string;
  confidence: ExecutionConfidence;
}

// ── Helpers ──────────────────────────────────────────────────────────

function daysSince(dateStr: string | undefined | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function formatCurrency(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

// ── Action Intent Detection ──────────────────────────────────────────

export function detectActionIntent(
  entity: Deal | Lead,
  entityType: 'deal' | 'lead',
  moneyResult?: MoneyModelResult | null,
  oppResult?: OpportunityHeatResult | null,
): ActionIntent {
  if (entityType === 'deal') {
    const deal = entity as Deal;
    if (deal.milestoneStatus?.inspection === 'unknown') return 'inspection_followup';
    if (moneyResult && moneyResult.riskScore >= 60) return 'recover_client';
    if (deal.stage === 'offer') return 'follow_up_deal';
    return 'stabilize_relationship';
  }
  const lead = entity as Lead;
  if (lead.leadTemperature === 'hot' && daysSince(lead.lastTouchedAt) > 2) return 'reengage_lead';
  if (oppResult && oppResult.opportunityScore >= 50) return 'advance_opportunity';
  if (lead.source?.toLowerCase().includes('referral')) return 'advance_opportunity';
  return 'reengage_lead';
}

// ── Execution Confidence ─────────────────────────────────────────────

export function computeExecutionConfidence(
  entityType: 'deal' | 'lead',
  entity: Deal | Lead,
  moneyResult?: MoneyModelResult | null,
  oppResult?: OpportunityHeatResult | null,
  tasks?: Task[],
): ExecutionConfidence {
  let level: ConfidenceLevel = 'MEDIUM';
  const reasons: string[] = [];
  let upside = 0;

  if (entityType === 'deal') {
    const deal = entity as Deal;
    upside = moneyResult?.personalCommissionAtRisk ?? deal.commission;
    if (moneyResult && moneyResult.riskScore >= 70) {
      level = 'HIGH';
      reasons.push('High risk score requires immediate action');
    } else if (moneyResult && moneyResult.riskScore >= 40) {
      level = 'MEDIUM';
      reasons.push('Moderate risk — action recommended');
    } else {
      level = 'LOW';
      reasons.push('Low risk — maintenance action');
    }
    const dealTasks = tasks?.filter(t => t.relatedDealId === deal.id && !t.completedAt) || [];
    if (dealTasks.some(t => new Date(t.dueAt) < new Date())) {
      level = 'HIGH';
      reasons.push('Overdue tasks on this deal');
    }
  } else {
    const lead = entity as Lead;
    upside = oppResult?.opportunityValue ?? 0;
    if (lead.leadTemperature === 'hot' && lead.engagementScore >= 60) {
      level = 'HIGH';
      reasons.push('Hot lead with high engagement');
    } else if (lead.leadTemperature === 'warm') {
      level = 'MEDIUM';
      reasons.push('Warm lead — needs nurturing');
    } else {
      level = 'LOW';
      reasons.push('Standard outreach');
    }
  }

  return { level, reason: reasons[0] || 'Based on current signals', upside };
}

// ── Communication Drafts ─────────────────────────────────────────────

const INTENT_TEMPLATES: Record<ActionIntent, (name: string, context: string) => CommunicationDraft> = {
  reengage_lead: (name, ctx) => ({
    sms: `Hi ${name}, I wanted to check in and see how your search is going. Do you have a few minutes to connect today?`,
    email: {
      subject: `Checking in — ${name}`,
      body: `Hi ${name},\n\nI hope you're doing well. I wanted to follow up and see if there have been any changes to your timeline or needs.\n\n${ctx}\n\nI'm available to chat whenever it's convenient for you.\n\nBest regards`,
    },
    callPoints: [
      'Ask about current status and timeline',
      'Listen for any changes in needs or concerns',
      'Offer relevant updates or new options',
      'Propose specific next steps',
    ],
  }),
  follow_up_deal: (name, ctx) => ({
    sms: `Hi ${name}, just following up on our current transaction. Do you have any questions or anything I can help with?`,
    email: {
      subject: `Transaction Update — ${name}`,
      body: `Hi ${name},\n\nI wanted to provide a quick update on where we stand.\n\n${ctx}\n\nPlease let me know if you have any questions or concerns.\n\nBest regards`,
    },
    callPoints: [
      'Review current status of all contingencies',
      'Confirm upcoming deadlines',
      'Address any open questions',
      'Set clear expectations for next steps',
    ],
  }),
  recover_client: (name, ctx) => ({
    sms: `Hi ${name}, I want to make sure everything is on track. I have some updates to share — can we connect briefly today?`,
    email: {
      subject: `Important Update — ${name}`,
      body: `Hi ${name},\n\nI wanted to reach out because I want to make sure we're aligned on the current status.\n\n${ctx}\n\nI'd like to schedule a brief call to address any concerns and ensure everything stays on track.\n\nBest regards`,
    },
    callPoints: [
      'Acknowledge any delays or concerns proactively',
      'Share specific steps being taken to resolve issues',
      'Confirm commitment to their goals',
      'Set a follow-up checkpoint',
    ],
  }),
  advance_opportunity: (name, ctx) => ({
    sms: `Hi ${name}, I came across something that might be a great fit for what you're looking for. Do you have time for a quick conversation?`,
    email: {
      subject: `New Opportunity — ${name}`,
      body: `Hi ${name},\n\nI've been keeping an eye out for options that match your criteria, and I have some updates to share.\n\n${ctx}\n\nWould you be available for a brief call to discuss?\n\nBest regards`,
    },
    callPoints: [
      'Share specific listings or opportunities',
      'Connect to their stated preferences',
      'Gauge readiness and timeline',
      'Propose viewing or next step',
    ],
  }),
  stabilize_relationship: (name, ctx) => ({
    sms: `Hi ${name}, just a quick check-in. I'm here if you need anything — don't hesitate to reach out.`,
    email: {
      subject: `Quick Check-in — ${name}`,
      body: `Hi ${name},\n\nI hope all is well. I wanted to touch base and let you know I'm available if anything comes up.\n\n${ctx}\n\nWishing you the best.\n\nBest regards`,
    },
    callPoints: [
      'Casual check-in — no pressure',
      'Ask how things are going',
      'Mention availability',
      'Keep the door open for future needs',
    ],
  }),
  schedule_showing: (name, ctx) => ({
    sms: `Hi ${name}, I have some properties I'd love to show you. What does your schedule look like this week?`,
    email: {
      subject: `Showing Availability — ${name}`,
      body: `Hi ${name},\n\nI've identified some properties that match your criteria and I'd like to schedule showings.\n\n${ctx}\n\nPlease let me know your availability this week.\n\nBest regards`,
    },
    callPoints: [
      'Review their criteria and any updates',
      'Present top 2-3 matching properties',
      'Propose specific showing times',
      'Confirm logistics and expectations',
    ],
  }),
  price_discussion: (name, ctx) => ({
    sms: `Hi ${name}, I'd like to discuss our current pricing strategy. Do you have a few minutes today?`,
    email: {
      subject: `Market Update & Strategy — ${name}`,
      body: `Hi ${name},\n\nI've been monitoring market activity and I'd like to review our current strategy together.\n\n${ctx}\n\nCan we schedule a brief call to discuss?\n\nBest regards`,
    },
    callPoints: [
      'Share relevant market data',
      'Review current interest and showing activity',
      'Discuss adjustment options',
      'Agree on strategy and timeline',
    ],
  }),
  inspection_followup: (name, ctx) => ({
    sms: `Hi ${name}, I wanted to follow up on the inspection status. Can we connect briefly to discuss next steps?`,
    email: {
      subject: `Inspection Follow-up — ${name}`,
      body: `Hi ${name},\n\nI wanted to check on the inspection status and make sure we're on track.\n\n${ctx}\n\nPlease let me know if there are any findings we should discuss.\n\nBest regards`,
    },
    callPoints: [
      'Confirm inspection status',
      'Review any findings or concerns',
      'Discuss resolution timeline',
      'Set expectations for next steps',
    ],
  }),
};

export function composeCommunication(
  intent: ActionIntent,
  entityName: string,
  contextDetails: string,
): CommunicationDraft {
  const template = INTENT_TEMPLATES[intent];
  return template(entityName, contextDetails);
}

// ── Call Brief ───────────────────────────────────────────────────────

export function generateCallBrief(
  entity: Deal | Lead,
  entityType: 'deal' | 'lead',
  moneyResult?: MoneyModelResult | null,
  oppResult?: OpportunityHeatResult | null,
): CallBrief {
  if (entityType === 'deal') {
    const deal = entity as Deal;
    const risks: string[] = deal.riskFlags?.slice(0, 3) || [];
    if (moneyResult && moneyResult.riskScore >= 60) risks.push(`Risk score: ${moneyResult.riskScore}/100`);
    if (deal.milestoneStatus?.financing === 'unknown') risks.push('Financing status unknown');
    if (deal.milestoneStatus?.inspection === 'unknown') risks.push('Inspection not scheduled');

    return {
      who: deal.title,
      status: `Stage: ${deal.stage} · Close: ${new Date(deal.closeDate).toLocaleDateString()}`,
      whyNow: moneyResult?.reasonPrimary || 'Scheduled follow-up',
      keyRisks: risks.length > 0 ? risks : ['No active risk flags'],
      desiredOutcome: moneyResult && moneyResult.riskScore >= 50
        ? 'Confirm deal is on track and resolve open risks'
        : 'Maintain momentum and confirm next milestones',
      conversationFlow: [
        'Open with status check',
        'Review outstanding items',
        risks.length > 0 ? 'Address risk factors directly' : 'Confirm all milestones on track',
        'Set clear next steps with dates',
        'Confirm follow-up timing',
      ],
    };
  }

  const lead = entity as Lead;
  return {
    who: lead.name,
    status: `Temperature: ${lead.leadTemperature || 'unknown'} · Source: ${lead.source} · Engagement: ${lead.engagementScore}`,
    whyNow: oppResult?.reasonPrimary || `Last contact: ${daysSince(lead.lastContactAt)} days ago`,
    keyRisks: daysSince(lead.lastContactAt) > 7
      ? ['Extended gap since last contact', 'Risk of losing momentum']
      : ['Standard follow-up timing'],
    desiredOutcome: lead.leadTemperature === 'hot'
      ? 'Move toward appointment or concrete next step'
      : 'Re-establish engagement and assess readiness',
    conversationFlow: [
      'Reference previous conversation or their stated needs',
      'Share relevant update or new option',
      'Listen for buying signals or objections',
      'Propose specific next step',
      'Confirm follow-up timing',
    ],
  };
}

// ── Objection Engine ─────────────────────────────────────────────────

export function anticipateObjections(
  entity: Deal | Lead,
  entityType: 'deal' | 'lead',
): ObjectionEntry[] {
  const objections: ObjectionEntry[] = [];

  if (entityType === 'deal') {
    const deal = entity as Deal;
    if (deal.stage === 'offer' || deal.stage === 'offer_accepted') {
      objections.push({
        objection: '"We need more time to decide"',
        response: 'I understand. Let me outline what happens next so you can make an informed decision on your timeline.',
        confidence: 'HIGH',
      });
    }
    if (deal.milestoneStatus?.financing === 'unknown') {
      objections.push({
        objection: '"We\'re still working on financing"',
        response: 'That\'s normal at this stage. I can connect you with a lender who can expedite the process if that would be helpful.',
        confidence: 'MEDIUM',
      });
    }
    objections.push({
      objection: '"The price seems high"',
      response: 'I hear you. Let me share some recent comparable sales that support the current pricing.',
      confidence: 'MEDIUM',
    });
  } else {
    const lead = entity as Lead;
    if (lead.leadTemperature === 'cold' || daysSince(lead.lastContactAt) > 14) {
      objections.push({
        objection: '"We\'re not looking right now"',
        response: 'No pressure at all. I\'d just like to stay in touch in case your situation changes. Is it okay if I check in periodically?',
        confidence: 'HIGH',
      });
    }
    objections.push({
      objection: '"We\'re working with someone else"',
      response: 'That\'s perfectly fine. If you ever want a second perspective, I\'m happy to help.',
      confidence: 'MEDIUM',
    });
    objections.push({
      objection: '"I need to talk to my spouse/partner first"',
      response: 'Absolutely. Would it be helpful if I prepared a summary of what we discussed that you can share with them?',
      confidence: 'HIGH',
    });
  }

  return objections.slice(0, 3);
}

// ── Follow-Up Generator ─────────────────────────────────────────────

export function generateFollowUp(
  entity: Deal | Lead,
  entityType: 'deal' | 'lead',
  completedActionType?: TaskType,
): FollowUpSuggestion {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  if (new Date().getHours() >= 20) {
    tomorrow.setDate(tomorrow.getDate() + 1);
  }

  if (entityType === 'deal') {
    const deal = entity as Deal;
    const isUrgent = daysSince(deal.closeDate) < 0 && Math.abs(daysSince(deal.closeDate)) < 7;
    return {
      contactType: completedActionType === 'call' ? 'email' : 'call',
      timing: isUrgent ? 'Tomorrow morning' : 'Within 2 days',
      dueAt: isUrgent ? tomorrow.toISOString() : new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      title: `Follow up: ${deal.title}`,
      draft: `Check in on ${deal.title} — confirm status of outstanding items and next milestones.`,
    };
  }

  const lead = entity as Lead;
  const isHot = lead.leadTemperature === 'hot';
  return {
    contactType: completedActionType === 'call' ? 'text' : 'call',
    timing: isHot ? 'Tomorrow' : 'Within 3 days',
    dueAt: isHot ? tomorrow.toISOString() : new Date(tomorrow.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    title: `Follow up with ${lead.name}`,
    draft: `Continue conversation with ${lead.name} — reference previous discussion and propose next step.`,
  };
}

// ── Momentum Builder ─────────────────────────────────────────────────

export function detectStagnation(
  deals: Deal[],
  leads: Lead[],
  tasks: Task[],
): MomentumSignal[] {
  const signals: MomentumSignal[] = [];
  const now = new Date();

  // Stagnant deals
  for (const deal of deals) {
    if (deal.stage === 'closed') continue;
    const stagnantDays = daysSince(deal.lastTouchedAt);
    if (stagnantDays >= 7) {
      signals.push({
        entityId: deal.id,
        entityType: 'deal',
        title: deal.title,
        signal: stagnantDays >= 14 ? 'No activity in 2+ weeks' : 'No activity in 7+ days',
        suggestedAction: 'Follow up to maintain momentum',
        daysStagnant: stagnantDays,
      });
    }
  }

  // Stagnant leads
  for (const lead of leads) {
    if (lead.leadTemperature === 'cold') continue;
    const stagnantDays = daysSince(lead.lastTouchedAt || lead.lastContactAt);
    const threshold = lead.leadTemperature === 'hot' ? 3 : 7;
    if (stagnantDays >= threshold) {
      signals.push({
        entityId: lead.id,
        entityType: 'lead',
        title: lead.name,
        signal: `${lead.leadTemperature} lead — no contact in ${stagnantDays} days`,
        suggestedAction: lead.leadTemperature === 'hot' ? 'Call immediately' : 'Send follow-up message',
        daysStagnant: stagnantDays,
      });
    }
  }

  return signals.sort((a, b) => b.daysStagnant - a.daysStagnant).slice(0, 8);
}

// ── Relationship Intelligence ────────────────────────────────────────

export function detectRelationshipOpportunities(
  leads: Lead[],
): RelationshipOpportunity[] {
  const opportunities: RelationshipOpportunity[] = [];
  const now = new Date();

  for (const lead of leads) {
    const lastContactDays = daysSince(lead.lastContactAt);

    // Past clients not contacted (30+ days, not actively engaged)
    if (lastContactDays >= 30 && lead.engagementScore < 20) {
      opportunities.push({
        leadId: lead.id,
        name: lead.name,
        reason: lastContactDays >= 90
          ? `No contact in ${Math.floor(lastContactDays / 30)} months — seasonal check-in`
          : 'Due for relationship maintenance',
        suggestedMessage: `Hi ${lead.name}, I hope you're doing well. I was thinking of you and wanted to check in. If there's anything I can help with, I'm always here.`,
        lastContactDays,
      });
    }
  }

  return opportunities.sort((a, b) => b.lastContactDays - a.lastContactDays).slice(0, 5);
}

// ── Build Full Execution Context ─────────────────────────────────────

export function buildExecutionContext(
  entity: Deal | Lead,
  entityType: 'deal' | 'lead',
  moneyResult?: MoneyModelResult | null,
  oppResult?: OpportunityHeatResult | null,
  tasks?: Task[],
): ExecutionContext {
  const intent = detectActionIntent(entity, entityType, moneyResult, oppResult);
  const confidence = computeExecutionConfidence(entityType, entity, moneyResult, oppResult, tasks);

  const riskSignals: string[] = [];
  let entityName = '';
  let value = 0;
  let stage: string | undefined;
  let urgency: 'high' | 'medium' | 'low' = 'medium';
  let temperature: string | undefined;

  if (entityType === 'deal') {
    const deal = entity as Deal;
    entityName = deal.title;
    value = moneyResult?.personalCommissionAtRisk ?? deal.commission;
    stage = deal.stage;
    if (deal.riskFlags) riskSignals.push(...deal.riskFlags.slice(0, 3));
    if (moneyResult && moneyResult.riskScore >= 70) urgency = 'high';
    else if (moneyResult && moneyResult.riskScore >= 40) urgency = 'medium';
    else urgency = 'low';
  } else {
    const lead = entity as Lead;
    entityName = lead.name;
    value = oppResult?.opportunityValue ?? 0;
    temperature = lead.leadTemperature || undefined;
    if (lead.leadTemperature === 'hot') urgency = 'high';
    else if (lead.leadTemperature === 'warm') urgency = 'medium';
    else urgency = 'low';
  }

  return {
    intent,
    entityName,
    entityType,
    entityId: entityType === 'deal' ? (entity as Deal).id : (entity as Lead).id,
    urgency,
    value,
    stage,
    riskSignals,
    temperature,
    confidence,
  };
}
