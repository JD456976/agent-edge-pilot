import { useMemo, useState, useEffect, useCallback } from 'react';
import { DollarSign, AlertTriangle, TrendingUp, Zap, Check, Info, ChevronRight, Sparkles, Eye, Plus, Phone } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { buildCommandCenterPanels } from '@/lib/intelligenceEngine';
import { getDailyBriefing, getMissedYesterdayCount, getMomentum, getPipelineWatch, getControlStatus, getProgressSnapshot, shouldShowStressReduction, getPostActionFeedback } from '@/lib/dailyIntelligence';
import { useSessionMemory } from '@/hooks/useSessionMemory';
import { useImportHighlight } from '@/hooks/useImportHighlight';
import { useSessionMode, useSessionStartRisk } from '@/hooks/useSessionMode';
import { useEndOfDaySummary } from '@/hooks/useEndOfDaySummary';
import { usePanelLayout, type PanelId, type PresetKey } from '@/hooks/usePanelLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonCard } from '@/components/SkeletonCard';
import { ActionDetailDrawer } from '@/components/ActionDetailDrawer';
import { AutopilotPanel } from '@/components/AutopilotPanel';
import { ControlStatusBar } from '@/components/ControlStatusBar';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import { QuickAddModal } from '@/components/QuickAddModal';
import { FubDriftCard } from '@/components/FubDriftCard';
import { FubWatchlistPanel } from '@/components/FubWatchlistPanel';
import { MoneyAtRiskPanel } from '@/components/MoneyAtRiskPanel';
import { MoneyRiskDrawer } from '@/components/MoneyRiskDrawer';
import { OpportunityHeatPanel } from '@/components/OpportunityHeatPanel';
import { IncomeForecastPanelV2 } from '@/components/IncomeForecastPanelV2';
import { StabilityScorePanelV2 } from '@/components/StabilityScorePanelV2';
import { MorningFocusCard, MiddayStabilizationCard, EodSafetyCard } from '@/components/DailyModeCards';
import { LogTouchModal } from '@/components/LogTouchModal';
import { TouchPickerModal } from '@/components/TouchPickerModal';
import { EndOfDayReviewDrawer } from '@/components/EndOfDayReviewDrawer';
import { IncomeVolatilityPanel } from '@/components/IncomeVolatilityPanel';
import { LeadDecayPanel } from '@/components/LeadDecayPanel';
import { PipelineFragilityPanel } from '@/components/PipelineFragilityPanel';
import { OperationalLoadPanel } from '@/components/OperationalLoadPanel';
import { DealFailurePanel, hasCriticalFailureRisk } from '@/components/DealFailurePanel';
import { GhostingRiskPanel, hasHighGhostingRisk } from '@/components/GhostingRiskPanel';
import { ReferralConversionPanel } from '@/components/ReferralConversionPanel';
import { ListingPerformancePanel } from '@/components/ListingPerformancePanel';
import { DailyFlightPlan } from '@/components/DailyFlightPlan';
import { TimeAllocationEngine } from '@/components/TimeAllocationEngine';
import { OpportunityRadarPanel } from '@/components/OpportunityRadarPanel';
import { IncomeProtectionShield } from '@/components/IncomeProtectionShield';
import { WeeklyCommandReview } from '@/components/WeeklyCommandReview';
import { ActionWorkspaceDrawer } from '@/components/ActionWorkspaceDrawer';
import { PreparedActionsCard } from '@/components/PreparedActionsCard';
import { ExecutionQueuePanel } from '@/components/ExecutionQueuePanel';
import { LearningTransparencyPanel } from '@/components/LearningTransparencyPanel';
import { StrategicOverviewPanel } from '@/components/StrategicOverviewPanel';
import { WeeklyPlanningAssistant } from '@/components/WeeklyPlanningAssistant';
import { useStrategicSettings } from '@/hooks/useStrategicSettings';
import { useSelfOptimizing } from '@/hooks/useSelfOptimizing';
import { computeStrategicOverview } from '@/lib/strategicEngine';
import { NetworkBenchmarksPanel } from '@/components/NetworkBenchmarksPanel';
import { CohortPlaybooksPanel } from '@/components/CohortPlaybooksPanel';
import { AgentProfilePanel } from '@/components/AgentProfilePanel';
import { IncomePatternsPanel } from '@/components/IncomePatternsPanel';
import { useAgentProfile } from '@/hooks/useAgentProfile';
import { computeIncomePatterns } from '@/lib/incomePatternsEngine';
import { MarketConditionsPanel } from '@/components/MarketConditionsPanel';
import { MarketSignalsPanel } from '@/components/MarketSignalsPanel';
import { SortablePanel } from '@/components/SortablePanel';
import { SelfOptNudges } from '@/components/SelfOptNudges';
import { PanelLayoutControls } from '@/components/PanelLayoutControls';
import { MorningBriefCard } from '@/components/MorningBriefCard';
import { WhatThisMeansPanel } from '@/components/WhatThisMeansPanel';
import { IncomeControlMeter } from '@/components/IncomeControlMeter';
import { FocusModeSelector, isPanelVisibleInMode } from '@/components/FocusModeSelector';
import { useFocusMode } from '@/hooks/useFocusMode';
import { useHabitTracking } from '@/hooks/useHabitTracking';
import { useAgentLearning } from '@/hooks/useAgentLearning';
import { useNetworkTelemetry } from '@/hooks/useNetworkTelemetry';
import { useMarketConditions } from '@/hooks/useMarketConditions';
import { useNetworkPlaybooks, type NetworkPlaybook } from '@/hooks/useNetworkPlaybooks';
import { computeOpportunityBatch, type OpportunityHeatResult, type UserCommissionDefaults } from '@/lib/leadMoneyModel';
import { computeForecastBatch } from '@/lib/forecastModel';
import { computeStabilityScore, type StabilityInputs } from '@/lib/stabilityModel';
import { useScoringPreferences } from '@/hooks/useScoringPreferences';
import { useRankChangeTracker, type RankChange } from '@/hooks/useRankChangeTracker';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { getAutonomyLevel, type PreparedAction } from '@/lib/preparedActions';
import { computeMoneyModelBatch, suggestAction, type MoneyModelResult } from '@/lib/moneyModel';
import type { RiskLevel, Deal, Lead, CommandCenterAction, CommandCenterDealAtRisk, CommandCenterOpportunity, CommandCenterSpeedAlert } from '@/types';

const SNOOZE_STORAGE_KEY = 'dp-snooze-counts';

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const riskBadge: Record<RiskLevel, { variant: 'urgent' | 'warning' | 'opportunity'; label: string }> = {
  red: { variant: 'urgent', label: 'High Risk' },
  yellow: { variant: 'warning', label: 'At Risk' },
  green: { variant: 'opportunity', label: 'On Track' },
};

