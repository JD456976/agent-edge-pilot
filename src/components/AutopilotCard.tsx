import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Clock, Check, Shield, Flame, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CommandCenterPanels, CommandCenterAction, Deal, Lead } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import type { StabilityResult } from '@/lib/stabilityModel';

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
  overdueTasksCount?: number;
  dueSoonCount?: number;
  onStabilityAction?: () => void;
  onCreateTask?: (title: string, dealId?: string, leadId?: string) => void;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const SNOOZE_OPTIONS = [
  { label: '1 hour', ms: 3600000 },
  { label: '4 hours', ms: 14400000 },
  { label: 'Tomorrow', ms: 86400000 },
] as const;

type AutopilotMode = 'protect' | 'create' | 'stability';

export function AutopilotCard({
  panels, onComplete, snoozedIds, onSnooze,
  topMoneyAtRisk, deals, onMoneyAction,
  topOpportunity, leads, onOpportunityAction,
  stabilityResult, overdueTasksCount = 0, dueSoonCount = 0,
  onStabilityAction, onCreateTask,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);

  const moneyDeal = useMemo(() => {
    if (!topMoneyAtRisk || !deals) return null;
    return deals.find(d => d.id === topMoneyAtRisk.dealId) || null;
  }, [topMoneyAtRisk, deals]);

  const opportunityLead = useMemo(() => {
    if (!topOpportunity || !leads) return null;
    return leads.find(l => l.id === topOpportunity.leadId) || null;
  }, [topOpportunity, leads]);

  // Autopilot decision logic
  const decision = useMemo((): { mode: AutopilotMode; id: string } | null => {
    const riskValue = topMoneyAtRisk?.personalCommissionAtRisk ?? 0;
    const riskScore = topMoneyAtRisk?.riskScore ?? 0;
    const oppValue = topOpportunity?.opportunityValue ?? 0;
    const hasRisk = riskValue > 0 && moneyDeal;
    const hasOpp = oppValue > 0 && opportunityLead;
    const needsStability = stabilityResult?.band === 'Needs Attention' || (stabilityResult && stabilityResult.score < 55);
    const stabilityUrgent = needsStability && (overdueTasksCount >= 5 || dueSoonCount >= 3);

    // Priority 1: Stability crisis
    if (stabilityUrgent) return { mode: 'stability', id: 'stability' };

    // Priority 2: Protect vs Create
    if (hasRisk && hasOpp) {
      if (riskValue >= oppValue || riskScore >= 70) return { mode: 'protect', id: topMoneyAtRisk!.dealId };
      return { mode: 'create', id: topOpportunity!.leadId };
    }
    if (hasRisk) return { mode: 'protect', id: topMoneyAtRisk!.dealId };
    if (hasOpp) return { mode: 'create', id: topOpportunity!.leadId };

    // Fallback: stability if not great
    if (needsStability) return { mode: 'stability', id: 'stability' };

    return null;
  }, [topMoneyAtRisk, topOpportunity, moneyDeal, opportunityLead, stabilityResult, overdueTasksCount, dueSoonCount]);

  // Fallback action from priority actions
  const topAction = useMemo(() => {
    return panels.priorityActions.find(a => !snoozedIds.has(a.id)) || null;
  }, [panels.priorityActions, snoozedIds]);

  if (!decision && !topAction) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Autopilot</p>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nothing urgent detected. Operations stable.</p>
        </div>
      </div>
    );
  }

  // ── Stability mode ─────────────────────────────────────────────────
  if (decision?.mode === 'stability' && stabilityResult) {
    const actionTitle = stabilityResult.suggestedAction?.title || 'Clear urgent backlog (top 3 overdue)';
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Autopilot</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Restore Stability</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm font-semibold leading-snug">Restore control first</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Stability score: {stabilityResult.score} — {stabilityResult.topReasons[0] || 'Multiple factors reducing stability'}
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="default" className="text-xs" onClick={() => {
            onCreateTask?.(actionTitle);
            onStabilityAction?.();
          }}>
            <Check className="h-3.5 w-3.5 mr-1" />
            Start Action
          </Button>
          <SnoozeButton id="stability" showSnooze={showSnooze} setShowSnooze={setShowSnooze} onSnooze={onSnooze} />
        </div>
      </div>
    );
  }

  // ── Protect mode ───────────────────────────────────────────────────
  if (decision?.mode === 'protect' && moneyDeal && topMoneyAtRisk) {
    const oppValue = topOpportunity?.opportunityValue ?? 0;
    return (
      <div className="rounded-lg border border-urgent/20 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Autopilot</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-urgent/10 text-urgent border border-urgent/20">Protect Income</span>
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
            <p className="text-[10px] text-muted-foreground mt-1.5 italic">Higher risk than opportunity value ({formatCurrency(oppValue)})</p>
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="default" className="text-xs" onClick={() => {
            onCreateTask?.(`Resolve the highest-risk blocker on ${moneyDeal.title}`, moneyDeal.id);
            onMoneyAction?.(topMoneyAtRisk, moneyDeal);
          }}>
            <Shield className="h-3.5 w-3.5 mr-1" />
            Start Action
          </Button>
          <SnoozeButton id={decision.id} showSnooze={showSnooze} setShowSnooze={setShowSnooze} onSnooze={onSnooze} />
        </div>
      </div>
    );
  }

  // ── Create mode ────────────────────────────────────────────────────
  if (decision?.mode === 'create' && opportunityLead && topOpportunity) {
    const riskValue = topMoneyAtRisk?.personalCommissionAtRisk ?? 0;
    return (
      <div className="rounded-lg border border-opportunity/20 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Autopilot</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-opportunity/10 text-opportunity border border-opportunity/20">Create Income</span>
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
          <Button size="sm" variant="default" className="text-xs" onClick={() => {
            onCreateTask?.(`Contact ${opportunityLead.name} now (hot lead)`, undefined, opportunityLead.id);
            onOpportunityAction?.(opportunityLead, topOpportunity);
          }}>
            <Flame className="h-3.5 w-3.5 mr-1" />
            Start Action
          </Button>
          <SnoozeButton id={decision.id} showSnooze={showSnooze} setShowSnooze={setShowSnooze} onSnooze={onSnooze} />
        </div>
      </div>
    );
  }

  // ── Fallback: regular priority action ──────────────────────────────
  if (!topAction) return null;

  const entityType = topAction.isSuggested ? (topAction.relatedDealId ? 'Deal' : 'Lead') : 'Task';
  const whyBullets = topAction.scores.explanation.slice(0, 3);
  const timeSensitivity = topAction.timeWindow;
  const timeSensitivityClass = timeSensitivity === 'Overdue' ? 'text-urgent' : timeSensitivity === 'Due now' ? 'text-warning' : 'text-muted-foreground';

  return (
    <div className="rounded-lg border border-primary/20 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Autopilot</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{entityType}</span>
          <span className={`text-xs font-medium ${timeSensitivityClass}`}>
            <Clock className="inline h-3 w-3 mr-0.5" />
            {timeSensitivity}
          </span>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold leading-snug">{topAction.title}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {topAction.reason}
          {topAction.potentialValue && (
            <span className="text-opportunity font-medium ml-1">{formatCurrency(topAction.potentialValue)} at stake</span>
          )}
        </p>
      </div>

      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
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

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="default" className="text-xs" onClick={() => {
          if (topAction.relatedTaskId) onComplete(topAction.relatedTaskId);
          onSnooze(topAction.id);
        }}>
          <Check className="h-3.5 w-3.5 mr-1" />
          {topAction.relatedTaskId ? 'Mark Handled' : 'Start Action'}
        </Button>
        <SnoozeButton id={topAction.id} showSnooze={showSnooze} setShowSnooze={setShowSnooze} onSnooze={onSnooze} />
      </div>
    </div>
  );
}

function SnoozeButton({ id, showSnooze, setShowSnooze, onSnooze }: {
  id: string; showSnooze: boolean; setShowSnooze: (v: boolean) => void; onSnooze: (id: string) => void;
}) {
  return (
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
              onClick={() => { onSnooze(id); setShowSnooze(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
