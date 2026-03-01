import type {
  Lead, Deal, Task, Alert, TaskType,
  ScoredEntity, CommandCenterAction, CommandCenterDealAtRisk,
  CommandCenterOpportunity, CommandCenterSpeedAlert, CommandCenterPanels,
} from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 100): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function hoursUntil(dateStr: string | undefined, now: Date): number {
  if (!dateStr) return Infinity;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (t - now.getTime()) / (1000 * 60 * 60);
}

function daysSince(dateStr: string | undefined, now: Date): number {
  if (!dateStr) return Infinity;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.floor((now.getTime() - t) / (1000 * 60 * 60 * 24));
}

function normalizeCommission(commission: number): number {
  if (!Number.isFinite(commission) || commission <= 0) return 0;
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

/** Deterministic tiebreaker: urgency → revenue → decay → oldest entity id */
function tiebreaker(a: { overallScore: number; scores: ScoredEntity; id: string }, b: { overallScore: number; scores: ScoredEntity; id: string }): number {
  let diff = b.overallScore - a.overallScore;
  if (diff !== 0) return diff;
  diff = b.scores.urgencyScore - a.scores.urgencyScore;
  if (diff !== 0) return diff;
  diff = b.scores.revenueImpactScore - a.scores.revenueImpactScore;
  if (diff !== 0) return diff;
  diff = b.scores.decayRiskScore - a.scores.decayRiskScore;
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id); // oldest / deterministic
}

// ── Score Lead ───────────────────────────────────────────────────────

export function scoreLead(lead: Lead, now: Date): ScoredEntity | null {
  try {
    const explanation: string[] = [];
    let urgency = 0;
    let revenueImpact = 0;
    let decayRisk = 0;
    let opportunity = 0;
    let attentionGap = 0;
    const engagement = lead.engagementScore ?? 0;

    const daysSinceContact = daysSince(lead.lastContactAt, now);
    if (daysSinceContact > 7) { decayRisk += 50; explanation.push(`No contact in ${Math.round(daysSinceContact)} days`); }
    else if (daysSinceContact > 3) { decayRisk += 30; explanation.push(`Last contact ${Math.round(daysSinceContact)} days ago`); }
    else if (daysSinceContact > 1) { decayRisk += 15; explanation.push(`Last contact ${Math.round(daysSinceContact)} days ago`); }

    if (engagement >= 80) { opportunity += 35; explanation.push(`High engagement (${engagement})`); }
    else if (engagement >= 60) { opportunity += 20; explanation.push(`Good engagement (${engagement})`); }
    else if (engagement >= 40) { opportunity += 10; }

    const daysSinceCreated = daysSince(lead.createdAt, now);
    if (daysSinceCreated < 1) { opportunity += 45; explanation.push('New lead — created within 24h'); }

    const hoursSinceActivity = daysSince(lead.lastActivityAt, now) * 24;
    if (hoursSinceActivity < 24) { opportunity += 25; explanation.push('Active within last 24h'); }

    if (lead.leadTemperature === 'hot') { opportunity += 20; explanation.push('Lead temperature: hot'); }

    return {
      entityId: lead.id, entityType: 'lead',
      urgencyScore: clamp(urgency), revenueImpactScore: clamp(revenueImpact),
      decayRiskScore: clamp(decayRisk), opportunityScore: clamp(opportunity),
      attentionGapScore: clamp(attentionGap),
      overallPriorityScore: clamp(0.40 * clamp(urgency) + 0.25 * clamp(revenueImpact) + 0.20 * clamp(decayRisk) + 0.15 * clamp(opportunity)),
      explanation,
    };
  } catch (err) {
    if (import.meta.env.DEV) console.error('[scoreLead] failed for', lead.id, err);
    return null;
  }
}

// ── Score Deal ───────────────────────────────────────────────────────

