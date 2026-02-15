/**
 * Scenario-based seed packs for exercising all Command Center panels.
 * Each pack returns typed insert-ready rows tagged with seeded=true + seed_batch_id.
 */

const now = new Date();
const hour = (h: number) => {
  const d = new Date(now);
  d.setHours(d.getHours() + h);
  return d.toISOString();
};
const day = (d: number) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString();
};
const ago = (d: number) => day(-d);

export type SeedPackId =
  | 'money_at_risk'
  | 'opportunity'
  | 'forecast'
  | 'stability'
  | 'sync'
  | 'activity'
  | 'golden_path';

export interface SeedPackMeta {
  id: SeedPackId;
  label: string;
  description: string;
  icon: string; // lucide icon name
}

export const SEED_PACKS: SeedPackMeta[] = [
  { id: 'money_at_risk', label: 'Money at Risk', description: 'High-value deals with open milestones closing soon, financing unknowns, and red/yellow risk levels.', icon: 'DollarSign' },
  { id: 'opportunity', label: 'Opportunity', description: 'Hot leads with high engagement, warm leads recently touched, and new leads within 48h.', icon: 'Zap' },
  { id: 'forecast', label: 'Forecast', description: 'Mix of deal stages/close dates across 7/30/90-day windows to populate income forecast panels.', icon: 'TrendingUp' },
  { id: 'stability', label: 'Stability', description: 'Overloaded task queue, strained capacity, overdue tasks to trigger stability warnings.', icon: 'Shield' },
  { id: 'sync', label: 'Sync', description: 'FUB import history and drift summary examples for the Sync workspace.', icon: 'RefreshCw' },
  { id: 'activity', label: 'Activity', description: 'Touch history patterns across call, text, email, showing types for activity trail.', icon: 'Activity' },
  { id: 'golden_path', label: 'Golden Path', description: 'One of each scenario: drives Autopilot, Sweep, and every Command Center panel.', icon: 'Star' },
];

interface SeedData {
  leads: any[];
  deals: any[];
  dealParticipants: any[];
  tasks: any[];
  alerts: any[];
  activityEvents: any[];
}

function tag(batchId: string) {
  return { seeded: true, seed_batch_id: batchId };
}

function emptyData(): SeedData {
  return { leads: [], deals: [], dealParticipants: [], tasks: [], alerts: [], activityEvents: [] };
}

// ── Money at Risk Pack ──
function moneyAtRisk(userId: string, batchId: string): SeedData {
  const d = emptyData();
  const dealIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const leadIds = [crypto.randomUUID()];

  d.leads.push({
    id: leadIds[0], name: 'Margaret Thornton', source: 'Referral',
    last_contact_at: ago(4), engagement_score: 60, notes: 'Buyer for 742 Oakwood.',
    status_tags: ['warm', 'buyer'], assigned_to_user_id: userId,
    created_at: ago(15), lead_temperature: 'warm', ...tag(batchId),
  });

  // High-value deal closing in 3 days, red risk, open milestones
  d.deals.push({
    id: dealIds[0], title: '8800 Grandview Blvd', stage: 'pending', price: 875000,
    commission_amount: 26250, close_date: day(3), risk_level: 'red',
    assigned_to_user_id: userId, created_at: ago(40), last_touched_at: ago(5),
    risk_flags: ['Inspection failed', 'Appraisal pending', 'Buyer financing uncertain'],
    milestone_inspection: 'unknown', milestone_financing: 'unknown', milestone_appraisal: 'unknown',
    ...tag(batchId),
  });

  // Medium deal, yellow risk, financing preapproved but appraisal stalled
  d.deals.push({
    id: dealIds[1], title: '222 Sunset Ridge', stage: 'pending', price: 520000,
    commission_amount: 15600, close_date: day(6), risk_level: 'yellow',
    assigned_to_user_id: userId, created_at: ago(30), last_touched_at: ago(3),
    risk_flags: ['Appraisal delayed', 'Title search pending'],
    milestone_inspection: 'complete', milestone_financing: 'preapproved', milestone_appraisal: 'ordered',
    ...tag(batchId),
  });

  // Deal with missing price edge case
  d.deals.push({
    id: dealIds[2], title: '456 Unknown Price Ln', stage: 'offer_accepted', price: 0,
    commission_amount: 0, close_date: day(10), risk_level: 'yellow',
    assigned_to_user_id: userId, created_at: ago(5), last_touched_at: ago(1),
    risk_flags: ['Price TBD'], ...tag(batchId),
  });

  // Participants — one with split > 100 warning
  d.dealParticipants.push(
    { deal_id: dealIds[0], user_id: userId, role: 'primary_agent', split_percent: 100, ...tag(batchId) },
    { deal_id: dealIds[1], user_id: userId, role: 'primary_agent', split_percent: 70, ...tag(batchId) },
    { deal_id: dealIds[2], user_id: userId, role: 'primary_agent', split_percent: 110, ...tag(batchId) }, // edge case
  );

  d.alerts.push(
    { type: 'risk', title: 'Inspection failed — 8800 Grandview', detail: 'Buyer may walk. $26K commission at risk.', expires_at: day(2), related_deal_id: dealIds[0], ...tag(batchId) },
    { type: 'urgent', title: 'Appraisal delayed — 222 Sunset Ridge', detail: 'Close date in 6 days, appraisal still ordered.', expires_at: day(4), related_deal_id: dealIds[1], ...tag(batchId) },
  );

  d.tasks.push(
    { title: 'Call appraiser — 8800 Grandview', type: 'closing', due_at: hour(2), related_deal_id: dealIds[0], assigned_to_user_id: userId, ...tag(batchId) },
    { title: 'Follow up lender — 222 Sunset Ridge', type: 'closing', due_at: day(1), related_deal_id: dealIds[1], assigned_to_user_id: userId, ...tag(batchId) },
  );

  return d;
}

