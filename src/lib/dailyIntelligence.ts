import type { Lead, Deal, Task, CommandCenterPanels } from '@/types';
import type { SessionSnapshot } from '@/hooks/useSessionMemory';

// ── Dynamic Briefing Message ────────────────────────────────────────

export interface BriefingMessage {
  icon: string;
  text: string;
}

export function getDailyBriefing(
  panels: CommandCenterPanels,
  tasks: Task[],
  deals: Deal[],
  leads: Lead[],
): BriefingMessage {
  const now = new Date();
  const overdueTasks = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < now);
  const riskDeals = deals.filter(d => d.stage !== 'closed' && (d.riskLevel === 'red' || d.riskLevel === 'yellow'));
  const hotLeads = leads.filter(l => l.engagementScore >= 80 || l.leadTemperature === 'hot');

  // Overdue tasks are handled by the dedicated OverdueTasksCard — skip here
  if (riskDeals.length > 0 && overdueTasks.length === 0) {
    // fall through to risk deals below
  }
  if (overdueTasks.length === 0 && riskDeals.length > 0) {
    return {
      icon: '⚠️',
      text: `You have ${riskDeals.length} deal${riskDeals.length !== 1 ? 's' : ''} at risk today.`,
    };
  }
  if (hotLeads.length > 0) {
    return {
      icon: '🔥',
      text: `${hotLeads.length} high-intent lead${hotLeads.length !== 1 ? 's are' : ' is'} heating up.`,
    };
  }
  return {
    icon: '✅',
    text: 'No urgent threats detected. Focus on growth.',
  };
}

// ── Missed Yesterday ────────────────────────────────────────────────

export function getMissedYesterdayCount(
  tasks: Task[],
  deals: Deal[],
  previousSnapshot: SessionSnapshot | null,
): number {
  if (!previousSnapshot) return 0;

  const now = new Date();
  // Only show if last session was before today
  const lastOpened = new Date(previousSnapshot.lastOpenedAt);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (lastOpened >= todayStart) return 0;

  // Count items from yesterday's snapshot that are still unresolved
  let count = 0;
  for (const taskId of previousSnapshot.overdueTaskIds) {
    const task = tasks.find(t => t.id === taskId);
    if (task && !task.completedAt) count++;
  }
  for (const dealId of previousSnapshot.riskDealIds) {
    const deal = deals.find(d => d.id === dealId);
    if (deal && deal.stage !== 'closed' && (deal.riskLevel === 'red' || deal.riskLevel === 'yellow')) count++;
  }
  return count;
}

// ── Momentum ────────────────────────────────────────────────────────

export type Momentum = 'Improving' | 'Stable' | 'Declining';

export function getMomentum(
  tasks: Task[],
  deals: Deal[],
  previousSnapshot: SessionSnapshot | null,
): Momentum {
  if (!previousSnapshot) return 'Stable';

  const now = new Date();
  const overdueTasks = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < now);
  const riskDeals = deals.filter(d => d.stage !== 'closed' && (d.riskLevel === 'red' || d.riskLevel === 'yellow'));
  const currentUrgent = overdueTasks.length + riskDeals.length;
  const previousUrgent = previousSnapshot.urgentCount;

  const diff = currentUrgent - previousUrgent;
  if (diff <= -2) return 'Improving';
  if (diff >= 2) return 'Declining';
  return 'Stable';
}

// ── Pipeline Watch ──────────────────────────────────────────────────

export interface PipelineEvent {
  id: string;
  icon: string;
  text: string;
}

