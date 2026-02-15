import { useState, useMemo } from 'react';
import { Shield, Flame, Activity, Clock, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PanelHelpTooltip } from '@/components/PanelHelpTooltip';
import { Badge } from '@/components/ui/badge';
import type { CommandCenterPanels, CommandCenterAction, Deal, Lead } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import type { StabilityResult } from '@/lib/stabilityModel';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────

type OperatingMode = 'crisis' | 'stabilize' | 'growth';
type DirectiveType = 'protect' | 'create' | 'restore';
type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'late_night';

interface NextAction {
  id: string;
  title: string;
  reason: string;
  type: 'task' | 'deal' | 'lead' | 'stability';
  dealId?: string;
  leadId?: string;
  value?: number;
}

interface PredictiveSignal {
  type: 'failure' | 'ghosting' | 'fragility' | 'volatility' | 'decay';
  label: string;
  severity: 'high' | 'medium';
}

interface Props {
  panels: CommandCenterPanels;
  onComplete: (taskId: string) => void;
  snoozedIds: Set<string>;
  onSnooze: (id: string) => void;
  topMoneyAtRisk?: MoneyModelResult | null;
  deals?: Deal[];
  onMoneyAction?: (result: MoneyModelResult, deal: Deal) => void;
  topOpportunity?: OpportunityHeatResult | null;
  leads?: Lead[];
  onOpportunityAction?: (lead: Lead, result: OpportunityHeatResult) => void;
  stabilityResult?: StabilityResult | null;
  stabilityScore?: number;
  overdueTasksCount?: number;
  dueSoonCount?: number;
  totalMoneyAtRisk?: number;
  onStabilityAction?: () => void;
  onCreateTask?: (title: string, dealId?: string, leadId?: string) => void;
  burnoutCritical?: boolean;
  predictiveSignals?: PredictiveSignal[];
  onOpenExecution?: (entityId: string, entityType: 'deal' | 'lead') => void;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const SNOOZE_OPTIONS = [
  { label: '1 hour', ms: 3600000 },
  { label: '4 hours', ms: 14400000 },
  { label: 'Tomorrow', ms: 86400000 },
] as const;

function getTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'late_night';
}

const TIME_GUIDANCE: Record<TimeOfDay, { label: string; focus: string }> = {
  morning: { label: 'Morning', focus: 'Proactive actions — set the day up for success' },
  afternoon: { label: 'Afternoon', focus: 'Execution — move deals forward and follow up' },
  evening: { label: 'Evening', focus: 'Wrap-up — address remaining items before tomorrow' },
  late_night: { label: 'Late Night', focus: 'Low-pressure review only — no urgency' },
};

function determineOperatingMode(
  stabilityScore: number,
  totalMoneyAtRisk: number,
): OperatingMode {
  if (stabilityScore < 40 || totalMoneyAtRisk > 10000) return 'crisis';
  if (stabilityScore <= 70) return 'stabilize';
  return 'growth';
}

const MODE_CONFIG: Record<OperatingMode, { label: string; className: string; description: string }> = {
  crisis: {
    label: 'Crisis Mode',
    className: 'bg-urgent/10 text-urgent border-urgent/20',
    description: 'Focus all effort on protecting existing income and restoring stability.',
  },
  stabilize: {
    label: 'Stabilize Mode',
    className: 'bg-warning/10 text-warning border-warning/20',
    description: 'Address risks while maintaining deal momentum.',
  },
  growth: {
    label: 'Growth Mode',
    className: 'bg-opportunity/10 text-opportunity border-opportunity/20',
    description: 'Pipeline is stable. Prioritize creating new income.',
  },
};

function determineDirective(
  operatingMode: OperatingMode,
  stabilityScore: number,
  topRiskValue: number,
  topOppValue: number,
): { type: DirectiveType; title: string; reason: string } {
  if (operatingMode === 'crisis' || stabilityScore < 40) {
    return {
      type: 'restore',
      title: 'Restore Stability',
      reason: `Stability score is ${stabilityScore}. Clear overdue items and address risks before taking new actions.`,
    };
  }
  if (topRiskValue > 0 && (topRiskValue >= topOppValue || operatingMode === 'stabilize')) {
    return {
      type: 'protect',
      title: 'Protect Income',
      reason: `${formatCurrency(topRiskValue)} in personal commission is at risk. Secure existing deals first.`,
    };
  }
  if (topOppValue > 0) {
    return {
      type: 'create',
      title: 'Create Income',
      reason: `Pipeline is stable. Top opportunity worth ${formatCurrency(topOppValue)}. Focus on converting leads.`,
    };
  }
  return {
    type: 'restore',
    title: 'Restore Stability',
    reason: 'Address outstanding items to maintain operational health.',
  };
}

const DIRECTIVE_ICON: Record<DirectiveType, typeof Shield> = {
  protect: Shield,
  create: Flame,
  restore: Activity,
};

