/**
 * Market Conditions Model
 *
 * Translates external market signals into pipeline impact analysis,
 * opportunity detection, and strategy adjustments.
 * No MLS integration required — manual inputs.
 */

import type { Deal, Lead } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { ForecastSummary } from '@/lib/forecastModel';

// ── Types ────────────────────────────────────────────────────────────

export type MarketTrend = 'rising' | 'stable' | 'falling';
export type InventoryTrend = 'increasing' | 'stable' | 'decreasing';
export type DemandTrend = 'strong' | 'moderate' | 'weak';
export type SeasonalPhase = 'peak' | 'cooling' | 'off_season';
export type DomTrend = 'increasing' | 'stable' | 'decreasing';

export interface MarketConditions {
  interestRateTrend: MarketTrend;
  inventoryTrend: InventoryTrend;
  domTrend: DomTrend;
  buyerDemandTrend: DemandTrend;
  seasonalPhase: SeasonalPhase;
  updatedAt: string;
}

export const DEFAULT_MARKET_CONDITIONS: MarketConditions = {
  interestRateTrend: 'stable',
  inventoryTrend: 'stable',
  domTrend: 'stable',
  buyerDemandTrend: 'moderate',
  seasonalPhase: 'peak',
  updatedAt: new Date().toISOString(),
};

// ── Pipeline Impact ──────────────────────────────────────────────────

