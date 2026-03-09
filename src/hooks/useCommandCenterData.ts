import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { computeMoneyModelBatch, suggestAction, type MoneyModelResult } from '@/lib/moneyModel';
import { computeOpportunityBatch, type OpportunityHeatResult, type UserCommissionDefaults } from '@/lib/leadMoneyModel';
import { computeForecastBatch } from '@/lib/forecastModel';
import { computeStabilityScore, type StabilityInputs } from '@/lib/stabilityModel';
import { computeStrategicOverview, hasUserSetBudget } from '@/lib/strategicEngine';
import { computeIncomePatterns } from '@/lib/incomePatternsEngine';
import { buildCommandCenterPanels } from '@/lib/intelligenceEngine';
import { getDailyBriefing, getMissedYesterdayCount, getMomentum, getPipelineWatch, getControlStatus, getProgressSnapshot, shouldShowStressReduction } from '@/lib/dailyIntelligence';
import { useSessionMemory } from '@/hooks/useSessionMemory';
import { useEndOfDaySummary } from '@/hooks/useEndOfDaySummary';
import { useScoringPreferences } from '@/hooks/useScoringPreferences';
import { useRankChangeTracker } from '@/hooks/useRankChangeTracker';
import { useAgentProfile } from '@/hooks/useAgentProfile';
import { useStrategicSettings } from '@/hooks/useStrategicSettings';
import { useNetworkPlaybooks, type NetworkPlaybook } from '@/hooks/useNetworkPlaybooks';
import { useNetworkTelemetry } from '@/hooks/useNetworkTelemetry';
import { useMarketConditions } from '@/hooks/useMarketConditions';
import { useAgentLearning } from '@/hooks/useAgentLearning';
import { useSelfOptimizing } from '@/hooks/useSelfOptimizing';
import { useSessionMode, useSessionStartRisk } from '@/hooks/useSessionMode';
import type { Deal, Lead, Task, Alert, DealParticipant } from '@/types';

