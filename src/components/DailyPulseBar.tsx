import { DollarSign, Users, CheckSquare, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deal, Lead, Task } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';

interface Props {
  totalMoneyAtRisk: number;
  topMoneyResult: MoneyModelResult | null;
  topDeal: Deal | null;
  topOpportunity: OpportunityHeatResult | null;
  topLead: Lead | null;
  overdueTasks: Task[];
  dueSoonTasks: Task[];
  onMoneyClick: () => void;
  onLeadClick: () => void;
  onTasksClick: () => void;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

export function DailyPulseBar({
  totalMoneyAtRisk, topMoneyResult, topDeal, topOpportunity, topLead,
  overdueTasks, dueSoonTasks, onMoneyClick, onLeadClick, onTasksClick,
}: Props) {
  const hasMoneyRisk = totalMoneyAtRisk > 0 && topDeal;
  const hasHotLead = topOpportunity && topLead;
  const overdueCount = overdueTasks.length;
  const dueTodayCount = dueSoonTasks.length;
  const hasTaskUrgency = overdueCount > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Card 1: Income at Risk */}
      <button
        onClick={onMoneyClick}
        className={cn(
          'flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50',
          hasMoneyRisk ? 'border-destructive/30' : 'border-border'
        )}
      >
        <div className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md shrink-0',
          hasMoneyRisk ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
        )}>
          {hasMoneyRisk ? <DollarSign className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">Income at Risk</p>
          {hasMoneyRisk ? (
            <p className="text-sm font-bold text-destructive truncate">{formatCurrency(totalMoneyAtRisk)} at risk</p>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">All clear</p>
          )}
        </div>
      </button>

      {/* Card 2: Hottest Lead */}
      <button
        onClick={onLeadClick}
        className={cn(
          'flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50',
          hasHotLead ? 'border-primary/30' : 'border-border'
        )}
      >
        <div className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md shrink-0',
          hasHotLead ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}>
          {hasHotLead ? <Users className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">Hottest Lead</p>
          {hasHotLead ? (
            <p className="text-sm font-bold truncate">
              {topLead.name} <span className="text-xs font-normal text-muted-foreground">· {topOpportunity.opportunityScore} heat</span>
            </p>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">All clear</p>
          )}
        </div>
      </button>

      {/* Card 3: Today's Tasks */}
      <button
        onClick={onTasksClick}
        className={cn(
          'flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50',
          hasTaskUrgency ? 'border-warning/30' : 'border-border'
        )}
      >
        <div className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md shrink-0',
          hasTaskUrgency ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
        )}>
          {hasTaskUrgency ? <CheckSquare className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">Today's Tasks</p>
          {(overdueCount > 0 || dueTodayCount > 0) ? (
            <p className="text-sm font-bold truncate">
              {overdueCount > 0 && <span className="text-destructive">{overdueCount} overdue</span>}
              {overdueCount > 0 && dueTodayCount > 0 && <span className="text-muted-foreground"> · </span>}
              {dueTodayCount > 0 && <span className="text-warning">{dueTodayCount} due soon</span>}
            </p>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">All clear</p>
          )}
        </div>
      </button>
    </div>
  );
}