export interface PipelineImpact {
  segment: 'buyers' | 'sellers' | 'pending' | 'listings' | 'lead_conversion';
  effect: 'positive' | 'neutral' | 'negative';
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export function analyzePipelineImpact(conditions: MarketConditions): PipelineImpact[] {
  const impacts: PipelineImpact[] = [];

  // Interest rate effects
  if (conditions.interestRateTrend === 'rising') {
    impacts.push({
      segment: 'buyers',
      effect: 'negative',
      description: 'Rising rates reduce buyer urgency and purchasing power',
      severity: 'high',
    });
    impacts.push({
      segment: 'pending',
      effect: 'negative',
      description: 'Pending deals face higher financing risk',
      severity: 'medium',
    });
  } else if (conditions.interestRateTrend === 'falling') {
    impacts.push({
      segment: 'buyers',
      effect: 'positive',
      description: 'Falling rates increase buyer motivation',
      severity: 'high',
    });
    impacts.push({
      segment: 'lead_conversion',
      effect: 'positive',
      description: 'Lower rates bring fence-sitters into the market',
      severity: 'medium',
    });
  }

  // Inventory effects
  if (conditions.inventoryTrend === 'decreasing') {
    impacts.push({
      segment: 'sellers',
      effect: 'positive',
      description: 'Low inventory gives sellers pricing advantage',
      severity: 'medium',
    });
    impacts.push({
      segment: 'buyers',
      effect: 'negative',
      description: 'Limited inventory makes buyer deals harder to close',
      severity: 'medium',
    });
  } else if (conditions.inventoryTrend === 'increasing') {
    impacts.push({
      segment: 'listings',
      effect: 'negative',
      description: 'Growing inventory means listings risk stagnation',
      severity: 'medium',
    });
    impacts.push({
      segment: 'buyers',
      effect: 'positive',
      description: 'More options for buyers improve conversion chances',
      severity: 'low',
    });
  }

  // Demand effects
  if (conditions.buyerDemandTrend === 'weak') {
    impacts.push({
      segment: 'lead_conversion',
      effect: 'negative',
      description: 'Weak demand lowers lead conversion probability',
      severity: 'high',
    });
  } else if (conditions.buyerDemandTrend === 'strong') {
    impacts.push({
      segment: 'lead_conversion',
      effect: 'positive',
      description: 'Strong demand supports higher conversion rates',
      severity: 'medium',
    });
  }

  // DOM effects
  if (conditions.domTrend === 'increasing') {
    impacts.push({
      segment: 'listings',
      effect: 'negative',
      description: 'Rising days-on-market signals softening conditions for sellers',
      severity: 'medium',
    });
  }

  // Seasonal effects
  if (conditions.seasonalPhase === 'off_season') {
    impacts.push({
      segment: 'lead_conversion',
      effect: 'negative',
      description: 'Off-season slows new lead activity',
      severity: 'low',
    });
  }

  return impacts;
}

// ── Market Impact Alerts ─────────────────────────────────────────────

export interface MarketAlert {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
  affectedDealIds: string[];
  affectedLeadIds: string[];
}

export function generateMarketAlerts(
  conditions: MarketConditions,
  deals: Deal[],
  leads: Lead[],
  moneyResults: MoneyModelResult[],
): MarketAlert[] {
  const alerts: MarketAlert[] = [];
  const activeDeals = deals.filter(d => d.stage !== 'closed');
  const buyerDeals = activeDeals.filter(d => d.side === 'buy');
  const sellerDeals = activeDeals.filter(d => d.side === 'sell' || d.side === 'list');
  const pendingDeals = activeDeals.filter(d => d.stage === 'pending');

  // Rising rates + buyer deals
  if (conditions.interestRateTrend === 'rising' && buyerDeals.length > 0) {
    alerts.push({
      id: 'rate-risk-buyers',
      title: 'Rising rates may affect buyer deal closings',
      detail: `${buyerDeals.length} buyer deal${buyerDeals.length > 1 ? 's' : ''} could face financing pressure`,
      severity: buyerDeals.length >= 3 ? 'critical' : 'warning',
      affectedDealIds: buyerDeals.map(d => d.id),
      affectedLeadIds: [],
    });
  }

  // Rising rates + pending deals with financing unresolved
  if (conditions.interestRateTrend === 'rising' && pendingDeals.length > 0) {
    const atRisk = pendingDeals.filter(d =>
      d.milestoneStatus?.financing === 'unknown' || d.milestoneStatus?.financing === 'preapproved'
    );
    if (atRisk.length > 0) {
      alerts.push({
        id: 'rate-risk-pending',
        title: 'Pending deals with unresolved financing in a rising rate environment',
        detail: `${atRisk.length} pending deal${atRisk.length > 1 ? 's' : ''} may need financing status check`,
        severity: 'critical',
        affectedDealIds: atRisk.map(d => d.id),
        affectedLeadIds: [],
      });
    }
  }

  // High inventory + listings
  if (conditions.inventoryTrend === 'increasing' && sellerDeals.length > 0) {
    alerts.push({
      id: 'inventory-listings',
      title: 'Growing inventory may slow your listings',
      detail: `${sellerDeals.length} listing${sellerDeals.length > 1 ? 's' : ''} face increased competition`,
      severity: 'warning',
      affectedDealIds: sellerDeals.map(d => d.id),
      affectedLeadIds: [],
    });
  }

  // Weak demand + hot leads
  if (conditions.buyerDemandTrend === 'weak') {
    const hotLeads = leads.filter(l => l.leadTemperature === 'hot');
    if (hotLeads.length > 0) {
      alerts.push({
        id: 'weak-demand-leads',
        title: 'Weak buyer demand may slow lead conversions',
        detail: `${hotLeads.length} hot lead${hotLeads.length > 1 ? 's' : ''} in a softening market — prioritize quick engagement`,
        severity: 'warning',
        affectedDealIds: [],
        affectedLeadIds: hotLeads.map(l => l.id),
      });
    }
  }

  return alerts;
}

// ── Opportunity Detection ────────────────────────────────────────────

export interface MarketOpportunity {
  id: string;
  title: string;
  detail: string;
  type: 'urgency' | 'pricing' | 'timing' | 'demand';
  relatedEntityIds: string[];
  entityType: 'deal' | 'lead';
}

export function detectMarketOpportunities(
  conditions: MarketConditions,
  deals: Deal[],
  leads: Lead[],
): MarketOpportunity[] {
  const opportunities: MarketOpportunity[] = [];
  const activeDeals = deals.filter(d => d.stage !== 'closed');

  // Rates about to rise → buyer urgency
  if (conditions.interestRateTrend === 'rising') {
    const warmBuyers = leads.filter(l => l.leadTemperature === 'warm' || l.leadTemperature === 'hot');
    if (warmBuyers.length > 0) {
      opportunities.push({
        id: 'rate-urgency-buyers',
        title: 'Buyers may need to act before rates rise further',
        detail: `${warmBuyers.length} warm/hot buyer lead${warmBuyers.length > 1 ? 's' : ''} — emphasize rate lock opportunities`,
        type: 'urgency',
        relatedEntityIds: warmBuyers.map(l => l.id),
        entityType: 'lead',
      });
    }
  }

  // Low inventory → listings move quickly
  if (conditions.inventoryTrend === 'decreasing') {
    const listings = activeDeals.filter(d => d.side === 'sell' || d.side === 'list');
    if (listings.length > 0) {
      opportunities.push({
        id: 'low-inventory-listings',
        title: 'Low inventory — your listings are well-positioned',
        detail: 'Reduced competition may accelerate closings',
        type: 'pricing',
        relatedEntityIds: listings.map(d => d.id),
        entityType: 'deal',
      });
    }
  }

  // Strong demand + off-season → motivated buyers
  if (conditions.buyerDemandTrend === 'strong' && conditions.seasonalPhase !== 'off_season') {
    const newLeads = leads.filter(l => {
      if (!l.createdAt) return false;
      const daysSince = (Date.now() - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince <= 14;
    });
    if (newLeads.length > 0) {
      opportunities.push({
        id: 'strong-demand-new-leads',
        title: 'Strong demand — capitalize on new leads quickly',
        detail: `${newLeads.length} recent lead${newLeads.length > 1 ? 's' : ''} in a high-demand market`,
        type: 'demand',
        relatedEntityIds: newLeads.map(l => l.id),
        entityType: 'lead',
      });
    }
  }

  // Falling rates → refinance / upgrade opportunities
  if (conditions.interestRateTrend === 'falling') {
    const coldLeads = leads.filter(l => l.leadTemperature === 'cold');
    if (coldLeads.length >= 3) {
      opportunities.push({
        id: 'falling-rates-reactivation',
        title: 'Falling rates — re-engage dormant leads',
        detail: `${coldLeads.length} cold leads may respond to lower rate messaging`,
        type: 'timing',
        relatedEntityIds: coldLeads.slice(0, 10).map(l => l.id),
        entityType: 'lead',
      });
    }
  }

  return opportunities;
}

// ── Strategy Adjustment ──────────────────────────────────────────────

export interface StrategyAdjustment {
  label: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export function computeStrategyAdjustments(
  conditions: MarketConditions,
  deals: Deal[],
): StrategyAdjustment[] {
  const adjustments: StrategyAdjustment[] = [];

  if (conditions.buyerDemandTrend === 'weak') {
    adjustments.push({
      label: 'Prioritize seller-side deals',
      detail: 'Weak buyer demand — shift focus to listing acquisition and seller services',
      priority: 'high',
    });
  }

  if (conditions.inventoryTrend === 'decreasing') {
    adjustments.push({
      label: 'Focus on listing acquisition',
      detail: 'Low inventory creates seller opportunities — prospect for new listings',
      priority: 'high',
    });
  }

  if (conditions.seasonalPhase === 'cooling' || conditions.seasonalPhase === 'off_season') {
    adjustments.push({
      label: 'Protect existing deals',
      detail: 'Market cooling — ensure pending deals stay on track and reduce deal fall-through risk',
      priority: 'high',
    });
  }

  if (conditions.interestRateTrend === 'rising') {
    adjustments.push({
      label: 'Accelerate buyer pipeline',
      detail: 'Help buyers lock in rates — create urgency in communications',
      priority: 'medium',
    });
  }

  if (conditions.domTrend === 'increasing') {
    adjustments.push({
      label: 'Review listing pricing strategy',
      detail: 'Longer days-on-market may require pricing conversations with sellers',
      priority: 'medium',
    });
  }

  if (adjustments.length === 0) {
    adjustments.push({
      label: 'Maintain current approach',
      detail: 'Market conditions are stable — continue balanced strategy',
      priority: 'low',
    });
  }

  return adjustments;
}

// ── Forecast Confidence Modifier ─────────────────────────────────────

export type ForecastVolatility = 'stable' | 'volatile' | 'high_uncertainty';

export function computeForecastVolatility(conditions: MarketConditions): {
  volatility: ForecastVolatility;
  explanation: string;
} {
  let instabilityScore = 0;

  if (conditions.interestRateTrend !== 'stable') instabilityScore += 2;
  if (conditions.inventoryTrend !== 'stable') instabilityScore += 1;
  if (conditions.buyerDemandTrend === 'weak') instabilityScore += 2;
  if (conditions.buyerDemandTrend === 'strong') instabilityScore += 1;
  if (conditions.domTrend !== 'stable') instabilityScore += 1;
  if (conditions.seasonalPhase === 'off_season') instabilityScore += 1;
  if (conditions.seasonalPhase === 'cooling') instabilityScore += 1;

  if (instabilityScore >= 5) {
    return {
      volatility: 'high_uncertainty',
      explanation: 'Multiple market shifts in progress — forecast reliability is reduced',
    };
  }
  if (instabilityScore >= 3) {
    return {
      volatility: 'volatile',
      explanation: 'Market conditions are shifting — forecast confidence is moderate',
    };
  }
  return {
    volatility: 'stable',
    explanation: 'Market conditions support current forecast assumptions',
  };
}

// ── Weekly Market Brief ──────────────────────────────────────────────

export interface WeeklyMarketBrief {
  headline: string;
  actions: string[];
}

export function generateWeeklyMarketBrief(
  conditions: MarketConditions,
  deals: Deal[],
  leads: Lead[],
): WeeklyMarketBrief {
  const actions: string[] = [];
  const activeDeals = deals.filter(d => d.stage !== 'closed');
  const buyerDeals = activeDeals.filter(d => d.side === 'buy');
  const sellerDeals = activeDeals.filter(d => d.side === 'sell' || d.side === 'list');

  // Headline
  let headline: string;
  const volatility = computeForecastVolatility(conditions);

  if (volatility.volatility === 'high_uncertainty') {
    headline = 'Market conditions are shifting — focus on protecting active deals this week';
  } else if (conditions.interestRateTrend === 'rising' && buyerDeals.length > 0) {
    headline = 'Rising rates may create urgency for your buyer deals this week';
  } else if (conditions.inventoryTrend === 'decreasing' && sellerDeals.length > 0) {
    headline = 'Low inventory benefits your listings — keep seller momentum going';
  } else if (conditions.buyerDemandTrend === 'strong') {
    headline = 'Strong buyer demand supports your pipeline this week';
  } else if (conditions.seasonalPhase === 'off_season') {
    headline = 'Off-season — focus on relationship building and pipeline nurturing';
  } else {
    headline = 'Stable conditions — maintain your current strategy and execution pace';
  }

  // Actions (pipeline-relevant only)
  if (conditions.interestRateTrend === 'rising' && buyerDeals.length > 0) {
    actions.push(`Check financing status on ${buyerDeals.length} buyer deal${buyerDeals.length > 1 ? 's' : ''}`);
  }
  if (conditions.inventoryTrend === 'increasing' && sellerDeals.length > 0) {
    actions.push('Review pricing strategy on your active listings');
  }
  if (conditions.buyerDemandTrend === 'weak') {
    actions.push('Shift prospecting focus toward seller leads');
  }
  if (conditions.seasonalPhase === 'cooling') {
    actions.push('Ensure all pending deals have clear next steps this week');
  }
  const hotLeads = leads.filter(l => l.leadTemperature === 'hot');
  if (hotLeads.length > 0) {
    actions.push(`Engage ${hotLeads.length} hot lead${hotLeads.length > 1 ? 's' : ''} before market conditions shift`);
  }

  if (actions.length === 0) {
    actions.push('Continue your current execution rhythm');
  }

  return { headline, actions };
}
