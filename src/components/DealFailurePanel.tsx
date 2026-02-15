import { useMemo } from 'react';
import { AlertOctagon, Phone, Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Deal, Task } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import { cn } from '@/lib/utils';

interface Props {
  deals: Deal[];
  tasks: Task[];
  moneyResults: MoneyModelResult[];
  onCreateTask: (title: string, dealId: string) => void;
  onOpenDeal?: (dealId: string) => void;
}

type FailureLevel = 'low' | 'watch' | 'elevated' | 'high' | 'critical';

interface FailurePrediction {
  dealId: string;
  dealTitle: string;
  probability: number;
  level: FailureLevel;
  signals: string[];
  suggestedAction: { title: string; type: string };
}

function formatCurrency(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function predictFailure(deal: Deal, tasks: Task[], moneyResult: MoneyModelResult | undefined, now: Date): FailurePrediction {
  let score = 0;
  const signals: string[] = [];

  // 1) High risk score
  const riskScore = moneyResult?.riskScore ?? 0;
  if (riskScore >= 70) {
    score += 25;
    signals.push('Very high risk score');
  } else if (riskScore >= 50) {
    score += 15;
    signals.push('Elevated risk score');
  }

  // 2) Missed milestones
  const ms = deal.milestoneStatus;
  if (ms) {
    let unresolved = 0;
    if (ms.inspection === 'unknown') unresolved++;
    if (ms.financing === 'unknown') unresolved++;
    if (ms.appraisal === 'unknown') unresolved++;
    if (unresolved >= 2) {
      score += 20;
      signals.push(`${unresolved} unresolved milestones`);
    } else if (unresolved === 1) {
      score += 10;
      signals.push('Unresolved milestone');
    }
  }

  // 3) Long inactivity
  const touchDate = deal.lastTouchedAt || deal.createdAt;
  if (touchDate) {
    const days = daysBetween(now, new Date(touchDate));
    if (days > 14) {
      score += 25;
      signals.push(`No activity in ${Math.round(days)} days`);
    } else if (days > 7) {
      score += 15;
      signals.push(`Inactive ${Math.round(days)} days`);
    }
  }

  // 4) Close date issues
  if (deal.closeDate) {
    const daysToClose = daysBetween(new Date(deal.closeDate), now);
    if (daysToClose < 0) {
      score += 20;
      signals.push(`Overdue by ${Math.abs(Math.round(daysToClose))} days`);
    } else if (daysToClose <= 3 && riskScore >= 40) {
      score += 15;
      signals.push('Closing imminent with unresolved risks');
    }
  }

  // 5) Drift/conflict flags
  const driftFlags = (deal.riskFlags || []).filter(f =>
    f.toLowerCase().includes('drift') || f.toLowerCase().includes('conflict')
  );
  if (driftFlags.length > 0) {
    score += 10;
    signals.push('Unresolved drift signals');
  }

  // 6) Overdue tasks on this deal
  const dealTasks = tasks.filter(t => t.relatedDealId === deal.id && !t.completedAt);
  const overdueDealTasks = dealTasks.filter(t => new Date(t.dueAt) < now);
  if (overdueDealTasks.length >= 3) {
    score += 15;
    signals.push(`${overdueDealTasks.length} overdue tasks`);
  } else if (overdueDealTasks.length >= 1) {
    score += 8;
    signals.push(`${overdueDealTasks.length} overdue task${overdueDealTasks.length > 1 ? 's' : ''}`);
  }

  const probability = Math.min(100, Math.max(0, score));

  let level: FailureLevel;
  if (probability >= 70) level = 'critical';
  else if (probability >= 55) level = 'high';
  else if (probability >= 40) level = 'elevated';
  else if (probability >= 25) level = 'watch';
  else level = 'low';

  // Suggested action
  let suggestedAction: { title: string; type: string };
  if (signals.some(s => s.includes('milestone'))) {
    suggestedAction = { title: `Resolve milestones on ${deal.title}`, type: 'follow_up' };
  } else if (signals.some(s => s.includes('Inactive') || s.includes('No activity'))) {
    suggestedAction = { title: `Contact client on ${deal.title}`, type: 'call' };
  } else if (signals.some(s => s.includes('Overdue'))) {
    suggestedAction = { title: `Clear overdue tasks for ${deal.title}`, type: 'follow_up' };
  } else {
    suggestedAction = { title: `Review ${deal.title} status`, type: 'follow_up' };
  }

  return { dealId: deal.id, dealTitle: deal.title, probability, level, signals, suggestedAction };
}

const LEVEL_STYLE: Record<FailureLevel, { label: string; className: string }> = {
  low: { label: 'Low Risk', className: 'text-opportunity border-opportunity/30' },
  watch: { label: 'Watch', className: 'text-muted-foreground border-muted-foreground/30' },
  elevated: { label: 'Elevated', className: 'text-warning border-warning/30' },
  high: { label: 'High Risk', className: 'text-urgent border-urgent/30' },
  critical: { label: 'Critical', className: 'text-urgent border-urgent/50' },
};

export function DealFailurePanel({ deals, tasks, moneyResults, onCreateTask }: Props) {
  const now = useMemo(() => new Date(), []);

  const predictions = useMemo(() => {
    const resultMap = new Map(moneyResults.map(r => [r.dealId, r]));
    return deals
      .filter(d => d.stage !== 'closed')
      .map(d => predictFailure(d, tasks, resultMap.get(d.id), now))
      .filter(p => p.probability >= 25)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);
  }, [deals, tasks, moneyResults, now]);

  // Export critical deal count for Autopilot
  const hasCritical = predictions.some(p => p.level === 'critical');

  if (predictions.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <AlertOctagon className="h-4 w-4 text-urgent" />
        <h2 className="text-sm font-semibold">Deals Likely to Fail</h2>
        {hasCritical && (
          <Badge variant="outline" className="text-[10px] border-urgent/30 text-urgent ml-auto">Action Needed</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">Deals showing patterns associated with failure or stalling.</p>

      <div className="space-y-2">
        {predictions.map(pred => {
          const style = LEVEL_STYLE[pred.level];
          return (
            <div key={pred.dealId} className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium truncate flex-1 min-w-0">{pred.dealTitle}</p>
                <Badge variant="outline" className={cn('text-[10px] shrink-0 ml-2', style.className)}>
                  {style.label}
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Failure likelihood</span>
                  <span className="text-[10px] font-medium">{pred.probability}%</span>
                </div>
                <Progress value={pred.probability} className="h-1" />
              </div>
              <p className="text-xs text-muted-foreground">{pred.signals[0]}</p>
              <Button
                size="sm" variant="outline" className="w-full text-xs h-7"
                onClick={() => onCreateTask(pred.suggestedAction.title, pred.dealId)}
              >
                <Plus className="h-3 w-3 mr-1" /> {pred.suggestedAction.title.length > 35 ? 'Start Action' : pred.suggestedAction.title}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Utility: check if any deal is at critical failure risk */
export function hasCriticalFailureRisk(deals: Deal[], tasks: Task[], moneyResults: MoneyModelResult[]): boolean {
  const now = new Date();
  const resultMap = new Map(moneyResults.map(r => [r.dealId, r]));
  return deals
    .filter(d => d.stage !== 'closed')
    .some(d => predictFailure(d, tasks, resultMap.get(d.id), now).level === 'critical');
}