// ── Opportunity Pack ──
function opportunity(userId: string, batchId: string): SeedData {
  const d = emptyData();
  const leadIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

  // Hot lead, no touch in 48h
  d.leads.push({
    id: leadIds[0], name: 'Aisha Mohammed', source: 'Zillow',
    last_contact_at: ago(3), engagement_score: 92, notes: 'Pre-approved $800K. Viewed 6 listings.',
    status_tags: ['hot', 'buyer'], assigned_to_user_id: userId,
    created_at: ago(5), last_activity_at: hour(-4), lead_temperature: 'hot', ...tag(batchId),
  });

  // Hot lead, brand new (18h old)
  d.leads.push({
    id: leadIds[1], name: 'Carlos Mendoza', source: 'Facebook Ad',
    last_contact_at: hour(-18), engagement_score: 85, notes: 'Luxury condo buyer. Responded to ad immediately.',
    status_tags: ['hot', 'buyer', 'new'], assigned_to_user_id: userId,
    created_at: hour(-18), last_activity_at: hour(-2), lead_temperature: 'hot', ...tag(batchId),
  });

  // Warm lead, recently touched
  d.leads.push({
    id: leadIds[2], name: 'Jennifer Walsh', source: 'Open House',
    last_contact_at: ago(1), engagement_score: 68, notes: 'Interested in listing. Owns duplex.',
    status_tags: ['warm', 'seller'], assigned_to_user_id: userId,
    created_at: ago(8), last_activity_at: ago(1), lead_temperature: 'warm',
    last_touched_at: ago(1), ...tag(batchId),
  });

  // Cold lead re-engaging
  d.leads.push({
    id: leadIds[3], name: 'Tom Bradley', source: 'Website',
    last_contact_at: ago(30), engagement_score: 35, notes: 'Went cold. Just opened 3 emails.',
    status_tags: ['cold', 'buyer'], assigned_to_user_id: userId,
    created_at: ago(60), last_activity_at: hour(-6), lead_temperature: 'cold', ...tag(batchId),
  });

  d.alerts.push(
    { type: 'speed', title: 'Aisha Mohammed browsing again', detail: 'Viewed 3 new luxury listings.', expires_at: hour(6), related_lead_id: leadIds[0], ...tag(batchId) },
    { type: 'speed', title: 'Carlos Mendoza — new hot lead', detail: 'Engagement 85 within 18h. Respond now.', expires_at: hour(4), related_lead_id: leadIds[1], ...tag(batchId) },
    { type: 'opportunity', title: 'Tom Bradley re-engaged', detail: 'Cold lead opened 3 emails. Re-engage?', expires_at: day(2), related_lead_id: leadIds[3], ...tag(batchId) },
  );

  d.tasks.push(
    { title: 'Call Aisha Mohammed — schedule showing', type: 'call', due_at: hour(1), related_lead_id: leadIds[0], assigned_to_user_id: userId, ...tag(batchId) },
    { title: 'Text Carlos Mendoza — introduce yourself', type: 'text', due_at: hour(0.5), related_lead_id: leadIds[1], assigned_to_user_id: userId, ...tag(batchId) },
    { title: 'Email CMA to Jennifer Walsh', type: 'email', due_at: day(1), related_lead_id: leadIds[2], assigned_to_user_id: userId, ...tag(batchId) },
  );

  return d;
}

