/**
 * Agent Health Model
 * 
 * Computes an Agent Health Index (0–100) from stability, task management,
 * money-at-risk exposure, forecast trend, and activity signals.
 */

import type { StabilityResult } from '@/lib/stabilityModel';

export type HealthBand = 'Healthy' | 'Watch' | 'Needs Support' | 'Critical';

export interface AgentHealthScore {
  score: number;
  band: HealthBand;
  factors: { label: string; impact: number }[];
  topConcerns: string[];
}

export interface AgentHealthInputs {
  stabilityScore: number;
  overdueTaskCount: number;
  moneyAtRiskRatio: number; // moneyAtRisk / forecast30
  forecastTrend: 'rising' | 'flat' | 'declining';
  activityDecline: boolean; // true if touches/actions declining over 7d
  totalActiveDays30: number;
}

export function computeAgentHealth(inputs: AgentHealthInputs): AgentHealthScore {
  let score = 100;
  const factors: { label: string; impact: number }[] = [];

  // Stability contribution (max -30)
  if (inputs.stabilityScore < 40) {
    const penalty = 30;
    factors.push({ label: 'Low stability score', impact: -penalty });
    score -= penalty;
  } else if (inputs.stabilityScore < 60) {
    const penalty = 15;
    factors.push({ label: 'Below-average stability', impact: -penalty });
    score -= penalty;
  } else if (inputs.stabilityScore < 75) {
    const penalty = 5;
    factors.push({ label: 'Stability needs attention', impact: -penalty });
    score -= penalty;
  }

  // Overdue tasks (max -25)
  if (inputs.overdueTaskCount >= 8) {
    factors.push({ label: `${inputs.overdueTaskCount} overdue tasks`, impact: -25 });
    score -= 25;
  } else if (inputs.overdueTaskCount >= 4) {
    factors.push({ label: `${inputs.overdueTaskCount} overdue tasks`, impact: -15 });
    score -= 15;
  } else if (inputs.overdueTaskCount >= 2) {
    factors.push({ label: `${inputs.overdueTaskCount} overdue tasks`, impact: -8 });
    score -= 8;
  }

  // Money at risk ratio (max -20)
  if (inputs.moneyAtRiskRatio > 0.5) {
    factors.push({ label: 'High money at risk exposure', impact: -20 });
    score -= 20;
  } else if (inputs.moneyAtRiskRatio > 0.25) {
    factors.push({ label: 'Elevated money at risk', impact: -10 });
    score -= 10;
  }

  // Forecast trend (max -15)
  if (inputs.forecastTrend === 'declining') {
    factors.push({ label: 'Declining income forecast', impact: -15 });
    score -= 15;
  }

  // Activity decline (max -10)
  if (inputs.activityDecline) {
    factors.push({ label: 'Declining activity levels', impact: -10 });
    score -= 10;
  }

  // Low active days
  if (inputs.totalActiveDays30 < 10) {
    factors.push({ label: 'Low engagement (< 10 active days)', impact: -10 });
    score -= 10;
  }

  const clamped = Math.max(0, Math.min(100, score));
  const band = getHealthBand(clamped);
  const topConcerns = factors
    .sort((a, b) => a.impact - b.impact)
    .slice(0, 3)
    .map(f => f.label);

  return { score: clamped, band, factors, topConcerns };
}

function getHealthBand(score: number): HealthBand {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Watch';
  if (score >= 40) return 'Needs Support';
  return 'Critical';
}

// ── Brokerage Aggregation ─────────────────────────────────────────

export interface BrokerageMetrics {
  totalAgents: number;
  totalProjectedCommission30: number;
  totalProjectedCommission90: number;
  totalMoneyAtRisk: number;
  healthDistribution: Record<HealthBand, number>;
  stabilityDistribution: { high: number; medium: number; low: number };
  avgStabilityScore: number;
  avgForecast30: number;
  activityHealthIndicators: {
    activeAgents: number;
    decliningAgents: number;
    disengagedAgents: number;
  };
  retentionWarnings: string[];
  coachingFocusAreas: { area: string; description: string; priority: 'high' | 'medium' | 'low' }[];
}

export interface AgentSummary {
  userId: string;
  name: string;
  healthScore: AgentHealthScore;
  stabilityScore: number;
  forecast30: number;
  moneyAtRisk: number;
  overdueTaskCount: number;
  activeDays30: number;
  forecastTrend: 'rising' | 'flat' | 'declining';
  activityDecline: boolean;
}