export function scoreDeal(deal: Deal, now: Date): ScoredEntity | null {
  try {
    const explanation: string[] = [];
    let urgency = 0;
    let decayRisk = 0;
    const opportunity = 0;
    const attentionGap = 0;

    const commissionValue = deal.userCommission ?? deal.commission ?? 0;
    const revenueImpact = normalizeCommission(commissionValue);
    if (revenueImpact >= 50) explanation.push(`$${(commissionValue / 1000).toFixed(0)}K commission at stake`);

    const hoursToClose = hoursUntil(deal.closeDate, now);
    if (hoursToClose < 0) { urgency += 60; explanation.push('Past close date'); }
    else if (hoursToClose < 24 * 7) { urgency += 40; explanation.push(`Closing in ${Math.round(hoursToClose / 24)} days`); }
    else if (hoursToClose < 24 * 14) { urgency += 20; }

    const daysSinceTouch = daysSince(deal.lastTouchedAt, now);
    if (deal.stage === 'pending' && daysSinceTouch > 5) { decayRisk += 40; explanation.push('Pending deal untouched for 5+ days'); }
    else if (daysSinceTouch > 7) { decayRisk += 50; explanation.push(`No activity in ${Math.round(daysSinceTouch)} days`); }
    else if (daysSinceTouch > 3) { decayRisk += 30; explanation.push(`Last touch ${Math.round(daysSinceTouch)} days ago`); }
    else if (daysSinceTouch > 1) { decayRisk += 15; }

    const flags = deal.riskFlags || [];
    decayRisk += Math.min(flags.length * 10, 30);
    if (flags.length > 0) explanation.push(`Risk flags: ${flags.join(', ')}`);

    return {
      entityId: deal.id, entityType: 'deal',
      urgencyScore: clamp(urgency), revenueImpactScore: clamp(revenueImpact),
      decayRiskScore: clamp(decayRisk), opportunityScore: clamp(opportunity),
      attentionGapScore: clamp(attentionGap),
      overallPriorityScore: clamp(0.40 * clamp(urgency) + 0.25 * clamp(revenueImpact) + 0.20 * clamp(decayRisk) + 0.15 * clamp(opportunity)),
      explanation,
    };
  } catch (err) {
    if (import.meta.env.DEV) console.error('[scoreDeal] failed for', deal.id, err);
    return null;
  }
}

// ── Score Task ───────────────────────────────────────────────────────

export function scoreTask(task: Task, relatedLead: Lead | undefined, relatedDeal: Deal | undefined, now: Date): ScoredEntity | null {
  try {
    const explanation: string[] = [];
    let urgency = 0;
    let revenueImpact = 0;
    let decayRisk = 0;
    let opportunity = 0;
    const attentionGap = 0;

    const hours = hoursUntil(task.dueAt, now);
    if (hours < 0) { urgency += 60; explanation.push('Overdue'); }
    else if (hours < 8) { urgency += 40; explanation.push('Due today'); }
    else if (hours < 24) { urgency += 30; explanation.push('Due within 24h'); }
    else if (hours < 72) { urgency += 15; explanation.push('Due within 72h'); }

    if (relatedDeal) {
      const dealComm = relatedDeal.userCommission ?? relatedDeal.commission ?? 0;
      revenueImpact = normalizeCommission(dealComm);
      if (revenueImpact >= 30) explanation.push(`$${(dealComm / 1000).toFixed(0)}K commission`);
    }

    if (relatedLead) {
      const ds = daysSince(relatedLead.lastContactAt, now);
      if (ds > 7) { decayRisk += 50; explanation.push(`Lead not contacted in ${Math.round(ds)} days`); }
      else if (ds > 3) { decayRisk += 30; }
      else if (ds > 1) { decayRisk += 15; }

      const eng = relatedLead.engagementScore ?? 0;
      if (eng >= 80) { opportunity += 35; explanation.push(`High engagement lead (${eng})`); }
      else if (eng >= 60) { opportunity += 20; }
    }

    if (relatedDeal?.riskFlags?.length) {
      decayRisk += Math.min(relatedDeal.riskFlags.length * 10, 30);
    }

    const overall = clamp(0.40 * clamp(urgency) + 0.25 * clamp(revenueImpact) + 0.20 * clamp(decayRisk) + 0.15 * clamp(opportunity));
    const finalOverall = (revenueImpact < 10 && urgency < 20 && opportunity < 20) ? Math.min(overall, 25) : overall;

    return {
      entityId: task.id, entityType: 'task',
      urgencyScore: clamp(urgency), revenueImpactScore: clamp(revenueImpact),
      decayRiskScore: clamp(decayRisk), opportunityScore: clamp(opportunity),
      attentionGapScore: clamp(attentionGap),
      overallPriorityScore: finalOverall,
      explanation,
    };
  } catch (err) {
    if (import.meta.env.DEV) console.error('[scoreTask] failed for', task.id, err);
    return null;
  }
}

