import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AutopilotPanel } from '@/components/AutopilotPanel';
import { PreparedActionsCard } from '@/components/PreparedActionsCard';
import { ExecutionQueuePanel } from '@/components/ExecutionQueuePanel';
import { MoneyAtRiskPanel } from '@/components/MoneyAtRiskPanel';
import { OpportunityHeatPanel } from '@/components/OpportunityHeatPanel';
import { IncomeForecastPanelV2 } from '@/components/IncomeForecastPanelV2';
import { StabilityScorePanelV2 } from '@/components/StabilityScorePanelV2';
import { IncomeVolatilityPanel } from '@/components/IncomeVolatilityPanel';
import { PipelineFragilityPanel } from '@/components/PipelineFragilityPanel';
import { LeadDecayPanel } from '@/components/LeadDecayPanel';
import { OperationalLoadPanel } from '@/components/OperationalLoadPanel';
import { DealFailurePanel } from '@/components/DealFailurePanel';
import { GhostingRiskPanel } from '@/components/GhostingRiskPanel';
import { ReferralConversionPanel } from '@/components/ReferralConversionPanel';
import { ListingPerformancePanel } from '@/components/ListingPerformancePanel';
import { TimeAllocationEngine } from '@/components/TimeAllocationEngine';
import { OpportunityRadarPanel } from '@/components/OpportunityRadarPanel';
import { IncomeProtectionShield } from '@/components/IncomeProtectionShield';
import { MarketConditionsPanel } from '@/components/MarketConditionsPanel';
import { LearningTransparencyPanel } from '@/components/LearningTransparencyPanel';
import { NetworkBenchmarksPanel } from '@/components/NetworkBenchmarksPanel';
import { WeeklyCommandReview } from '@/components/WeeklyCommandReview';
import { AgentProfilePanel } from '@/components/AgentProfilePanel';
import { IncomePatternsPanel } from '@/components/IncomePatternsPanel';
import { MarketSignalsPanel } from '@/components/MarketSignalsPanel';
import type { PanelId } from '@/hooks/useCommandCenterLayout';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult, UserCommissionDefaults } from '@/lib/leadMoneyModel';
import type { StabilityInputs } from '@/lib/stabilityModel';
import type { Deal, Lead, Task, DealParticipant } from '@/types';

export interface PanelRendererProps {
  panels: ReturnType<typeof import('@/lib/intelligenceEngine').buildCommandCenterPanels>;
  userId: string;
  deals: Deal[];
  leads: Lead[];
  tasks: Task[];
  dealParticipants: DealParticipant[];
  moneyResults: MoneyModelResult[];
  opportunityResults: OpportunityHeatResult[];
  stabilityResult: ReturnType<typeof import('@/lib/stabilityModel').computeStabilityScore>;
  stabilityInputs: StabilityInputs;
  overdueTasks: Task[];
  dueSoonTasks: Task[];
  totalMoneyAtRisk: number;
  topMoneyAtRisk: MoneyModelResult | null;
  topOpportunity: OpportunityHeatResult | null;
  burnoutCritical: boolean;
  predictiveSignals: any[];
  forecast: any;
  userDefaults: UserCommissionDefaults | undefined;
  riskWeights: any;
  oppWeights: any;
  dealChanges: any;
  leadChanges: any;
  marketConditions: any;
  learningSnapshot: any;
  resetLearning: () => void;
  agentProfile: any;
  agentProfileLoading: boolean;
  exportAgentProfile: () => void;
  resetAgentProfile: () => void;
  incomePatterns: any;
  snoozedIds: Set<string>;
  autonomyLevel: any;
  // Handlers
  handleSnooze: (id: string) => void;
  handleMoneySelect: (result: MoneyModelResult, deal: Deal) => void;
  handleOpportunityAction: (lead: Lead, result: OpportunityHeatResult) => Promise<void>;
  handleOpenLead: (lead: Lead) => void;
  handleOpenDeal: (deal: Deal) => void;
  handleOpenExecution: (entityId: string, entityType: 'deal' | 'lead') => void;
  handleAutopilotCreateTask: (title: string, dealId?: string, leadId?: string) => Promise<void>;
  handleForecastCreateTask: (title: string, dealId: string) => Promise<void>;
  refreshData: () => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  showPostActionToast: (kind: 'complete' | 'snooze' | 'handled', context?: any) => void;
  setTouchTarget: (t: any) => void;
  setShowLogTouch: (s: boolean) => void;
  setExecutionEntity: (e: any) => void;
  setSelectedItem: (item: any) => void;
}