// ── Forecast Pack ──
function forecast(userId: string, batchId: string): SeedData {
  const d = emptyData();
  const dealIds = Array.from({ length: 6 }, () => crypto.randomUUID());

  const forecastDeals = [
    { id: dealIds[0], title: '100 Main St — 7-day close', stage: 'pending', price: 450000, commission_amount: 13500, close_date: day(5), risk_level: 'green', milestone_inspection: 'complete', milestone_financing: 'approved', milestone_appraisal: 'complete' },
    { id: dealIds[1], title: '201 Oak Ave — 14-day close', stage: 'pending', price: 380000, commission_amount: 11400, close_date: day(14), risk_level: 'green', milestone_inspection: 'complete', milestone_financing: 'preapproved' },
    { id: dealIds[2], title: '305 Pine Rd — 30-day close', stage: 'offer_accepted', price: 620000, commission_amount: 18600, close_date: day(28), risk_level: 'yellow' },
    { id: dealIds[3], title: '410 Cedar Blvd — 60-day close', stage: 'offer', price: 550000, commission_amount: 16500, close_date: day(55), risk_level: 'green' },
    { id: dealIds[4], title: '520 Birch Ln — 90-day close', stage: 'offer', price: 720000, commission_amount: 21600, close_date: day(85), risk_level: 'green' },
    { id: dealIds[5], title: '88 River Rd — Recently closed', stage: 'closed', price: 475000, commission_amount: 14250, close_date: ago(5), risk_level: 'green' },
  ];

  forecastDeals.forEach(deal => {
    d.deals.push({ ...deal, assigned_to_user_id: userId, created_at: ago(30), last_touched_at: ago(1), risk_flags: [], side: 'buy', ...tag(batchId) });
    d.dealParticipants.push({ deal_id: deal.id, user_id: userId, role: 'primary_agent', split_percent: 100, ...tag(batchId) });
  });

  return d;
}

// ── Stability Pack ──
function stability(userId: string, batchId: string): SeedData {
  const d = emptyData();
  const leadIds = Array.from({ length: 4 }, () => crypto.randomUUID());

  // Lots of leads to create workload strain
  d.leads.push(
    { id: leadIds[0], name: 'Overload Lead A', source: 'Website', last_contact_at: ago(2), engagement_score: 50, status_tags: ['warm', 'buyer'], assigned_to_user_id: userId, created_at: ago(5), lead_temperature: 'warm', ...tag(batchId) },
    { id: leadIds[1], name: 'Overload Lead B', source: 'Zillow', last_contact_at: ago(4), engagement_score: 45, status_tags: ['warm', 'buyer'], assigned_to_user_id: userId, created_at: ago(8), lead_temperature: 'warm', ...tag(batchId) },
    { id: leadIds[2], name: 'Overload Lead C', source: 'Referral', last_contact_at: ago(6), engagement_score: 40, status_tags: ['cold', 'seller'], assigned_to_user_id: userId, created_at: ago(12), lead_temperature: 'cold', ...tag(batchId) },
    { id: leadIds[3], name: 'Overload Lead D', source: 'Open House', last_contact_at: ago(1), engagement_score: 70, status_tags: ['warm', 'buyer'], assigned_to_user_id: userId, created_at: ago(3), lead_temperature: 'warm', ...tag(batchId) },
  );

  // Many tasks — overdue, due today, due soon
  const taskTypes = ['call', 'text', 'email', 'follow_up', 'showing', 'closing'] as const;
  for (let i = 0; i < 15; i++) {
    const isOverdue = i < 5;
    const isDueToday = i >= 5 && i < 9;
    d.tasks.push({
      title: `${isOverdue ? 'OVERDUE: ' : ''}Task ${i + 1} — ${taskTypes[i % taskTypes.length]} ${leadIds[i % leadIds.length].slice(0, 4)}`,
      type: taskTypes[i % taskTypes.length],
      due_at: isOverdue ? ago(i + 1) : isDueToday ? hour(i - 4) : day(i - 8),
      related_lead_id: leadIds[i % leadIds.length],
      assigned_to_user_id: userId,
      ...tag(batchId),
    });
  }

  d.alerts.push(
    { type: 'risk', title: 'Workload capacity strained', detail: '15 tasks, 5 overdue. Consider delegating.', expires_at: day(1), ...tag(batchId) },
  );

  return d;
}

// ── Sync Pack ──
function sync(userId: string, batchId: string): SeedData {
  const d = emptyData();
  // Sync pack creates FUB import run history and drift summary data
  // These go into fub_import_runs and fub_sync_state tables, handled separately
  return d;
}

