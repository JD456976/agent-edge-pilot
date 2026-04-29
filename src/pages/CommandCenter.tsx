import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { DollarSign, AlertTriangle, TrendingUp, Zap, Check, Info, ChevronRight, Sparkles, Eye, EyeOff, Plus, Phone, Undo2, Upload, Settings2, RefreshCw, BarChart3, Rows3, Rows4 } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';

import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useImportHighlight } from '@/hooks/useImportHighlight';
import { useCommandCenterLayout, PANEL_LABELS, type PanelId, type PresetKey } from '@/hooks/useCommandCenterLayout';
import { useCommandCenterData } from '@/hooks/useCommandCenterData';
import { useCommandCenterHandlers } from '@/hooks/useCommandCenterHandlers';
import { usePanelRenderer } from '@/components/commandcenter/PanelRenderer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonCard } from '@/components/SkeletonCard';
import { ActionDetailDrawer } from '@/components/ActionDetailDrawer';
import { ControlStatusBar } from '@/components/ControlStatusBar';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import { QuickAddModal } from '@/components/QuickAddModal';
import { FubWatchlistPanel } from '@/components/FubWatchlistPanel';
import { MoneyRiskDrawer } from '@/components/MoneyRiskDrawer';
import { MorningFocusCard, MiddayStabilizationCard, EodSafetyCard } from '@/components/DailyModeCards';
import { LogTouchModal } from '@/components/LogTouchModal';
import { TouchPickerModal } from '@/components/TouchPickerModal';
import { EndOfDayReviewDrawer } from '@/components/EndOfDayReviewDrawer';
import { ActionComposerDrawer } from '@/components/ActionComposerDrawer';
import { SortablePanel } from '@/components/SortablePanel';
import { SelfOptNudges } from '@/components/SelfOptNudges';
import { PanelCustomizer } from '@/components/PanelCustomizer';
import { MorningBriefCard } from '@/components/MorningBriefCard';
import { WhatThisMeansPanel } from '@/components/WhatThisMeansPanel';
import { CollapsiblePanel } from '@/components/CollapsiblePanel';
import { IncomeControlMeter } from '@/components/IncomeControlMeter';
import { FocusModeSelector, isPanelVisibleInMode } from '@/components/FocusModeSelector';
import { useUserMaturity, type UserLevel } from '@/hooks/useUserMaturity';
import { computeMinimalModeAudit, logAuditReport } from '@/lib/minimalModeAudit';
import { PanelSearchFilter, matchesPanelFilter } from '@/components/PanelSearchFilter';
import { CSVImportModal } from '@/components/CSVImportModal';
import { useFocusMode } from '@/hooks/useFocusMode';
import { useHabitTracking } from '@/hooks/useHabitTracking';
import { usePinnedPanels } from '@/hooks/usePinnedPanels';
import { PanelPinButton } from '@/components/PanelPinButton';
import { PanelHelpTooltip } from '@/components/PanelHelpTooltip';
import { usePanelCollapse } from '@/hooks/usePanelCollapse';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { NotificationBell } from '@/components/NotificationBell';
import { ScrollToTopFAB } from '@/components/ScrollToTopFAB';
import { useFavoriteEntities, FavoritesStrip } from '@/components/FavoriteEntities';
import { GettingStartedChecklist } from '@/components/GettingStartedChecklist';
import { PanelDensityToggle, usePanelDensity } from '@/components/PanelDensityToggle';
import { AutoSaveIndicator, useAutoSaveIndicator } from '@/components/AutoSaveIndicator';
import { ConfettiOverlay, useConfetti } from '@/components/ConfettiOverlay';
import { UpcomingEventsPanel } from '@/components/UpcomingEventsPanel';
import { DailyPulseBar } from '@/components/DailyPulseBar';
import { IntelligenceLibrary } from '@/components/IntelligenceLibrary';
import { ShowingPrepCard } from '@/components/ShowingPrepCard';
import { DealCloseCountdown } from '@/components/DealCloseCountdown';
import { PostShowingComposer } from '@/components/PostShowingComposer';
import { CohortPlaybooksPanel } from '@/components/CohortPlaybooksPanel';
import { StrategicOverviewPanel } from '@/components/StrategicOverviewPanel';
import { WeeklyPlanningAssistant } from '@/components/WeeklyPlanningAssistant';
import { DailyFlightPlan } from '@/components/DailyFlightPlan';
import { DailyStreakBadge } from '@/components/DailyStreakBadge';
import { ExportSnapshotButton } from '@/components/ExportSnapshotButton';
import { useEntityNavigation } from '@/contexts/EntityNavigationContext';
import { getPostActionFeedback } from '@/lib/dailyIntelligence';
import { getAutonomyLevel } from '@/lib/preparedActions';
import { hasUserSetBudget } from '@/lib/strategicEngine';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import type { RiskLevel, Deal, Lead, CommandCenterAction, CommandCenterDealAtRisk, CommandCenterOpportunity, CommandCenterSpeedAlert } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';

const SNOOZE_STORAGE_KEY = 'dp-snooze-counts';

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const riskBadge: Record<RiskLevel, { variant: 'urgent' | 'warning' | 'opportunity'; label: string }> = {
  red: { variant: 'urgent', label: 'High Risk' },
  yellow: { variant: 'warning', label: 'At Risk' },
  green: { variant: 'opportunity', label: 'On Track' }
};

