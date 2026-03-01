import type { Task, Lead, Deal, PriorityAction } from '@/types';
import type { FubPersonProfile } from '@/lib/intelAnalyzer';

// ── FUB Tag → Score Calibration ──────────────────────────────────────
// Agent-curated tags are high-signal intent indicators that should
// directly influence priority scoring and engagement calibration.

const TAG_SCORE_BOOSTS: Record<string, number> = {
  'buyer': 10,
  'seller': 10,
  'investor': 8,
  'hot': 15,
  'warm': 8,
  'cold': -5,
  'dp:cold': -5,
  'dp:hot': 15,
  'dp:warm': 8,
  'nurture': 3,
  'sphere': 5,
  'past_client': 5,
  'past client': 5,
  'first time': 8,
  'first-time': 8,
  'relocation': 10,
  'luxury': 12,
  'enrich': 5,
  'vip': 15,
  'high_maintenance': -12,
  'tire_kicker': -15,
  'difficult': -10,
  'unrealistic': -10,
  'price_sensitive': -6,
  'not_motivated': -8,
  'low_budget': -5,
  'motivated': 12,
  'serious': 10,
  'relocating': 12,
  'pre_approved': 15,
  'cash_buyer': 18,
  'repeat_client': 10,
  'referral': 8,
};

/**
 * Calculate a score adjustment from FUB tags.
 * Returns a bonus (positive) or penalty (negative) to add to priority score.
 */
export function computeTagScoreAdjustment(tags: string[]): { adjustment: number; matchedTags: string[] } {
  let adjustment = 0;
  const matchedTags: string[] = [];
  
  for (const tag of tags) {
    const normalized = tag.toLowerCase().trim();
    for (const [pattern, boost] of Object.entries(TAG_SCORE_BOOSTS)) {
      if (normalized === pattern || normalized.includes(pattern)) {
        adjustment += boost;
        matchedTags.push(tag);
        break; // Only match one pattern per tag
      }
    }
  }
  
  return { adjustment: Math.max(-10, Math.min(30, adjustment)), matchedTags };
}

export function calculatePriorityScore(task: Task, lead?: Lead, deal?: Deal): number {
  let score = 0;
  const now = new Date();

  // Guard: missing or invalid dueAt
  const dueAt = task.dueAt ? new Date(task.dueAt) : null;
  if (!dueAt || isNaN(dueAt.getTime())) {
    // No due date — treat as moderate priority
    score += 10;
  } else {
    const hoursUntilDue = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Urgency
    if (hoursUntilDue < 0) score += 40;
    else if (hoursUntilDue < 4) score += 30;
    else if (hoursUntilDue < 24) score += 20;
    else if (hoursUntilDue < 48) score += 10;
  }

  // Revenue impact (guard: missing price/commission)
  if (deal) {
    const commission = deal.userCommission ?? deal.commission ?? 0;
    score += Math.min(Number.isFinite(commission) ? commission / 1000 : 0, 25);
  }

  // Decay risk (guard: missing lastContactAt)
  if (lead) {
    if (lead.lastContactAt) {
      const contactDate = new Date(lead.lastContactAt);
      if (!isNaN(contactDate.getTime())) {
        const daysSinceContact = (now.getTime() - contactDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceContact > 7) score += 15;
        else if (daysSinceContact > 3) score += 10;
        else if (daysSinceContact > 1) score += 5;
      }
    }

    score += (lead.engagementScore ?? 0) / 10;
  }

  return Math.round(score);
}

export function generatePriorityActions(
  tasks: Task[],
  leads: Lead[],
  deals: Deal[]
): PriorityAction[] {
  const leadMap = new Map(leads.map(l => [l.id, l]));
  const dealMap = new Map(deals.map(d => [d.id, d]));

  const incompleteTasks = tasks.filter(t => !t.completedAt);

  const actions: PriorityAction[] = incompleteTasks.map(task => {
    const lead = task.relatedLeadId ? leadMap.get(task.relatedLeadId) : undefined;
    const deal = task.relatedDealId ? dealMap.get(task.relatedDealId) : undefined;
    const score = calculatePriorityScore(task, lead, deal);

    const now = new Date();
    const dueAt = task.dueAt ? new Date(task.dueAt) : null;
    const hoursUntilDue = dueAt && !isNaN(dueAt.getTime())
      ? (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60)
      : null;

    let timeWindow = '';
    if (hoursUntilDue === null) timeWindow = 'No due date';
    else if (hoursUntilDue < 0) timeWindow = 'Overdue';
    else if (hoursUntilDue < 1) timeWindow = 'Due now';
    else if (hoursUntilDue < 4) timeWindow = `Due in ${Math.round(hoursUntilDue)}h`;
    else if (hoursUntilDue < 24) timeWindow = 'Due today';
    else if (hoursUntilDue < 48) timeWindow = 'Due tomorrow';
    else timeWindow = `Due in ${Math.round(hoursUntilDue / 24)}d`;

    let reason = '';
    if (hoursUntilDue !== null && hoursUntilDue < 0) reason = 'Overdue — act now';
    else if (deal && deal.riskLevel === 'red') reason = 'Deal at risk';
    else if (lead && (lead.engagementScore ?? 0) > 75) reason = 'High engagement lead';
    else if (deal) reason = `$${((deal.commission ?? 0) / 1000).toFixed(0)}K commission`;
    else if (lead) reason = `${lead.source || 'Unknown'} lead`;
    else reason = 'Scheduled task';

    return {
      id: `action-${task.id}`,
      title: task.title,
      reason,
      timeWindow,
      potentialValue: deal ? (deal.userCommission ?? deal.commission ?? 0) : undefined,
      score,
      relatedTaskId: task.id,
      relatedLeadId: task.relatedLeadId,
      relatedDealId: task.relatedDealId,
    };
  });

  return actions.sort((a, b) => b.score - a.score);
}
