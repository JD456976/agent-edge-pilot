import { useMemo, useState, useEffect } from 'react';
import { DollarSign, AlertTriangle, TrendingUp, Zap, Check, ChevronRight, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { generatePriorityActions } from '@/lib/scoring';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonCard } from '@/components/SkeletonCard';
import type { RiskLevel } from '@/types';

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const riskBadge: Record<RiskLevel, { variant: 'urgent' | 'warning' | 'opportunity'; label: string }> = {
  red: { variant: 'urgent', label: 'High Risk' },
  yellow: { variant: 'warning', label: 'At Risk' },
  green: { variant: 'opportunity', label: 'On Track' },
};

export default function CommandCenter() {
  const { user } = useAuth();
  const { leads, deals, tasks, alerts, hasData, seedDemoData, completeTask } = useData();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const priorityActions = useMemo(() => generatePriorityActions(tasks, leads, deals).slice(0, 7), [tasks, leads, deals]);
  const activeDeals = deals.filter(d => d.stage !== 'closed');
  const dealsAtRisk = activeDeals.filter(d => d.riskLevel === 'red' || d.riskLevel === 'yellow');
  const hotLeads = leads.filter(l => l.engagementScore >= 60).sort((a, b) => b.engagementScore - a.engagementScore).slice(0, 6);
  const speedAlerts = alerts.filter(a => a.type === 'speed' || a.type === 'urgent').slice(0, 6);
  const totalRevenue = activeDeals.reduce((s, d) => s + d.commission, 0);
  const dealsNeedingAttention = dealsAtRisk.length;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="space-y-1 mb-6">
          <SkeletonCard lines={1} />
        </div>
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

      {/* Morning Briefing */}
      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-opportunity" />
          <span className="text-sm font-medium">{formatCurrency(totalRevenue)} revenue in play</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="text-sm font-medium">{dealsNeedingAttention} deal{dealsNeedingAttention !== 1 ? 's' : ''} need{dealsNeedingAttention === 1 ? 's' : ''} attention</span>
        </div>
        <span className="text-xs text-muted-foreground">Good morning, {user?.name?.split(' ')[0]}</span>
      </div>

      {/* 4-Panel Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Priority Actions */}
        <div className="rounded-lg border border-border bg-card p-4 md:row-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Priority Actions</h2>
            <span className="text-xs text-muted-foreground ml-auto">{priorityActions.length} items</span>
          </div>
          {priorityActions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">You're all caught up!</p>
          ) : (
            <div className="space-y-2">
              {priorityActions.map(action => (
                <div key={action.id} className="flex items-start gap-3 p-2.5 rounded-md hover:bg-accent/50 transition-colors group">
                  <button
                    onClick={() => action.relatedTaskId && completeTask(action.relatedTaskId)}
                    className="mt-0.5 h-5 w-5 rounded-md border-2 border-muted-foreground/30 flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors shrink-0"
                  >
                    <Check className="h-3 w-3 text-transparent group-hover:text-primary transition-colors" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{action.title}</p>
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
              ))}
            </div>
          )}
        </div>

        {/* Deals at Risk */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold">Deals at Risk</h2>
          </div>
          {dealsAtRisk.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">All deals are on track</p>
          ) : (
            <div className="space-y-2">
              {dealsAtRisk.slice(0, 4).map(deal => (
                <div key={deal.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{deal.title}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(deal.price)} · closes {new Date(deal.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                  </div>
                  <Badge variant={riskBadge[deal.riskLevel].variant}>{riskBadge[deal.riskLevel].label}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Opportunities Heating Up */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-opportunity" />
            <h2 className="text-sm font-semibold">Opportunities Heating Up</h2>
          </div>
          {hotLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No hot leads right now</p>
          ) : (
            <div className="space-y-2">
              {hotLeads.slice(0, 4).map(lead => (
                <div key={lead.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">{lead.source} · {lead.statusTags[0]}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-opportunity" style={{ width: `${lead.engagementScore}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-7 text-right">{lead.engagementScore}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Speed Alerts */}
        <div className="rounded-lg border border-border bg-card p-4 md:col-start-2">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-time-sensitive" />
            <h2 className="text-sm font-semibold">Speed Alerts</h2>
          </div>
          {speedAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No time-sensitive alerts</p>
          ) : (
            <div className="space-y-2">
              {speedAlerts.slice(0, 4).map(alert => (
                <div key={alert.id} className="p-2 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="flex items-start gap-2">
                    <span className={`status-dot mt-1.5 shrink-0 ${alert.type === 'urgent' ? 'bg-urgent' : 'bg-time-sensitive'}`} />
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
    </div>
  );
}