// ── Score Alert ──────────────────────────────────────────────────────

export function scoreAlert(alert: Alert, now: Date): ScoredEntity | null {
  try {
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
      entityId: alert.id, entityType: 'alert',
      urgencyScore: clamp(urgency), revenueImpactScore: 0,
      decayRiskScore: 0, opportunityScore: 0,
      attentionGapScore: 0, overallPriorityScore: clamp(urgency),
      explanation,
    };
  } catch (err) {
    if (import.meta.env.DEV) console.error('[scoreAlert] failed for', alert.id, err);
    return null;
  }
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

function generateSuggestedActions(leads: Lead[], deals: Deal[], tasks: Task[], now: Date): SuggestedAction[] {
  const suggestions: SuggestedAction[] = [];

  const leadsWithRecentOrUpcomingTask = new Set<string>();
  const dealsWithRecentOrUpcomingTask = new Set<string>();
  for (const t of tasks) {
    // Skip suggestions for entities that have an upcoming task OR a recently completed one (within 24h)
    const recentlyCompleted = t.completedAt && (now.getTime() - new Date(t.completedAt).getTime()) < 24 * 60 * 60 * 1000;
    if (t.completedAt && !recentlyCompleted) continue;
    const h = hoursUntil(t.dueAt, now);
    if (h < 72 || recentlyCompleted) {
      if (t.relatedLeadId) leadsWithRecentOrUpcomingTask.add(t.relatedLeadId);
      if (t.relatedDealId) dealsWithRecentOrUpcomingTask.add(t.relatedDealId);
    }
  }

  for (const lead of leads) {
    const scored = scoreLead(lead, now);
    if (!scored) continue;
    if (scored.attentionGapScore < 40 && daysSince(lead.lastContactAt, now) <= 4) continue;
    if (leadsWithRecentOrUpcomingTask.has(lead.id)) continue;

    const ds = daysSince(lead.lastContactAt, now);
    let suggestedType: TaskType = 'follow_up';
    let title = `Follow up with ${lead.name}`;
    if (ds > 4) { suggestedType = 'call'; title = `Call ${lead.name} — ${Math.round(ds)} days since last contact`; }

    const adjustedScores: ScoredEntity = { ...scored, attentionGapScore: clamp(scored.attentionGapScore + 40) };
    adjustedScores.overallPriorityScore = clamp(
      0.40 * adjustedScores.urgencyScore + 0.25 * adjustedScores.revenueImpactScore +
      0.20 * (adjustedScores.decayRiskScore + 20) + 0.15 * adjustedScores.opportunityScore
    );
    adjustedScores.explanation = [...adjustedScores.explanation, 'No upcoming task scheduled'];

    suggestions.push({ id: `suggested-lead-${lead.id}`, title, suggestedType, relatedLeadId: lead.id, scores: adjustedScores });
  }

  for (const deal of deals) {
    if (deal.stage === 'closed') continue;
    if (dealsWithRecentOrUpcomingTask.has(deal.id)) continue;

    const scored = scoreDeal(deal, now);
    if (!scored) continue;
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
  const taskActions: CommandCenterAction[] = [];
  for (const task of incompleteTasks) {
    const lead = task.relatedLeadId ? leadMap.get(task.relatedLeadId) : undefined;
    const deal = task.relatedDealId ? dealMap.get(task.relatedDealId) : undefined;
    const scores = scoreTask(task, lead, deal, now);
    if (!scores) continue; // fail-safe: exclude failed entities
    const hours = hoursUntil(task.dueAt, now);
    taskActions.push({
      id: `action-task-${task.id}`,
      title: task.title,
      reason: scores.explanation[0] || 'Scheduled task',
      timeWindow: formatTimeWindow(hours),
      potentialValue: deal ? (deal.userCommission ?? deal.commission ?? 0) : undefined,
      overallScore: scores.overallPriorityScore,
      scores,
      relatedTaskId: task.id,
      relatedLeadId: task.relatedLeadId,
      relatedDealId: task.relatedDealId,
    });
  }

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
    .sort((a, b) => tiebreaker(a, b))
    .slice(0, 5);

  // ── Deals at Risk ──
  const activeDeals = deals.filter(d => d.stage !== 'closed');
  const scoredDeals: { deal: Deal; scores: ScoredEntity; combinedRisk: number }[] = [];
  for (const deal of activeDeals) {
    const scores = scoreDeal(deal, now);
    if (!scores) continue;
    scoredDeals.push({ deal, scores, combinedRisk: scores.decayRiskScore + scores.urgencyScore + scores.revenueImpactScore });
  }
  const dealsAtRisk = scoredDeals
    .filter(d => d.deal.riskLevel === 'red' || d.deal.riskLevel === 'yellow' || d.scores.decayRiskScore >= 30)
    .sort((a, b) => b.combinedRisk - a.combinedRisk)
    .slice(0, 6)
    .map(({ deal, scores }) => ({ deal, scores, topReason: scores.explanation[0] || 'Needs attention' }));

  // ── Opportunities Heating Up ──
  const scoredLeads: { lead: Lead; scores: ScoredEntity }[] = [];
  for (const lead of leads) {
    const scores = scoreLead(lead, now);
    if (!scores) continue;
    scoredLeads.push({ lead, scores });
  }
  const opportunities = scoredLeads
    .filter(({ scores }) => scores.opportunityScore >= 20)
    .sort((a, b) => {
      const diff = b.scores.opportunityScore - a.scores.opportunityScore;
      return diff !== 0 ? diff : b.scores.revenueImpactScore - a.scores.revenueImpactScore;
    })
    .slice(0, 6)
    .map(({ lead, scores }) => ({ lead, scores, topReason: scores.explanation[0] || 'Showing engagement' }));

  // ── Speed Alerts ──
  const scoredAlerts: CommandCenterSpeedAlert[] = [];
  for (const alert of alerts.filter(a => a.type === 'speed' || a.type === 'urgent')) {
    const scores = scoreAlert(alert, now);
    if (!scores) continue;
    scoredAlerts.push({
      id: alert.id, title: alert.title, detail: alert.detail,
      type: alert.type, urgencyScore: scores.urgencyScore, scores,
      relatedLeadId: alert.relatedLeadId, relatedDealId: alert.relatedDealId,
    });
  }

  const urgentTaskAlerts: CommandCenterSpeedAlert[] = [];
  for (const task of incompleteTasks.filter(t => hoursUntil(t.dueAt, now) < 48)) {
    const lead = task.relatedLeadId ? leadMap.get(task.relatedLeadId) : undefined;
    const deal = task.relatedDealId ? dealMap.get(task.relatedDealId) : undefined;
    const scores = scoreTask(task, lead, deal, now);
    if (!scores) continue;
    urgentTaskAlerts.push({
      id: `speed-task-${task.id}`, title: task.title,
      detail: hoursUntil(task.dueAt, now) < 0 ? 'This task is overdue' : 'Due very soon',
      type: 'task_due' as const, urgencyScore: scores.urgencyScore, scores,
      relatedLeadId: task.relatedLeadId, relatedDealId: task.relatedDealId,
    });
  }

  const filteredAlerts = scoredAlerts.filter(a => {
    const alert = alerts.find(al => al.id === a.id);
    return alert ? hoursUntil(alert.expiresAt, now) < 48 : false;
  });

  const speedAlerts = [...filteredAlerts, ...urgentTaskAlerts]
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, 4);

  return { priorityActions, dealsAtRisk, opportunities, speedAlerts };
}