// ── Activity Pack ──
function activity(userId: string, batchId: string, orgId?: string): SeedData {
  const d = emptyData();
  const leadIds = [crypto.randomUUID(), crypto.randomUUID()];

  d.leads.push(
    { id: leadIds[0], name: 'Activity Lead Alpha', source: 'Referral', last_contact_at: ago(1), engagement_score: 75, status_tags: ['warm', 'buyer'], assigned_to_user_id: userId, created_at: ago(20), lead_temperature: 'warm', last_touched_at: hour(-3), ...tag(batchId) },
    { id: leadIds[1], name: 'Activity Lead Beta', source: 'Zillow', last_contact_at: ago(3), engagement_score: 60, status_tags: ['warm', 'seller'], assigned_to_user_id: userId, created_at: ago(14), lead_temperature: 'warm', ...tag(batchId) },
  );

  // Rich touch history
  const touchTypes = ['call', 'text', 'email', 'showing', 'follow_up'];
  for (let i = 0; i < 12; i++) {
    d.activityEvents.push({
      entity_id: leadIds[i % 2],
      entity_type: 'lead',
      touch_type: touchTypes[i % touchTypes.length],
      user_id: userId,
      organization_id: orgId || crypto.randomUUID(),
      note: `Seeded touch #${i + 1}`,
      created_at: ago(i),
    });
  }

  return d;
}

// ── Golden Path Pack ──
function goldenPath(userId: string, batchId: string): SeedData {
  const d = emptyData();
  const leadId = crypto.randomUUID();
  const dealId = crypto.randomUUID();

  // One hot lead untouched 48h
  d.leads.push({
    id: leadId, name: 'Golden Path VIP', source: 'Sphere',
    last_contact_at: ago(3), engagement_score: 95,
    notes: 'VIP referral. Pre-approved $1.2M. No response in 48h.',
    status_tags: ['hot', 'buyer', 'vip'], assigned_to_user_id: userId,
    created_at: ago(2), last_activity_at: ago(2), lead_temperature: 'hot', ...tag(batchId),
  });

  // One high-risk deal closing in 5 days
  d.deals.push({
    id: dealId, title: '1 Golden Path Estate', stage: 'pending', price: 1200000,
    commission_amount: 36000, close_date: day(5), risk_level: 'red',
    assigned_to_user_id: userId, created_at: ago(45), last_touched_at: ago(4),
    risk_flags: ['Inspection objection deadline tomorrow', 'Appraisal gap possible', 'Financing conditional'],
    milestone_inspection: 'scheduled', milestone_financing: 'preapproved', milestone_appraisal: 'ordered',
    side: 'buy', ...tag(batchId),
  });

  d.dealParticipants.push({
    deal_id: dealId, user_id: userId, role: 'primary_agent', split_percent: 100, ...tag(batchId),
  });

  d.tasks.push(
    { title: 'URGENT: Call Golden Path VIP — 48h no response', type: 'call', due_at: hour(0.5), related_lead_id: leadId, assigned_to_user_id: userId, ...tag(batchId) },
    { title: 'Inspection objection — Golden Path Estate', type: 'closing', due_at: day(1), related_deal_id: dealId, assigned_to_user_id: userId, ...tag(batchId) },
    { title: 'Follow up appraiser — Golden Path Estate', type: 'follow_up', due_at: day(2), related_deal_id: dealId, assigned_to_user_id: userId, ...tag(batchId) },
  );

  d.alerts.push(
    { type: 'speed', title: 'Golden Path VIP — 48h silence', detail: '$1.2M buyer. Engagement 95. No response in 48h.', expires_at: hour(4), related_lead_id: leadId, ...tag(batchId) },
    { type: 'urgent', title: 'Inspection deadline — Golden Path Estate', detail: 'Objection deadline tomorrow. $36K at stake.', expires_at: day(1), related_deal_id: dealId, ...tag(batchId) },
    { type: 'risk', title: 'Appraisal gap risk — Golden Path Estate', detail: 'Appraisal ordered, gap possible on $1.2M price.', expires_at: day(3), related_deal_id: dealId, ...tag(batchId) },
  );

  return d;
}

const GENERATORS: Record<SeedPackId, (userId: string, batchId: string, orgId?: string) => SeedData> = {
  money_at_risk: moneyAtRisk,
  opportunity,
  forecast,
  stability,
  sync,
  activity,
  golden_path: goldenPath,
};

export function generateSeedPack(packIds: SeedPackId[], userId: string, orgId?: string): { batchId: string; data: SeedData } {
  const batchId = `seed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const merged = emptyData();

  for (const packId of packIds) {
    const gen = GENERATORS[packId];
    if (!gen) continue;
    const result = gen(userId, batchId, orgId);
    merged.leads.push(...result.leads);
    merged.deals.push(...result.deals);
    merged.dealParticipants.push(...result.dealParticipants);
    merged.tasks.push(...result.tasks);
    merged.alerts.push(...result.alerts);
    merged.activityEvents.push(...result.activityEvents);
  }

  return { batchId, data: merged };
}
