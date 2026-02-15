/**
 * Strategic Engine
 *
 * Analyzes pipeline composition, income targets, and gap analysis
 * to provide high-level strategic guidance. Does NOT modify scoring logic.
 */

import type { Deal, Lead } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import type { ForecastSummary } from '@/lib/forecastModel';
import type { StabilityResult } from '@/lib/stabilityModel';

// ── Types ────────────────────────────────────────────────────────────

export type StrategyMode = 'growth' | 'protection' | 'stability' | 'opportunity';
export type ForecastAlignment = 'on_track' | 'slightly_behind' | 'off_track' | 'critical_gap';
export type PipelineBalance = 'balanced' | 'buyer_heavy' | 'seller_heavy' | 'early_stage_heavy' | 'risk_heavy';
export type GapType = 'insufficient_leads' | 'too_few_deals' | 'early_stage' | 'risk_concentration' | 'deal_mix_imbalance';
export type StrategyRecommendation = 'increase_prospecting' | 'focus_listings' | 'stabilize_deals' | 're_engage_pipeline' | 'protect_closings';

export interface StrategicSettings {
  weeklyTarget: number;
  monthlyTarget: number;
  preferredDealMix: { buyers: number; sellers: number; listings: number; investors: number };
  comfortPipelineSize: number;
}

export interface StrategicGap {
  type: GapType;
  label: string;
  description: string;
  severity: 'low' | 'moderate' | 'high';
}

