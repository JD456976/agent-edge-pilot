import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Clock, Check, TrendingUp, Shield, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CommandCenterPanels, CommandCenterAction, CommandCenterOpportunity, Deal, Lead } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';

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
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const SNOOZE_OPTIONS = [
  { label: '1 hour', ms: 3600000 },
  { label: '4 hours', ms: 14400000 },
  { label: 'Tomorrow', ms: 86400000 },
] as const;

export function RecommendedFirstAction({ panels, onComplete, snoozedIds, onSnooze, topMoneyAtRisk, deals, onMoneyAction, topOpportunity, leads, onOpportunityAction }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);

  // Check if money-at-risk should override
  const moneyDeal = useMemo(() => {
    if (!topMoneyAtRisk || !deals) return null;
    return deals.find(d => d.id === topMoneyAtRisk.dealId) || null;
  }, [topMoneyAtRisk, deals]);

  const opportunityLead = useMemo(() => {
    if (!topOpportunity || !leads) return null;
    return leads.find(l => l.id === topOpportunity.leadId) || null;
  }, [topOpportunity, leads]);

  // Money-aware decision: risk vs opportunity
  const moneyDecision = useMemo(() => {
    const riskValue = topMoneyAtRisk?.personalCommissionAtRisk ?? 0;
    const riskScore = topMoneyAtRisk?.riskScore ?? 0;
    const oppValue = topOpportunity?.opportunityValue ?? 0;
    const hasRisk = riskValue > 0 && moneyDeal;
    const hasOpp = oppValue > 0 && opportunityLead;

    if (hasRisk && hasOpp) {
      if (riskValue >= oppValue || riskScore >= 70) {
        return 'risk' as const;
      }
      return 'opportunity' as const;
    }
    if (hasRisk) return 'risk' as const;
    if (hasOpp) return 'opportunity' as const;
    return null;
  }, [topMoneyAtRisk, topOpportunity, moneyDeal, opportunityLead]);

  // Find the top action that isn't snoozed
  const topAction = useMemo(() => {
    return panels.priorityActions.find(a => !snoozedIds.has(a.id)) || null;
  }, [panels.priorityActions, snoozedIds]);

  // Fallback: highest opportunity if no urgent action
  const fallbackOpportunity = useMemo((): CommandCenterOpportunity | null => {
    if (topAction && topAction.scores.urgencyScore >= 20) return null;
    return panels.opportunities[0] || null;
  }, [topAction, panels.opportunities]);

  const isFallback = !topAction || topAction.scores.urgencyScore < 20;
  const displayAction = topAction;
  const displayOpportunity = isFallback ? fallbackOpportunity : null;

  // No items at all
  if (!displayAction && !displayOpportunity && !moneyDecision) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Recommended First Action</p>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nothing urgent detected. Focus on opportunities.</p>
        </div>
      </div>
    );
  }

  // Money-at-risk override (protect income)
  if (moneyDecision === 'risk' && moneyDeal && topMoneyAtRisk) {
    const oppValue = topOpportunity?.opportunityValue ?? 0;
    return (
      <div className="rounded-lg border border-urgent/20 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Recommended First Action</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-urgent/10 text-urgent border border-urgent/20">Protect Income</span>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-urgent shrink-0" />
            <p className="text-sm font-semibold leading-snug">Protect this income first</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {moneyDeal.title} — <span className="text-urgent font-medium">{formatCurrency(topMoneyAtRisk.personalCommissionAtRisk)} at risk</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{topMoneyAtRisk.reasonPrimary}</p>
          {oppValue > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1.5 italic">Higher money at risk than opportunity value ({formatCurrency(oppValue)})</p>
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="default"
            className="text-xs"
            onClick={() => onMoneyAction?.(topMoneyAtRisk, moneyDeal)}
          >
            <Shield className="h-3.5 w-3.5 mr-1" />
            View Risk Details
          </Button>
        </div>
      </div>
    );
  }

  // Opportunity override (create income)
  if (moneyDecision === 'opportunity' && opportunityLead && topOpportunity) {
    const riskValue = topMoneyAtRisk?.personalCommissionAtRisk ?? 0;
    return (
      <div className="rounded-lg border border-opportunity/20 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Recommended First Action</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-opportunity/10 text-opportunity border border-opportunity/20">Create Income</span>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-opportunity shrink-0" />
            <p className="text-sm font-semibold leading-snug">Create income next</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {opportunityLead.name} — <span className="text-opportunity font-medium">{formatCurrency(topOpportunity.opportunityValue)} opportunity</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{topOpportunity.reasonPrimary}</p>
          {riskValue > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1.5 italic">Higher opportunity value than money at risk ({formatCurrency(riskValue)})</p>
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="default"
            className="text-xs"
            onClick={() => onOpportunityAction?.(opportunityLead, topOpportunity)}
          >
            <Flame className="h-3.5 w-3.5 mr-1" />
            Start Action
          </Button>
        </div>
      </div>
    );
  }

  // Opportunity fallback mode
  if (displayOpportunity && !displayAction) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Recommended First Action</p>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-opportunity" />
          <p className="text-sm font-medium">Nothing urgent detected. Focus on opportunities.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Reach out to <span className="text-foreground font-medium">{displayOpportunity.lead.name}</span> — {displayOpportunity.topReason.toLowerCase()}.
        </p>
      </div>
    );
  }

  if (!displayAction) return null;

  const entityType = displayAction.isSuggested
    ? (displayAction.relatedDealId ? 'Deal' : 'Lead')
    : 'Task';

  const whyBullets = displayAction.scores.explanation.slice(0, 3);

  const timeSensitivity = displayAction.timeWindow;
  const timeSensitivityClass = timeSensitivity === 'Overdue'
    ? 'text-urgent'
    : timeSensitivity === 'Due now'
      ? 'text-warning'
      : 'text-muted-foreground';

  return (
    <div className="rounded-lg border border-primary/20 bg-card p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Recommended First Action</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{entityType}</span>
          <span className={`text-xs font-medium ${timeSensitivityClass}`}>
            <Clock className="inline h-3 w-3 mr-0.5" />
            {timeSensitivity}
          </span>
        </div>
      </div>

      {/* Main directive */}
      <div>
        <p className="text-sm font-semibold leading-snug">{displayAction.title}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {displayAction.reason}
          {displayAction.potentialValue && (
            <span className="text-opportunity font-medium ml-1">
              {formatCurrency(displayAction.potentialValue)} at stake
            </span>
          )}
        </p>
      </div>

      {/* Expandable "Why this is first" */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Why this is your top priority
      </button>
      {expanded && whyBullets.length > 0 && (
        <ul className="space-y-1 pl-1">
          {whyBullets.map((bullet, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="status-dot bg-primary mt-1 shrink-0" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="default"
          className="text-xs"
          onClick={() => {
            if (displayAction.relatedTaskId) {
              onComplete(displayAction.relatedTaskId);
            }
            onSnooze(displayAction.id); // surfaces next item
          }}
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          {displayAction.relatedTaskId ? 'Mark Handled' : 'Start Action'}
        </Button>

        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => setShowSnooze(!showSnooze)}
          >
            <Clock className="h-3.5 w-3.5 mr-1" />
            Snooze
          </Button>
          {showSnooze && (
            <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 min-w-[120px]">
              {SNOOZE_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  className="block w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors first:rounded-t-md last:rounded-b-md"
                  onClick={() => {
                    onSnooze(displayAction.id);
                    setShowSnooze(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
