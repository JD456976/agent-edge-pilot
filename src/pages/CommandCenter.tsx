import { useMemo, useState, useEffect, useCallback } from 'react';
import { DollarSign, AlertTriangle, TrendingUp, Zap, Check, Info, ChevronRight, Sparkles, Eye, Plus, Phone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { buildCommandCenterPanels } from '@/lib/intelligenceEngine';
import { getDailyBriefing, getMissedYesterdayCount, getMomentum, getPipelineWatch, getControlStatus, getProgressSnapshot, shouldShowStressReduction, getPostActionFeedback } from '@/lib/dailyIntelligence';
import { useSessionMemory } from '@/hooks/useSessionMemory';
import { useImportHighlight } from '@/hooks/useImportHighlight';
import { useSessionMode, useSessionStartRisk } from '@/hooks/useSessionMode';
import { useEndOfDaySummary } from '@/hooks/useEndOfDaySummary';
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
import { computeOpportunityBatch, type OpportunityHeatResult, type UserCommissionDefaults } from '@/lib/leadMoneyModel';
import { computeForecastBatch } from '@/lib/forecastModel';
import { computeStabilityScore, type StabilityInputs } from '@/lib/stabilityModel';
import { useScoringPreferences } from '@/hooks/useScoringPreferences';
import { useRankChangeTracker, type RankChange } from '@/hooks/useRankChangeTracker';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
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
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
  const [hasFubIntegration, setHasFubIntegration] = useState(false);
  const [snoozeCounts, setSnoozeCounts] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(SNOOZE_STORAGE_KEY) || '{}'); } catch { return {}; }
  });
  const [stressReductionDismissed, setStressReductionDismissed] = useState(false);

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

  // Forecast task creation
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
  // momentum already declared above (before stabilityInputs)
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
        <Button size="sm" variant="outline" onClick={() => setShowQuickAdd(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Quick Add
        </Button>
      </div>

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
          onReviewAll={() => navigate('/tasks')}
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

      {/* Autopilot v2 */}
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
      />

      {/* Money At Risk + Opportunities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PanelErrorBoundary>
          <MoneyAtRiskPanel
            deals={deals}
            participants={dealParticipants}
            userId={user?.id || ''}
            onSelect={handleMoneySelect}
            onAddCommissionToDeals={() => navigate('/pipeline')}
            refreshData={refreshData}
            dealChanges={dealChanges}
            riskWeights={riskWeights}
          />
        </PanelErrorBoundary>
        <PanelErrorBoundary>
          <OpportunityHeatPanel
            leads={leads}
            tasks={tasks}
            userId={user?.id || ''}
            onStartAction={handleOpportunityAction}
            leadChanges={leadChanges}
            oppWeights={oppWeights}
          />
        </PanelErrorBoundary>
      </div>

      {/* Income Forecast + Stability Score */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PanelErrorBoundary>
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
        </PanelErrorBoundary>
        <PanelErrorBoundary>
          <StabilityScorePanelV2
            inputs={stabilityInputs}
            onCreateTask={(title) => handleAutopilotCreateTask(title)}
          />
        </PanelErrorBoundary>
      </div>

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
              onScopedStageComplete={(runId) => navigate(`/settings?reviewRun=${runId}`)}
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
        onClose={() => setShowEodReview(false)}
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
        onNavigateToTasks={() => navigate('/tasks')}
      />
    </div>
  );
}
