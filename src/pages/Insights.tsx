import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import { IncomeForecastPanelV2 } from '@/components/IncomeForecastPanelV2';
import { LeadSourceROIPanel } from '@/components/LeadSourceROIPanel';
import { CommissionForecastBySource } from '@/components/CommissionForecastBySource';
import { StabilityScorePanelV2 } from '@/components/StabilityScorePanelV2';
import { IncomeVolatilityPanel } from '@/components/IncomeVolatilityPanel';
import { PipelineFragilityPanel } from '@/components/PipelineFragilityPanel';
import { WeeklyCommandReview } from '@/components/WeeklyCommandReview';
import { NetworkBenchmarksPanel } from '@/components/NetworkBenchmarksPanel';
import { LearningTransparencyPanel } from '@/components/LearningTransparencyPanel';
import { MarketConditionsPanel } from '@/components/MarketConditionsPanel';
import { computeForecastBatch } from '@/lib/forecastModel';
import { computeStabilityScore, type StabilityInputs } from '@/lib/stabilityModel';
import { computeMoneyModelBatch } from '@/lib/moneyModel';
import { computeOpportunityBatch, type UserCommissionDefaults } from '@/lib/leadMoneyModel';
import { useEndOfDaySummary } from '@/hooks/useEndOfDaySummary';
import { useAgentLearning } from '@/hooks/useAgentLearning';
import { useMarketConditions } from '@/hooks/useMarketConditions';
import { useSessionMemory } from '@/hooks/useSessionMemory';
import { useScoringPreferences } from '@/hooks/useScoringPreferences';
import { getMomentum } from '@/lib/dailyIntelligence';
import { supabase } from '@/integrations/supabase/client';
// useEffect already imported above
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const TABS = ['Forecast', 'Stability', 'Review', 'Benchmarks', 'Sources'] as const;

