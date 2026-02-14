import { useMemo, useState, useEffect, useCallback } from 'react';
import { DollarSign, AlertTriangle, TrendingUp, Zap, Check, Info, ChevronRight, Sparkles, Eye } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { buildCommandCenterPanels } from '@/lib/intelligenceEngine';
import { getDailyBriefing, getMissedYesterdayCount, getMomentum, getPipelineWatch } from '@/lib/dailyIntelligence';
import { useSessionMemory } from '@/hooks/useSessionMemory';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonCard } from '@/components/SkeletonCard';
import { ActionDetailDrawer } from '@/components/ActionDetailDrawer';
import { RecommendedFirstAction } from '@/components/RecommendedFirstAction';
import type { RiskLevel, CommandCenterAction, CommandCenterDealAtRisk, CommandCenterOpportunity, CommandCenterSpeedAlert } from '@/types';

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
  const { leads, deals, tasks, alerts, hasData, seedDemoData, completeTask } = useData();
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());

  const handleSnooze = useCallback((id: string) => {
    setSnoozedIds(prev => new Set(prev).add(id));
  }, []);

  const previousSnapshot = useSessionMemory(leads, deals, tasks, alerts, hasData);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const panels = useMemo(() => buildCommandCenterPanels(leads, deals, tasks, alerts), [leads, deals, tasks, alerts]);

  const activeDeals = deals.filter(d => d.stage !== 'closed');
  const totalRevenue = activeDeals.reduce((s, d) => s + d.commission, 0);
  const dealsNeedingAttention = panels.dealsAtRisk.length;

  const briefing = useMemo(() => getDailyBriefing(panels, tasks, deals, leads), [panels, tasks, deals, leads]);
  const missedYesterday = useMemo(() => getMissedYesterdayCount(tasks, deals, previousSnapshot), [tasks, deals, previousSnapshot]);
  const momentum = useMemo(() => getMomentum(tasks, deals, previousSnapshot), [tasks, deals, previousSnapshot]);
  const pipelineWatch = useMemo(() => getPipelineWatch(leads, deals, previousSnapshot), [leads, deals, previousSnapshot]);

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
        <EmptyState
          title="No data yet"
          description="Load demo data to see your Command Center in action with realistic real estate scenarios."
          actionLabel="Load Demo Data"
          onAction={seedDemoData}
        />
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
      </div>

      {/* Daily Intelligence Briefing */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        {/* Dynamic briefing message */}
        <div className="flex items-center gap-2">
          <span className="text-base">{briefing.icon}</span>
          <span className="text-sm font-medium">{briefing.text}</span>
        </div>

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

        <span className="text-xs text-muted-foreground block">Good morning, {user?.name?.split(' ')[0]}</span>
      </div>

      {/* Recommended First Action */}
      <RecommendedFirstAction
        panels={panels}
        onComplete={completeTask}
        snoozedIds={snoozedIds}
        onSnooze={handleSnooze}
      />

      {/* 4-Panel Grid + Pipeline Watch */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Priority Actions */}
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
                return (
                  <div
                    key={action.id}
                    className="flex items-start gap-3 p-2.5 rounded-md hover:bg-accent/50 transition-colors group cursor-pointer"
                    onClick={() => setSelectedItem({ kind: 'action', data: action })}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); action.relatedTaskId && completeTask(action.relatedTaskId); }}
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

        {/* Deals at Risk */}
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

        {/* Opportunities Heating Up */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-opportunity" />
            <h2 className="text-sm font-semibold">Opportunities Heating Up</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Leads showing strong buying or selling signals.</p>
          {panels.opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No hot leads right now</p>
          ) : (
            <div className="space-y-2">
              {panels.opportunities.map(item => (
                <div
                  key={item.lead.id}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedItem({ kind: 'opportunity', data: item })}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.lead.name}</p>
                    <p className="text-xs text-muted-foreground">{item.topReason}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">🔥</span>
                    <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-opportunity" style={{ width: `${item.scores.opportunityScore}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-7 text-right">{item.scores.opportunityScore}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Speed Alerts */}
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

      {/* Detail Drawer */}
      <ActionDetailDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onComplete={completeTask}
      />
    </div>
  );
}
