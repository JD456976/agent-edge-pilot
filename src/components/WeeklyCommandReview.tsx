import { useMemo, useState, useCallback } from 'react';
import { BookOpen, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, DollarSign, AlertTriangle, Target, Lightbulb, Globe } from 'lucide-react';
import { getWeeklyReviewDefaultExpanded, getWeeklyReviewUserOverride, setWeeklyReviewUserOverride, getNoisePrefs } from '@/lib/noiseGovernor';
import { NoiseSuppressionHint } from '@/components/NoiseSuppressionHint';
import { cn } from '@/lib/utils';
import { useNetworkBenchmarks } from '@/hooks/useNetworkBenchmarks';
import type { Deal, Lead, Task } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';

interface MissedOppLead { id: string; name: string; }

interface Props {
  deals: Deal[];
  leads: Lead[];
  tasks: Task[];
  moneyResults: MoneyModelResult[];
  stabilityScore: number;
  totalMoneyAtRisk: number;
  onSelectLead?: (leadId: string) => void;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

export function WeeklyCommandReview({ deals, leads, tasks, moneyResults, stabilityScore, totalMoneyAtRisk, onSelectLead }: Props) {
  const userOverride = getWeeklyReviewUserOverride();
  const defaultExpanded = getWeeklyReviewDefaultExpanded();
  const isAutoCollapsed = !defaultExpanded && userOverride === null;
  const [expanded, setExpanded] = useState(userOverride ?? defaultExpanded);
  const { benchmark } = useNetworkBenchmarks();

  const handleToggle = useCallback(() => {
    setExpanded(prev => {
      const next = !prev;
      setWeeklyReviewUserOverride(next);
      return next;
    });
  }, []);

  const review = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Income generated (closed this week)
    const closedThisWeek = deals.filter(d => d.stage === 'closed' && new Date(d.closeDate) >= weekAgo);
    const incomeGenerated = closedThisWeek.reduce((s, d) => s + (d.personalCommissionTotal ?? d.commission), 0);

    // Tasks completed this week
    const completedTasks = tasks.filter(t => t.completedAt && new Date(t.completedAt) >= weekAgo);
    const totalTasks = tasks.filter(t => new Date(t.dueAt) >= weekAgo && new Date(t.dueAt) <= now);

    // Missed opportunities (hot leads that went cold or were lost)
    const missedOppLeads: MissedOppLead[] = leads.filter(l => {
      if (l.leadTemperature !== 'cold') return false;
      const lastContact = new Date(l.lastContactAt);
      return lastContact >= weekAgo && lastContact <= now;
    }).map(l => ({ id: l.id, name: l.name }));
    const missedOpps = missedOppLeads.length;

    // Pipeline health
    const activeDeals = deals.filter(d => d.stage !== 'closed');
    const riskyDeals = moneyResults.filter(r => r.personalCommissionAtRisk > 0).length;

    // Trend
    const trend = stabilityScore >= 70 ? 'up' : stabilityScore >= 40 ? 'stable' : 'down';

    // Lessons & adjustments
    const adjustments: string[] = [];
    if (riskyDeals >= 3) adjustments.push('Increase deal follow-up frequency next week');
    if (missedOpps >= 2) adjustments.push('Respond to hot leads within 24 hours');
    if (completedTasks.length < totalTasks.length * 0.5) adjustments.push('Prioritize task completion — clear overdue items first');
    if (activeDeals.length < 3) adjustments.push('Focus more time on prospecting and lead generation');
    if (adjustments.length === 0) adjustments.push('Maintain current approach — pipeline is healthy');

    return {
      incomeGenerated,
      closedDeals: closedThisWeek.length,
      completedTasks: completedTasks.length,
      totalTasks: totalTasks.length,
      missedOpps,
      missedOppLeads,
      activeDeals: activeDeals.length,
      riskyDeals,
      trend,
      adjustments,
    };
  }, [deals, leads, tasks, moneyResults, stabilityScore]);

  const TrendIcon = review.trend === 'up' ? TrendingUp : review.trend === 'down' ? TrendingDown : Minus;
  const trendLabel = review.trend === 'up' ? 'Improving' : review.trend === 'down' ? 'Declining' : 'Stable';

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <button onClick={handleToggle} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Weekly Command Review</p>
        </div>
        <div className="flex items-center gap-2">
          <TrendIcon className={cn('h-3.5 w-3.5', review.trend === 'up' ? 'text-opportunity' : review.trend === 'down' ? 'text-urgent' : 'text-muted-foreground')} />
          <span className="text-xs text-muted-foreground">{trendLabel}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Auto-collapse hint */}
      {isAutoCollapsed && !expanded && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/60 italic">Weekly review is most useful on Mon/Fri.</p>
          <NoiseSuppressionHint reason="Auto-collapsed on non-review days (Tue–Thu, Sat–Sun)" />
        </div>
      )}

      {/* Summary row always visible */}
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <DollarSign className="h-3 w-3 text-opportunity" />
          {formatCurrency(review.incomeGenerated)} earned ({review.closedDeals} closed)
        </span>
        <span className="flex items-center gap-1">
          <Target className="h-3 w-3" />
          {review.completedTasks}/{review.totalTasks} tasks done
        </span>
        {review.missedOpps > 0 && (
          <button
            onClick={handleToggle}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            title={review.missedOppLeads.map(l => l.name).join(', ')}>
            <AlertTriangle className="h-3 w-3 text-warning" />
            <span className="underline decoration-dotted underline-offset-2">{review.missedOpps} missed opportunities</span>
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-4 pt-2 border-t border-border">
          {/* Pipeline health */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pipeline Health</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <span>{review.activeDeals} active deals</span>
              <span>{review.riskyDeals} at risk</span>
              <span>Stability: {stabilityScore}/100</span>
              {totalMoneyAtRisk > 0 && <span className="text-urgent">{formatCurrency(totalMoneyAtRisk)} at risk</span>}
            </div>
          </div>

          {/* Missed Opportunities Detail */}
          {review.missedOppLeads.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-warning" /> Missed Opportunities
              </p>
              <p className="text-[10px] text-muted-foreground">Leads that went cold this week — consider re-engaging.</p>
              <div className="space-y-1">
                {review.missedOppLeads.map(lead => (
                  <button
                    key={lead.id}
                    onClick={() => onSelectLead?.(lead.id)}
                    className="block text-xs text-primary hover:text-primary/80 underline decoration-dotted underline-offset-2 transition-colors">
                    {lead.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Adjustments */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Lightbulb className="h-3 w-3" /> Recommended Adjustments
            </p>
            {review.adjustments.map((adj, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[10px] font-mono text-muted-foreground mt-0.5">{i + 1}.</span>
                <span className="text-xs">{adj}</span>
              </div>
            ))}
          </div>

          {/* Cohort Insights */}
          {benchmark && benchmark.metrics && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Globe className="h-3 w-3" /> Cohort Insights
              </p>
              {benchmark.metrics.median_time_to_first_touch_hot && (
                <p className="text-xs text-muted-foreground">
                  Agents in your cohort who touch hot leads within <span className="text-foreground font-medium">{benchmark.metrics.median_time_to_first_touch_hot.replace(/_/g, ' ')}</span> convert more often.
                </p>
              )}
              {benchmark.metrics.deal_close_rate !== null && benchmark.metrics.deal_close_rate !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Cohort deal close rate is around <span className="text-foreground font-medium">{Math.round(benchmark.metrics.deal_close_rate * 100)}%</span>. Consistent follow-ups improve this.
                </p>
              )}
              {benchmark.metrics.autopilot_completion_rate !== null && benchmark.metrics.autopilot_completion_rate !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Agents completing autopilot actions see better pipeline stability (<span className="text-foreground font-medium">{Math.round(benchmark.metrics.autopilot_completion_rate * 100)}%</span> completion rate).
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
