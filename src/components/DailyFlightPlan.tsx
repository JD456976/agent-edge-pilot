import { useMemo } from 'react';
import { Plane, Shield, Flame, Wrench, Phone, Clock, DollarSign, FileText, Mail, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Deal, Lead, Task } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import type { StabilityResult } from '@/lib/stabilityModel';
import type { SessionMode } from '@/hooks/useSessionMode';
import { computeExecutionConfidence, type ConfidenceLevel } from '@/lib/executionEngine';

interface FlightStep {
  id: string;
  category: 'protect' | 'create' | 'maintain';
  title: string;
  reason: string;
  estimatedMinutes: number;
  estimatedImpact?: number;
  entityId?: string;
  entityType?: 'deal' | 'lead' | 'task';
  confidence?: ConfidenceLevel;
}

interface Props {
  deals: Deal[];
  leads: Lead[];
  tasks: Task[];
  moneyResults: MoneyModelResult[];
  opportunityResults: OpportunityHeatResult[];
  stabilityResult: StabilityResult;
  totalMoneyAtRisk: number;
  sessionMode: SessionMode;
  onStartAction?: (step: FlightStep) => void;
  onOpenExecution?: (entityId: string, entityType: 'deal' | 'lead') => void;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const CATEGORY_CONFIG = {
  protect: { icon: Shield, label: 'Protect Income', className: 'text-urgent' },
  create: { icon: Flame, label: 'Create Income', className: 'text-opportunity' },
  maintain: { icon: Wrench, label: 'Maintenance', className: 'text-muted-foreground' },
} as const;

const MODE_FOCUS: Record<SessionMode, { primary: FlightStep['category']; description: string }> = {
  morning: { primary: 'create', description: 'Focus on outreach and opportunity creation' },
  midday: { primary: 'protect', description: 'Focus on negotiations and deal movement' },
  evening: { primary: 'maintain', description: 'Focus on planning and cleanup' },
  night: { primary: 'maintain', description: 'Rest up — tomorrow starts fresh' },
};

export function DailyFlightPlan({ deals, leads, tasks, moneyResults, opportunityResults, stabilityResult, totalMoneyAtRisk, sessionMode, onStartAction, onOpenExecution }: Props) {
  const steps = useMemo((): FlightStep[] => {
    const result: FlightStep[] = [];
    const now = new Date();
    const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    // Protect: deals at risk
    const riskyResults = [...moneyResults]
      .filter(r => r.personalCommissionAtRisk > 0)
      .sort((a, b) => b.personalCommissionAtRisk - a.personalCommissionAtRisk)
      .slice(0, 3);

    for (const r of riskyResults) {
      const deal = deals.find(d => d.id === r.dealId);
      if (!deal) continue;
      const conf = computeExecutionConfidence('deal', deal, r, null, tasks);
      result.push({
        id: `protect-${r.dealId}`,
        category: 'protect',
        title: `Resolve risk on ${deal.title}`,
        reason: r.reasonPrimary || `${formatCurrency(r.personalCommissionAtRisk)} at risk`,
        estimatedMinutes: r.riskScore >= 70 ? 30 : 15,
        estimatedImpact: r.personalCommissionAtRisk,
        entityId: deal.id,
        entityType: 'deal',
        confidence: conf.level,
      });
    }

    // Create: hot opportunities
    const topOpps = [...opportunityResults]
      .filter(r => r.opportunityScore >= 40)
      .sort((a, b) => b.opportunityValue - a.opportunityValue)
      .slice(0, 3);

    for (const opp of topOpps) {
      const lead = leads.find(l => l.id === opp.leadId);
      if (!lead) continue;
      const conf = computeExecutionConfidence('lead', lead, null, opp, tasks);
      result.push({
        id: `create-${opp.leadId}`,
        category: 'create',
        title: `Contact ${lead.name}`,
        reason: opp.reasonPrimary || `${formatCurrency(opp.opportunityValue)} opportunity`,
        estimatedMinutes: 15,
        estimatedImpact: opp.opportunityValue,
        entityId: lead.id,
        entityType: 'lead',
        confidence: conf.level,
      });
    }

    // Maintain: overdue tasks
    const overdue = tasks
      .filter(t => !t.completedAt && new Date(t.dueAt) < now)
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, 2);

    for (const t of overdue) {
      result.push({
        id: `maintain-${t.id}`,
        category: 'maintain',
        title: t.title,
        reason: 'Overdue — clear backlog',
        estimatedMinutes: 10,
        entityId: t.id,
        entityType: 'task',
      });
    }

    // Maintain: due soon tasks (within 72h)
    const dueSoon = tasks
      .filter(t => !t.completedAt && new Date(t.dueAt) >= now && new Date(t.dueAt) <= in72h)
      .slice(0, 2);

    for (const t of dueSoon) {
      result.push({
        id: `maintain-soon-${t.id}`,
        category: 'maintain',
        title: t.title,
        reason: 'Due within 72 hours',
        estimatedMinutes: 10,
        entityId: t.id,
        entityType: 'task',
      });
    }

    // Sort by mode priority then impact
    const modeFocus = MODE_FOCUS[sessionMode];
    const catOrder: Record<string, number> = { [modeFocus.primary]: 0 };
    if (modeFocus.primary !== 'protect') catOrder['protect'] = 1;
    if (modeFocus.primary !== 'create') catOrder['create'] = catOrder['create'] ?? 1;
    catOrder['maintain'] = 2;

    return result
      .sort((a, b) => {
        const oa = catOrder[a.category] ?? 1;
        const ob = catOrder[b.category] ?? 1;
        if (oa !== ob) return oa - ob;
        return (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0);
      })
      .slice(0, 5);
  }, [deals, leads, tasks, moneyResults, opportunityResults, sessionMode]);