export function computeBrokerageMetrics(agents: AgentSummary[]): BrokerageMetrics {
  const totalAgents = agents.length;

  const healthDist: Record<HealthBand, number> = { 'Healthy': 0, 'Watch': 0, 'Needs Support': 0, 'Critical': 0 };
  const stabDist = { high: 0, medium: 0, low: 0 };

  let totalForecast30 = 0;
  let totalForecast90 = 0;
  let totalRisk = 0;
  let totalStability = 0;
  let activeCount = 0;
  let decliningCount = 0;
  let disengagedCount = 0;

  for (const agent of agents) {
    healthDist[agent.healthScore.band]++;
    
    if (agent.stabilityScore >= 75) stabDist.high++;
    else if (agent.stabilityScore >= 50) stabDist.medium++;
    else stabDist.low++;

    totalForecast30 += agent.forecast30;
    totalRisk += agent.moneyAtRisk;
    totalStability += agent.stabilityScore;

    if (agent.activeDays30 >= 20) activeCount++;
    if (agent.activityDecline) decliningCount++;
    if (agent.activeDays30 < 10) disengagedCount++;
  }

  // Retention warnings
  const warnings: string[] = [];
  if (disengagedCount >= 3) {
    warnings.push(`${disengagedCount} agents showing disengagement patterns.`);
  }
  if (decliningCount >= Math.ceil(totalAgents * 0.3)) {
    warnings.push(`${decliningCount} agents with declining activity — review needed.`);
  }
  const criticalCount = healthDist['Critical'] + healthDist['Needs Support'];
  if (criticalCount >= 2) {
    warnings.push(`${criticalCount} agents need support attention.`);
  }

  // Coaching focus areas
  const coaching: BrokerageMetrics['coachingFocusAreas'] = [];
  
  const avgOverdue = agents.reduce((s, a) => s + a.overdueTaskCount, 0) / Math.max(totalAgents, 1);
  if (avgOverdue > 3) {
    coaching.push({ area: 'Task Management', description: 'Average overdue tasks above 3 — focus on follow-up speed and task completion.', priority: 'high' });
  }

  const riskRatio = totalRisk / Math.max(totalForecast30, 1);
  if (riskRatio > 0.3) {
    coaching.push({ area: 'Risk Management', description: 'Money at risk exceeds 30% of projected income — review deal risk behaviors.', priority: 'high' });
  }

  const lowConversion = agents.filter(a => a.healthScore.factors.some(f => f.label.includes('Declining'))).length;
  if (lowConversion > 2) {
    coaching.push({ area: 'Pipeline Development', description: `${lowConversion} agents with declining forecasts — prioritize prospecting coaching.`, priority: 'medium' });
  }

  if (stabDist.low > Math.ceil(totalAgents * 0.25)) {
    coaching.push({ area: 'Stability Improvement', description: 'Over 25% of agents have low stability — address workload distribution.', priority: 'medium' });
  }

  return {
    totalAgents,
    totalProjectedCommission30: totalForecast30,
    totalProjectedCommission90: totalForecast90,
    totalMoneyAtRisk: totalRisk,
    healthDistribution: healthDist,
    stabilityDistribution: stabDist,
    avgStabilityScore: totalAgents > 0 ? Math.round(totalStability / totalAgents) : 0,
    avgForecast30: totalAgents > 0 ? Math.round(totalForecast30 / totalAgents) : 0,
    activityHealthIndicators: {
      activeAgents: activeCount,
      decliningAgents: decliningCount,
      disengagedAgents: disengagedCount,
    },
    retentionWarnings: warnings,
    coachingFocusAreas: coaching,
  };
}

// ── Value Report ──────────────────────────────────────────────────

export interface BrokerageValueReport {
  period: string;
  incomeProtected: number;
  dealsSavedFromRisk: number;
  productivityImprovement: string;
  stabilityImprovement: string;
  generatedAt: string;
}

export function generateValueReport(
  agents: AgentSummary[],
  totalMoneyAtRisk: number,
  totalForecast: number,
): BrokerageValueReport {
  const healthyCount = agents.filter(a => a.healthScore.band === 'Healthy').length;
  const totalAgents = agents.length || 1;
  const healthyPct = Math.round((healthyCount / totalAgents) * 100);

  return {
    period: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    incomeProtected: totalForecast - totalMoneyAtRisk,
    dealsSavedFromRisk: agents.reduce((s, a) => s + (a.moneyAtRisk > 0 && a.healthScore.band !== 'Critical' ? 1 : 0), 0),
    productivityImprovement: `${healthyPct}% of agents operating at healthy levels`,
    stabilityImprovement: `Average stability: ${Math.round(agents.reduce((s, a) => s + a.stabilityScore, 0) / totalAgents)}`,
    generatedAt: new Date().toISOString(),
  };
}
