import type {
  Lead, Deal, Task, Alert, TaskType,
  ScoredEntity, CommandCenterAction, CommandCenterDealAtRisk,
  CommandCenterOpportunity, CommandCenterSpeedAlert, CommandCenterPanels,
} from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function hoursUntil(dateStr: string, now: Date): number {
  return (new Date(dateStr).getTime() - now.getTime()) / (1000 * 60 * 60);
}

function daysSince(dateStr: string | undefined, now: Date): number {
  if (!dateStr) return Infinity;
  // Round down to whole days for ranking stability (anti-jitter)
  return Math.floor((now.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeCommission(commission: number): number {
  // Scale 1k–25k to 0–100
  return clamp(((commission - 1000) / 24000) * 100);
}

function formatTimeWindow(hoursLeft: number): string {
  if (hoursLeft < 0) return 'Overdue';
  if (hoursLeft < 1) return 'Due now';
  if (hoursLeft < 4) return `Before ${Math.round(hoursLeft)}h`;
  if (hoursLeft < 8) return 'Today';
  if (hoursLeft < 24) return 'Within 24h';
  if (hoursLeft < 48) return 'Tomorrow';
  return `In ${Math.round(hoursLeft / 24)}d`;
}

// ── Score Lead ───────────────────────────────────────────────────────

export function scoreLead(lead: Lead, now: Date): ScoredEntity {
  const explanation: string[] = [];
  let urgency = 0;
  let revenueImpact = 0;
  let decayRisk = 0;
  let opportunity = 0;
  let attentionGap = 0;

  // Decay risk from lastContactAt
  const daysSinceContact = daysSince(lead.lastContactAt, now);
  if (daysSinceContact > 7) { decayRisk += 50; explanation.push(`No contact in ${Math.round(daysSinceContact)} days`); }
  else if (daysSinceContact > 3) { decayRisk += 30; explanation.push(`Last contact ${Math.round(daysSinceContact)} days ago`); }
  else if (daysSinceContact > 1) { decayRisk += 15; explanation.push(`Last contact ${Math.round(daysSinceContact)} days ago`); }

  // Opportunity: engagement score
  if (lead.engagementScore >= 80) { opportunity += 35; explanation.push(`High engagement (${lead.engagementScore})`); }
  else if (lead.engagementScore >= 60) { opportunity += 20; explanation.push(`Good engagement (${lead.engagementScore})`); }
  else if (lead.engagementScore >= 40) { opportunity += 10; }

  // Opportunity: new lead
  const daysSinceCreated = daysSince(lead.createdAt, now);
  if (daysSinceCreated < 1) { opportunity += 45; explanation.push('New lead — created within 24h'); }

  // Opportunity: recent activity
  const hoursSinceActivity = daysSince(lead.lastActivityAt, now) * 24;
  if (hoursSinceActivity < 24) { opportunity += 25; explanation.push('Active within last 24h'); }

  // Opportunity: temperature
  if (lead.leadTemperature === 'hot') { opportunity += 20; explanation.push('Lead temperature: hot'); }

  return {
    entityId: lead.id,
    entityType: 'lead',
    urgencyScore: clamp(urgency),
    revenueImpactScore: clamp(revenueImpact),
    decayRiskScore: clamp(decayRisk),
    opportunityScore: clamp(opportunity),
    attentionGapScore: clamp(attentionGap),
    overallPriorityScore: clamp(
      0.40 * clamp(urgency) + 0.25 * clamp(revenueImpact) + 0.20 * clamp(decayRisk) + 0.15 * clamp(opportunity)
    ),
    explanation,
  };
}

// ── Score Deal ───────────────────────────────────────────────────────

export function scoreDeal(deal: Deal, now: Date): ScoredEntity {
  const explanation: string[] = [];
  let urgency = 0;
  let revenueImpact = 0;
  let decayRisk = 0;
  let opportunity = 0;
  let attentionGap = 0;

  // Revenue impact
  revenueImpact = normalizeCommission(deal.userCommission ?? deal.commission);
  if (revenueImpact >= 50) explanation.push(`$${((deal.userCommission ?? deal.commission) / 1000).toFixed(0)}K commission at stake`);

  // Urgency from close date
  const hoursToClose = hoursUntil(deal.closeDate, now);
  if (hoursToClose < 0) { urgency += 60; explanation.push('Past close date'); }
  else if (hoursToClose < 24 * 7) { urgency += 40; explanation.push(`Closing in ${Math.round(hoursToClose / 24)} days`); }
  else if (hoursToClose < 24 * 14) { urgency += 20; }

  // Decay from lastTouchedAt
  const daysSinceTouch = daysSince(deal.lastTouchedAt, now);
  if (deal.stage === 'pending' && daysSinceTouch > 5) { decayRisk += 40; explanation.push('Pending deal untouched for 5+ days'); }
  else if (daysSinceTouch > 7) { decayRisk += 50; explanation.push(`No activity in ${Math.round(daysSinceTouch)} days`); }
  else if (daysSinceTouch > 3) { decayRisk += 30; explanation.push(`Last touch ${Math.round(daysSinceTouch)} days ago`); }
  else if (daysSinceTouch > 1) { decayRisk += 15; }

  // Risk flags
  const flags = deal.riskFlags || [];
  const flagPenalty = Math.min(flags.length * 10, 30);
  decayRisk += flagPenalty;
  if (flags.length > 0) explanation.push(`Risk flags: ${flags.join(', ')}`);

  return {
    entityId: deal.id,
    entityType: 'deal',
    urgencyScore: clamp(urgency),
    revenueImpactScore: clamp(revenueImpact),
    decayRiskScore: clamp(decayRisk),
    opportunityScore: clamp(opportunity),
    attentionGapScore: clamp(attentionGap),
    overallPriorityScore: clamp(
      0.40 * clamp(urgency) + 0.25 * clamp(revenueImpact) + 0.20 * clamp(decayRisk) + 0.15 * clamp(opportunity)
    ),
    explanation,
  };
}

// ── Score Task ───────────────────────────────────────────────────────

export function scoreTask(
  task: Task,
  relatedLead: Lead | undefined,
  relatedDeal: Deal | undefined,
  now: Date,
): ScoredEntity {
  const explanation: string[] = [];
  let urgency = 0;
  let revenueImpact = 0;
  let decayRisk = 0;
  let opportunity = 0;
  let attentionGap = 0;

  const hours = hoursUntil(task.dueAt, now);

  // Urgency
  if (hours < 0) { urgency += 60; explanation.push('Overdue'); }
  else if (hours < 8) { urgency += 40; explanation.push('Due today'); }
  else if (hours < 24) { urgency += 30; explanation.push('Due within 24h'); }
  else if (hours < 72) { urgency += 15; explanation.push('Due within 72h'); }

  // Revenue from related deal
  if (relatedDeal) {
    revenueImpact = normalizeCommission(relatedDeal.userCommission ?? relatedDeal.commission);
    if (revenueImpact >= 30) explanation.push(`$${((relatedDeal.userCommission ?? relatedDeal.commission) / 1000).toFixed(0)}K commission`);
  }

  // Decay from related lead
  if (relatedLead) {
    const ds = daysSince(relatedLead.lastContactAt, now);
    if (ds > 7) { decayRisk += 50; explanation.push(`Lead not contacted in ${Math.round(ds)} days`); }
    else if (ds > 3) { decayRisk += 30; }
    else if (ds > 1) { decayRisk += 15; }

    if (relatedLead.engagementScore >= 80) { opportunity += 35; explanation.push(`High engagement lead (${relatedLead.engagementScore})`); }
    else if (relatedLead.engagementScore >= 60) { opportunity += 20; }
  }

  // Deal risk flags
  if (relatedDeal?.riskFlags?.length) {
    decayRisk += Math.min(relatedDeal.riskFlags.length * 10, 30);
  }

  const overall = clamp(
    0.40 * clamp(urgency) + 0.25 * clamp(revenueImpact) + 0.20 * clamp(decayRisk) + 0.15 * clamp(opportunity)
  );

  // Noise gate
  const finalOverall = (revenueImpact < 10 && urgency < 20 && opportunity < 20) ? Math.min(overall, 25) : overall;

  return {
    entityId: task.id,
    entityType: 'task',
    urgencyScore: clamp(urgency),
    revenueImpactScore: clamp(revenueImpact),
    decayRiskScore: clamp(decayRisk),
    opportunityScore: clamp(opportunity),
    attentionGapScore: clamp(attentionGap),
    overallPriorityScore: finalOverall,
    explanation,
  };
}

// ── Score Alert ──────────────────────────────────────────────────────

export function scoreAlert(alert: Alert, now: Date): ScoredEntity {
  const explanation: string[] = [];
  let urgency = 0;

  const hours = hoursUntil(alert.expiresAt, now);
  if (hours < 0) { urgency += 70; explanation.push('Expired — needs immediate review'); }
  else if (hours < 2) { urgency += 70; explanation.push('Expiring within 2 hours'); }
  else if (hours < 24) { urgency += 50; explanation.push('Expiring within 24h'); }
  else if (hours < 72) { urgency += 25; explanation.push('Expiring within 72h'); }

  if (alert.type === 'urgent') { urgency += 20; explanation.push('Marked urgent'); }
  if (alert.type === 'speed') { explanation.push('Speed-to-lead alert'); }

  return {
    entityId: alert.id,
    entityType: 'alert',
    urgencyScore: clamp(urgency),
    revenueImpactScore: 0,
    decayRiskScore: 0,
    opportunityScore: 0,
    attentionGapScore: 0,
    overallPriorityScore: clamp(urgency),
    explanation,
  };
}

// ── Suggested Actions Generator ─────────────────────────────────────

interface SuggestedAction {
  id: string;
  title: string;
  suggestedType: TaskType;
  relatedLeadId?: string;
  relatedDealId?: string;
  scores: ScoredEntity;
}

function generateSuggestedActions(
  leads: Lead[],
  deals: Deal[],
  tasks: Task[],
  now: Date,
): SuggestedAction[] {
  const suggestions: SuggestedAction[] = [];

  // Index: leads/deals with a task due within 72h
  const leadsWithUpcomingTask = new Set<string>();
  const dealsWithUpcomingTask = new Set<string>();
  for (const t of tasks) {
    if (t.completedAt) continue;
    const h = hoursUntil(t.dueAt, now);
    if (h < 72) {
      if (t.relatedLeadId) leadsWithUpcomingTask.add(t.relatedLeadId);
      if (t.relatedDealId) dealsWithUpcomingTask.add(t.relatedDealId);
    }
  }

  // Leads with attention gaps
  for (const lead of leads) {
    const scored = scoreLead(lead, now);
    if (scored.attentionGapScore < 40 && daysSince(lead.lastContactAt, now) <= 4) continue;
    if (leadsWithUpcomingTask.has(lead.id)) continue;

    const ds = daysSince(lead.lastContactAt, now);
    let suggestedType: TaskType = 'follow_up';
    let title = `Follow up with ${lead.name}`;
    if (ds > 4) { suggestedType = 'call'; title = `Call ${lead.name} — ${Math.round(ds)} days since last contact`; }

    // Bump attentionGap in the scores
    const adjustedScores: ScoredEntity = { ...scored, attentionGapScore: clamp(scored.attentionGapScore + 40) };
    adjustedScores.overallPriorityScore = clamp(
      0.40 * adjustedScores.urgencyScore + 0.25 * adjustedScores.revenueImpactScore +
      0.20 * (adjustedScores.decayRiskScore + 20) + 0.15 * adjustedScores.opportunityScore
    );
    adjustedScores.explanation = [...adjustedScores.explanation, 'No upcoming task scheduled'];

    suggestions.push({ id: `suggested-lead-${lead.id}`, title, suggestedType, relatedLeadId: lead.id, scores: adjustedScores });
  }

  // Deals with attention gaps
  for (const deal of deals) {
    if (deal.stage === 'closed') continue;
    if (dealsWithUpcomingTask.has(deal.id)) continue;

    const scored = scoreDeal(deal, now);
    const daysToClose = hoursUntil(deal.closeDate, now) / 24;
    if (daysToClose > 14 && scored.decayRiskScore < 30) continue;

    const adjustedScores: ScoredEntity = { ...scored, attentionGapScore: clamp(scored.attentionGapScore + 40) };
    adjustedScores.overallPriorityScore = clamp(
      0.40 * adjustedScores.urgencyScore + 0.25 * adjustedScores.revenueImpactScore +
      0.20 * (adjustedScores.decayRiskScore + 20) + 0.15 * adjustedScores.opportunityScore
    );
    adjustedScores.explanation = [...adjustedScores.explanation, 'No upcoming task for this deal'];

    const title = daysToClose < 14 ? `Check milestone status — ${deal.title}` : `Follow up on ${deal.title}`;
    suggestions.push({ id: `suggested-deal-${deal.id}`, title, suggestedType: 'closing', relatedDealId: deal.id, scores: adjustedScores });
  }

  return suggestions;
}

// ── Build Command Center Panels ─────────────────────────────────────

export function buildCommandCenterPanels(
  leads: Lead[],
  deals: Deal[],
  tasks: Task[],
  alerts: Alert[],
  now: Date = new Date(),
): CommandCenterPanels {
  const leadMap = new Map(leads.map(l => [l.id, l]));
  const dealMap = new Map(deals.map(d => [d.id, d]));

  // ── Priority Actions ──
  const incompleteTasks = tasks.filter(t => !t.completedAt);
  const taskActions: CommandCenterAction[] = incompleteTasks.map(task => {
    const lead = task.relatedLeadId ? leadMap.get(task.relatedLeadId) : undefined;
    const deal = task.relatedDealId ? dealMap.get(task.relatedDealId) : undefined;
    const scores = scoreTask(task, lead, deal, now);
    const hours = hoursUntil(task.dueAt, now);

    return {
      id: `action-task-${task.id}`,
      title: task.title,
      reason: scores.explanation[0] || 'Scheduled task',
      timeWindow: formatTimeWindow(hours),
      potentialValue: deal ? (deal.userCommission ?? deal.commission) : undefined,
      overallScore: scores.overallPriorityScore,
      scores,
      relatedTaskId: task.id,
      relatedLeadId: task.relatedLeadId,
      relatedDealId: task.relatedDealId,
    };
  });

  const suggested = generateSuggestedActions(leads, deals, tasks, now);
  const suggestedActions: CommandCenterAction[] = suggested.map(s => ({
    id: s.id,
    title: s.title,
    reason: s.scores.explanation[0] || 'Attention gap',
    timeWindow: 'Within 24h',
    potentialValue: s.relatedDealId ? (dealMap.get(s.relatedDealId)?.userCommission ?? dealMap.get(s.relatedDealId)?.commission) : undefined,
    overallScore: s.scores.overallPriorityScore,
    scores: s.scores,
    relatedLeadId: s.relatedLeadId,
    relatedDealId: s.relatedDealId,
    isSuggested: true,
    suggestedType: s.suggestedType,
  }));

  const priorityActions = [...taskActions, ...suggestedActions]
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 5);

  // ── Deals at Risk ──
  const activeDeals = deals.filter(d => d.stage !== 'closed');
  const scoredDeals = activeDeals.map(deal => {
    const scores = scoreDeal(deal, now);
    const combinedRisk = scores.decayRiskScore + scores.urgencyScore + scores.revenueImpactScore;
    return { deal, scores, combinedRisk };
  });
  const dealsAtRisk = scoredDeals
    .filter(d => d.deal.riskLevel === 'red' || d.deal.riskLevel === 'yellow' || d.scores.decayRiskScore >= 30)
    .sort((a, b) => b.combinedRisk - a.combinedRisk)
    .slice(0, 6)
    .map(({ deal, scores }) => ({
      deal,
      scores,
      topReason: scores.explanation[0] || 'Needs attention',
    }));

  // ── Opportunities Heating Up ──
  const scoredLeads = leads.map(lead => {
    const scores = scoreLead(lead, now);
    return { lead, scores };
  });
  const opportunities = scoredLeads
    .filter(({ scores }) => scores.opportunityScore >= 20)
    .sort((a, b) => {
      const diff = b.scores.opportunityScore - a.scores.opportunityScore;
      return diff !== 0 ? diff : b.scores.revenueImpactScore - a.scores.revenueImpactScore;
    })
    .slice(0, 6)
    .map(({ lead, scores }) => ({
      lead,
      scores,
      topReason: scores.explanation[0] || 'Showing engagement',
    }));

  // ── Speed Alerts ──
  const scoredAlerts: CommandCenterSpeedAlert[] = alerts
    .filter(a => a.type === 'speed' || a.type === 'urgent')
    .map(alert => {
      const scores = scoreAlert(alert, now);
      return {
        id: alert.id,
        title: alert.title,
        detail: alert.detail,
        type: alert.type,
        urgencyScore: scores.urgencyScore,
        scores,
        relatedLeadId: alert.relatedLeadId,
        relatedDealId: alert.relatedDealId,
      };
    });

  // Also inject overdue/due-soon tasks as speed alerts (within 48h)
  const urgentTaskAlerts: CommandCenterSpeedAlert[] = incompleteTasks
    .filter(t => hoursUntil(t.dueAt, now) < 48)
    .map(task => {
      const lead = task.relatedLeadId ? leadMap.get(task.relatedLeadId) : undefined;
      const deal = task.relatedDealId ? dealMap.get(task.relatedDealId) : undefined;
      const scores = scoreTask(task, lead, deal, now);
      return {
        id: `speed-task-${task.id}`,
        title: task.title,
        detail: hoursUntil(task.dueAt, now) < 0 ? 'This task is overdue' : 'Due very soon',
        type: 'task_due' as const,
        urgencyScore: scores.urgencyScore,
        scores,
        relatedLeadId: task.relatedLeadId,
        relatedDealId: task.relatedDealId,
      };
    });

  // Filter speed alerts: only overdue or within 48h
  const filteredAlerts = scoredAlerts.filter(a => {
    const alert = alerts.find(al => al.id === a.id);
    if (!alert) return false;
    return hoursUntil(alert.expiresAt, now) < 48;
  });

  const speedAlerts = [...filteredAlerts, ...urgentTaskAlerts]
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, 4);

  return { priorityActions, dealsAtRisk, opportunities, speedAlerts };
}
