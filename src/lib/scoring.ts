import type { Task, Lead, Deal, PriorityAction } from '@/types';

export function calculatePriorityScore(task: Task, lead?: Lead, deal?: Deal): number {
  let score = 0;
  const now = new Date();
  const dueAt = new Date(task.dueAt);
  const hoursUntilDue = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Urgency
  if (hoursUntilDue < 0) score += 40;
  else if (hoursUntilDue < 4) score += 30;
  else if (hoursUntilDue < 24) score += 20;
  else if (hoursUntilDue < 48) score += 10;

  // Revenue impact
  if (deal) {
    score += Math.min(deal.commission / 1000, 25);
  }

  // Decay risk
  if (lead) {
    const daysSinceContact = (now.getTime() - new Date(lead.lastContactAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceContact > 7) score += 15;
    else if (daysSinceContact > 3) score += 10;
    else if (daysSinceContact > 1) score += 5;

    score += lead.engagementScore / 10;
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
    const dueAt = new Date(task.dueAt);
    const hoursUntilDue = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);

    let timeWindow = '';
    if (hoursUntilDue < 0) timeWindow = 'Overdue';
    else if (hoursUntilDue < 1) timeWindow = 'Due now';
    else if (hoursUntilDue < 4) timeWindow = `Due in ${Math.round(hoursUntilDue)}h`;
    else if (hoursUntilDue < 24) timeWindow = 'Due today';
    else if (hoursUntilDue < 48) timeWindow = 'Due tomorrow';
    else timeWindow = `Due in ${Math.round(hoursUntilDue / 24)}d`;

    let reason = '';
    if (hoursUntilDue < 0) reason = 'Overdue — act now';
    else if (deal && deal.riskLevel === 'red') reason = 'Deal at risk';
    else if (lead && lead.engagementScore > 75) reason = 'High engagement lead';
    else if (deal) reason = `$${(deal.commission / 1000).toFixed(0)}K commission`;
    else if (lead) reason = `${lead.source} lead`;
    else reason = 'Scheduled task';

    return {
      id: `action-${task.id}`,
      title: task.title,
      reason,
      timeWindow,
      potentialValue: deal?.commission,
      score,
      relatedTaskId: task.id,
      relatedLeadId: task.relatedLeadId,
      relatedDealId: task.relatedDealId,
    };
  });

  return actions.sort((a, b) => b.score - a.score);
}