export function usePanelRenderer(props: PanelRendererProps) {
  const navigate = useNavigate();
  const {
    panels, userId, deals, leads, tasks, dealParticipants,
    moneyResults, opportunityResults, stabilityResult, stabilityInputs,
    overdueTasks, dueSoonTasks, totalMoneyAtRisk, topMoneyAtRisk, topOpportunity,
    burnoutCritical, predictiveSignals, forecast, userDefaults, riskWeights, oppWeights,
    dealChanges, leadChanges, marketConditions, learningSnapshot, resetLearning,
    agentProfile, agentProfileLoading, exportAgentProfile, resetAgentProfile, incomePatterns,
    snoozedIds, autonomyLevel,
    handleSnooze, handleMoneySelect, handleOpportunityAction, handleOpenLead, handleOpenDeal,
    handleOpenExecution, handleAutopilotCreateTask, handleForecastCreateTask,
    refreshData, completeTask, showPostActionToast,
    setTouchTarget, setShowLogTouch, setExecutionEntity, setSelectedItem,
  } = props;

  const renderPanel = useCallback((panelId: PanelId): React.ReactNode => {
    switch (panelId) {
      case 'autopilot':
        return (
          <AutopilotPanel
            panels={panels} snoozedIds={snoozedIds} topMoneyAtRisk={topMoneyAtRisk}
            deals={deals} leads={leads} topOpportunity={topOpportunity}
            stabilityResult={stabilityResult} stabilityScore={stabilityResult.score}
            overdueTasksCount={overdueTasks.length} dueSoonCount={dueSoonTasks.length}
            totalMoneyAtRisk={totalMoneyAtRisk}
            onComplete={(taskId) => {
              completeTask(taskId);
              showPostActionToast('complete', {
                taskId,
                isOverdue: tasks.find((t) => t.id === taskId && !t.completedAt && new Date(t.dueAt) < new Date()) !== undefined,
                isRiskDeal: deals.some((d) => d.stage !== 'closed' && (d.riskLevel === 'red' || d.riskLevel === 'yellow') && tasks.find((t) => t.id === taskId)?.relatedDealId === d.id)
              });
            }}
            onSnooze={handleSnooze} onMoneyAction={handleMoneySelect}
            onOpportunityAction={handleOpportunityAction} onStabilityAction={() => {}}
            onCreateTask={handleAutopilotCreateTask} burnoutCritical={burnoutCritical}
            predictiveSignals={predictiveSignals} onOpenExecution={handleOpenExecution}
          />
        );

      case 'prepared-actions':
        return (
          <PreparedActionsCard
            deals={deals} leads={leads} tasks={tasks} moneyResults={moneyResults}
            opportunityResults={opportunityResults} autonomyLevel={autonomyLevel}
            onReviewAction={(action) => {
              if (action.entityType === 'deal') {
                const deal = deals.find((d) => d.id === action.entityId);
                if (deal) setExecutionEntity({ entity: deal, entityType: 'deal', moneyResult: moneyResults.find((r) => r.dealId === action.entityId) || null });
              } else {
                const lead = leads.find((l) => l.id === action.entityId);
                if (lead) setExecutionEntity({ entity: lead, entityType: 'lead', oppResult: opportunityResults.find((r) => r.leadId === action.entityId) || null });
              }
            }}
            onExecuteAction={(action) => {
              if (action.entityType === 'deal') {
                const deal = deals.find((d) => d.id === action.entityId);
                if (deal) setExecutionEntity({ entity: deal, entityType: 'deal', moneyResult: moneyResults.find((r) => r.dealId === action.entityId) || null });
              } else {
                const lead = leads.find((l) => l.id === action.entityId);
                if (lead) setExecutionEntity({ entity: lead, entityType: 'lead', oppResult: opportunityResults.find((r) => r.leadId === action.entityId) || null });
              }
            }}
          />
        );

      case 'execution-queue':
        return (
          <ExecutionQueuePanel deals={deals} leads={leads} tasks={tasks}
            moneyResults={moneyResults} opportunityResults={opportunityResults}
            onStartAction={handleOpenExecution}
          />
        );

      case 'money-at-risk':
        return (
          <MoneyAtRiskPanel deals={deals} participants={dealParticipants} userId={userId}
            onSelect={handleMoneySelect} onOpenDeal={handleOpenDeal}
            onAddCommissionToDeals={() => navigate('/?workspace=work')}
            refreshData={refreshData} dealChanges={dealChanges} riskWeights={riskWeights}
          />
        );

      case 'opportunity-heat':
        return (
          <OpportunityHeatPanel leads={leads} tasks={tasks} userId={userId}
            onStartAction={handleOpportunityAction} onOpenLead={handleOpenLead}
            leadChanges={leadChanges} oppWeights={oppWeights}
          />
        );

      case 'income-forecast':
        return (
          <IncomeForecastPanelV2 deals={deals} participants={dealParticipants} userId={userId}
            moneyResults={moneyResults}
            typicalDealValue={userDefaults?.typicalPriceMid ? Math.round(userDefaults.typicalPriceMid * (userDefaults.typicalCommissionRate ?? 3) / 100 * (userDefaults.typicalSplitPct ?? 100) / 100) : 8000}
            onCreateTask={handleForecastCreateTask}
            onOpenMoneyAtRisk={() => {
              if (topMoneyAtRisk && deals.find((d) => d.id === topMoneyAtRisk.dealId)) {
                handleMoneySelect(topMoneyAtRisk, deals.find((d) => d.id === topMoneyAtRisk.dealId)!);
              }
            }}
          />
        );

      case 'stability-score':
        return <StabilityScorePanelV2 inputs={stabilityInputs} onCreateTask={(title) => handleAutopilotCreateTask(title)} />;

      case 'income-volatility':
        return (
          <IncomeVolatilityPanel deals={deals} participants={dealParticipants} userId={userId}
            forecast={forecast}
            typicalMonthlyIncome={userDefaults?.typicalPriceMid ? Math.round(userDefaults.typicalPriceMid * (userDefaults.typicalCommissionRate ?? 3) / 100 * (userDefaults.typicalSplitPct ?? 100) / 100) : 8000}
            onOpenOpportunities={() => { if (topOpportunity) { const lead = leads.find((l) => l.id === topOpportunity.leadId); if (lead) handleOpenLead(lead); } }}
          />
        );

      case 'pipeline-fragility':
        return (
          <PipelineFragilityPanel deals={deals} moneyResults={moneyResults} forecast={forecast}
            onOpenOpportunities={() => { if (topOpportunity) { const lead = leads.find((l) => l.id === topOpportunity.leadId); if (lead) handleOpenLead(lead); } }}
          />
        );

      case 'lead-decay':
        return (
          <LeadDecayPanel leads={leads} tasks={tasks} opportunityResults={opportunityResults}
            onLogTouch={(entityType, entityId, entityTitle) => { setTouchTarget({ entityType, entityId, entityTitle }); setShowLogTouch(true); }}
            onCreateTask={(title, leadId) => handleAutopilotCreateTask(title, undefined, leadId)}
          />
        );

      case 'operational-load':
        return (
          <OperationalLoadPanel tasks={tasks} deals={deals} leads={leads}
            stabilityResult={stabilityResult} stabilityScore={stabilityResult.score}
            totalMoneyAtRisk={totalMoneyAtRisk}
          />
        );

      case 'deal-failure':
        return (
          <DealFailurePanel deals={deals} tasks={tasks} moneyResults={moneyResults}
            onCreateTask={(title, dealId) => handleAutopilotCreateTask(title, dealId)}
            onOpenDeal={(dealId) => { const deal = deals.find(d => d.id === dealId); if (deal) handleOpenDeal(deal); }}
          />
        );

      case 'ghosting-risk':
        return (
          <GhostingRiskPanel leads={leads} tasks={tasks} deals={deals}
            onLogTouch={(entityType, entityId, entityTitle) => { setTouchTarget({ entityType, entityId, entityTitle }); setShowLogTouch(true); }}
            onCreateTask={(title, leadId) => handleAutopilotCreateTask(title, undefined, leadId)}
            onOpenLead={(leadId) => { const lead = leads.find(l => l.id === leadId); if (lead) handleOpenLead(lead); }}
          />
        );

      case 'referral-conversion':
        return <ReferralConversionPanel leads={leads} tasks={tasks} opportunityResults={opportunityResults} userDefaults={userDefaults} />;

      case 'listing-performance':
        return <ListingPerformancePanel deals={deals} tasks={tasks} />;

      case 'time-allocation':
        return (
          <TimeAllocationEngine deals={deals} tasks={tasks} moneyResults={moneyResults}
            opportunityResults={opportunityResults} stabilityScore={stabilityResult.score}
            totalMoneyAtRisk={totalMoneyAtRisk}
          />
        );

      case 'opportunity-radar':
        return (
          <OpportunityRadarPanel leads={leads} deals={deals} tasks={tasks} opportunityResults={opportunityResults}
            onAction={(item) => {
              if (item.entityType === 'lead') {
                const lead = leads.find((l) => l.id === item.entityId);
                if (!lead) return;
                setExecutionEntity({ entity: lead, entityType: 'lead', oppResult: opportunityResults.find((r) => r.leadId === item.entityId) || null });
              } else if (item.entityType === 'deal') {
                const deal = deals.find((d) => d.id === item.entityId);
                if (!deal) return;
                setExecutionEntity({ entity: deal, entityType: 'deal', moneyResult: moneyResults.find((r) => r.dealId === item.entityId) || null });
              }
            }}
          />
        );

      case 'income-protection':
        return (
          <IncomeProtectionShield deals={deals} tasks={tasks} moneyResults={moneyResults}
            totalMoneyAtRisk={totalMoneyAtRisk} userId={userId}
            onAction={(threat) => {
              const deal = deals.find((d) => d.id === threat.dealId);
              const result = moneyResults.find((r) => r.dealId === threat.dealId);
              if (deal && result) handleMoneySelect(result, deal);
            }}
          />
        );

      case 'market-conditions':
        return <MarketConditionsPanel conditions={marketConditions} deals={deals} leads={leads} moneyResults={moneyResults} />;

      case 'learning-transparency':
        return <LearningTransparencyPanel snapshot={learningSnapshot} onReset={resetLearning} />;

      case 'network-benchmarks':
        return (
          <NetworkBenchmarksPanel agentMetrics={{
            followUpCompletionRate: tasks.length > 0 ? tasks.filter((t) => t.completedAt).length / tasks.length : undefined,
            dealCloseRate: deals.length > 0 ? deals.filter((d) => d.stage === 'closed').length / deals.length : undefined
          }} />
        );

      case 'weekly-review':
        return (
          <WeeklyCommandReview deals={deals} leads={leads} tasks={tasks}
            moneyResults={moneyResults} stabilityScore={stabilityResult.score}
            totalMoneyAtRisk={totalMoneyAtRisk}
            onSelectLead={(leadId) => {
              const lead = leads.find(l => l.id === leadId);
              if (lead) setSelectedItem({
                kind: 'opportunity', data: {
                  lead, scores: { entityId: lead.id, entityType: 'lead', urgencyScore: 0, revenueImpactScore: 0, decayRiskScore: 50, attentionGapScore: 60, opportunityScore: 0, overallPriorityScore: 50, explanation: ['Went cold this week'] },
                  topReason: 'Went cold this week'
                }
              });
            }}
          />
        );

      case 'agent-profile':
        return <AgentProfilePanel profile={agentProfile} loading={agentProfileLoading} onExport={exportAgentProfile} onReset={resetAgentProfile} />;

      case 'income-patterns':
        return <IncomePatternsPanel patterns={incomePatterns} />;

      case 'market-signals':
        return <MarketSignalsPanel deals={deals} leads={leads} moneyResults={moneyResults} />;

      case 'end-of-day':
        return null;

      default:
        return null;
    }
  }, [
    panels, snoozedIds, handleSnooze, topMoneyAtRisk, deals, leads, tasks,
    handleMoneySelect, topOpportunity, handleOpportunityAction, stabilityResult,
    stabilityInputs, overdueTasks, dueSoonTasks, totalMoneyAtRisk,
    handleAutopilotCreateTask, burnoutCritical, predictiveSignals, handleOpenExecution,
    handleOpenLead, handleOpenDeal, moneyResults, opportunityResults, dealParticipants,
    userId, refreshData, dealChanges, leadChanges, riskWeights, oppWeights, forecast,
    userDefaults, marketConditions, learningSnapshot, resetLearning, completeTask,
    showPostActionToast, navigate, handleForecastCreateTask, agentProfile,
    agentProfileLoading, exportAgentProfile, resetAgentProfile, incomePatterns,
    autonomyLevel, setExecutionEntity, setTouchTarget, setShowLogTouch, setSelectedItem,
  ]);

  return renderPanel;
}
