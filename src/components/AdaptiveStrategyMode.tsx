import { useMemo } from 'react';
import { Compass, TrendingUp, Shield, Activity, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deal } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';

type StrategyMode = 'growth' | 'protection' | 'stability' | 'opportunity';

interface Props {
  deals: Deal[];
  moneyResults: MoneyModelResult[];
  opportunityResults: OpportunityHeatResult[];
  stabilityScore: number;
  totalMoneyAtRisk: number;
}

const MODE_CONFIG: Record<StrategyMode, { icon: typeof Shield; label: string; description: string; className: string }> = {
  growth: {
    icon: TrendingUp,
    label: 'Growth Mode',
    description: 'Pipeline needs building. Prioritize prospecting and lead conversion.',
    className: 'border-opportunity/20 bg-opportunity/5',
  },
  protection: {
    icon: Shield,
    label: 'Protection Mode',
    description: 'Income is at risk. Prioritize securing existing deals.',
    className: 'border-urgent/20 bg-urgent/5',
  },
  stability: {
    icon: Activity,
    label: 'Stability Mode',
    description: 'Operational load is high. Focus on clearing backlog and restoring balance.',
    className: 'border-warning/20 bg-warning/5',
  },
  opportunity: {
    icon: Flame,
    label: 'Opportunity Mode',
    description: 'Pipeline is healthy and market is active. Capitalize on momentum.',
    className: 'border-primary/20 bg-primary/5',
  },
};

export function AdaptiveStrategyMode({ deals, moneyResults, opportunityResults, stabilityScore, totalMoneyAtRisk }: Props) {
  const { mode, priorities } = useMemo(() => {
    const activeDeals = deals.filter(d => d.stage !== 'closed');
    const riskyDeals = moneyResults.filter(r => r.personalCommissionAtRisk > 0).length;
    const hotOpps = opportunityResults.filter(r => r.opportunityScore >= 50).length;

    let mode: StrategyMode;
    const priorities: string[] = [];

    if (stabilityScore < 40) {
      mode = 'stability';
      priorities.push('Clear overdue tasks', 'Reduce commitments', 'Focus on top 3 deals');
    } else if (totalMoneyAtRisk > 10000 || riskyDeals >= 3) {
      mode = 'protection';
      priorities.push('Resolve deal risks', 'Secure contingencies', 'Follow up on at-risk clients');
    } else if (activeDeals.length < 3) {
      mode = 'growth';
      priorities.push('Increase prospecting', 'Convert warm leads', 'Expand referral network');
    } else if (hotOpps >= 3 && stabilityScore > 70) {
      mode = 'opportunity';
      priorities.push('Act on hot opportunities', 'Advance warm leads', 'Maintain deal momentum');
    } else {
      mode = stabilityScore > 70 ? 'opportunity' : 'growth';
      priorities.push('Balanced approach', 'Monitor pipeline health', 'Follow standard workflow');
    }

    return { mode, priorities };
  }, [deals, moneyResults, opportunityResults, stabilityScore, totalMoneyAtRisk]);

  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  return (
    <div className={cn('rounded-lg border bg-card p-5 space-y-3', config.className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Strategy Mode</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon className={cn('h-3.5 w-3.5', mode === 'protection' ? 'text-urgent' : mode === 'growth' ? 'text-opportunity' : mode === 'stability' ? 'text-warning' : 'text-primary')} />
          <span className="text-xs font-semibold">{config.label}</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{config.description}</p>

      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Priorities</p>
        {priorities.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground">{i + 1}.</span>
            <span className="text-xs">{p}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
