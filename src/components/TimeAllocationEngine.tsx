import { useMemo } from 'react';
import { Clock, Shield, Flame, Wrench, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { Deal, Task } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';

interface Allocation {
  category: string;
  label: string;
  percent: number;
  icon: typeof Shield;
  className: string;
  reason: string;
}

interface Props {
  deals: Deal[];
  tasks: Task[];
  moneyResults: MoneyModelResult[];
  opportunityResults: OpportunityHeatResult[];
  stabilityScore: number;
  totalMoneyAtRisk: number;
}

export function TimeAllocationEngine({ deals, tasks, moneyResults, opportunityResults, stabilityScore, totalMoneyAtRisk }: Props) {
  const allocation = useMemo((): Allocation[] => {
    const activeDeals = deals.filter(d => d.stage !== 'closed');
    const riskyDeals = moneyResults.filter(r => r.personalCommissionAtRisk > 0).length;
    const hotOpps = opportunityResults.filter(r => r.opportunityScore >= 40).length;
    const overdue = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < new Date()).length;

    let protect = 30, create = 30, followUp = 20, admin = 20;

    // Adaptive: pipeline weak → more prospecting
    if (activeDeals.length < 3 || hotOpps > riskyDeals) {
      create = 45; protect = 25; followUp = 15; admin = 15;
    }
    // Deals at risk → more protection
    if (riskyDeals >= 3 || totalMoneyAtRisk > 10000) {
      protect = 45; create = 20; followUp = 20; admin = 15;
    }
    // Overloaded → balanced
    if (stabilityScore < 40 || overdue > 5) {
      protect = 30; create = 15; followUp = 25; admin = 30;
    }
    // Stable → balanced growth
    if (stabilityScore > 80 && riskyDeals === 0) {
      create = 40; protect = 20; followUp = 25; admin = 15;
    }

    const reason = stabilityScore < 40
      ? 'Overloaded — focus on clearing backlog'
      : totalMoneyAtRisk > 10000
        ? 'Income at risk — prioritize deal protection'
        : activeDeals.length < 3
          ? 'Pipeline weak — increase prospecting'
          : 'Balanced — maintain momentum';

    return [
      { category: 'create', label: 'Create Income', percent: create, icon: Flame, className: 'text-opportunity', reason: 'Prospecting & lead outreach' },
      { category: 'protect', label: 'Protect Income', percent: protect, icon: Shield, className: 'text-urgent', reason: 'Deal management & risk resolution' },
      { category: 'followUp', label: 'Client Follow-ups', percent: followUp, icon: TrendingUp, className: 'text-primary', reason: 'Nurture existing relationships' },
      { category: 'admin', label: 'Maintenance', percent: admin, icon: Wrench, className: 'text-muted-foreground', reason: 'Admin, planning & backlog' },
    ];
  }, [deals, tasks, moneyResults, opportunityResults, stabilityScore, totalMoneyAtRisk]);

  const strategyLabel = useMemo(() => {
    const top = allocation.reduce((a, b) => a.percent > b.percent ? a : b);
    return top.label;
  }, [allocation]);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Today's Time Mix</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">Focus: {strategyLabel}</span>
      </div>

      <div className="space-y-3">
        {allocation.map(a => {
          const Icon = a.icon;
          return (
            <div key={a.category} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-3.5 w-3.5', a.className)} />
                  <span className="text-xs font-medium">{a.label}</span>
                </div>
                <span className="text-xs font-medium text-muted-foreground">{a.percent}%</span>
              </div>
              <Progress value={a.percent} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground">{a.reason}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