export interface StrategicAlert {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface WeeklyPlan {
  priorities: string[];
  timeAllocations: { category: string; percent: number; description: string }[];
  incomeActions: string[];
  riskActions: string[];
}

export interface StrategicOverview {
  mode: StrategyMode;
  modeLabel: string;
  modeDescription: string;
  weeklyTarget: number;
  monthlyTarget: number;
  projected30: number;
  projected7: number;
  weeklyGap: number;
  monthlyGap: number;
  pipelineCoverage30: number;
  pipelineCoverage60: number;
  pipelineCoverage90: number;
  riskToTarget: 'low' | 'moderate' | 'high';
  alignment: ForecastAlignment;
  pipelineBalance: PipelineBalance;
  gaps: StrategicGap[];
  recommendations: { key: StrategyRecommendation; label: string; description: string }[];
  alerts: StrategicAlert[];
  weeklyPlan: WeeklyPlan;
}

// ── Defaults ─────────────────────────────────────────────────────────

export const DEFAULT_STRATEGIC_SETTINGS: StrategicSettings = {
  weeklyTarget: 5000,
  monthlyTarget: 20000,
  preferredDealMix: { buyers: 40, sellers: 30, listings: 20, investors: 10 },
  comfortPipelineSize: 8,
};

const STORAGE_KEY = 'dp-strategic-settings';

export function loadStrategicSettings(userId?: string): StrategicSettings {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${userId || 'default'}`);
    if (raw) return { ...DEFAULT_STRATEGIC_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_STRATEGIC_SETTINGS };
}

export function saveStrategicSettings(settings: StrategicSettings, userId?: string): void {
  localStorage.setItem(`${STORAGE_KEY}-${userId || 'default'}`, JSON.stringify(settings));
}

// ── Pipeline Analysis ────────────────────────────────────────────────

function analyzePipelineBalance(deals: Deal[]): PipelineBalance {
  const active = deals.filter(d => d.stage !== 'closed');
  if (active.length === 0) return 'balanced';

  const buyers = active.filter(d => d.side === 'buy').length;
  const sellers = active.filter(d => d.side === 'sell' || d.side === 'list').length;
  const earlyStage = active.filter(d => d.stage === 'offer').length;
  const risky = active.filter(d => d.riskLevel === 'red' || d.riskLevel === 'yellow').length;

  const buyerPct = buyers / active.length;
  const sellerPct = sellers / active.length;
  const earlyPct = earlyStage / active.length;
  const riskPct = risky / active.length;

  if (riskPct > 0.5) return 'risk_heavy';
  if (earlyPct > 0.6) return 'early_stage_heavy';
  if (buyerPct > 0.7) return 'buyer_heavy';
  if (sellerPct > 0.7) return 'seller_heavy';
  return 'balanced';
}

// ── Gap Analysis ─────────────────────────────────────────────────────

function analyzeGaps(
  deals: Deal[],
  leads: Lead[],
  settings: StrategicSettings,
  forecast: ForecastSummary | null,
  moneyResults: MoneyModelResult[],
): StrategicGap[] {
  const gaps: StrategicGap[] = [];
  const active = deals.filter(d => d.stage !== 'closed');
  const activeLeads = leads.filter(l => !l.statusTags?.includes('lost'));

  if (activeLeads.length < 5) {
    gaps.push({
      type: 'insufficient_leads',
      label: 'Not Enough Leads',
      description: `Only ${activeLeads.length} active leads. Increase prospecting to build pipeline.`,
      severity: activeLeads.length < 2 ? 'high' : 'moderate',
    });
  }

  if (active.length < Math.max(3, settings.comfortPipelineSize * 0.5)) {
    gaps.push({
      type: 'too_few_deals',
      label: 'Pipeline Too Thin',
      description: `${active.length} active deals vs ${settings.comfortPipelineSize} target. Need more conversions.`,
      severity: active.length < 2 ? 'high' : 'moderate',
    });
  }

  const earlyStage = active.filter(d => d.stage === 'offer').length;
  if (active.length > 0 && earlyStage / active.length > 0.6) {
    gaps.push({
      type: 'early_stage',
      label: 'Early-Stage Heavy',
      description: `${Math.round((earlyStage / active.length) * 100)}% of deals are in offer stage. Push deals forward.`,
      severity: 'moderate',
    });
  }

  const risky = moneyResults.filter(r => r.riskScore > 50).length;
  if (risky >= 3) {
    gaps.push({
      type: 'risk_concentration',
      label: 'Risk Concentration',
      description: `${risky} deals have elevated risk scores. Diversify or stabilize.`,
      severity: risky >= 5 ? 'high' : 'moderate',
    });
  }

  const balance = analyzePipelineBalance(deals);
  if (balance === 'buyer_heavy' || balance === 'seller_heavy') {
    gaps.push({
      type: 'deal_mix_imbalance',
      label: balance === 'buyer_heavy' ? 'Buyer-Heavy Pipeline' : 'Seller-Heavy Pipeline',
      description: `Pipeline is ${balance.replace('_', '-')}. Consider diversifying deal types.`,
      severity: 'low',
    });
  }

  return gaps;
}

// ── Strategy Recommendations ─────────────────────────────────────────

const RECOMMENDATION_MAP: Record<StrategyRecommendation, { label: string; description: string }> = {
  increase_prospecting: { label: 'Increase Prospecting', description: 'Generate more leads through outreach, networking, and marketing.' },
  focus_listings: { label: 'Focus on Listings', description: 'Prioritize listing appointments and seller relationships.' },
  stabilize_deals: { label: 'Stabilize Active Deals', description: 'Address risk factors and push deals toward closing.' },
  re_engage_pipeline: { label: 'Re-Engage Pipeline', description: 'Reconnect with dormant leads and stalled opportunities.' },
  protect_closings: { label: 'Protect Current Closings', description: 'Ensure deals near closing stay on track.' },
};

function generateRecommendations(
  mode: StrategyMode,
  gaps: StrategicGap[],
): { key: StrategyRecommendation; label: string; description: string }[] {
  const recs: StrategyRecommendation[] = [];

  if (mode === 'growth' || gaps.some(g => g.type === 'insufficient_leads')) {
    recs.push('increase_prospecting');
  }
  if (gaps.some(g => g.type === 'deal_mix_imbalance' && g.label.includes('Buyer'))) {
    recs.push('focus_listings');
  }
  if (mode === 'protection' || gaps.some(g => g.type === 'risk_concentration')) {
    recs.push('stabilize_deals');
    recs.push('protect_closings');
  }
  if (mode === 'stability') {
    recs.push('stabilize_deals');
  }
  if (gaps.some(g => g.type === 'too_few_deals')) {
    recs.push('re_engage_pipeline');
  }

  // Dedupe and limit
  const unique = [...new Set(recs)];
  return unique.slice(0, 4).map(key => ({ key, ...RECOMMENDATION_MAP[key] }));
}

// ── Strategic Alerts ─────────────────────────────────────────────────

function generateAlerts(
  deals: Deal[],
  forecast: ForecastSummary | null,
  settings: StrategicSettings,
  totalMoneyAtRisk: number,
  gaps: StrategicGap[],
): StrategicAlert[] {
  const alerts: StrategicAlert[] = [];
  const active = deals.filter(d => d.stage !== 'closed');

  // Pipeline insufficient
  if (active.length < settings.comfortPipelineSize * 0.5) {
    alerts.push({
      id: 'pipeline_insufficient',
      title: 'Pipeline Below Target',
      description: `${active.length} active deals vs ${settings.comfortPipelineSize} target pipeline size.`,
      severity: 'warning',
    });
  }

  // Income concentration
  if (forecast && forecast.topContributors.length > 0) {
    const topDeal = forecast.topContributors[0];
    const pct = forecast.next30 > 0 ? topDeal.expectedPersonalCommission / forecast.next30 : 0;
    if (pct > 0.6) {
      alerts.push({
        id: 'income_concentration',
        title: 'Income Concentrated in One Deal',
        description: `${Math.round(pct * 100)}% of 30-day income depends on "${topDeal.dealTitle}".`,
        severity: 'critical',
      });
    }
  }

  // Future income cliff
  if (forecast && forecast.next90 > 0 && forecast.next30 > forecast.next90 * 0.7) {
    alerts.push({
      id: 'income_cliff',
      title: 'Future Income Cliff Detected',
      description: 'Most income is concentrated in the next 30 days with limited pipeline beyond.',
      severity: 'warning',
    });
  }

  // Lead flow slowing
  if (gaps.some(g => g.type === 'insufficient_leads' && g.severity === 'high')) {
    alerts.push({
      id: 'lead_flow_slow',
      title: 'Lead Flow Slowing',
      description: 'Active lead count is critically low. Increase prospecting immediately.',
      severity: 'critical',
    });
  }

  return alerts;
}

// ── Weekly Plan ──────────────────────────────────────────────────────

function generateWeeklyPlan(
  mode: StrategyMode,
  gaps: StrategicGap[],
  deals: Deal[],
  totalMoneyAtRisk: number,
): WeeklyPlan {
  const priorities: string[] = [];
  const timeAllocations: { category: string; percent: number; description: string }[] = [];
  const incomeActions: string[] = [];
  const riskActions: string[] = [];

  switch (mode) {
    case 'growth':
      priorities.push('Expand pipeline through prospecting', 'Convert warm leads', 'Build referral network');
      timeAllocations.push(
        { category: 'Prospecting', percent: 40, description: 'Lead generation and outreach' },
        { category: 'Follow-ups', percent: 25, description: 'Nurturing active leads' },
        { category: 'Deal Management', percent: 20, description: 'Advancing existing deals' },
        { category: 'Admin', percent: 15, description: 'Planning and documentation' },
      );
      incomeActions.push('Schedule 3 prospecting blocks', 'Follow up on all warm leads', 'Ask for 2 referrals');
      riskActions.push('Review any at-risk deals weekly', 'Set up automated follow-up reminders');
      break;
    case 'protection':
      priorities.push('Secure at-risk deals', 'Address milestone blockers', 'Communicate with clients');
      timeAllocations.push(
        { category: 'Deal Protection', percent: 40, description: 'Resolving risks and blockers' },
        { category: 'Client Communication', percent: 25, description: 'Proactive updates' },
        { category: 'Prospecting', percent: 20, description: 'Maintaining lead flow' },
        { category: 'Admin', percent: 15, description: 'Documentation and follow-ups' },
      );
      incomeActions.push('Contact all at-risk clients', 'Push pending milestones', 'Identify backup deals');
      riskActions.push('Resolve top 3 risk factors', 'Schedule contingency meetings');
      break;
    case 'stability':
      priorities.push('Clear task backlog', 'Reduce operational load', 'Focus on top 3 deals');
      timeAllocations.push(
        { category: 'Task Clearing', percent: 35, description: 'Clearing overdue items' },
        { category: 'Deal Focus', percent: 30, description: 'Top priority deals only' },
        { category: 'Prospecting', percent: 15, description: 'Minimal maintenance' },
        { category: 'Rest & Plan', percent: 20, description: 'Recovery and planning' },
      );
      incomeActions.push('Close quickest-to-close deals', 'Delegate non-essential tasks');
      riskActions.push('Clear all overdue tasks', 'Pause non-urgent prospecting');
      break;
    case 'opportunity':
      priorities.push('Capitalize on momentum', 'Advance warm leads aggressively', 'Upsell existing clients');
      timeAllocations.push(
        { category: 'Deal Advancement', percent: 35, description: 'Moving deals forward' },
        { category: 'Opportunity Pursuit', percent: 30, description: 'Hot leads and new opportunities' },
        { category: 'Relationship Building', percent: 20, description: 'Networking and referrals' },
        { category: 'Admin', percent: 15, description: 'Planning and documentation' },
      );
      incomeActions.push('Act on all hot opportunities', 'Schedule showings for warm leads', 'Ask for referrals from happy clients');
      riskActions.push('Monitor deals for early warning signs', 'Keep pipeline balanced');
      break;
  }

  return { priorities, timeAllocations, incomeActions, riskActions };
}

// ── Main Compute ─────────────────────────────────────────────────────

export function computeStrategicOverview(
  deals: Deal[],
  leads: Lead[],
  settings: StrategicSettings,
  forecast: ForecastSummary | null,
  moneyResults: MoneyModelResult[],
  stabilityResult: StabilityResult,
  totalMoneyAtRisk: number,
): StrategicOverview {
  const active = deals.filter(d => d.stage !== 'closed');
  const projected30 = forecast?.next30 ?? 0;
  const projected7 = forecast?.next7 ?? 0;

  // Weekly projected = next30 / 4.3
  const weeklyProjected = projected30 / 4.3;
  const weeklyGap = Math.max(0, settings.weeklyTarget - weeklyProjected);
  const monthlyGap = Math.max(0, settings.monthlyTarget - projected30);

  // Pipeline coverage ratios
  const pipelineCoverage30 = settings.monthlyTarget > 0 ? Math.min(200, Math.round((projected30 / settings.monthlyTarget) * 100)) : 0;
  const pipelineCoverage60 = settings.monthlyTarget > 0 ? Math.min(200, Math.round(((forecast?.next90 ?? 0) * 0.66 / settings.monthlyTarget) * 100)) : 0;
  const pipelineCoverage90 = settings.monthlyTarget > 0 ? Math.min(200, Math.round(((forecast?.next90 ?? 0) / settings.monthlyTarget) * 100)) : 0;

  // Risk to target
  const coverageRatio = projected30 / Math.max(1, settings.monthlyTarget);
  const riskToTarget: 'low' | 'moderate' | 'high' =
    coverageRatio >= 0.8 ? 'low' : coverageRatio >= 0.5 ? 'moderate' : 'high';

  // Forecast alignment
  let alignment: ForecastAlignment;
  if (coverageRatio >= 0.9) alignment = 'on_track';
  else if (coverageRatio >= 0.65) alignment = 'slightly_behind';
  else if (coverageRatio >= 0.35) alignment = 'off_track';
  else alignment = 'critical_gap';

  // Strategic mode
  let mode: StrategyMode;
  if (stabilityResult.score < 40) {
    mode = 'stability';
  } else if (totalMoneyAtRisk > settings.monthlyTarget * 0.5 || moneyResults.filter(r => r.personalCommissionAtRisk > 0).length >= 3) {
    mode = 'protection';
  } else if (active.length < Math.max(3, settings.comfortPipelineSize * 0.5)) {
    mode = 'growth';
  } else if (stabilityResult.score > 70 && coverageRatio >= 0.8) {
    mode = 'opportunity';
  } else {
    mode = coverageRatio >= 0.6 ? 'opportunity' : 'growth';
  }

  const MODE_META: Record<StrategyMode, { label: string; description: string }> = {
    growth: { label: 'Growth Mode', description: 'Pipeline needs building. Prioritize prospecting and lead conversion.' },
    protection: { label: 'Protection Mode', description: 'Income is at risk. Focus on securing existing deals.' },
    stability: { label: 'Stability Mode', description: 'Operational load is high. Clear backlog and restore balance.' },
    opportunity: { label: 'Opportunity Mode', description: 'Pipeline is healthy. Capitalize on momentum.' },
  };

  const pipelineBalance = analyzePipelineBalance(deals);
  const gaps = analyzeGaps(deals, leads, settings, forecast, moneyResults);
  const recommendations = generateRecommendations(mode, gaps);
  const alerts = generateAlerts(deals, forecast, settings, totalMoneyAtRisk, gaps);
  const weeklyPlan = generateWeeklyPlan(mode, gaps, deals, totalMoneyAtRisk);

  return {
    mode,
    modeLabel: MODE_META[mode].label,
    modeDescription: MODE_META[mode].description,
    weeklyTarget: settings.weeklyTarget,
    monthlyTarget: settings.monthlyTarget,
    projected30,
    projected7,
    weeklyGap,
    monthlyGap,
    pipelineCoverage30,
    pipelineCoverage60,
    pipelineCoverage90,
    riskToTarget,
    alignment,
    pipelineBalance,
    gaps,
    recommendations,
    alerts,
    weeklyPlan,
  };
}
