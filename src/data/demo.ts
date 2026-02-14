import type { Lead, Deal, Task, Alert } from '@/types';

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

const USER_ID = 'demo-agent-1';

export const demoLeads: Lead[] = [
  { id: 'lead-1', name: 'Sarah Chen', source: 'Zillow', lastContactAt: ago(1), engagementScore: 82, notes: 'Viewed 4 properties this week. Actively browsing.', statusTags: ['hot', 'buyer'], assignedToUserId: USER_ID },
  { id: 'lead-2', name: 'Marcus Rivera', source: 'Referral', lastContactAt: ago(5), engagementScore: 65, notes: 'Referral from past client. Needs follow-up before referral expires.', statusTags: ['referral', 'buyer'], assignedToUserId: USER_ID },
  { id: 'lead-3', name: 'Priya Kapoor', source: 'Open House', lastContactAt: ago(2), engagementScore: 71, notes: 'Interested in Lakeview area. Pre-approved for $650K.', statusTags: ['pre-approved', 'buyer'], assignedToUserId: USER_ID },
  { id: 'lead-4', name: 'James Thornton', source: 'Website', lastContactAt: ago(8), engagementScore: 43, notes: 'Downloaded market report. No response to calls yet.', statusTags: ['cold', 'seller'], assignedToUserId: USER_ID },
  { id: 'lead-5', name: 'Elena Vasquez', source: 'Sphere', lastContactAt: ago(0), engagementScore: 90, notes: 'Ready to list. Wants CMA this week.', statusTags: ['hot', 'seller'], assignedToUserId: USER_ID },
  { id: 'lead-6', name: 'David Kim', source: 'Zillow', lastContactAt: ago(3), engagementScore: 55, notes: 'Looking at condos downtown. Budget $400K-$500K.', statusTags: ['warm', 'buyer'], assignedToUserId: USER_ID },
  { id: 'lead-7', name: 'Amanda Foster', source: 'Facebook Ad', lastContactAt: ago(12), engagementScore: 30, notes: 'Clicked ad but no engagement since.', statusTags: ['cold', 'buyer'], assignedToUserId: USER_ID },
  { id: 'lead-8', name: 'Robert Chang', source: 'Past Client', lastContactAt: ago(1), engagementScore: 78, notes: 'Looking to upgrade. Has equity in current home.', statusTags: ['warm', 'buyer', 'seller'], assignedToUserId: USER_ID },
];

export const demoDeals: Deal[] = [
  { id: 'deal-1', title: '742 Oakwood Drive', stage: 'pending', price: 525000, commission: 15750, closeDate: day(12), riskLevel: 'red', assignedToUserId: USER_ID },
  { id: 'deal-2', title: '189 Lakeview Condo #4B', stage: 'offer_accepted', price: 415000, commission: 12450, closeDate: day(28), riskLevel: 'yellow', assignedToUserId: USER_ID },
  { id: 'deal-3', title: '55 Maple Heights', stage: 'offer', price: 680000, commission: 20400, closeDate: day(45), riskLevel: 'green', assignedToUserId: USER_ID },
  { id: 'deal-4', title: '1200 Park Avenue #12', stage: 'pending', price: 390000, commission: 11700, closeDate: day(7), riskLevel: 'yellow', assignedToUserId: USER_ID },
  { id: 'deal-5', title: '88 River Road', stage: 'closed', price: 475000, commission: 14250, closeDate: ago(3), riskLevel: 'green', assignedToUserId: USER_ID },
  { id: 'deal-6', title: '320 Elm Street', stage: 'offer', price: 550000, commission: 16500, closeDate: day(60), riskLevel: 'green', assignedToUserId: USER_ID },
];

export const demoTasks: Task[] = [
  { id: 'task-1', title: 'Call Sarah Chen — confirm showing at 742 Oakwood', type: 'call', dueAt: hour(2), relatedLeadId: 'lead-1', relatedDealId: 'deal-1', assignedToUserId: USER_ID },
  { id: 'task-2', title: 'Follow up with Marcus Rivera — referral expiring', type: 'follow_up', dueAt: hour(4), relatedLeadId: 'lead-2', assignedToUserId: USER_ID },
  { id: 'task-3', title: 'Send CMA to Elena Vasquez', type: 'email', dueAt: day(1), relatedLeadId: 'lead-5', assignedToUserId: USER_ID },
  { id: 'task-4', title: 'Inspection follow-up — 742 Oakwood', type: 'closing', dueAt: hour(-2), relatedDealId: 'deal-1', assignedToUserId: USER_ID },
  { id: 'task-5', title: 'Submit financing docs — Lakeview Condo', type: 'closing', dueAt: day(2), relatedDealId: 'deal-2', assignedToUserId: USER_ID },
  { id: 'task-6', title: 'Open house prep — 55 Maple Heights', type: 'open_house', dueAt: day(3), relatedDealId: 'deal-3', assignedToUserId: USER_ID },
  { id: 'task-7', title: 'Thank you note — 88 River Road closing', type: 'thank_you', dueAt: day(0), relatedDealId: 'deal-5', assignedToUserId: USER_ID },
  { id: 'task-8', title: 'Text Priya Kapoor — new Lakeview listing', type: 'text', dueAt: hour(1), relatedLeadId: 'lead-3', assignedToUserId: USER_ID },
  { id: 'task-9', title: 'Show 1200 Park Avenue to David Kim', type: 'showing', dueAt: day(1), relatedLeadId: 'lead-6', relatedDealId: 'deal-4', assignedToUserId: USER_ID },
  { id: 'task-10', title: 'Call James Thornton — re-engage cold lead', type: 'call', dueAt: day(2), relatedLeadId: 'lead-4', assignedToUserId: USER_ID },
  { id: 'task-11', title: 'Follow up Robert Chang — listing discussion', type: 'follow_up', dueAt: hour(-6), relatedLeadId: 'lead-8', assignedToUserId: USER_ID },
];

export const demoAlerts: Alert[] = [
  { id: 'alert-1', type: 'speed', title: 'Sarah Chen browsing Zillow again', detail: 'Viewed 3 new listings in the last hour. Reach out now before she contacts another agent.', expiresAt: hour(4), relatedLeadId: 'lead-1' },
  { id: 'alert-2', type: 'urgent', title: 'Inspection deadline — 742 Oakwood', detail: 'Inspection objection deadline is tomorrow. Must respond or risk losing the deal.', expiresAt: day(1), relatedDealId: 'deal-1' },
  { id: 'alert-3', type: 'risk', title: 'Financing unknown — Lakeview Condo', detail: "Buyer's lender hasn't confirmed pre-approval. Follow up to avoid contract fall-through.", expiresAt: day(3), relatedDealId: 'deal-2' },
  { id: 'alert-4', type: 'opportunity', title: 'Marcus Rivera referral expiring', detail: 'Referral bonus from past client expires in 5 days. Schedule a call to convert.', expiresAt: day(5), relatedLeadId: 'lead-2' },
  { id: 'alert-5', type: 'speed', title: 'Elena Vasquez ready to list', detail: 'Engagement score at 90. She wants a CMA this week — move fast.', expiresAt: day(2), relatedLeadId: 'lead-5' },
  { id: 'alert-6', type: 'risk', title: '1200 Park Ave — closing in 7 days', detail: 'Title search still pending. Confirm with title company today.', expiresAt: day(2), relatedDealId: 'deal-4' },
];

export const DEMO_USER_ID = USER_ID;