type DetailItem =
  { kind: 'action'; data: CommandCenterAction } |
  { kind: 'deal'; data: CommandCenterDealAtRisk } |
  { kind: 'opportunity'; data: CommandCenterOpportunity } |
  { kind: 'speedAlert'; data: CommandCenterSpeedAlert };

export default function CommandCenter() {
  const { user } = useAuth();
  const { leads, deals, tasks, alerts, dealParticipants, hasData, loading: dataLoading, completeTask, uncompleteTask, addTask, refreshData } = useData();
  const navigate = useNavigate();
  const { pendingNavigation, clearNavigation } = useEntityNavigation();

  // ── Extracted computed data ────────────────────────────────────────
  const ccData = useCommandCenterData(user?.id, leads, deals, tasks, alerts, dealParticipants, hasData);

  // ── UI State ───────────────────────────────────────────────────────
  const [moneyDrawerResult, setMoneyDrawerResult] = useState<MoneyModelResult | null>(null);
  const [moneyDrawerDeal, setMoneyDrawerDeal] = useState<Deal | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddPrefill, setQuickAddPrefill] = useState<{ title?: string; leadId?: string; dealId?: string }>({});
  const [showLogTouch, setShowLogTouch] = useState(false);
  const [showTouchPicker, setShowTouchPicker] = useState(false);
  const [touchTarget, setTouchTarget] = useState<{ entityType: 'lead' | 'deal'; entityId: string; entityTitle: string } | null>(null);
  const [showEodReview, setShowEodReview] = useState(false);
  const [executionEntity, setExecutionEntity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
  const [snoozeCounts, setSnoozeCounts] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(SNOOZE_STORAGE_KEY) || '{}'); } catch { return {}; }
  });
  const [stressReductionDismissed, setStressReductionDismissed] = useState(false);
  const [autonomyLevel] = useState(() => getAutonomyLevel());
  const [showWeeklyPlanner, setShowWeeklyPlanner] = useState(false);
  const [panelFilter, setPanelFilter] = useState('');
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showPostShowing, setShowPostShowing] = useState(false);
  const [postShowingContext, setPostShowingContext] = useState<{ lead: Lead; propertyAddress?: string } | null>(null);

  // Panel hooks
  const { pinnedPanels, togglePin, isPinned, sortWithPins } = usePinnedPanels();
  const { isCollapsed, toggleCollapse } = usePanelCollapse();
  const { favorites, toggleFavorite, isFavorite } = useFavoriteEntities();
  const { density, toggleDensity } = usePanelDensity();
  const { status: saveStatus, markSaving, markSaved } = useAutoSaveIndicator();
  const { active: confettiActive, triggerConfetti } = useConfetti();
  const { focusMode, updateFocusMode } = useFocusMode();
  const maturity = useUserMaturity();
  const [fullViewOverride, setFullViewOverride] = useState(() => {
    try { return localStorage.getItem('dp-full-view') === 'true'; } catch { return false; }
  });
  const { stats: habitStats, markBriefViewed, markEodCompleted } = useHabitTracking();

  const {
    panelOrder, hiddenPanels, editMode, isDragging, setIsDragging,
    toggleEditMode, reorder, togglePanelVisibility, isPanelHidden,
    applyPreset, resetToDefault, showAllPanels, visibleCount, totalCount
  } = useCommandCenterLayout(user?.id);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showHiddenPanels, setShowHiddenPanels] = useState(false);

  const showImportBadge = useImportHighlight();

  // Progressive unlock
  const prevLevelRef = useRef<UserLevel>(maturity.level);
  useEffect(() => {
    if (maturity.level > prevLevelRef.current) {
      toast({ description: 'New insights unlocked as your data grows.', duration: 4000 });
      prevLevelRef.current = maturity.level;
    }
  }, [maturity.level]);

  // Minimal Mode Audit
  useEffect(() => {
    if (focusMode === 'minimal' && !fullViewOverride) {
      const vc = panelOrder.filter((id) => isPanelVisibleInMode(id, 'minimal', maturity.level, false)).length;
      const report = computeMinimalModeAudit(vc, maturity.level);
      logAuditReport(report);
    }
  }, [focusMode, fullViewOverride, maturity.level, panelOrder]);

  // DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleDragStart = useCallback(() => setIsDragging(true), [setIsDragging]);
  const prevOrderRef = useRef<PanelId[]>([]);
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    prevOrderRef.current = [...panelOrder];
    reorder(active.id as string, over.id as string);
    markSaving();
    setTimeout(() => markSaved(), 600);
    toast({
      description: 'Panel order updated', duration: 4000,
      action: React.createElement('button', {
        className: 'inline-flex items-center gap-1 shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors',
        onClick: () => { if (prevOrderRef.current.length) reorder(prevOrderRef.current[0], prevOrderRef.current[0]); }
      }, React.createElement(Undo2, { className: 'h-3 w-3' }), 'Undo') as any
    });
  }, [reorder, setIsDragging, panelOrder, markSaving, markSaved]);

  // Post-action toast
  const showPostActionToast = useCallback((kind: 'complete' | 'snooze' | 'handled', context?: any) => {
    const feedback = getPostActionFeedback(kind, context);
    if (kind === 'complete' && context?.taskId) {
      toast({
        description: feedback.message, duration: 5000,
        action: React.createElement('button', {
          className: 'inline-flex items-center gap-1 shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors',
          onClick: () => uncompleteTask(context.taskId)
        }, React.createElement(Undo2, { className: 'h-3 w-3' }), 'Undo') as any
      });
    } else {
      toast({ description: feedback.message, duration: 3000 });
    }
  }, [uncompleteTask]);

  const handleSnooze = useCallback((id: string) => {
    setSnoozedIds((prev) => new Set(prev).add(id));
    setSnoozeCounts((prev) => {
      const next = { ...prev, [id]: (prev[id] || 0) + 1 };
      localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    showPostActionToast('snooze');
  }, [showPostActionToast]);

  const getSnoozeCount = useCallback((id: string) => snoozeCounts[id] || 0, [snoozeCounts]);

  // ── Extracted handlers ─────────────────────────────────────────────
  const handlers = useCommandCenterHandlers({
    userId: user?.id, deals, leads, tasks: [],
    moneyResults: ccData.moneyResults, opportunityResults: ccData.opportunityResults,
    addTask, uncompleteTask,
    setExecutionEntity, setMoneyDrawerResult, setMoneyDrawerDeal,
    setTouchTarget, setShowLogTouch,
  });

  // Entity navigation from Command Palette
  useEffect(() => {
    if (!pendingNavigation) return;
    const { entityId, entityType } = pendingNavigation;
    handlers.handleOpenExecution(entityId, entityType as 'deal' | 'lead');
    clearNavigation();
  }, [pendingNavigation, clearNavigation, handlers.handleOpenExecution]);

  // ── Panel renderer ─────────────────────────────────────────────────
  const renderPanel = usePanelRenderer({
    panels: ccData.panels, userId: user?.id || '', deals, leads, tasks, dealParticipants,
    moneyResults: ccData.moneyResults, opportunityResults: ccData.opportunityResults,
    stabilityResult: ccData.stabilityResult, stabilityInputs: ccData.stabilityInputs,
    overdueTasks: ccData.overdueTasks, dueSoonTasks: ccData.dueSoonTasks,
    totalMoneyAtRisk: ccData.totalMoneyAtRisk, topMoneyAtRisk: ccData.topMoneyAtRisk,
    topOpportunity: ccData.topOpportunity, burnoutCritical: ccData.burnoutCritical,
    predictiveSignals: ccData.predictiveSignals, forecast: ccData.forecast,
    userDefaults: ccData.userDefaults, riskWeights: ccData.riskWeights, oppWeights: ccData.oppWeights,
    dealChanges: ccData.dealChanges, leadChanges: ccData.leadChanges,
    marketConditions: ccData.marketConditions, learningSnapshot: ccData.learningSnapshot,
    resetLearning: ccData.resetLearning,
    agentProfile: ccData.agentProfile, agentProfileLoading: ccData.agentProfileLoading,
    exportAgentProfile: ccData.exportAgentProfile, resetAgentProfile: ccData.resetAgentProfile,
    incomePatterns: ccData.incomePatterns, snoozedIds, autonomyLevel,
    handleSnooze, handleMoneySelect: handlers.handleMoneySelect,
    handleOpportunityAction: handlers.handleOpportunityAction,
    handleOpenLead: handlers.handleOpenLead, handleOpenDeal: handlers.handleOpenDeal,
    handleOpenExecution: handlers.handleOpenExecution,
    handleAutopilotCreateTask: handlers.handleAutopilotCreateTask,
    handleForecastCreateTask: handlers.handleForecastCreateTask,
    refreshData, completeTask, showPostActionToast,
    setTouchTarget, setShowLogTouch, setExecutionEntity, setSelectedItem,
  });

  // Loading
  useEffect(() => {
    if (!dataLoading) { setLoading(false); return; }
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, [dataLoading]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="space-y-1 mb-6"><SkeletonCard lines={1} /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard lines={4} /><SkeletonCard lines={3} /><SkeletonCard lines={3} /><SkeletonCard lines={3} />
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
        {ccData.hasFubIntegration && (
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3 mb-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">FUB is connected</p>
                <p className="text-xs text-muted-foreground">Go to Sync to import your leads, deals, and appointments</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/?workspace=sync')}>Import Now</Button>
          </div>
        )}
        <GettingStartedChecklist
          hasCrmConnected={ccData.hasFubIntegration} hasDeals={false} hasLeads={false} hasTasks={false}
          hasIncomeTarget={!!(ccData.strategicSettings as any)?.annualIncomeTarget}
          onConnectCrm={() => navigate('/?workspace=sync')} onAddDeal={() => setShowQuickAdd(true)}
          onSetIncomeTarget={() => navigate('/?workspace=settings')} onLoadDemo={() => {}}
        />
        <EmptyState type="deals" title="Your command center is ready"
          description="Connect your CRM to import deals and leads, or add them manually."
          actionLabel="Add Your First Deal" onAction={() => setShowQuickAdd(true)}
        />
        {showQuickAdd && <QuickAddModal defaultType="deal" onClose={() => setShowQuickAdd(false)} />}
        <CSVImportModal open={showCSVImport} onClose={() => setShowCSVImport(false)} />
        <div className="mt-4 text-center">
          <Button size="sm" variant="outline" onClick={() => setShowCSVImport(true)}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Import from CSV
          </Button>
        </div>
      </div>
    );
  }

  const { totalRevenue, activeDeals, overdueTasks, dueSoonTasks, totalMoneyAtRisk, momentum, stabilityResult,
    topMoneyAtRisk, topOpportunity, moneyResults, opportunityResults, panels, briefing, missedYesterday,
    controlStatus, progressItems, stressReduction, pipelineWatch, currentMode, sessionStartRisk,
    selfOptAnalysis, closingDeals, imminentShowing, untouchedRiskDeals, untouchedHotLeads, eodSummary,
    modeHeader, risksReducedToday, cohortPlaybooks, playbookSituations, strategicOverview,
    strategicSettings, hasFubIntegration, fubAppointments, previousSnapshot,
  } = ccData;

  const dealsNeedingAttention = panels.dealsAtRisk.length;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Sticky Header */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:top-0 z-10 bg-background/95 backdrop-blur-sm -mx-4 px-4 py-3 border-b border-transparent [&:not(:first-child)]:border-border space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg lg:text-xl font-bold leading-tight truncate">Command Center</h1>
            <p className="text-sm text-muted-foreground truncate">{today}</p>
          </div>
          <div className="flex lg:hidden items-center gap-1.5 shrink-0">
            <DailyStreakBadge eodStreak={habitStats.eodStreak} briefStreak={habitStats.briefStreak} />
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => setShowQuickAdd(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setShowCSVImport(true)}><Upload className="h-3.5 w-3.5 mr-1" /> Import</Button>
            <Button size="sm" variant="outline" onClick={() => setShowQuickAdd(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Quick Add</Button>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-2 flex-wrap">
          <AutoSaveIndicator status={saveStatus} />
          <NotificationBell alerts={alerts} />
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={toggleDensity}>
            {density === 'comfortable' ? <Rows4 className="h-3 w-3" /> : <Rows3 className="h-3 w-3" />}
            {density === 'comfortable' ? 'Compact' : 'Comfortable'}
          </Button>
          <ExportSnapshotButton totalRevenue={totalRevenue} totalMoneyAtRisk={totalMoneyAtRisk}
            stabilityScore={stabilityResult.score} overdueCount={overdueTasks.length}
            activeDeals={activeDeals.length} momentum={momentum}
          />
          <PanelSearchFilter onFilterChange={setPanelFilter} />
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={() => setShowCustomizer(true)}>
            <Settings2 className="h-3 w-3" /> Customize ({visibleCount}/{totalCount})
          </Button>
          <div data-tour="focus-mode"><FocusModeSelector mode={focusMode} onModeChange={updateFocusMode} /></div>
        </div>
        <div className="flex lg:hidden items-center gap-2 overflow-x-auto pb-1 -mb-1">
          <div data-tour="focus-mode"><FocusModeSelector mode={focusMode} onModeChange={updateFocusMode} /></div>
          <Button size="sm" variant="ghost" className="h-9 min-w-[44px] text-xs shrink-0 gap-1" onClick={() => setShowCustomizer(true)}>
            <Settings2 className="h-3.5 w-3.5" /> Panels ({visibleCount})
          </Button>
          <Button size="sm" variant="ghost" className="h-9 min-w-[44px] text-xs shrink-0" onClick={() => setShowCSVImport(true)}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Import
          </Button>
        </div>
      </div>

      {/* Adaptive Mode Banner */}
      {focusMode === 'minimal' && maturity.level <= 1 && !fullViewOverride && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-foreground">Starting with a focused view — more insights will appear as your data grows.</p>
            <p className="text-xs text-muted-foreground mt-0.5">Level: {maturity.label} · {maturity.dealCount} deals · {maturity.leadCount} leads</p>
          </div>
          <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => { setFullViewOverride(true); localStorage.setItem('dp-full-view', 'true'); }}>
            Switch to Full View
          </Button>
        </div>
      )}

      <GettingStartedChecklist
        hasCrmConnected={hasFubIntegration} hasDeals={deals.length > 0} hasLeads={leads.length > 0}
        hasTasks={tasks.length > 0} hasIncomeTarget={!!(strategicSettings as any)?.annualIncomeTarget}
        onConnectCrm={() => navigate('/?workspace=sync')} onAddDeal={() => setShowQuickAdd(true)}
        onSetIncomeTarget={() => navigate('/?workspace=settings')} onLoadDemo={() => {}}
      />

      <FavoritesStrip favorites={favorites} onSelect={(id, type) => handlers.handleOpenExecution(id, type)} />

      {imminentShowing && (
        <ShowingPrepCard appointment={imminentShowing.appointment} lead={imminentShowing.lead} tasks={tasks}
          onOpenLead={handlers.handleOpenLead}
          onLogTouch={(et, ei, en) => { setTouchTarget({ entityType: et, entityId: ei, entityTitle: en }); setShowLogTouch(true); }}
          onCreateTask={(title, leadId) => handlers.handleAutopilotCreateTask(title, undefined, leadId)}
        />
      )}

      {closingDeals.map(deal => (
        <DealCloseCountdown key={deal.id} deal={deal}
          moneyResult={moneyResults.find(r => r.dealId === deal.id) || null}
          onCreateTask={(title, dealId) => handlers.handleAutopilotCreateTask(title, dealId, undefined)}
          onOpenDeal={handlers.handleOpenDeal}
        />
      ))}

      <IncomeControlMeter stabilityResult={stabilityResult} totalMoneyAtRisk={totalMoneyAtRisk}
        totalRevenue={totalRevenue} overdueCount={overdueTasks.length}
      />

      <DailyPulseBar totalMoneyAtRisk={totalMoneyAtRisk}
        topMoneyResult={topMoneyAtRisk} topDeal={topMoneyAtRisk ? deals.find(d => d.id === topMoneyAtRisk.dealId) || null : null}
        topOpportunity={topOpportunity} topLead={topOpportunity ? leads.find(l => l.id === topOpportunity.leadId) || null : null}
        overdueTasks={overdueTasks} dueSoonTasks={dueSoonTasks}
        onMoneyClick={() => { if (topMoneyAtRisk) { const deal = deals.find(d => d.id === topMoneyAtRisk.dealId); if (deal) handlers.handleMoneySelect(topMoneyAtRisk, deal); } }}
        onLeadClick={() => { if (topOpportunity) { const lead = leads.find(l => l.id === topOpportunity.leadId); if (lead) handlers.handleOpenLead(lead); } }}
        onTasksClick={() => navigate('/?workspace=work')}
      />

      <UpcomingEventsPanel deals={deals} tasks={tasks} appointments={fubAppointments}
        isCollapsed={isCollapsed('upcoming-events')} onToggleCollapse={() => toggleCollapse('upcoming-events')}
        onOpenLead={(leadId) => { const lead = leads.find(l => l.id === leadId); if (lead) handlers.handleOpenLead(lead); }}
        onOpenDeal={(dealId) => { const deal = deals.find(d => d.id === dealId); if (deal) handlers.handleOpenDeal(deal); }}
      />

      {currentMode === 'morning' && (
        <MorningBriefCard deals={deals} leads={leads} tasks={tasks} moneyResults={moneyResults}
          opportunityResults={opportunityResults} stabilityResult={stabilityResult}
          totalMoneyAtRisk={totalMoneyAtRisk} previousSnapshot={previousSnapshot}
          onStartActions={() => {
            markBriefViewed();
            if (topMoneyAtRisk) { const deal = deals.find(d => d.id === topMoneyAtRisk.dealId); if (deal) { setExecutionEntity({ entity: deal, entityType: 'deal', moneyResult: topMoneyAtRisk }); return; } }
            if (topOpportunity) { const lead = leads.find(l => l.id === topOpportunity.leadId); if (lead) { setExecutionEntity({ entity: lead, entityType: 'lead', oppResult: topOpportunity }); return; } }
          }}
          onReviewDetail={() => { markBriefViewed(); navigate('/?workspace=work'); }}
        />
      )}

      <CollapsiblePanel id="daily-briefing" label="Daily Intelligence Briefing" icon={<Sparkles className="h-3.5 w-3.5 text-primary" />} isCollapsed={isCollapsed('daily-briefing')} onToggleCollapse={() => toggleCollapse('daily-briefing')}>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          {showImportBadge && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/10 mb-2">
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">Imported just now</Badge>
              <span className="text-xs text-muted-foreground">New items from your latest FUB import are reflected below.</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-base">{briefing.icon}</span>
            <span className="text-sm font-medium">{modeHeader.message}</span>
          </div>
          <p className="text-xs text-muted-foreground">{modeHeader.subtext}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
            <div className="flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-opportunity" />
              <span className="text-xs text-muted-foreground"><AnimatedCounter value={totalRevenue} formatter={formatCurrency} /> revenue in play</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs text-muted-foreground"><AnimatedCounter value={dealsNeedingAttention} /> deal{dealsNeedingAttention !== 1 ? 's' : ''} need{dealsNeedingAttention === 1 ? 's' : ''} attention</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Momentum: <span className={`font-medium ${momentum === 'Improving' || momentum === 'Declining' ? 'text-foreground' : 'text-muted-foreground'}`}>{momentum}</span>
              </span>
            </div>
          </div>
          {missedYesterday > 0 && <p className="text-xs text-muted-foreground">Yesterday's unfinished priorities: {missedYesterday}</p>}
          <span className="text-xs text-muted-foreground block font-bold">
            {currentMode === 'morning' ? 'Good morning' : currentMode === 'midday' ? 'Good afternoon' : 'Good evening'}, {user?.name?.split(' ')[0]?.trim() || localStorage.getItem('dp_user_firstname')?.trim() || 'there'}
          </span>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel id="control-status" label="Control Status & Progress" icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />} isCollapsed={isCollapsed('control-status')} onToggleCollapse={() => toggleCollapse('control-status')}>
        <ControlStatusBar controlStatus={controlStatus} progressItems={progressItems}
          showStressReduction={stressReduction} stressReductionDismissed={stressReductionDismissed}
          onDismissStressReduction={() => setStressReductionDismissed(true)}
        />
      </CollapsiblePanel>

      {selfOptAnalysis.nudges.length > 0 && <SelfOptNudges nudges={selfOptAnalysis.nudges} />}

      {currentMode === 'midday' && <MiddayStabilizationCard currentTotalRisk={totalMoneyAtRisk} sessionStart={sessionStartRisk} risksReducedToday={risksReducedToday} />}
      {currentMode === 'evening' && (
        <EodSafetyCard untouchedRiskDeals={untouchedRiskDeals} untouchedHotLeads={untouchedHotLeads}
          overdueTasks={overdueTasks} onLogTouch={() => setShowTouchPicker(true)}
          onCreateTask={() => { setQuickAddPrefill({}); setShowQuickAdd(true); }}
          onReviewItems={() => setShowEodReview(true)}
        />
      )}

      <CollapsiblePanel id="what-this-means" label="What This Means Today" icon={<Info className="h-3.5 w-3.5 text-primary" />} isCollapsed={isCollapsed('what-this-means')} onToggleCollapse={() => toggleCollapse('what-this-means')}>
        <WhatThisMeansPanel deals={deals} leads={leads} tasks={tasks} moneyResults={moneyResults}
          opportunityResults={opportunityResults} stabilityResult={stabilityResult} totalMoneyAtRisk={totalMoneyAtRisk}
        />
      </CollapsiblePanel>

      <CollapsiblePanel id="daily-flight-plan" label="Daily Flight Plan" icon={<Zap className="h-3.5 w-3.5 text-primary" />} isCollapsed={isCollapsed('daily-flight-plan')} onToggleCollapse={() => toggleCollapse('daily-flight-plan')}>
        <PanelErrorBoundary>
          <DailyFlightPlan deals={deals} leads={leads} tasks={tasks} moneyResults={moneyResults}
            opportunityResults={opportunityResults} stabilityResult={stabilityResult}
            totalMoneyAtRisk={totalMoneyAtRisk} sessionMode={currentMode === 'midday' ? 'midday' : currentMode}
            onStartAction={(step) => {
              if (step.entityType === 'deal' && step.entityId) { const deal = deals.find(d => d.id === step.entityId); const result = moneyResults.find(r => r.dealId === step.entityId); if (deal && result) handlers.handleMoneySelect(result, deal); }
              else if (step.entityType === 'lead' && step.entityId) { const lead = leads.find(l => l.id === step.entityId); if (lead) handlers.handleOpenLead(lead); }
              else if (step.entityType === 'task' && step.entityId) { completeTask(step.entityId); showPostActionToast('complete', { taskId: step.entityId }); }
            }}
            onOpenExecution={handlers.handleOpenExecution}
          />
        </PanelErrorBoundary>
      </CollapsiblePanel>

      <CollapsiblePanel id="strategic-overview" label="Strategic Overview" icon={<BarChart3 className="h-3.5 w-3.5 text-primary" />} isCollapsed={isCollapsed('strategic-overview')} onToggleCollapse={() => toggleCollapse('strategic-overview')}>
        <PanelErrorBoundary>
          <StrategicOverviewPanel overview={strategicOverview} onOpenPlanner={() => setShowWeeklyPlanner(true)}
            hasBudget={hasUserSetBudget(user?.id)}
          />
        </PanelErrorBoundary>
      </CollapsiblePanel>

      {/* TIER 2: Action Zone */}
      <div className="space-y-3" data-tour="panel-area">
        <PanelErrorBoundary>{renderPanel('autopilot')}</PanelErrorBoundary>
        <PanelErrorBoundary>{renderPanel('money-at-risk')}</PanelErrorBoundary>
        <PanelErrorBoundary>{renderPanel('opportunity-heat')}</PanelErrorBoundary>
      </div>

      {/* TIER 3: Intelligence Library */}
      <IntelligenceLibrary renderPanel={renderPanel}
        isPanelVisible={(panelId) => {
          if (isPanelHidden(panelId) && !showHiddenPanels) return false;
          if (!isPanelVisibleInMode(panelId, focusMode, maturity.level, fullViewOverride)) return false;
          if (!matchesPanelFilter(panelId, panelFilter)) return false;
          return true;
        }}
      />

      {cohortPlaybooks.length > 0 && (
        <PanelErrorBoundary>
          <CohortPlaybooksPanel playbooks={cohortPlaybooks} situations={playbookSituations}
            onApplyPlaybook={handlers.handleApplyPlaybook}
          />
        </PanelErrorBoundary>
      )}

      {/* Priority Grid */}
      {(panels.priorityActions.length > 0 || panels.dealsAtRisk.length > 0 || panels.speedAlerts.length > 0) && (
        <CollapsiblePanel id="priority-grid" label="Priority Actions, Deals at Risk & Speed Alerts" icon={<Zap className="h-3.5 w-3.5 text-primary" />} isCollapsed={isCollapsed('priority-grid')} onToggleCollapse={() => toggleCollapse('priority-grid')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {panels.priorityActions.length > 0 && (
              <PanelErrorBoundary>
                <div className="rounded-lg border border-border bg-card p-4 md:row-span-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold">Priority Actions</h2>
                    <span className="text-xs text-muted-foreground ml-auto">{panels.priorityActions.length} items</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Focus on these first to protect or create income.</p>
                  <div className="space-y-2">
                    {panels.priorityActions.map((action) => {
                      const confidence = action.scores.urgencyScore >= 40 && action.scores.revenueImpactScore >= 40 || action.scores.decayRiskScore >= 50 ? 'High' : 'Medium';
                      const snoozeCount = getSnoozeCount(action.id);
                      return (
                        <div key={action.id} className="flex items-start gap-3 p-2.5 rounded-md hover:bg-accent/50 transition-colors group cursor-pointer"
                          onClick={() => setSelectedItem({ kind: 'action', data: action })}>
                          <button onClick={async (e) => {
                            e.stopPropagation();
                            if (action.relatedTaskId) { completeTask(action.relatedTaskId); showPostActionToast('complete', { taskId: action.relatedTaskId, isOverdue: action.timeWindow === 'Overdue' }); }
                            else {
                              await addTask({ title: action.title, type: (action.suggestedType || 'follow_up') as any, dueAt: new Date().toISOString(), completedAt: new Date().toISOString(), relatedDealId: action.relatedDealId || undefined, relatedLeadId: action.relatedLeadId || undefined, assignedToUserId: user?.id || '' });
                              showPostActionToast('complete', {});
                            }
                          }} className="mt-0.5 h-5 w-5 rounded-md border-2 border-muted-foreground/30 flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors shrink-0">
                            <Check className="h-3 w-3 text-transparent group-hover:text-primary transition-colors" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium leading-tight truncate">{action.title}</p>
                              {action.isSuggested && <Sparkles className="h-3 w-3 text-time-sensitive shrink-0" />}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${confidence === 'High' ? 'bg-muted text-foreground/70' : 'bg-muted/50 text-muted-foreground'}`}>{confidence}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">{action.reason}</span>
                              {action.potentialValue && <span className="text-xs text-opportunity font-medium">{formatCurrency(action.potentialValue)}</span>}
                            </div>
                            {snoozeCount >= 3 && <p className="text-[10px] text-warning mt-1 italic">Action repeatedly deferred.</p>}
                          </div>
                          <span className={`text-xs font-medium shrink-0 ${action.timeWindow === 'Overdue' ? 'text-urgent' : action.timeWindow === 'Due now' ? 'text-warning' : 'text-muted-foreground'}`}>{action.timeWindow}</span>
                        </div>
                      );
                    })}
                    <button onClick={() => navigate('/?workspace=work')} className="w-full text-center text-xs text-primary hover:text-primary/80 transition-colors py-2">
                      View All Actions <ChevronRight className="inline h-3 w-3" />
                    </button>
                  </div>
                </div>
              </PanelErrorBoundary>
            )}
            {panels.dealsAtRisk.length > 0 && (
              <PanelErrorBoundary>
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-warning" /><h2 className="text-sm font-semibold">Deals at Risk</h2></div>
                  <div className="space-y-2">
                    {panels.dealsAtRisk.map((item) => (
                      <div key={item.deal.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => setSelectedItem({ kind: 'deal', data: item })}>
                        <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{item.deal.title}</p><p className="text-xs text-muted-foreground">{item.topReason}</p></div>
                        <Badge variant={riskBadge[item.deal.riskLevel].variant}>{riskBadge[item.deal.riskLevel].label}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </PanelErrorBoundary>
            )}
            {panels.speedAlerts.length > 0 && (
              <PanelErrorBoundary>
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-1"><Zap className="h-4 w-4 text-time-sensitive" /><h2 className="text-sm font-semibold">Speed Alerts</h2></div>
                  <p className="text-xs text-muted-foreground mb-3">Time-sensitive items requiring immediate attention.</p>
                  <div className="space-y-2">
                    {panels.speedAlerts.map((alert) => (
                      <div key={alert.id} className="p-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => setSelectedItem({ kind: 'speedAlert', data: alert })}>
                        <div className="flex items-start gap-2">
                          <span className={`status-dot mt-1.5 shrink-0 ${alert.type === 'urgent' || alert.type === 'task_due' ? 'bg-urgent' : 'bg-time-sensitive'}`} />
                          <div className="min-w-0"><p className="text-sm font-medium leading-tight">{alert.title}</p><p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.detail}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </PanelErrorBoundary>
            )}
          </div>
        </CollapsiblePanel>
      )}

      {pipelineWatch.length > 0 && (
        <CollapsiblePanel id="pipeline-watch" label="Pipeline Watch" icon={<Eye className="h-3.5 w-3.5 text-muted-foreground" />} isCollapsed={isCollapsed('pipeline-watch')} onToggleCollapse={() => toggleCollapse('pipeline-watch')}>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3"><Eye className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Pipeline Watch</h2><span className="text-xs text-muted-foreground ml-auto">Since last session</span></div>
            <div className="space-y-2">
              {pipelineWatch.map((event) => <div key={event.id} className="flex items-center gap-2.5 p-2 rounded-md"><span className="text-sm">{event.icon}</span><span className="text-sm text-muted-foreground">{event.text}</span></div>)}
            </div>
          </div>
        </CollapsiblePanel>
      )}

      {hasFubIntegration && (
        <CollapsiblePanel id="fub-drift-watchlist" label="CRM Watchlist" icon={<RefreshCw className="h-3.5 w-3.5 text-primary" />} isCollapsed={isCollapsed('fub-drift-watchlist')} onToggleCollapse={() => toggleCollapse('fub-drift-watchlist')}>
          <PanelErrorBoundary><FubWatchlistPanel hasIntegration={hasFubIntegration} /></PanelErrorBoundary>
        </CollapsiblePanel>
      )}

      {/* Drawers & Modals */}
      <ActionDetailDrawer item={selectedItem} onClose={() => setSelectedItem(null)}
        onComplete={(taskId) => { completeTask(taskId); showPostActionToast('handled'); }}
        snoozeCount={selectedItem ? getSnoozeCount(selectedItem.kind === 'action' ? selectedItem.data.id : '') : 0}
      />
      <MoneyRiskDrawer result={moneyDrawerResult} deal={moneyDrawerDeal}
        onClose={() => { setMoneyDrawerResult(null); setMoneyDrawerDeal(null); }}
        onStartAction={handlers.handleStartAction}
      />
      {showQuickAdd && <QuickAddModal defaultType="task" prefillTaskTitle={quickAddPrefill.title} prefillRelatedLeadId={quickAddPrefill.leadId} prefillRelatedDealId={quickAddPrefill.dealId} onClose={() => { setShowQuickAdd(false); setQuickAddPrefill({}); }} />}
      <TouchPickerModal open={showTouchPicker} onClose={() => setShowTouchPicker(false)} onSelect={(et, ei, en) => { setShowTouchPicker(false); setTouchTarget({ entityType: et, entityId: ei, entityTitle: en }); setShowLogTouch(true); }} />
      {showLogTouch && touchTarget && (
        <LogTouchModal open entityType={touchTarget.entityType} entityId={touchTarget.entityId} entityTitle={touchTarget.entityTitle}
          onClose={() => { setShowLogTouch(false); setTouchTarget(null); }}
          onLogged={(touchType: string) => {
            if (touchType === 'showing' && touchTarget.entityType === 'lead') {
              const lead = leads.find(l => l.id === touchTarget.entityId);
              if (lead) { const matchingAppt = fubAppointments.find(a => a.related_lead_id === lead.id); setPostShowingContext({ lead, propertyAddress: matchingAppt?.location || undefined }); setTimeout(() => setShowPostShowing(true), 300); }
            }
          }}
        />
      )}
      {postShowingContext && (
        <PostShowingComposer open={showPostShowing} onClose={() => { setShowPostShowing(false); setPostShowingContext(null); }}
          lead={postShowingContext.lead} propertyAddress={postShowingContext.propertyAddress} agentName={user?.name}
          onSendText={async (text) => { try { await navigator.clipboard.writeText(text); toast({ description: 'Text copied to clipboard — paste into your messaging app', duration: 3000 }); } catch {} }}
          onSendEmail={async (subject, body) => { try { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); toast({ description: 'Email copied to clipboard', duration: 3000 }); } catch {} }}
          onCreateFollowUpTask={(title, dueAt) => { addTask({ title, type: 'follow_up', dueAt, relatedLeadId: postShowingContext.lead.id, assignedToUserId: user?.id || '' }); toast({ description: `Follow-up task created for ${postShowingContext.lead.name}`, duration: 3000 }); }}
        />
      )}
      <EndOfDayReviewDrawer open={showEodReview} onClose={() => { setShowEodReview(false); markEodCompleted(); }}
        overdueTasks={eodSummary.overdueTasks} untouchedHotLeads={eodSummary.untouchedHotLeads} computedAt={eodSummary.computedAt}
        deals={deals} moneyResults={moneyResults} opportunityResults={opportunityResults}
        onLogTouch={(et, ei, en) => { setTouchTarget({ entityType: et, entityId: ei, entityTitle: en }); setShowLogTouch(true); }}
        onCreateTask={(t, lid, did) => { setQuickAddPrefill({ title: t, leadId: lid, dealId: did }); setShowQuickAdd(true); }}
        onNavigateToTasks={() => navigate('/?workspace=work')}
      />
      <ActionComposerDrawer open={!!executionEntity} onClose={() => setExecutionEntity(null)}
        entity={executionEntity?.entity || null} entityType={executionEntity?.entityType || 'deal'}
        moneyResult={executionEntity?.moneyResult} oppResult={executionEntity?.oppResult}
        tasks={tasks} onCreateTask={handlers.handleExecutionFollowUp} onLogTouch={handlers.handleExecutionLogTouch}
      />
      <WeeklyPlanningAssistant open={showWeeklyPlanner} onClose={() => setShowWeeklyPlanner(false)} overview={strategicOverview} />
      <ConfettiOverlay active={confettiActive} />
      <ScrollToTopFAB />
      <CSVImportModal open={showCSVImport} onClose={() => setShowCSVImport(false)} />
      <PanelCustomizer open={showCustomizer} onClose={() => setShowCustomizer(false)}
        panelOrder={panelOrder} hiddenPanels={hiddenPanels} onReorder={reorder}
        onToggleVisibility={togglePanelVisibility} onApplyPreset={applyPreset}
        onReset={resetToDefault} onShowAll={showAllPanels} visibleCount={visibleCount} totalCount={totalCount}
      />
    </div>
  );
}