const DIRECTIVE_STYLE: Record<DirectiveType, string> = {
  protect: 'border-urgent/20',
  create: 'border-opportunity/20',
  restore: 'border-border',
};

export function AutopilotPanel({
  panels, onComplete, snoozedIds, onSnooze,
  topMoneyAtRisk, deals, onMoneyAction,
  topOpportunity, leads, onOpportunityAction,
  stabilityResult, stabilityScore = 100,
  overdueTasksCount = 0, dueSoonCount = 0,
  totalMoneyAtRisk = 0,
  onStabilityAction, onCreateTask,
  burnoutCritical = false,
  predictiveSignals = [],
  onOpenExecution,
}: Props) {
  const [showSnooze, setShowSnooze] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const timeOfDay = useMemo(getTimeOfDay, []);
  const operatingMode = useMemo(
    () => {
      if (burnoutCritical) return 'crisis' as OperatingMode;
      return determineOperatingMode(stabilityScore, totalMoneyAtRisk);
    },
    [stabilityScore, totalMoneyAtRisk, burnoutCritical],
  );

  const moneyDeal = useMemo(() => {
    if (!topMoneyAtRisk || !deals) return null;
    return deals.find(d => d.id === topMoneyAtRisk.dealId) || null;
  }, [topMoneyAtRisk, deals]);

  const opportunityLead = useMemo(() => {
    if (!topOpportunity || !leads) return null;
    return leads.find(l => l.id === topOpportunity.leadId) || null;
  }, [topOpportunity, leads]);

  const riskValue = topMoneyAtRisk?.personalCommissionAtRisk ?? 0;
  const oppValue = topOpportunity?.opportunityValue ?? 0;

  const isPredictive = predictiveSignals.length > 0;
  const topPredictiveSignal = predictiveSignals[0] || null;

  const directive = useMemo(
    () => {
      // If predictive signals override — highest severity predictive signal drives directive
      if (topPredictiveSignal?.severity === 'high') {
        if (topPredictiveSignal.type === 'failure' || topPredictiveSignal.type === 'ghosting') {
          return {
            type: 'protect' as DirectiveType,
            title: 'Prevent Income Loss',
            reason: topPredictiveSignal.label,
          };
        }
        if (topPredictiveSignal.type === 'fragility' || topPredictiveSignal.type === 'volatility') {
          return {
            type: 'create' as DirectiveType,
            title: 'Stabilize Pipeline',
            reason: topPredictiveSignal.label,
          };
        }
      }
      return determineDirective(operatingMode, stabilityScore, riskValue, oppValue);
    },
    [operatingMode, stabilityScore, riskValue, oppValue, topPredictiveSignal],
  );

  // Determine next best action
  const nextAction = useMemo((): NextAction | null => {
    // Crisis / restore: overdue tasks first
    if (directive.type === 'restore' && overdueTasksCount > 0) {
      const actionTitle = stabilityResult?.suggestedAction?.title || `Clear overdue tasks (top ${Math.min(3, overdueTasksCount)})`;
      return { id: 'stability', title: actionTitle, reason: 'Reduces overdue backlog and improves stability', type: 'stability' };
    }

    // Protect: deal at risk
    if (directive.type === 'protect' && moneyDeal && topMoneyAtRisk) {
      return {
        id: topMoneyAtRisk.dealId,
        title: `Resolve risk on ${moneyDeal.title}`,
        reason: topMoneyAtRisk.reasonPrimary || `${formatCurrency(riskValue)} at risk`,
        type: 'deal',
        dealId: moneyDeal.id,
        value: riskValue,
      };
    }

    // Create: opportunity
    if (directive.type === 'create' && opportunityLead && topOpportunity) {
      return {
        id: topOpportunity.leadId,
        title: `Contact ${opportunityLead.name}`,
        reason: topOpportunity.reasonPrimary || `${formatCurrency(oppValue)} opportunity`,
        type: 'lead',
        leadId: opportunityLead.id,
        value: oppValue,
      };
    }

    // Fallback: top priority action
    const topAction = panels.priorityActions.find(a => !snoozedIds.has(a.id));
    if (topAction) {
      return {
        id: topAction.id,
        title: topAction.title,
        reason: topAction.reason,
        type: topAction.relatedDealId ? 'deal' : topAction.relatedTaskId ? 'task' : 'lead',
        dealId: topAction.relatedDealId,
        leadId: topAction.relatedLeadId,
      };
    }

    return null;
  }, [directive, overdueTasksCount, stabilityResult, moneyDeal, topMoneyAtRisk, riskValue, opportunityLead, topOpportunity, oppValue, panels.priorityActions, snoozedIds]);

  const handleAction = () => {
    if (!nextAction) return;
    if (nextAction.type === 'stability') {
      onCreateTask?.(nextAction.title);
      onStabilityAction?.();
    } else if (nextAction.type === 'deal' && moneyDeal && topMoneyAtRisk) {
      onCreateTask?.(nextAction.title, moneyDeal.id);
      onMoneyAction?.(topMoneyAtRisk, moneyDeal);
    } else if (nextAction.type === 'lead' && opportunityLead && topOpportunity) {
      onCreateTask?.(`Contact ${opportunityLead.name} now (hot lead)`, undefined, opportunityLead.id);
      onOpportunityAction?.(opportunityLead, topOpportunity);
    } else {
      // Fallback task action
      const topAction = panels.priorityActions.find(a => a.id === nextAction.id);
      if (topAction?.relatedTaskId) {
        onComplete(topAction.relatedTaskId);
      }
      onSnooze(nextAction.id);
    }
  };

  const DIcon = DIRECTIVE_ICON[directive.type];
  const modeConfig = MODE_CONFIG[operatingMode];
  const timeConfig = TIME_GUIDANCE[timeOfDay];

  const hasExecutionTarget = nextAction && (nextAction.dealId || nextAction.leadId);

  // Empty state
  if (!nextAction && stabilityScore >= 80) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Autopilot</p>
            <PanelHelpTooltip text="Your AI co-pilot. Analyzes risk, opportunity, and stability to recommend the single best next action." />
          </div>
          <div className="flex items-center gap-1.5">
            {isPredictive && <span className="text-[10px] px-2 py-0.5 rounded-full border border-primary/20 text-primary bg-primary/5">Predictive</span>}
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full border', modeConfig.className)}>{modeConfig.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Operations stable. No immediate action required.</p>
        </div>
        <p className="text-[10px] text-muted-foreground">{timeConfig.label} · {timeConfig.focus}</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border bg-card p-5 space-y-4', DIRECTIVE_STYLE[directive.type])}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Autopilot</p>
          <PanelHelpTooltip text="Your AI co-pilot. Analyzes risk, opportunity, and stability to recommend the single best next action." />
        </div>
        <div className="flex items-center gap-1.5">
          {hasExecutionTarget && <span className="text-[10px] px-2 py-0.5 rounded-full border border-primary/20 text-primary bg-primary/5">Execution Ready</span>}
          {isPredictive && <span className="text-[10px] px-2 py-0.5 rounded-full border border-primary/20 text-primary bg-primary/5">Predictive</span>}
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border', modeConfig.className)}>{modeConfig.label}</span>
        </div>
      </div>

      {/* A) Primary Directive */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <DIcon className={cn('h-4 w-4 shrink-0', directive.type === 'protect' ? 'text-urgent' : directive.type === 'create' ? 'text-opportunity' : 'text-muted-foreground')} />
          <h3 className="text-sm font-bold tracking-tight">{directive.title}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{directive.reason}</p>
      </div>

      {/* B) Next Best Action */}
      {nextAction && (
        <div className="rounded-md border border-border bg-background/50 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Next Action</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{nextAction.type}</span>
          </div>
          <p className="text-sm font-medium leading-snug">{nextAction.title}</p>
          <p className="text-xs text-muted-foreground">{nextAction.reason}</p>
          {nextAction.value && (
            <p className={cn('text-xs font-medium', directive.type === 'protect' ? 'text-urgent' : 'text-opportunity')}>
              {formatCurrency(nextAction.value)} {directive.type === 'protect' ? 'at risk' : 'opportunity'}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="default" className="text-xs" onClick={handleAction}>
              <Check className="h-3.5 w-3.5 mr-1" />
              {directive.type === 'protect' ? 'Generate Recovery Plan' : directive.type === 'create' ? 'Engage Lead Now' : 'Clear Overdue Tasks'}
            </Button>
            {hasExecutionTarget && onOpenExecution && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => {
                  const eid = nextAction.dealId || nextAction.leadId;
                  const etype = nextAction.dealId ? 'deal' : 'lead';
                  if (eid) onOpenExecution(eid, etype as 'deal' | 'lead');
                }}
              >
                Briefing
              </Button>
            )}
            <div className="relative">
              <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowSnooze(!showSnooze)}>
                <Clock className="h-3.5 w-3.5 mr-1" />
                Snooze
              </Button>
              {showSnooze && (
                <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 min-w-[120px]">
                  {SNOOZE_OPTIONS.map(opt => (
                    <button
                      key={opt.label}
                      className="block w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors first:rounded-t-md last:rounded-b-md"
                      onClick={() => { onSnooze(nextAction.id); setShowSnooze(false); }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Snooze fatigue warning */}
          {snoozedIds.has(nextAction.id) && (
            <p className="text-[10px] text-warning/80 mt-1">This item has been snoozed before. Consider resolving or delegating it.</p>
          )}
        </div>
      )}

      {/* C) Operating Mode + Time */}
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <span>{timeConfig.label} · {modeConfig.label}</span>
      </button>
      {expanded && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{timeConfig.focus}</span>
          </div>
          <p>{modeConfig.description}</p>
          {operatingMode === 'crisis' && (
            <p className="text-urgent/80">Stability is critical. Avoid new commitments until the score improves.</p>
          )}
        </div>
      )}
    </div>
  );
}