  const totalMinutes = steps.reduce((s, st) => s + st.estimatedMinutes, 0);
  const totalImpact = steps.reduce((s, st) => s + (st.estimatedImpact ?? 0), 0);
  const modeFocus = MODE_FOCUS[sessionMode];

  if (steps.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Plane className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Today's Flight Plan</p>
        </div>
        <p className="text-sm text-muted-foreground">No actions needed right now. Pipeline is clear.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/10 bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plane className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Today's Flight Plan</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> ~{totalMinutes}min</span>
          {totalImpact > 0 && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {formatCurrency(totalImpact)} impact</span>}
        </div>
      </div>

      {/* Mode focus */}
      <p className="text-xs text-muted-foreground">{modeFocus.description}</p>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, i) => {
          const config = CATEGORY_CONFIG[step.category];
          const Icon = config.icon;
          return (
            <div key={step.id} className="flex items-start gap-3 p-3 rounded-md border border-border bg-background/50">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-muted-foreground w-4">{i + 1}.</span>
                <Icon className={cn('h-3.5 w-3.5', config.className)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug truncate">{step.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{step.reason}</span>
                  {step.confidence && (
                    <span className={cn('text-[10px] font-medium', step.confidence === 'HIGH' ? 'text-opportunity' : step.confidence === 'MEDIUM' ? 'text-warning' : 'text-muted-foreground')}>
                      {step.confidence}
                    </span>
                  )}
                  {step.estimatedImpact && (
                    <span className={cn('text-xs font-medium', step.category === 'protect' ? 'text-urgent' : 'text-opportunity')}>
                      {formatCurrency(step.estimatedImpact)}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">~{step.estimatedMinutes}min</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {step.entityType && step.entityType !== 'task' && step.entityId && onOpenExecution && (
                  <Button size="sm" variant="ghost" className="text-xs px-2" onClick={() => onOpenExecution(step.entityId!, step.entityType as 'deal' | 'lead')}>
                    <FileText className="h-3 w-3 mr-1" /> View Talking Points
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-xs" onClick={() => onStartAction?.(step)}>
                  {step.category === 'protect' ? (
                    <><Phone className="h-3 w-3 mr-1" /> Start Action</>
                  ) : step.category === 'create' ? (
                    <><MessageSquare className="h-3 w-3 mr-1" /> Start Action</>
                  ) : (
                    <><Shield className="h-3 w-3 mr-1" /> Create Follow-Up</>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