export function getPipelineWatch(
  leads: Lead[],
  deals: Deal[],
  previousSnapshot: SessionSnapshot | null,
): PipelineEvent[] {
  const events: PipelineEvent[] = [];

  const prevLeadIds = new Set(previousSnapshot?.leadIds || []);
  const prevDealIds = new Set(previousSnapshot?.dealIds || []);

  // New high-intent leads
  for (const lead of leads) {
    if (!prevLeadIds.has(lead.id) && (lead.engagementScore >= 70 || lead.leadTemperature === 'hot')) {
      events.push({ id: `new-lead-${lead.id}`, icon: '🔥', text: `New high-intent lead: ${lead.name}` });
    }
  }

  // New deals or deals that moved to risk
  for (const deal of deals) {
    if (!prevDealIds.has(deal.id) && deal.commission >= 5000) {
      events.push({ id: `new-deal-${deal.id}`, icon: '💰', text: `Large commission deal added: ${deal.title}` });
    }
    if (prevDealIds.has(deal.id) && (deal.riskLevel === 'red' || deal.riskLevel === 'yellow')) {
      const prevRiskIds = new Set(previousSnapshot?.riskDealIds || []);
      if (!prevRiskIds.has(deal.id)) {
        events.push({ id: `risk-deal-${deal.id}`, icon: '⚠️', text: `Deal moved to risk: ${deal.title}` });
      }
    }
  }

  // Deals closing within 7 days
  const now = new Date();
  for (const deal of deals) {
    if (deal.stage === 'closed') continue;
    const daysToClose = (new Date(deal.closeDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysToClose > 0 && daysToClose <= 7) {
      events.push({ id: `closing-${deal.id}`, icon: '📅', text: `${deal.title} closing in ${Math.ceil(daysToClose)} days` });
    }
  }

  return events.slice(0, 3);
}

// ── Control Status ──────────────────────────────────────────────────

export type ControlStatus = 'Stabilizing' | 'Holding' | 'Needs Attention';

export function getControlStatus(
  tasks: Task[],
  deals: Deal[],
  previousSnapshot: SessionSnapshot | null,
): ControlStatus {
  const m = getMomentum(tasks, deals, previousSnapshot);
  if (m === 'Improving') return 'Stabilizing';
  if (m === 'Declining') return 'Needs Attention';
  return 'Holding';
}

// ── Progress Snapshot ───────────────────────────────────────────────

export interface ProgressItem {
  id: string;
  text: string;
}

export function getProgressSnapshot(
  tasks: Task[],
  deals: Deal[],
  leads: Lead[],
  previousSnapshot: SessionSnapshot | null,
): ProgressItem[] {
  if (!previousSnapshot) return [];
  const items: ProgressItem[] = [];

  // Overdue items resolved (were overdue in previous, now completed)
  let resolvedOverdue = 0;
  for (const taskId of previousSnapshot.overdueTaskIds) {
    const task = tasks.find(t => t.id === taskId);
    if (task && task.completedAt) resolvedOverdue++;
  }
  if (resolvedOverdue > 0) {
    items.push({ id: 'resolved-overdue', text: `${resolvedOverdue} overdue item${resolvedOverdue !== 1 ? 's' : ''} resolved` });
  }

  // Deals moved out of risk
  let dealsDerisked = 0;
  for (const dealId of previousSnapshot.riskDealIds) {
    const deal = deals.find(d => d.id === dealId);
    if (deal && deal.riskLevel === 'green') dealsDerisked++;
  }
  if (dealsDerisked > 0) {
    items.push({ id: 'deals-derisked', text: `${dealsDerisked} deal${dealsDerisked !== 1 ? 's' : ''} moved out of risk` });
  }

  // New opportunities engaged (new leads since last session)
  const prevLeadIds = new Set(previousSnapshot.leadIds);
  const newLeads = leads.filter(l => !prevLeadIds.has(l.id));
  if (newLeads.length > 0) {
    items.push({ id: 'new-leads', text: `${newLeads.length} new opportunit${newLeads.length !== 1 ? 'ies' : 'y'} engaged` });
  }

  return items.slice(0, 3);
}

// ── Stress Reduction Signal ─────────────────────────────────────────

export function shouldShowStressReduction(
  tasks: Task[],
  deals: Deal[],
  previousSnapshot: SessionSnapshot | null,
): boolean {
  if (!previousSnapshot) return false;
  const now = new Date();
  const currentOverdue = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < now).length;
  const currentRisk = deals.filter(d => d.stage !== 'closed' && (d.riskLevel === 'red' || d.riskLevel === 'yellow')).length;
  const currentUrgent = currentOverdue + currentRisk;
  return previousSnapshot.urgentCount >= 3 && currentUrgent <= previousSnapshot.urgentCount - 2;
}

// ── Post-Action Feedback Messages ───────────────────────────────────

export type ActionFeedbackKind = 'complete' | 'snooze' | 'handled';

export interface ActionFeedback {
  message: string;
}

export function getPostActionFeedback(
  kind: ActionFeedbackKind,
  context?: { isRiskDeal?: boolean; isOverdue?: boolean; isOpportunity?: boolean },
): ActionFeedback {
  if (kind === 'snooze') {
    return { message: 'Action snoozed. Next priority surfaced.' };
  }
  if (context?.isRiskDeal) {
    return { message: 'Risk reduced. Deal status stabilized.' };
  }
  if (context?.isOverdue) {
    return { message: 'Overdue item cleared.' };
  }
  if (context?.isOpportunity) {
    return { message: 'Opportunity engaged.' };
  }
  return { message: 'Action completed.' };
}