export default function Insights() {
  const { user } = useAuth();
  const { leads, deals, tasks, alerts, dealParticipants, hasData } = useData();
  const [tab, setTab] = useState<typeof TABS[number]>('Forecast');

  const { conditions: marketConditions } = useMarketConditions();
  const { snapshot: learningSnapshot, resetLearning } = useAgentLearning(deals, leads, tasks, user?.id);
  const previousSnapshot = useSessionMemory(leads, deals, tasks, alerts, hasData);
  const { prefs: scoringPrefs, loaded: scoringLoaded } = useScoringPreferences(user?.id);

  const riskWeights = useMemo(() => scoringLoaded ? {
    inactivity_3d_points: scoringPrefs.inactivity_3d_points,
    inactivity_7d_points: scoringPrefs.inactivity_7d_points,
    closing_7d_points: scoringPrefs.closing_7d_points,
    closing_3d_points: scoringPrefs.closing_3d_points,
    milestone_points: scoringPrefs.milestone_points,
    drift_conflict_points: scoringPrefs.drift_conflict_points,
  } : undefined, [scoringPrefs, scoringLoaded]);

  const activeDeals = deals.filter(d => d.stage !== 'closed');
  const moneyResults = useMemo(() => {
    if (!user?.id) return [];
    return computeMoneyModelBatch(activeDeals, dealParticipants, user.id, new Date(), riskWeights);
  }, [activeDeals, dealParticipants, user?.id, riskWeights]);

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

  const forecast = useMemo(() => {
    if (!user?.id) return null;
    return computeForecastBatch(deals, dealParticipants, user.id);
  }, [deals, dealParticipants, user?.id]);

  const now = useMemo(() => new Date(), []);
  const eodSummary = useEndOfDaySummary(tasks, leads);
  const { overdueTasks, untouchedHotLeads } = eodSummary;
  const dueSoonTasks = useMemo(() => {
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    return tasks.filter(t => !t.completedAt && new Date(t.dueAt) >= now && new Date(t.dueAt) <= in48h);
  }, [tasks, now]);

  const totalMoneyAtRisk = useMemo(() => moneyResults.reduce((s, r) => s + r.personalCommissionAtRisk, 0), [moneyResults]);
  const momentum = useMemo(() => getMomentum(tasks, deals, previousSnapshot), [tasks, deals, previousSnapshot]);

  const stabilityInputs = useMemo((): StabilityInputs => ({
    overdueTasksCount: overdueTasks.length,
    dueSoonCount: dueSoonTasks.length,
    missedTouchesCount: untouchedHotLeads.length,
    forecast30: forecast?.next30 ?? 0,
    topDealExpected: forecast?.topContributors
      .filter(c => c.windows.w30)
      .sort((a, b) => b.expectedPersonalCommission - a.expectedPersonalCommission)[0]?.expectedPersonalCommission ?? 0,
    moneyAtRiskTotal: totalMoneyAtRisk,
    momentum: momentum as 'Improving' | 'Stable' | 'Declining',
  }), [overdueTasks, dueSoonTasks, untouchedHotLeads, forecast, totalMoneyAtRisk, momentum]);

  const stabilityResult = useMemo(() => computeStabilityScore(stabilityInputs), [stabilityInputs]);

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

  const handleCreateTask = async (title: string, dealId: string) => {
    toast({ description: `Task: ${title}`, duration: 3000 });
  };

  if (!hasData) {
    return (
      <div className="max-w-5xl mx-auto text-center py-12">
        <p className="text-sm text-muted-foreground">No data yet. Load demo data from the Command Center to see insights.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 max-w-md">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 text-sm font-medium py-1.5 rounded-md transition-colors',
              tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Forecast' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PanelErrorBoundary>
              <IncomeForecastPanelV2
                deals={deals}
                participants={dealParticipants}
                userId={user?.id || ''}
                moneyResults={moneyResults}
                typicalDealValue={userDefaults?.typicalPriceMid ? Math.round((userDefaults.typicalPriceMid * (userDefaults.typicalCommissionRate ?? 3) / 100) * (userDefaults.typicalSplitPct ?? 100) / 100) : 8000}
                onCreateTask={handleCreateTask}
                onOpenMoneyAtRisk={() => {}}
              />
            </PanelErrorBoundary>
            <PanelErrorBoundary>
              <IncomeVolatilityPanel
                deals={deals}
                participants={dealParticipants}
                userId={user?.id || ''}
                forecast={forecast}
                typicalMonthlyIncome={userDefaults?.typicalPriceMid ? Math.round((userDefaults.typicalPriceMid * (userDefaults.typicalCommissionRate ?? 3) / 100) * (userDefaults.typicalSplitPct ?? 100) / 100) : 8000}
                onOpenOpportunities={() => {}}
              />
            </PanelErrorBoundary>
          </div>
          <PanelErrorBoundary>
            <PipelineFragilityPanel
              deals={deals}
              moneyResults={moneyResults}
              forecast={forecast}
              onOpenOpportunities={() => {}}
            />
          </PanelErrorBoundary>
          <PanelErrorBoundary>
            <MarketConditionsPanel
              conditions={marketConditions}
              deals={deals}
              leads={leads}
              moneyResults={moneyResults}
            />
          </PanelErrorBoundary>
        </div>
      )}

      {tab === 'Stability' && (
        <div className="space-y-4">
          <PanelErrorBoundary>
            <StabilityScorePanelV2 inputs={stabilityInputs} onCreateTask={(title) => toast({ description: `Task: ${title}` })} />
          </PanelErrorBoundary>
          <PanelErrorBoundary>
            <LearningTransparencyPanel snapshot={learningSnapshot} onReset={resetLearning} />
          </PanelErrorBoundary>
        </div>
      )}

      {tab === 'Review' && (
        <PanelErrorBoundary>
          <WeeklyCommandReview
            deals={deals}
            leads={leads}
            tasks={tasks}
            moneyResults={moneyResults}
            stabilityScore={stabilityResult.score}
            totalMoneyAtRisk={totalMoneyAtRisk}
          />
        </PanelErrorBoundary>
      )}

      {tab === 'Benchmarks' && (
        <PanelErrorBoundary>
          <NetworkBenchmarksPanel
            agentMetrics={{
              followUpCompletionRate: tasks.length > 0 ? tasks.filter(t => t.completedAt).length / tasks.length : undefined,
              dealCloseRate: deals.length > 0 ? deals.filter(d => d.stage === 'closed').length / deals.length : undefined,
            }}
          />
        </PanelErrorBoundary>
      )}

      {tab === 'Sources' && (
        <div className="space-y-4">
          <PanelErrorBoundary>
            <LeadSourceROIPanel leads={leads} deals={deals} />
          </PanelErrorBoundary>
          <PanelErrorBoundary>
            <CommissionForecastBySource leads={leads} deals={deals} />
          </PanelErrorBoundary>
        </div>
      )}
    </div>
  );
}