export function useCommandCenterData(
  userId: string | undefined,
  leads: Lead[],
  deals: Deal[],
  tasks: Task[],
  alerts: Alert[],
  dealParticipants: DealParticipant[],
  hasData: boolean,
) {
  // Panels
  const panels = useMemo(() => buildCommandCenterPanels(leads, deals, tasks, alerts), [leads, deals, tasks, alerts]);

  // FUB integration check + appointments (consolidated from 2 separate effects)
  const [hasFubIntegration, setHasFubIntegration] = useState(false);
  const [fubAppointments, setFubAppointments] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      const [integResult, apptResult] = await Promise.all([
        supabase.from('crm_integrations' as any).select('status').eq('user_id', u.id).maybeSingle() as any,
        supabase.from('fub_appointments' as any)
          .select('id, title, start_at, end_at, location, description, related_lead_id')
          .eq('user_id', u.id)
          .gte('start_at', new Date().toISOString())
          .order('start_at', { ascending: true })
          .limit(100) as any,
      ]);
      setHasFubIntegration(integResult.data?.status === 'connected');
      setFubAppointments(apptResult.data || []);
    })();
  }, []);

  // Active deals
  const activeDeals = useMemo(() => deals.filter((d) => d.stage !== 'closed'), [deals]);
  const totalRevenue = useMemo(() => activeDeals.reduce((s, d) => s + d.commission, 0), [activeDeals]);

  // Scoring preferences
  const { prefs: scoringPrefs, loaded: scoringLoaded } = useScoringPreferences(userId);

  const riskWeights = useMemo(() => scoringLoaded ? {
    inactivity_3d_points: scoringPrefs.inactivity_3d_points,
    inactivity_7d_points: scoringPrefs.inactivity_7d_points,
    closing_7d_points: scoringPrefs.closing_7d_points,
    closing_3d_points: scoringPrefs.closing_3d_points,
    milestone_points: scoringPrefs.milestone_points,
    drift_conflict_points: scoringPrefs.drift_conflict_points
  } : undefined, [scoringPrefs, scoringLoaded]);

  // Money Model
  const moneyResults = useMemo(() => {
    if (!userId) return [];
    return computeMoneyModelBatch(activeDeals, dealParticipants, userId, new Date(), riskWeights);
  }, [activeDeals, dealParticipants, userId, riskWeights]);

  const topMoneyAtRisk = useMemo(() => {
    const sorted = [...moneyResults].filter((r) => r.personalCommissionAtRisk > 0)
      .sort((a, b) => b.personalCommissionAtRisk - a.personalCommissionAtRisk);
    return sorted[0] || null;
  }, [moneyResults]);

  const totalMoneyAtRisk = useMemo(() => moneyResults.reduce((s, r) => s + r.personalCommissionAtRisk, 0), [moneyResults]);

  // Opportunity Model
  const [userDefaults, setUserDefaults] = useState<UserCommissionDefaults | undefined>();
  useEffect(() => {
    if (!userId) return;
    supabase.from('commission_defaults').select('*').eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUserDefaults({
            typicalCommissionRate: data.default_commission_rate ? Number(data.default_commission_rate) : undefined,
            typicalSplitPct: data.default_split ? Number(data.default_split) : undefined,
            typicalReferralFeePct: data.default_referral_fee ? Number(data.default_referral_fee) : undefined,
            typicalPriceMid: (data as any).typical_price_mid ? Number((data as any).typical_price_mid) : undefined
          });
        }
      });
  }, [userId]);

  const oppWeights = useMemo(() => scoringLoaded ? {
    lead_hot_points: scoringPrefs.lead_hot_points,
    lead_warm_points: scoringPrefs.lead_warm_points,
    lead_new_48h_points: scoringPrefs.lead_new_48h_points,
    engagement_points: scoringPrefs.engagement_points,
    gap_2d_points: scoringPrefs.gap_2d_points,
    gap_5d_points: scoringPrefs.gap_5d_points,
    drift_new_lead_points: scoringPrefs.drift_new_lead_points
  } : undefined, [scoringPrefs, scoringLoaded]);

  const opportunityResults = useMemo(() => {
    if (!userId) return [];
    return computeOpportunityBatch(leads, tasks, userDefaults, new Date(), oppWeights);
  }, [leads, tasks, userDefaults, userId, oppWeights]);

  const topOpportunity = useMemo(() => opportunityResults[0] || null, [opportunityResults]);

  // Forecast
  const forecast = useMemo(() => {
    if (!userId) return null;
    return computeForecastBatch(deals, dealParticipants, userId);
  }, [deals, dealParticipants, userId]);

  // Stability
  const now = useMemo(() => new Date(), []);
  const overdueTasks = useMemo(() => tasks.filter(t => !t.completedAt && new Date(t.dueAt) < now), [tasks, now]);
  const dueSoonTasks = useMemo(() => {
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    return tasks.filter((t) => !t.completedAt && new Date(t.dueAt) >= now && new Date(t.dueAt) <= in48h);
  }, [tasks, now]);

  const eodSummary = useEndOfDaySummary(tasks, leads);
  const { untouchedHotLeads } = eodSummary;

  const previousSnapshot = useSessionMemory(leads, deals, tasks, alerts, hasData);
  const momentum = useMemo(() => getMomentum(tasks, deals, previousSnapshot), [tasks, deals, previousSnapshot]);

  const stabilityInputs = useMemo((): StabilityInputs => {
    const forecast30 = forecast?.next30 ?? 0;
    const topDealExpected = forecast?.topContributors
      .filter((c) => c.windows.w30)
      .sort((a, b) => b.expectedPersonalCommission - a.expectedPersonalCommission)[0]?.expectedPersonalCommission ?? 0;
    return {
      overdueTasksCount: overdueTasks.length,
      dueSoonCount: dueSoonTasks.length,
      missedTouchesCount: untouchedHotLeads.length,
      forecast30,
      topDealExpected,
      moneyAtRiskTotal: totalMoneyAtRisk,
      momentum: momentum as 'Improving' | 'Stable' | 'Declining'
    };
  }, [overdueTasks, dueSoonTasks, untouchedHotLeads, forecast, totalMoneyAtRisk, momentum]);

  const stabilityResult = useMemo(() => computeStabilityScore(stabilityInputs), [stabilityInputs]);

  // Rank changes
  const { dealChanges, leadChanges } = useRankChangeTracker(moneyResults, opportunityResults);

  // Agent profile
  const { profile: agentProfile, loading: agentProfileLoading, exportProfile: exportAgentProfile, resetProfile: resetAgentProfile } = useAgentProfile(userId, deals, leads, tasks, stabilityResult, forecast, moneyResults);

  // Income patterns
  const incomePatterns = useMemo(() => computeIncomePatterns(deals, tasks, forecast, stabilityResult, moneyResults), [deals, tasks, forecast, stabilityResult, moneyResults]);

  // Strategic
  const { settings: strategicSettings } = useStrategicSettings(userId);
  const strategicOverview = useMemo(() => {
    return computeStrategicOverview(deals, leads, strategicSettings, forecast, moneyResults, stabilityResult, totalMoneyAtRisk);
  }, [deals, leads, strategicSettings, forecast, moneyResults, stabilityResult, totalMoneyAtRisk]);

  // Self-Optimizing
  const { analysis: selfOptAnalysis, recordOutcome: recordSelfOptOutcome, getOptimizedDefaults } = useSelfOptimizing(userId);

  // Agent Learning
  const { calibration, snapshot: learningSnapshot, trackTaskCompletion, trackTaskIgnored, resetLearning } = useAgentLearning(deals, leads, tasks, userId);

  // Network
  const { participation: networkParticipation } = useNetworkTelemetry();
  const { playbooks: cohortPlaybooks, situations: playbookSituations } = useNetworkPlaybooks(leads, deals, tasks, moneyResults, networkParticipation.showPlaybooks);

  // Market
  const { conditions: marketConditions } = useMarketConditions();

  // Session mode
  const { currentMode } = useSessionMode();
  const sessionStartRisk = useSessionStartRisk(totalMoneyAtRisk, hasData);

  // Daily intelligence
  const briefing = useMemo(() => getDailyBriefing(panels, tasks, deals, leads), [panels, tasks, deals, leads]);
  const missedYesterday = useMemo(() => getMissedYesterdayCount(tasks, deals, previousSnapshot), [tasks, deals, previousSnapshot]);
  const pipelineWatch = useMemo(() => getPipelineWatch(leads, deals, previousSnapshot), [leads, deals, previousSnapshot]);
  const controlStatus = useMemo(() => getControlStatus(tasks, deals, previousSnapshot), [tasks, deals, previousSnapshot]);
  const progressItems = useMemo(() => getProgressSnapshot(tasks, deals, leads, previousSnapshot), [tasks, deals, leads, previousSnapshot]);
  const stressReduction = useMemo(() => shouldShowStressReduction(tasks, deals, previousSnapshot), [tasks, deals, previousSnapshot]);

  // Imminent showing (48h)
  const imminentShowing = useMemo(() => {
    const n = new Date();
    const in48h = new Date(n.getTime() + 48 * 60 * 60 * 1000);
    for (const appt of fubAppointments) {
      const startAt = new Date(appt.start_at);
      if (startAt > n && startAt < in48h && appt.related_lead_id) {
        const lead = leads.find((l: Lead) => l.id === appt.related_lead_id);
        if (lead) return { appointment: appt, lead };
      }
    }
    return null;
  }, [fubAppointments, leads]);

  // Deals closing within 14 days
  const closingDeals = useMemo(() => {
    const n = new Date();
    return deals
      .filter(d => {
        if (d.stage === 'closed') return false;
        const daysLeft = Math.ceil((new Date(d.closeDate).getTime() - n.getTime()) / (1000 * 60 * 60 * 24));
        return daysLeft >= 0 && daysLeft <= 14;
      })
      .sort((a, b) => new Date(a.closeDate).getTime() - new Date(b.closeDate).getTime());
  }, [deals]);

  // Burnout detection
  const burnoutCritical = useMemo(() => {
    let score = 0;
    if (overdueTasks.length >= 8) score += 30;
    else if (overdueTasks.length >= 4) score += 15;
    if (dueSoonTasks.length >= 10) score += 25;
    else if (dueSoonTasks.length >= 5) score += 10;
    if (stabilityResult.score < 40) score += 20;
    else if (stabilityResult.score < 60) score += 10;
    return score >= 70;
  }, [overdueTasks, dueSoonTasks, stabilityResult.score]);

  // Predictive signals
  const { hasCriticalFailureRisk } = require('@/components/DealFailurePanel');
  const { hasHighGhostingRisk } = require('@/components/GhostingRiskPanel');
  const predictiveSignals = useMemo(() => {
    const signals: { type: 'failure' | 'ghosting'; label: string; severity: 'high' | 'medium' }[] = [];
    if (hasCriticalFailureRisk(deals, tasks, moneyResults)) {
      signals.push({ type: 'failure', label: 'A deal is at critical failure risk. Protect income now.', severity: 'high' });
    }
    if (hasHighGhostingRisk(leads, tasks, deals)) {
      signals.push({ type: 'ghosting', label: 'A key client is at risk of going silent. Re-engage immediately.', severity: 'high' });
    }
    return signals;
  }, [deals, tasks, moneyResults, leads]);

  // Todaystart
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  // EOD untouched risk deals
  const untouchedRiskDeals = useMemo(() => {
    return deals.filter((d) => d.stage !== 'closed' && (d.riskLevel === 'red' || d.riskLevel === 'yellow') && (!d.lastTouchedAt || new Date(d.lastTouchedAt) < todayStart));
  }, [deals, todayStart]);

  // Midday: risks reduced
  const risksReducedToday = useMemo(() => {
    if (!previousSnapshot) return 0;
    let count = 0;
    for (const dealId of previousSnapshot.riskDealIds) {
      const deal = deals.find((d) => d.id === dealId);
      if (deal && deal.riskLevel === 'green') count++;
    }
    return count;
  }, [deals, previousSnapshot]);

  // Mode header
  const modeHeader = useMemo(() => {
    const riskCount = moneyResults.filter((r) => r.personalCommissionAtRisk > 0).length;
    const oppCount = opportunityResults.filter((r) => r.opportunityScore >= 40).length;
    switch (currentMode) {
      case 'morning': return { message: 'Start by protecting income, then create new opportunities.', subtext: `Top risks: ${riskCount}, Top opportunities: ${oppCount}` };
      case 'midday': return { message: 'Stabilize risks and keep momentum.', subtext: `Risks reduced today: ${risksReducedToday}` };
      case 'evening': return { message: 'Make sure nothing critical is left unattended.', subtext: `Open urgent items remaining: ${untouchedRiskDeals.length + overdueTasks.length}` };
    }
  }, [currentMode, moneyResults, opportunityResults, risksReducedToday, untouchedRiskDeals, overdueTasks]);

  return {
    panels,
    hasFubIntegration,
    fubAppointments,
    activeDeals,
    totalRevenue,
    moneyResults,
    topMoneyAtRisk,
    totalMoneyAtRisk,
    userDefaults,
    riskWeights,
    oppWeights,
    opportunityResults,
    topOpportunity,
    forecast,
    overdueTasks,
    dueSoonTasks,
    eodSummary,
    untouchedHotLeads,
    previousSnapshot,
    momentum,
    stabilityInputs,
    stabilityResult,
    dealChanges,
    leadChanges,
    agentProfile,
    agentProfileLoading,
    exportAgentProfile,
    resetAgentProfile,
    incomePatterns,
    strategicSettings,
    strategicOverview,
    selfOptAnalysis,
    learningSnapshot,
    resetLearning,
    cohortPlaybooks,
    playbookSituations,
    marketConditions,
    currentMode,
    sessionStartRisk,
    briefing,
    missedYesterday,
    pipelineWatch,
    controlStatus,
    progressItems,
    stressReduction,
    imminentShowing,
    closingDeals,
    burnoutCritical,
    predictiveSignals,
    untouchedRiskDeals,
    risksReducedToday,
    modeHeader,
    networkParticipation,
  };
}
