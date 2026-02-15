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

export function generateDemoData(userId: string) {
  const batchId = `demo_${Date.now()}`;
  const seeded = { seeded: true, seed_batch_id: batchId };

  // Pre-generate IDs
  const leadIds = Array.from({ length: 10 }, () => crypto.randomUUID());
  const dealIds = Array.from({ length: 7 }, () => crypto.randomUUID());
  const taskIds = Array.from({ length: 12 }, () => crypto.randomUUID());
  const alertIds = Array.from({ length: 8 }, () => crypto.randomUUID());

  const leads = [
    { id: leadIds[0], name: 'Sarah Chen', source: 'Zillow', last_contact_at: ago(1), engagement_score: 82, notes: 'Viewed 4 properties this week.', status_tags: ['hot', 'buyer'], assigned_to_user_id: userId, created_at: ago(10), last_activity_at: hour(-2), lead_temperature: 'hot' as const, ...seeded },
    { id: leadIds[1], name: 'Marcus Rivera', source: 'Referral', last_contact_at: ago(5), engagement_score: 65, notes: 'Referral from past client.', status_tags: ['referral', 'buyer'], assigned_to_user_id: userId, created_at: ago(7), last_activity_at: ago(4), lead_temperature: 'warm' as const, ...seeded },
    { id: leadIds[2], name: 'Priya Kapoor', source: 'Open House', last_contact_at: ago(2), engagement_score: 71, notes: 'Pre-approved for $650K.', status_tags: ['pre-approved', 'buyer'], assigned_to_user_id: userId, created_at: ago(14), last_activity_at: ago(1), lead_temperature: 'warm' as const, ...seeded },
    { id: leadIds[3], name: 'James Thornton', source: 'Website', last_contact_at: ago(8), engagement_score: 43, notes: 'Downloaded market report.', status_tags: ['cold', 'seller'], assigned_to_user_id: userId, created_at: ago(20), last_activity_at: ago(8), lead_temperature: 'cold' as const, ...seeded },
    { id: leadIds[4], name: 'Elena Vasquez', source: 'Sphere', last_contact_at: ago(0), engagement_score: 90, notes: 'Ready to list. Wants CMA.', status_tags: ['hot', 'seller'], assigned_to_user_id: userId, created_at: ago(3), last_activity_at: hour(-1), lead_temperature: 'hot' as const, ...seeded },
    { id: leadIds[5], name: 'David Kim', source: 'Zillow', last_contact_at: ago(3), engagement_score: 55, notes: 'Condos downtown. $400K-$500K.', status_tags: ['warm', 'buyer'], assigned_to_user_id: userId, created_at: ago(12), last_activity_at: ago(2), lead_temperature: 'warm' as const, ...seeded },
    { id: leadIds[6], name: 'Amanda Foster', source: 'Facebook Ad', last_contact_at: ago(12), engagement_score: 30, notes: 'Clicked ad, no engagement.', status_tags: ['cold', 'buyer'], assigned_to_user_id: userId, created_at: ago(14), last_activity_at: ago(12), lead_temperature: 'cold' as const, ...seeded },
    { id: leadIds[7], name: 'Robert Chang', source: 'Past Client', last_contact_at: ago(1), engagement_score: 78, notes: 'Looking to upgrade.', status_tags: ['warm', 'buyer', 'seller'], assigned_to_user_id: userId, created_at: ago(30), last_activity_at: ago(1), lead_temperature: 'warm' as const, ...seeded },
    { id: leadIds[8], name: 'Nina Patel', source: 'Zillow', last_contact_at: hour(-6), engagement_score: 88, notes: 'New lead, luxury listings.', status_tags: ['hot', 'buyer'], assigned_to_user_id: userId, created_at: hour(-18), last_activity_at: hour(-3), lead_temperature: 'hot' as const, ...seeded },
    // Listing-side lead for seller pipeline
    { id: leadIds[9], name: 'Patricia Morrison', source: 'Sphere', last_contact_at: ago(2), engagement_score: 76, notes: 'Wants to list her townhome. Estimated $580K.', status_tags: ['warm', 'seller'], assigned_to_user_id: userId, created_at: ago(6), last_activity_at: ago(1), lead_temperature: 'warm' as const, ...seeded },
  ];

  const deals = [
    // Deal 1: Solo deal — user is primary agent, 100% split
    { id: dealIds[0], title: '742 Oakwood Drive', stage: 'pending' as const, price: 525000, commission_amount: 15750, close_date: day(12), risk_level: 'red' as const, assigned_to_user_id: userId, created_at: ago(30), last_touched_at: ago(6), risk_flags: ['Inspection pending', 'Buyer financing unknown'], milestone_inspection: 'unknown', milestone_financing: 'unknown', milestone_appraisal: 'ordered', ...seeded },
    // Deal 2: Team deal — user is primary, 50% split, 25% referral fee
    { id: dealIds[1], title: '189 Lakeview Condo #4B', stage: 'offer_accepted' as const, price: 415000, commission_amount: 12450, referral_fee_percent: 25, close_date: day(28), risk_level: 'yellow' as const, assigned_to_user_id: userId, created_at: ago(20), last_touched_at: ago(3), risk_flags: ['Financing pre-approval pending'], milestone_inspection: 'scheduled', milestone_financing: 'preapproved', milestone_appraisal: 'unknown', ...seeded },
    // Deal 3: Co-agent deal — user is co-agent, 30% split
    { id: dealIds[2], title: '55 Maple Heights', stage: 'offer' as const, price: 680000, commission_amount: 20400, close_date: day(45), risk_level: 'green' as const, assigned_to_user_id: userId, created_at: ago(5), last_touched_at: ago(1), risk_flags: [], milestone_inspection: 'unknown', milestone_financing: 'preapproved', ...seeded },
    // Deal 4: Override commission deal
    { id: dealIds[3], title: '1200 Park Avenue #12', stage: 'pending' as const, price: 390000, commission_amount: 11700, close_date: day(7), risk_level: 'yellow' as const, assigned_to_user_id: userId, created_at: ago(25), last_touched_at: ago(2), risk_flags: ['Title search pending'], milestone_inspection: 'complete', milestone_financing: 'approved', milestone_appraisal: 'ordered', ...seeded },
    // Deal 5: Closed solo deal
    { id: dealIds[4], title: '88 River Road', stage: 'closed' as const, price: 475000, commission_amount: 14250, close_date: ago(3), risk_level: 'green' as const, assigned_to_user_id: userId, created_at: ago(60), last_touched_at: ago(3), risk_flags: [], ...seeded },
    // Deal 6: Solo deal
    { id: dealIds[5], title: '320 Elm Street', stage: 'offer' as const, price: 550000, commission_amount: 16500, close_date: day(60), risk_level: 'green' as const, assigned_to_user_id: userId, created_at: ago(8), last_touched_at: ago(1), risk_flags: [], ...seeded },
    // Deal 7: Listing-side deal (seller)
    { id: dealIds[6], title: '45 Magnolia Terrace', stage: 'pending' as const, price: 580000, commission_amount: 17400, close_date: day(21), risk_level: 'green' as const, assigned_to_user_id: userId, created_at: ago(10), last_touched_at: ago(1), risk_flags: [], side: 'sell', milestone_inspection: 'complete', milestone_financing: 'approved', milestone_appraisal: 'complete', ...seeded },
  ];

  const dealParticipants = [
    { deal_id: dealIds[0], user_id: userId, role: 'primary_agent' as const, split_percent: 100, ...seeded },
    { deal_id: dealIds[1], user_id: userId, role: 'primary_agent' as const, split_percent: 50, ...seeded },
    { deal_id: dealIds[2], user_id: userId, role: 'co_agent' as const, split_percent: 30, ...seeded },
    { deal_id: dealIds[3], user_id: userId, role: 'primary_agent' as const, split_percent: 100, commission_override: 5000, ...seeded },
    { deal_id: dealIds[4], user_id: userId, role: 'primary_agent' as const, split_percent: 100, ...seeded },
    { deal_id: dealIds[5], user_id: userId, role: 'primary_agent' as const, split_percent: 100, ...seeded },
    { deal_id: dealIds[6], user_id: userId, role: 'primary_agent' as const, split_percent: 100, ...seeded },
  ];

  const tasks = [
    { id: taskIds[0], title: 'Call Sarah Chen — confirm showing at 742 Oakwood', type: 'call' as const, due_at: hour(2), related_lead_id: leadIds[0], related_deal_id: dealIds[0], assigned_to_user_id: userId, ...seeded },
    { id: taskIds[1], title: 'Follow up with Marcus Rivera — referral expiring', type: 'follow_up' as const, due_at: hour(4), related_lead_id: leadIds[1], assigned_to_user_id: userId, ...seeded },
    { id: taskIds[2], title: 'Send CMA to Elena Vasquez', type: 'email' as const, due_at: day(1), related_lead_id: leadIds[4], assigned_to_user_id: userId, ...seeded },
    { id: taskIds[3], title: 'Inspection follow-up — 742 Oakwood', type: 'closing' as const, due_at: hour(-2), related_deal_id: dealIds[0], assigned_to_user_id: userId, ...seeded },
    { id: taskIds[4], title: 'Submit financing docs — Lakeview Condo', type: 'closing' as const, due_at: day(2), related_deal_id: dealIds[1], assigned_to_user_id: userId, ...seeded },
    { id: taskIds[5], title: 'Open house prep — 55 Maple Heights', type: 'open_house' as const, due_at: day(3), related_deal_id: dealIds[2], assigned_to_user_id: userId, ...seeded },
    { id: taskIds[6], title: 'Thank you note — 88 River Road closing', type: 'thank_you' as const, due_at: day(0), related_deal_id: dealIds[4], assigned_to_user_id: userId, ...seeded },
    { id: taskIds[7], title: 'Text Priya Kapoor — new Lakeview listing', type: 'text' as const, due_at: hour(1), related_lead_id: leadIds[2], assigned_to_user_id: userId, ...seeded },
    { id: taskIds[8], title: 'Show 1200 Park Avenue to David Kim', type: 'showing' as const, due_at: day(1), related_lead_id: leadIds[5], related_deal_id: dealIds[3], assigned_to_user_id: userId, ...seeded },
    { id: taskIds[9], title: 'Call James Thornton — re-engage cold lead', type: 'call' as const, due_at: day(2), related_lead_id: leadIds[3], assigned_to_user_id: userId, ...seeded },
    { id: taskIds[10], title: 'Follow up Robert Chang — listing discussion', type: 'follow_up' as const, due_at: hour(-6), related_lead_id: leadIds[7], assigned_to_user_id: userId, ...seeded },
    { id: taskIds[11], title: 'Schedule photos — 45 Magnolia Terrace', type: 'showing' as const, due_at: day(2), related_deal_id: dealIds[6], related_lead_id: leadIds[9], assigned_to_user_id: userId, ...seeded },
  ];

  // Alerts with 7+ day expiry so reviewers returning later still see them
  const alerts = [
    { id: alertIds[0], type: 'speed' as const, title: 'Sarah Chen browsing Zillow again', detail: 'Viewed 3 new listings in the last hour.', expires_at: day(7), related_lead_id: leadIds[0], ...seeded },
    { id: alertIds[1], type: 'urgent' as const, title: 'Inspection deadline — 742 Oakwood', detail: 'Inspection objection deadline is tomorrow.', expires_at: day(7), related_deal_id: dealIds[0], ...seeded },
    { id: alertIds[2], type: 'risk' as const, title: 'Financing unknown — Lakeview Condo', detail: "Buyer's lender hasn't confirmed pre-approval.", expires_at: day(10), related_deal_id: dealIds[1], ...seeded },
    { id: alertIds[3], type: 'opportunity' as const, title: 'Marcus Rivera referral expiring', detail: 'Referral bonus expires in 5 days.', expires_at: day(10), related_lead_id: leadIds[1], ...seeded },
    { id: alertIds[4], type: 'speed' as const, title: 'Elena Vasquez ready to list', detail: 'Engagement score at 90.', expires_at: day(7), related_lead_id: leadIds[4], ...seeded },
    { id: alertIds[5], type: 'risk' as const, title: '1200 Park Ave — closing in 7 days', detail: 'Title search still pending.', expires_at: day(7), related_deal_id: dealIds[3], ...seeded },
    { id: alertIds[6], type: 'speed' as const, title: 'Nina Patel — new hot lead responding', detail: 'New Zillow lead with 88 engagement score.', expires_at: day(7), related_lead_id: leadIds[8], ...seeded },
    { id: alertIds[7], type: 'opportunity' as const, title: 'Patricia Morrison — listing opportunity', detail: 'Warm seller lead. Townhome est. $580K, $17K commission.', expires_at: day(10), related_lead_id: leadIds[9], ...seeded },
  ];

  // Activity events for Activity Trail / Agent Profile panels
  // Requires an organization_id — we use a deterministic demo org UUID
  const demoOrgId = '00000000-0000-4000-a000-000000000001';
  const touchTypes = ['call', 'text', 'email', 'showing', 'follow_up'];
  const activityEvents = [
    // Sarah Chen — multiple recent touches
    { entity_id: leadIds[0], entity_type: 'lead', touch_type: 'call', user_id: userId, organization_id: demoOrgId, note: 'Discussed Oakwood showing time.', created_at: ago(1) },
    { entity_id: leadIds[0], entity_type: 'lead', touch_type: 'text', user_id: userId, organization_id: demoOrgId, note: 'Sent listing photos.', created_at: ago(2) },
    { entity_id: leadIds[0], entity_type: 'lead', touch_type: 'showing', user_id: userId, organization_id: demoOrgId, note: 'Showed 742 Oakwood Drive.', created_at: ago(5) },
    // Marcus Rivera
    { entity_id: leadIds[1], entity_type: 'lead', touch_type: 'call', user_id: userId, organization_id: demoOrgId, note: 'Initial referral call.', created_at: ago(5) },
    { entity_id: leadIds[1], entity_type: 'lead', touch_type: 'email', user_id: userId, organization_id: demoOrgId, note: 'Sent pre-approval checklist.', created_at: ago(3) },
    // Elena Vasquez
    { entity_id: leadIds[4], entity_type: 'lead', touch_type: 'call', user_id: userId, organization_id: demoOrgId, note: 'Discussed listing timeline.', created_at: ago(1) },
    { entity_id: leadIds[4], entity_type: 'lead', touch_type: 'email', user_id: userId, organization_id: demoOrgId, note: 'Sent comparable market analysis.', created_at: ago(0) },
    // Deal touches
    { entity_id: dealIds[0], entity_type: 'deal', touch_type: 'call', user_id: userId, organization_id: demoOrgId, note: 'Called lender for 742 Oakwood.', created_at: ago(3) },
    { entity_id: dealIds[1], entity_type: 'deal', touch_type: 'email', user_id: userId, organization_id: demoOrgId, note: 'Sent docs to title company.', created_at: ago(2) },
    { entity_id: dealIds[3], entity_type: 'deal', touch_type: 'call', user_id: userId, organization_id: demoOrgId, note: 'Title search follow-up.', created_at: ago(1) },
    // Robert Chang
    { entity_id: leadIds[7], entity_type: 'lead', touch_type: 'follow_up', user_id: userId, organization_id: demoOrgId, note: 'Discussed upgrade options.', created_at: ago(1) },
    // Nina Patel — new lead touches
    { entity_id: leadIds[8], entity_type: 'lead', touch_type: 'call', user_id: userId, organization_id: demoOrgId, note: 'Intro call — luxury buyer.', created_at: hour(-6) },
    { entity_id: leadIds[8], entity_type: 'lead', touch_type: 'text', user_id: userId, organization_id: demoOrgId, note: 'Sent 3 luxury listings.', created_at: hour(-3) },
    // Patricia Morrison — listing side
    { entity_id: leadIds[9], entity_type: 'lead', touch_type: 'call', user_id: userId, organization_id: demoOrgId, note: 'Listing consultation call.', created_at: ago(2) },
    { entity_id: dealIds[6], entity_type: 'deal', touch_type: 'showing', user_id: userId, organization_id: demoOrgId, note: 'Walk-through for listing photos.', created_at: ago(1) },
    // David Kim
    { entity_id: leadIds[5], entity_type: 'lead', touch_type: 'email', user_id: userId, organization_id: demoOrgId, note: 'Sent downtown condo options.', created_at: ago(2) },
    { entity_id: leadIds[5], entity_type: 'lead', touch_type: 'text', user_id: userId, organization_id: demoOrgId, note: 'Confirmed showing time.', created_at: ago(1) },
  ];

  return { leads, deals, dealParticipants, tasks, alerts, activityEvents };
}