type DetailItem =
  | { kind: 'action'; data: CommandCenterAction }
  | { kind: 'deal'; data: CommandCenterDealAtRisk }
  | { kind: 'opportunity'; data: CommandCenterOpportunity }
  | { kind: 'speedAlert'; data: CommandCenterSpeedAlert };

// Panels that render as pairs in a 2-col grid
const PAIRED_PANELS: Set<PanelId> = new Set([
  'money-at-risk', 'opportunity-heat',
  'income-forecast', 'stability-score',
  'income-volatility', 'pipeline-fragility',
  'lead-decay', 'operational-load',
  'deal-failure', 'ghosting-risk',
  'referral-conversion', 'listing-performance',
  'time-allocation', 'opportunity-radar',
  'market-signals',
]);

export default function CommandCenter() {
  const { user } = useAuth();
  const { leads, deals, tasks, alerts, dealParticipants, hasData, seedDemoData, completeTask, addTask, refreshData } = useData();
  const [moneyDrawerResult, setMoneyDrawerResult] = useState<MoneyModelResult | null>(null);
  const [moneyDrawerDeal, setMoneyDrawerDeal] = useState<Deal | null>(null);
  const navigate = useNavigate();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddPrefill, setQuickAddPrefill] = useState<{ title?: string; leadId?: string; dealId?: string }>({});
  const [showLogTouch, setShowLogTouch] = useState(false);
  const [showTouchPicker, setShowTouchPicker] = useState(false);
  const [touchTarget, setTouchTarget] = useState<{ entityType: 'lead' | 'deal'; entityId: string; entityTitle: string } | null>(null);
  const [showEodReview, setShowEodReview] = useState(false);
  const [executionEntity, setExecutionEntity] = useState<{ entity: Deal | Lead; entityType: 'deal' | 'lead'; moneyResult?: MoneyModelResult | null; oppResult?: OpportunityHeatResult | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
  const [hasFubIntegration, setHasFubIntegration] = useState(false);
  const [snoozeCounts, setSnoozeCounts] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(SNOOZE_STORAGE_KEY) || '{}'); } catch { return {}; }
  });
  const [stressReductionDismissed, setStressReductionDismissed] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [autonomyLevel] = useState(() => getAutonomyLevel());
  const [showWeeklyPlanner, setShowWeeklyPlanner] = useState(false);

  // Focus Mode
  const { focusMode, updateFocusMode } = useFocusMode();

  // Habit Tracking
  const { stats: habitStats, markBriefViewed, markEodCompleted } = useHabitTracking();

  // Strategic settings
  const { settings: strategicSettings } = useStrategicSettings(user?.id);

  // Self-Optimizing Mode
  const { analysis: selfOptAnalysis, recordOutcome: recordSelfOptOutcome, getOptimizedDefaults } = useSelfOptimizing(user?.id);

  // Panel layout
  const { panelOrder, updateOrder, applyPreset, resetToDefault } = usePanelLayout(user?.id);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = panelOrder.indexOf(active.id as PanelId);
      const newIndex = panelOrder.indexOf(over.id as PanelId);
      if (oldIndex !== -1 && newIndex !== -1) {
        updateOrder(arrayMove(panelOrder, oldIndex, newIndex));
      }
    }
  }, [panelOrder, updateOrder]);

  // Daily Operating Mode
  const { currentMode } = useSessionMode();

  const showPostActionToast = useCallback((kind: 'complete' | 'snooze' | 'handled', context?: { isRiskDeal?: boolean; isOverdue?: boolean; isOpportunity?: boolean }) => {
    const feedback = getPostActionFeedback(kind, context);
    toast({ description: feedback.message, duration: 3000 });
  }, []);

  const handleSnooze = useCallback((id: string) => {
    setSnoozedIds(prev => new Set(prev).add(id));
    setSnoozeCounts(prev => {
      const next = { ...prev, [id]: (prev[id] || 0) + 1 };
      localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    showPostActionToast('snooze');
  }, [showPostActionToast]);

  const getSnoozeCount = useCallback((id: string) => snoozeCounts[id] || 0, [snoozeCounts]);

  const previousSnapshot = useSessionMemory(leads, deals, tasks, alerts, hasData);
  const showImportBadge = useImportHighlight();

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  // Check FUB integration status
  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      const { data } = await (supabase.from('crm_integrations' as any)
        .select('status')
        .eq('user_id', u.id)
        .maybeSingle() as any);
      setHasFubIntegration(data?.status === 'connected');
    })();
  }, []);

  const panels = useMemo(() => buildCommandCenterPanels(leads, deals, tasks, alerts), [leads, deals, tasks, alerts]);

  // Agent Learning Layer
  const { calibration, snapshot: learningSnapshot, trackTaskCompletion, trackTaskIgnored, resetLearning } = useAgentLearning(deals, leads, tasks);

  // Network Effect Layer
  const { participation: networkParticipation } = useNetworkTelemetry();

  // Market Conditions Layer
  const { conditions: marketConditions } = useMarketConditions();

  const activeDeals = deals.filter(d => d.stage !== 'closed');
  const totalRevenue = activeDeals.reduce((s, d) => s + d.commission, 0);
  const dealsNeedingAttention = panels.dealsAtRisk.length;

  // Scoring preferences
  const { prefs: scoringPrefs, loaded: scoringLoaded } = useScoringPreferences(user?.id);

  // Money Model (with user scoring weights)
  const riskWeights = useMemo(() => scoringLoaded ? {
    inactivity_3d_points: scoringPrefs.inactivity_3d_points,
    inactivity_7d_points: scoringPrefs.inactivity_7d_points,
    closing_7d_points: scoringPrefs.closing_7d_points,
    closing_3d_points: scoringPrefs.closing_3d_points,
    milestone_points: scoringPrefs.milestone_points,
    drift_conflict_points: scoringPrefs.drift_conflict_points,
  } : undefined, [scoringPrefs, scoringLoaded]);

  const moneyResults = useMemo(() => {
    if (!user?.id) return [];
    return computeMoneyModelBatch(activeDeals, dealParticipants, user.id, new Date(), riskWeights);
  }, [activeDeals, dealParticipants, user?.id, riskWeights]);

  // Network Playbooks (after moneyResults)
  const { playbooks: cohortPlaybooks, situations: playbookSituations } = useNetworkPlaybooks(leads, deals, tasks, moneyResults, networkParticipation.showPlaybooks);

  const topMoneyAtRisk = useMemo(() => {
    const sorted = [...moneyResults].filter(r => r.personalCommissionAtRisk > 0)
      .sort((a, b) => b.personalCommissionAtRisk - a.personalCommissionAtRisk);
    return sorted[0] || null;
  }, [moneyResults]);

  // Opportunity Model
  const [userDefaults, setUserDefaults] = useState<UserCommissionDefaults | undefined>();
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('commission_defaults').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUserDefaults({
            typicalCommissionRate: data.default_commission_rate ? Number(data.default_commission_rate) : undefined,
            typicalSplitPct: data.default_split ? Number(data.default_split) : undefined,
            typicalReferralFeePct: data.default_referral_fee ? Number(data.default_referral_fee) : undefined,
            typicalPriceMid: (data as any).typical_price_mid ? Number((data as any).typical_price_mid) : undefined,
          });
        }
      });
  }, [user?.id]);

  const oppWeights = useMemo(() => scoringLoaded ? {
    lead_hot_points: scoringPrefs.lead_hot_points,
    lead_warm_points: scoringPrefs.lead_warm_points,
    lead_new_48h_points: scoringPrefs.lead_new_48h_points,
    engagement_points: scoringPrefs.engagement_points,
    gap_2d_points: scoringPrefs.gap_2d_points,
    gap_5d_points: scoringPrefs.gap_5d_points,
    drift_new_lead_points: scoringPrefs.drift_new_lead_points,
  } : undefined, [scoringPrefs, scoringLoaded]);

  const opportunityResults = useMemo(() => {
    if (!user?.id) return [];
    return computeOpportunityBatch(leads, tasks, userDefaults, new Date(), oppWeights);
  }, [leads, tasks, userDefaults, user?.id, oppWeights]);

  const topOpportunity = useMemo(() => {
    return opportunityResults[0] || null;
  }, [opportunityResults]);

  // Apply Playbook handler
  const handleApplyPlaybook = useCallback(async (playbook: NetworkPlaybook, situation: { entityId: string; entityType: 'lead' | 'deal'; entityTitle: string }) => {
    const timingToMs: Record<string, number> = { now: 0, under_1h: 3600000, same_day: 14400000, next_day: 86400000 };
    for (const step of playbook.steps) {
      const dueAt = new Date(Date.now() + (timingToMs[step.timing_bucket] || 0)).toISOString();
      const actionLabel = step.notes_key.replace(/_/g, ' ');
      await addTask({
        title: `${actionLabel} — ${situation.entityTitle}`,
        type: (step.action_type === 'call' ? 'call' : step.action_type === 'text' ? 'text' : step.action_type === 'email' ? 'email' : 'follow_up') as any,
        dueAt,
        relatedDealId: situation.entityType === 'deal' ? situation.entityId : undefined,
        relatedLeadId: situation.entityType === 'lead' ? situation.entityId : undefined,
        assignedToUserId: user?.id || '',
      });
    }
    toast({ description: `Playbook applied: ${playbook.steps.length} tasks created`, duration: 3000 });
  }, [addTask, user?.id]);

  // Rank change tracker
  const { dealChanges, leadChanges } = useRankChangeTracker(moneyResults, opportunityResults);

  // ── Income Forecast ────────────────────────────────────────────────
  const forecast = useMemo(() => {
    if (!user?.id) return null;
    return computeForecastBatch(deals, dealParticipants, user.id);
  }, [deals, dealParticipants, user?.id]);

  // ── Stability Score ────────────────────────────────────────────────
   const now = useMemo(() => new Date(), []);
  const dueSoonTasks = useMemo(() => {
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    return tasks.filter(t => !t.completedAt && new Date(t.dueAt) >= now && new Date(t.dueAt) <= in48h);
  }, [tasks, now]);

  const todayStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);

  // Single source of truth for EOD data
  const eodSummary = useEndOfDaySummary(tasks, leads);
  const { overdueTasks, untouchedHotLeads } = eodSummary;

  const totalMoneyAtRisk = useMemo(() => moneyResults.reduce((s, r) => s + r.personalCommissionAtRisk, 0), [moneyResults]);

  // Momentum (moved before stabilityInputs which depends on it)
  const momentum = useMemo(() => getMomentum(tasks, deals, previousSnapshot), [tasks, deals, previousSnapshot]);

  const stabilityInputs = useMemo((): StabilityInputs => {
    const forecast30 = forecast?.next30 ?? 0;
    const topDealExpected = forecast?.topContributors
      .filter(c => c.windows.w30)
      .sort((a, b) => b.expectedPersonalCommission - a.expectedPersonalCommission)[0]?.expectedPersonalCommission ?? 0;

    return {
      overdueTasksCount: overdueTasks.length,
      dueSoonCount: dueSoonTasks.length,
      missedTouchesCount: untouchedHotLeads.length,
      forecast30,
      topDealExpected,
      moneyAtRiskTotal: totalMoneyAtRisk,
      momentum: momentum as 'Improving' | 'Stable' | 'Declining',
    };
  }, [overdueTasks, dueSoonTasks, untouchedHotLeads, forecast, totalMoneyAtRisk, momentum]);

  const stabilityResult = useMemo(() => computeStabilityScore(stabilityInputs), [stabilityInputs]);

  // Agent Intelligence Profile
  const { profile: agentProfile, loading: agentProfileLoading, exportProfile: exportAgentProfile, resetProfile: resetAgentProfile } = useAgentProfile(user?.id, deals, leads, tasks, stabilityResult, forecast, moneyResults);

  // Income Patterns
  const incomePatterns = useMemo(() => computeIncomePatterns(deals, tasks, forecast, stabilityResult, moneyResults), [deals, tasks, forecast, stabilityResult, moneyResults]);

  // Strategic Overview
  const strategicOverview = useMemo(() => {
    return computeStrategicOverview(
      deals, leads, strategicSettings, forecast, moneyResults, stabilityResult, totalMoneyAtRisk
    );
  }, [deals, leads, strategicSettings, forecast, moneyResults, stabilityResult, totalMoneyAtRisk]);

  // Operational load / burnout detection
  const burnoutCritical = useMemo(() => {
    const overdue = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < new Date());
    const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const dueSoon = tasks.filter(t => !t.completedAt && new Date(t.dueAt) >= new Date() && new Date(t.dueAt) <= tomorrow);
    let score = 0;
    if (overdue.length >= 8) score += 30;
    else if (overdue.length >= 4) score += 15;
    if (dueSoon.length >= 10) score += 25;
    else if (dueSoon.length >= 5) score += 10;
    if (stabilityResult.score < 40) score += 20;
    else if (stabilityResult.score < 60) score += 10;
    return score >= 70;
  }, [tasks, stabilityResult.score]);

  // Predictive signals for Autopilot
  const predictiveSignals = useMemo(() => {
    const signals: { type: 'failure' | 'ghosting' | 'fragility' | 'volatility' | 'decay'; label: string; severity: 'high' | 'medium' }[] = [];
    if (hasCriticalFailureRisk(deals, tasks, moneyResults)) {
      signals.push({ type: 'failure', label: 'A deal is at critical failure risk. Protect income now.', severity: 'high' });
    }
    if (hasHighGhostingRisk(leads, tasks, deals)) {
      signals.push({ type: 'ghosting', label: 'A key client is at risk of going silent. Re-engage immediately.', severity: 'high' });
    }
    return signals;
  }, [deals, tasks, moneyResults, leads]);

  const handleMoneySelect = useCallback((result: MoneyModelResult, deal: Deal) => {
    setMoneyDrawerResult(result);
    setMoneyDrawerDeal(deal);
  }, []);

  const handleOpportunityAction = useCallback(async (lead: Lead, result: OpportunityHeatResult) => {
    const taskType = lead.leadTemperature === 'hot' ? 'call' : 'follow_up';
    const title = lead.leadTemperature === 'hot' ? `Call ${lead.name} — hot lead` : `Follow up with ${lead.name}`;
    await addTask({
      title,
      type: taskType as any,
      dueAt: new Date().toISOString(),
      relatedLeadId: lead.id,
      assignedToUserId: user?.id || '',
    });
    toast({ description: `Task created: ${title}`, duration: 3000 });
  }, [addTask, user?.id]);

  const handleStartAction = useCallback(async (deal: Deal, result: MoneyModelResult) => {
    const suggested = suggestAction(result, deal);
    const dueDate = result.riskScore >= 70
      ? new Date().toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await addTask({
      title: suggested.title,
      type: suggested.type as any,
      dueAt: dueDate,
      relatedDealId: deal.id,
      assignedToUserId: user?.id || '',
    });
    toast({ description: 'Task created from money risk analysis', duration: 3000 });
    setMoneyDrawerResult(null);
    setMoneyDrawerDeal(null);
  }, [addTask, user?.id]);

  // Autopilot task creation
  const handleAutopilotCreateTask = useCallback(async (title: string, dealId?: string, leadId?: string) => {
    await addTask({
      title,
      type: 'follow_up',
      dueAt: new Date().toISOString(),
      relatedDealId: dealId,
      relatedLeadId: leadId,
      assignedToUserId: user?.id || '',
    });
    toast({ description: `Task created: ${title}`, duration: 3000 });
  }, [addTask, user?.id]);

  // Execution layer handler
  const handleOpenExecution = useCallback((entityId: string, entityType: 'deal' | 'lead') => {
    if (entityType === 'deal') {
      const deal = deals.find(d => d.id === entityId);
      if (!deal) return;
      const mr = moneyResults.find(r => r.dealId === entityId) || null;
      setExecutionEntity({ entity: deal, entityType: 'deal', moneyResult: mr });
    } else {
      const lead = leads.find(l => l.id === entityId);
      if (!lead) return;
      const or = opportunityResults.find(r => r.leadId === entityId) || null;
      setExecutionEntity({ entity: lead, entityType: 'lead', oppResult: or });
    }
  }, [deals, leads, moneyResults, opportunityResults]);

  const handleExecutionFollowUp = useCallback(async (title: string, type: string, dueAt: string, entityId: string, entityType: 'deal' | 'lead') => {
    await addTask({
      title,
      type: (type || 'follow_up') as any,
      dueAt,
      relatedDealId: entityType === 'deal' ? entityId : undefined,
      relatedLeadId: entityType === 'lead' ? entityId : undefined,
      assignedToUserId: user?.id || '',
    });
    toast({ description: `Task created: ${title}`, duration: 3000 });
  }, [addTask, user?.id]);

  const handleExecutionLogTouch = useCallback((entityType: 'deal' | 'lead', entityId: string, entityTitle: string, touchType: string, note?: string) => {
    setExecutionEntity(null);
    setTouchTarget({ entityType, entityId, entityTitle });
    setShowLogTouch(true);
  }, []);

  const handleForecastCreateTask = useCallback(async (title: string, dealId: string) => {
    await addTask({
      title,
      type: 'follow_up',
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      relatedDealId: dealId,
      assignedToUserId: user?.id || '',
    });
    toast({ description: `Task created: ${title}`, duration: 3000 });
  }, [addTask, user?.id]);

  const briefing = useMemo(() => getDailyBriefing(panels, tasks, deals, leads), [panels, tasks, deals, leads]);
  const missedYesterday = useMemo(() => getMissedYesterdayCount(tasks, deals, previousSnapshot), [tasks, deals, previousSnapshot]);
  const pipelineWatch = useMemo(() => getPipelineWatch(leads, deals, previousSnapshot), [leads, deals, previousSnapshot]);
  const controlStatus = useMemo(() => getControlStatus(tasks, deals, previousSnapshot), [tasks, deals, previousSnapshot]);
  const progressItems = useMemo(() => getProgressSnapshot(tasks, deals, leads, previousSnapshot), [tasks, deals, leads, previousSnapshot]);
  const stressReduction = useMemo(() => shouldShowStressReduction(tasks, deals, previousSnapshot), [tasks, deals, previousSnapshot]);

  // Daily mode computed values
  const sessionStartRisk = useSessionStartRisk(totalMoneyAtRisk, hasData);

  // EOD: deals at risk without touches today
  const untouchedRiskDeals = useMemo(() => {
    return deals.filter(d => d.stage !== 'closed' && (d.riskLevel === 'red' || d.riskLevel === 'yellow') && (!d.lastTouchedAt || new Date(d.lastTouchedAt) < todayStart));
  }, [deals, todayStart]);

  // Midday: risks reduced since session start
  const risksReducedToday = useMemo(() => {
    if (!previousSnapshot) return 0;
    let count = 0;
    for (const dealId of previousSnapshot.riskDealIds) {
      const deal = deals.find(d => d.id === dealId);
      if (deal && deal.riskLevel === 'green') count++;
    }
    return count;
  }, [deals, previousSnapshot]);

  // Mode-aware header
  const modeHeader = useMemo(() => {
    const riskCount = moneyResults.filter(r => r.personalCommissionAtRisk > 0).length;
    const oppCount = opportunityResults.filter(r => r.opportunityScore >= 40).length;

    switch (currentMode) {
      case 'morning':
        return {
          message: 'Start by protecting income, then create new opportunities.',
          subtext: `Top risks: ${riskCount}, Top opportunities: ${oppCount}`,
        };
      case 'midday':
        return {
          message: 'Stabilize risks and keep momentum.',
          subtext: `Risks reduced today: ${risksReducedToday}`,
        };
      case 'evening':
        return {
          message: 'Make sure nothing critical is left unattended.',
          subtext: `Open urgent items remaining: ${untouchedRiskDeals.length + overdueTasks.length}`,
        };
    }
  }, [currentMode, moneyResults, opportunityResults, risksReducedToday, untouchedRiskDeals, overdueTasks]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Panel render map ──────────────────────────────────────────────
  const renderPanel = useCallback((panelId: PanelId): React.ReactNode => {
    switch (panelId) {
      case 'autopilot':
        return (
          <AutopilotPanel
            panels={panels}
            onComplete={(taskId) => {
              completeTask(taskId);
              showPostActionToast('complete', {
                isOverdue: tasks.find(t => t.id === taskId && !t.completedAt && new Date(t.dueAt) < new Date()) !== undefined,
                isRiskDeal: deals.some(d => d.stage !== 'closed' && (d.riskLevel === 'red' || d.riskLevel === 'yellow') && tasks.find(t => t.id === taskId)?.relatedDealId === d.id),
              });
            }}
            snoozedIds={snoozedIds}
            onSnooze={handleSnooze}
            topMoneyAtRisk={topMoneyAtRisk}
            deals={deals}
            onMoneyAction={handleMoneySelect}
            topOpportunity={topOpportunity}
            leads={leads}
            onOpportunityAction={handleOpportunityAction}
            stabilityResult={stabilityResult}
            stabilityScore={stabilityResult.score}
            overdueTasksCount={overdueTasks.length}
            dueSoonCount={dueSoonTasks.length}
            totalMoneyAtRisk={totalMoneyAtRisk}
            onStabilityAction={() => {}}
            onCreateTask={handleAutopilotCreateTask}
            burnoutCritical={burnoutCritical}
            predictiveSignals={predictiveSignals}
            onOpenExecution={handleOpenExecution}
          />
        );
      case 'prepared-actions':
        return (
          <PreparedActionsCard
            deals={deals}
            leads={leads}
            tasks={tasks}
            moneyResults={moneyResults}
            opportunityResults={opportunityResults}
            autonomyLevel={autonomyLevel}
            onReviewAction={(action) => {
              if (action.entityType === 'deal') {
                const deal = deals.find(d => d.id === action.entityId);
                if (deal) setExecutionEntity({ entity: deal, entityType: 'deal', moneyResult: moneyResults.find(r => r.dealId === action.entityId) || null });
              } else {
                const lead = leads.find(l => l.id === action.entityId);
                if (lead) setExecutionEntity({ entity: lead, entityType: 'lead', oppResult: opportunityResults.find(r => r.leadId === action.entityId) || null });
              }
            }}
            onExecuteAction={(action) => {
              if (action.entityType === 'deal') {
                const deal = deals.find(d => d.id === action.entityId);
                if (deal) setExecutionEntity({ entity: deal, entityType: 'deal', moneyResult: moneyResults.find(r => r.dealId === action.entityId) || null });
              } else {
                const lead = leads.find(l => l.id === action.entityId);
                if (lead) setExecutionEntity({ entity: lead, entityType: 'lead', oppResult: opportunityResults.find(r => r.leadId === action.entityId) || null });
              }
            }}
          />
        );
      case 'execution-queue':
        return (
          <ExecutionQueuePanel
            deals={deals}
            leads={leads}
            tasks={tasks}
            moneyResults={moneyResults}
            opportunityResults={opportunityResults}
            onStartAction={handleOpenExecution}
          />
        );
      case 'money-at-risk':
        return (
          <MoneyAtRiskPanel
            deals={deals}
            participants={dealParticipants}
            userId={user?.id || ''}
            onSelect={handleMoneySelect}
            onAddCommissionToDeals={() => navigate('/?workspace=work')}
            refreshData={refreshData}
            dealChanges={dealChanges}
            riskWeights={riskWeights}
          />
        );
      case 'opportunity-heat':
        return (
          <OpportunityHeatPanel
            leads={leads}
            tasks={tasks}
            userId={user?.id || ''}
            onStartAction={handleOpportunityAction}
            leadChanges={leadChanges}
            oppWeights={oppWeights}
          />
        );
      case 'income-forecast':
        return (
          <IncomeForecastPanelV2
            deals={deals}
            participants={dealParticipants}
            userId={user?.id || ''}
            moneyResults={moneyResults}
            typicalDealValue={userDefaults?.typicalPriceMid ? Math.round((userDefaults.typicalPriceMid * (userDefaults.typicalCommissionRate ?? 3) / 100) * (userDefaults.typicalSplitPct ?? 100) / 100) : 8000}
            onCreateTask={handleForecastCreateTask}
            onOpenMoneyAtRisk={() => {
              if (topMoneyAtRisk && deals.find(d => d.id === topMoneyAtRisk.dealId)) {
                handleMoneySelect(topMoneyAtRisk, deals.find(d => d.id === topMoneyAtRisk.dealId)!);
              }
            }}
          />
        );
      case 'stability-score':
        return (
          <StabilityScorePanelV2
            inputs={stabilityInputs}
            onCreateTask={(title) => handleAutopilotCreateTask(title)}
          />
        );
      case 'income-volatility':
        return (
          <IncomeVolatilityPanel
            deals={deals}
            participants={dealParticipants}
            userId={user?.id || ''}
            forecast={forecast}
            typicalMonthlyIncome={userDefaults?.typicalPriceMid ? Math.round((userDefaults.typicalPriceMid * (userDefaults.typicalCommissionRate ?? 3) / 100) * (userDefaults.typicalSplitPct ?? 100) / 100) : 8000}
            onOpenOpportunities={() => {
              if (topOpportunity && leads.find(l => l.id === topOpportunity.leadId)) {
                handleOpportunityAction(leads.find(l => l.id === topOpportunity.leadId)!, topOpportunity);
              }
            }}
          />
        );
      case 'pipeline-fragility':
        return (
          <PipelineFragilityPanel
            deals={deals}
            moneyResults={moneyResults}
            forecast={forecast}
            onOpenOpportunities={() => {
              if (topOpportunity && leads.find(l => l.id === topOpportunity.leadId)) {
                handleOpportunityAction(leads.find(l => l.id === topOpportunity.leadId)!, topOpportunity);
              }
            }}
          />
        );
      case 'lead-decay':
        return (
          <LeadDecayPanel
            leads={leads}
            tasks={tasks}
            opportunityResults={opportunityResults}
            onLogTouch={(entityType, entityId, entityTitle) => {
              setTouchTarget({ entityType, entityId, entityTitle });
              setShowLogTouch(true);
            }}
            onCreateTask={(title, leadId) => handleAutopilotCreateTask(title, undefined, leadId)}
          />
        );
      case 'operational-load':
        return (
          <OperationalLoadPanel
            tasks={tasks}
            deals={deals}
            leads={leads}
            stabilityResult={stabilityResult}
            stabilityScore={stabilityResult.score}
            totalMoneyAtRisk={totalMoneyAtRisk}
          />
        );
      case 'deal-failure':
        return (
          <DealFailurePanel
            deals={deals}
            tasks={tasks}
            moneyResults={moneyResults}
            onCreateTask={(title, dealId) => handleAutopilotCreateTask(title, dealId)}
          />
        );
      case 'ghosting-risk':
        return (
          <GhostingRiskPanel
            leads={leads}
            tasks={tasks}
            deals={deals}
            onLogTouch={(entityType, entityId, entityTitle) => {
              setTouchTarget({ entityType, entityId, entityTitle });
              setShowLogTouch(true);
            }}
            onCreateTask={(title, leadId) => handleAutopilotCreateTask(title, undefined, leadId)}
          />
        );
      case 'referral-conversion':
        return (
          <ReferralConversionPanel
            leads={leads}
            tasks={tasks}
            opportunityResults={opportunityResults}
            userDefaults={userDefaults}
          />
        );
      case 'listing-performance':
        return (
          <ListingPerformancePanel
            deals={deals}
            tasks={tasks}
          />
        );
      case 'time-allocation':
        return (
          <TimeAllocationEngine
            deals={deals}
            tasks={tasks}
            moneyResults={moneyResults}
            opportunityResults={opportunityResults}
            stabilityScore={stabilityResult.score}
            totalMoneyAtRisk={totalMoneyAtRisk}
          />
        );
      case 'opportunity-radar':
        return (
          <OpportunityRadarPanel
            leads={leads}
            deals={deals}
            tasks={tasks}
            opportunityResults={opportunityResults}
            onAction={(item) => {
              if (item.entityType === 'lead') {
                const lead = leads.find(l => l.id === item.entityId);
                if (!lead) return;
                const or = opportunityResults.find(r => r.leadId === item.entityId) || null;
                setExecutionEntity({ entity: lead, entityType: 'lead', oppResult: or });
              } else if (item.entityType === 'deal') {
                const deal = deals.find(d => d.id === item.entityId);
                if (!deal) return;
                const mr = moneyResults.find(r => r.dealId === item.entityId) || null;
                setExecutionEntity({ entity: deal, entityType: 'deal', moneyResult: mr });
              }
            }}
          />
        );
      case 'income-protection':
        return (
          <IncomeProtectionShield
            deals={deals}
            tasks={tasks}
            moneyResults={moneyResults}
            totalMoneyAtRisk={totalMoneyAtRisk}
            onAction={(threat) => {
              const deal = deals.find(d => d.id === threat.dealId);
              const result = moneyResults.find(r => r.dealId === threat.dealId);
              if (deal && result) handleMoneySelect(result, deal);
            }}
          />
        );
      case 'market-conditions':
        return (
          <MarketConditionsPanel
            conditions={marketConditions}
            deals={deals}
            leads={leads}
            moneyResults={moneyResults}
          />
        );
      case 'learning-transparency':
        return (
          <LearningTransparencyPanel
            snapshot={learningSnapshot}
            onReset={resetLearning}
          />
        );
      case 'network-benchmarks':
        return (
          <NetworkBenchmarksPanel
            agentMetrics={{
              followUpCompletionRate: tasks.length > 0
                ? tasks.filter(t => t.completedAt).length / tasks.length
                : undefined,
              dealCloseRate: deals.length > 0
                ? deals.filter(d => d.stage === 'closed').length / deals.length
                : undefined,
            }}
          />
        );
      case 'weekly-review':
        return (
          <WeeklyCommandReview
            deals={deals}
            leads={leads}
            tasks={tasks}
            moneyResults={moneyResults}
            stabilityScore={stabilityResult.score}
            totalMoneyAtRisk={totalMoneyAtRisk}
          />
        );
      case 'agent-profile':
        return (
          <AgentProfilePanel
            profile={agentProfile}
            loading={agentProfileLoading}
            onExport={exportAgentProfile}
            onReset={resetAgentProfile}
          />
        );
      case 'income-patterns':
        return (
          <IncomePatternsPanel patterns={incomePatterns} />
        );
      case 'market-signals':
        return (
          <MarketSignalsPanel
            deals={deals}
            leads={leads}
            moneyResults={moneyResults}
          />
        );
      case 'end-of-day':
        return null; // EOD is handled separately in mode cards
      default:
        return null;
    }
  }, [panels, snoozedIds, handleSnooze, topMoneyAtRisk, deals, leads, tasks, handleMoneySelect, topOpportunity, handleOpportunityAction, stabilityResult, stabilityInputs, overdueTasks, dueSoonTasks, totalMoneyAtRisk, handleAutopilotCreateTask, burnoutCritical, predictiveSignals, handleOpenExecution, moneyResults, opportunityResults, dealParticipants, user?.id, refreshData, dealChanges, leadChanges, riskWeights, oppWeights, forecast, userDefaults, marketConditions, learningSnapshot, resetLearning, completeTask, showPostActionToast, navigate, handleForecastCreateTask, agentProfile, agentProfileLoading, exportAgentProfile, resetAgentProfile, incomePatterns]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="space-y-1 mb-6"><SkeletonCard lines={1} /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 mb-6 flex items-center gap-2 text-sm">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground">Not connected to Follow Up Boss yet. Using demo or manual data.</span>
        </div>
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-fade-in">
          <div className="mb-4 rounded-2xl bg-muted p-4">
            <Zap className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No data yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs mb-4">
            Load demo data to explore, or add your first deal manually.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={seedDemoData}>Load Demo Data</Button>
            <Button size="sm" variant="outline" onClick={() => setShowQuickAdd(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Manually
            </Button>
          </div>
        </div>
        {showQuickAdd && <QuickAddModal defaultType="deal" onClose={() => setShowQuickAdd(false)} />}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground">Today's Briefing · {today}</p>
        </div>
        <div className="flex items-center gap-2">
          <PanelLayoutControls
            editMode={editMode}
            onToggleEdit={() => setEditMode(e => !e)}
            onApplyPreset={applyPreset}
            onReset={resetToDefault}
          />
          <FocusModeSelector mode={focusMode} onModeChange={updateFocusMode} />
          <Button size="sm" variant="outline" onClick={() => setShowQuickAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Quick Add
          </Button>
        </div>
      </div>

      {/* Income Control Meter */}
      <IncomeControlMeter
        stabilityResult={stabilityResult}
        totalMoneyAtRisk={totalMoneyAtRisk}
        totalRevenue={totalRevenue}
        overdueCount={overdueTasks.length}
      />

      {/* Morning Brief (first session of the day) */}
      {currentMode === 'morning' && (
        <MorningBriefCard
          deals={deals}
          leads={leads}
          tasks={tasks}
          moneyResults={moneyResults}
          opportunityResults={opportunityResults}
          stabilityResult={stabilityResult}
          totalMoneyAtRisk={totalMoneyAtRisk}
          previousSnapshot={previousSnapshot}
          onStartActions={() => { markBriefViewed(); }}
          onReviewDetail={() => { markBriefViewed(); navigate('/?workspace=work'); }}
        />
      )}

      {/* Daily Intelligence Briefing */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        {/* Import highlight banner */}
        {showImportBadge && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/10 mb-2">
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">Imported just now</Badge>
            <span className="text-xs text-muted-foreground">New items from your latest FUB import are reflected below.</span>
          </div>
        )}

        {/* Mode-aware briefing message */}
        <div className="flex items-center gap-2">
          <span className="text-base">{briefing.icon}</span>
          <span className="text-sm font-medium">{modeHeader.message}</span>
        </div>

        {/* Mode subtext */}
        <p className="text-xs text-muted-foreground">{modeHeader.subtext}</p>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-opportunity" />
            <span className="text-xs text-muted-foreground">{formatCurrency(totalRevenue)} revenue in play</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            <span className="text-xs text-muted-foreground">{dealsNeedingAttention} deal{dealsNeedingAttention !== 1 ? 's' : ''} need{dealsNeedingAttention === 1 ? 's' : ''} attention</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Momentum: <span className={`font-medium ${momentum === 'Improving' ? 'text-foreground' : momentum === 'Declining' ? 'text-foreground' : 'text-muted-foreground'}`}>{momentum}</span>
            </span>
          </div>
        </div>

        {/* Missed yesterday */}
        {missedYesterday > 0 && (
          <p className="text-xs text-muted-foreground">
            Yesterday's unfinished priorities: {missedYesterday}
          </p>
        )}

        <span className="text-xs text-muted-foreground block">
          {currentMode === 'morning' ? 'Good morning' : currentMode === 'midday' ? 'Good afternoon' : 'Good evening'}, {user?.name?.split(' ')[0]}
        </span>
      </div>

      {/* Control Status & Progress */}
      <ControlStatusBar
        controlStatus={controlStatus}
        progressItems={progressItems}
        showStressReduction={stressReduction}
        stressReductionDismissed={stressReductionDismissed}
        onDismissStressReduction={() => setStressReductionDismissed(true)}
      />

      {/* Self-Optimizing Nudges */}
      {selfOptAnalysis.nudges.length > 0 && (
        <SelfOptNudges nudges={selfOptAnalysis.nudges} />
      )}

      {/* Daily Mode Cards */}
      {currentMode === 'morning' && (
        <MorningFocusCard
          topRisk={topMoneyAtRisk}
          topOpportunity={topOpportunity}
          deals={deals}
          leads={leads}
          overdueTasks={overdueTasks}
          onStartAction={() => {
            if (topMoneyAtRisk && deals.find(d => d.id === topMoneyAtRisk.dealId)) {
              handleMoneySelect(topMoneyAtRisk, deals.find(d => d.id === topMoneyAtRisk.dealId)!);
            }
          }}
          onReviewAll={() => navigate('/?workspace=work')}
        />
      )}
      {currentMode === 'midday' && (
        <MiddayStabilizationCard
          currentTotalRisk={totalMoneyAtRisk}
          sessionStart={sessionStartRisk}
          risksReducedToday={risksReducedToday}
        />
      )}
      {currentMode === 'evening' && (
        <EodSafetyCard
          untouchedRiskDeals={untouchedRiskDeals}
          untouchedHotLeads={untouchedHotLeads}
          overdueTasks={overdueTasks}
          onLogTouch={() => setShowTouchPicker(true)}
          onCreateTask={() => {
            setQuickAddPrefill({});
            setShowQuickAdd(true);
          }}
          onReviewItems={() => setShowEodReview(true)}
        />
      )}

      {/* What This Means Today */}
      <WhatThisMeansPanel
        deals={deals}
        leads={leads}
        tasks={tasks}
        moneyResults={moneyResults}
        opportunityResults={opportunityResults}
        stabilityResult={stabilityResult}
        totalMoneyAtRisk={totalMoneyAtRisk}
      />

      {/* Daily Flight Plan */}
      <PanelErrorBoundary>
        <DailyFlightPlan
          deals={deals}
          leads={leads}
          tasks={tasks}
          moneyResults={moneyResults}
          opportunityResults={opportunityResults}
          stabilityResult={stabilityResult}
          totalMoneyAtRisk={totalMoneyAtRisk}
          sessionMode={currentMode === 'midday' ? 'midday' : currentMode}
          onStartAction={(step) => {
            if (step.entityType === 'deal' && step.entityId) {
              const deal = deals.find(d => d.id === step.entityId);
              const result = moneyResults.find(r => r.dealId === step.entityId);
              if (deal && result) handleMoneySelect(result, deal);
            } else if (step.entityType === 'lead' && step.entityId) {
              const lead = leads.find(l => l.id === step.entityId);
              const opp = opportunityResults.find(r => r.leadId === step.entityId);
              if (lead && opp) handleOpportunityAction(lead, opp);
            } else if (step.entityType === 'task' && step.entityId) {
              completeTask(step.entityId);
              showPostActionToast('complete');
            }
          }}
          onOpenExecution={handleOpenExecution}
        />
      </PanelErrorBoundary>

      {/* Strategic Overview */}
      <PanelErrorBoundary>
        <StrategicOverviewPanel
          overview={strategicOverview}
          onOpenPlanner={() => setShowWeeklyPlanner(true)}
        />
      </PanelErrorBoundary>

      {/* ── Sortable Panels ────────────────────────────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={panelOrder} strategy={verticalListSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {panelOrder.map(panelId => {
              if (!isPanelVisibleInMode(panelId, focusMode)) return null;
              const content = renderPanel(panelId);
              if (!content) return null;
              const isFullWidth = !PAIRED_PANELS.has(panelId);
              return (
                <SortablePanel key={panelId} id={panelId} editMode={editMode} fullWidth={isFullWidth}>
                  <PanelErrorBoundary>
                    {content}
                  </PanelErrorBoundary>
                </SortablePanel>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Cohort Playbooks */}
      {cohortPlaybooks.length > 0 && (
        <PanelErrorBoundary>
          <CohortPlaybooksPanel
            playbooks={cohortPlaybooks}
            situations={playbookSituations}
            onApplyPlaybook={handleApplyPlaybook}
          />
        </PanelErrorBoundary>
      )}

      {/* 4-Panel Grid + Pipeline Watch */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Priority Actions */}
        <PanelErrorBoundary>
        <div className="rounded-lg border border-border bg-card p-4 md:row-span-2">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Priority Actions</h2>
            <span className="text-xs text-muted-foreground ml-auto">{panels.priorityActions.length} items</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Focus on these first to protect or create income.</p>
          {panels.priorityActions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">You're all caught up!</p>
          ) : (
            <div className="space-y-2">
              {panels.priorityActions.map(action => {
                const confidence = (action.scores.urgencyScore >= 40 && action.scores.revenueImpactScore >= 40) || action.scores.decayRiskScore >= 50 ? 'High' : 'Medium';
                const snoozeCount = getSnoozeCount(action.id);
                return (
                  <div
                    key={action.id}
                    className="flex items-start gap-3 p-2.5 rounded-md hover:bg-accent/50 transition-colors group cursor-pointer"
                    onClick={() => setSelectedItem({ kind: 'action', data: action })}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); if (action.relatedTaskId) { completeTask(action.relatedTaskId); showPostActionToast('complete', { isOverdue: action.timeWindow === 'Overdue' }); } }}
                      className="mt-0.5 h-5 w-5 rounded-md border-2 border-muted-foreground/30 flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors shrink-0"
                    >
                      <Check className="h-3 w-3 text-transparent group-hover:text-primary transition-colors" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium leading-tight truncate">{action.title}</p>
                        {action.isSuggested && <Sparkles className="h-3 w-3 text-time-sensitive shrink-0" />}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${confidence === 'High' ? 'bg-muted text-foreground/70' : 'bg-muted/50 text-muted-foreground'}`}>
                          {confidence}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{action.reason}</span>
                        {action.potentialValue && (
                          <span className="text-xs text-opportunity font-medium">{formatCurrency(action.potentialValue)}</span>
                        )}
                      </div>
                      {snoozeCount >= 3 && (
                        <p className="text-[10px] text-warning mt-1 italic">Action repeatedly deferred.</p>
                      )}
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${action.timeWindow === 'Overdue' ? 'text-urgent' : action.timeWindow === 'Due now' ? 'text-warning' : 'text-muted-foreground'}`}>
                      {action.timeWindow}
                    </span>
                  </div>
                );
              })}
              <button
                onClick={() => {/* TODO: navigate to full actions list */}}
                className="w-full text-center text-xs text-primary hover:text-primary/80 transition-colors py-2"
              >
                View All Actions <ChevronRight className="inline h-3 w-3" />
              </button>
            </div>
          )}
        </div>
        </PanelErrorBoundary>

        {/* Deals at Risk */}
        <PanelErrorBoundary>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold">Deals at Risk</h2>
          </div>
          {panels.dealsAtRisk.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">All deals are on track</p>
          ) : (
            <div className="space-y-2">
              {panels.dealsAtRisk.map(item => (
                <div
                  key={item.deal.id}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedItem({ kind: 'deal', data: item })}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.deal.title}</p>
                    <p className="text-xs text-muted-foreground">{item.topReason}</p>
                  </div>
                  <Badge variant={riskBadge[item.deal.riskLevel].variant}>{riskBadge[item.deal.riskLevel].label}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
        </PanelErrorBoundary>

        {/* Speed Alerts */}
        <PanelErrorBoundary>
        <div className="rounded-lg border border-border bg-card p-4 md:col-start-2">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-time-sensitive" />
            <h2 className="text-sm font-semibold">Speed Alerts</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Time-sensitive items requiring immediate attention.</p>
          {panels.speedAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No time-sensitive alerts</p>
          ) : (
            <div className="space-y-2">
              {panels.speedAlerts.map(alert => (
                <div
                  key={alert.id}
                  className="p-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedItem({ kind: 'speedAlert', data: alert })}
                >
                  <div className="flex items-start gap-2">
                    <span className={`status-dot mt-1.5 shrink-0 ${alert.type === 'urgent' || alert.type === 'task_due' ? 'bg-urgent' : 'bg-time-sensitive'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{alert.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </PanelErrorBoundary>
      </div>

      {/* Pipeline Watch */}
      {pipelineWatch.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Pipeline Watch</h2>
            <span className="text-xs text-muted-foreground ml-auto">Since last session</span>
          </div>
          <div className="space-y-2">
            {pipelineWatch.map(event => (
              <div key={event.id} className="flex items-center gap-2.5 p-2 rounded-md">
                <span className="text-sm">{event.icon}</span>
                <span className="text-sm text-muted-foreground">{event.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FUB Drift Detection + Watchlist */}
      {hasFubIntegration && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PanelErrorBoundary>
            <FubDriftCard
              hasIntegration={hasFubIntegration}
              onScopedStageComplete={(runId) => navigate(`/?workspace=sync`)}
            />
          </PanelErrorBoundary>
          <PanelErrorBoundary>
            <FubWatchlistPanel hasIntegration={hasFubIntegration} />
          </PanelErrorBoundary>
        </div>
      )}

      {/* Detail Drawer */}
      <ActionDetailDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onComplete={(taskId) => {
          completeTask(taskId);
          showPostActionToast('handled');
        }}
        snoozeCount={selectedItem ? getSnoozeCount(selectedItem.kind === 'action' ? selectedItem.data.id : '') : 0}
      />

      {/* Money Risk Drawer */}
      <MoneyRiskDrawer
        result={moneyDrawerResult}
        deal={moneyDrawerDeal}
        onClose={() => { setMoneyDrawerResult(null); setMoneyDrawerDeal(null); }}
        onStartAction={handleStartAction}
      />

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <QuickAddModal
          defaultType="task"
          prefillTaskTitle={quickAddPrefill.title}
          prefillRelatedLeadId={quickAddPrefill.leadId}
          prefillRelatedDealId={quickAddPrefill.dealId}
          onClose={() => { setShowQuickAdd(false); setQuickAddPrefill({}); }}
        />
      )}

      {/* Touch Picker (EOD Log Touch) */}
      <TouchPickerModal
        open={showTouchPicker}
        onClose={() => setShowTouchPicker(false)}
        onSelect={(entityType, entityId, entityTitle) => {
          setShowTouchPicker(false);
          setTouchTarget({ entityType, entityId, entityTitle });
          setShowLogTouch(true);
        }}
      />

      {/* Log Touch Modal */}
      {showLogTouch && touchTarget && (
        <LogTouchModal
          open={true}
          entityType={touchTarget.entityType}
          entityId={touchTarget.entityId}
          entityTitle={touchTarget.entityTitle}
          onClose={() => { setShowLogTouch(false); setTouchTarget(null); }}
        />
      )}

      {/* End of Day Review Drawer */}
      <EndOfDayReviewDrawer
        open={showEodReview}
        onClose={() => { setShowEodReview(false); markEodCompleted(); }}
        overdueTasks={eodSummary.overdueTasks}
        untouchedHotLeads={eodSummary.untouchedHotLeads}
        computedAt={eodSummary.computedAt}
        deals={deals}
        moneyResults={moneyResults}
        opportunityResults={opportunityResults}
        onLogTouch={(entityType, entityId, entityTitle) => {
          setTouchTarget({ entityType, entityId, entityTitle });
          setShowLogTouch(true);
        }}
        onCreateTask={(prefillTitle, relatedLeadId, relatedDealId) => {
          setQuickAddPrefill({ title: prefillTitle, leadId: relatedLeadId, dealId: relatedDealId });
          setShowQuickAdd(true);
        }}
        onNavigateToTasks={() => navigate('/?workspace=work')}
      />

      {/* Action Workspace Drawer */}
      <ActionWorkspaceDrawer
        open={!!executionEntity}
        onClose={() => setExecutionEntity(null)}
        entity={executionEntity?.entity || null}
        entityType={executionEntity?.entityType || 'deal'}
        moneyResult={executionEntity?.moneyResult}
        oppResult={executionEntity?.oppResult}
        tasks={tasks}
        onCreateTask={handleExecutionFollowUp}
        onLogTouch={handleExecutionLogTouch}
      />

      {/* Weekly Planning Assistant */}
      <WeeklyPlanningAssistant
        open={showWeeklyPlanner}
        onClose={() => setShowWeeklyPlanner(false)}
        overview={strategicOverview}
      />
    </div>
  );
}
