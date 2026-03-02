import { useMemo } from 'react';
import { Calendar, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Deal } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';

interface DealCloseCountdownProps {
  deal: Deal;
  moneyResult: MoneyModelResult | null;
  onCreateTask: (title: string, dealId: string) => void;
  onOpenDeal: (deal: Deal) => void;
}

const MILESTONE_CONFIG = {
  inspection: {
    label: 'Inspection',
    states: {
      unknown:   { icon: '○', color: 'text-amber-500', task: 'Schedule inspection for {deal}' },
      scheduled: { icon: '◑', color: 'text-blue-500',  task: null },
      complete:  { icon: '●', color: 'text-green-500', task: null },
    }
  },
  financing: {
    label: 'Financing',
    states: {
      unknown:     { icon: '○', color: 'text-amber-500', task: 'Confirm financing status for {deal}' },
      preapproved: { icon: '◑', color: 'text-blue-500',  task: 'Confirm final loan approval for {deal}' },
      approved:    { icon: '●', color: 'text-green-500', task: null },
    }
  },
  appraisal: {
    label: 'Appraisal',
    states: {
      unknown:  { icon: '○', color: 'text-amber-500', task: 'Order appraisal for {deal}' },
      ordered:  { icon: '◑', color: 'text-blue-500',  task: 'Confirm appraisal completion for {deal}' },
      complete: { icon: '●', color: 'text-green-500', task: null },
    }
  },
} as const;

function getSuggestedAction(deal: Deal): { title: string; urgency: 'high' | 'medium' } | null {
  const ms = deal.milestoneStatus;
  if (!ms) return null;
  const daysLeft = Math.ceil((new Date(deal.closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (ms.financing === 'unknown') return { title: `Confirm financing status — ${daysLeft}d to close`, urgency: 'high' };
  if (ms.appraisal === 'unknown' && daysLeft <= 7) return { title: `Order appraisal immediately — ${daysLeft}d to close`, urgency: 'high' };
  if (ms.inspection === 'unknown') return { title: `Schedule inspection for ${deal.title}`, urgency: 'medium' };
  if (ms.financing === 'preapproved') return { title: `Confirm final loan approval for ${deal.title}`, urgency: 'medium' };
  return { title: `Check in on ${deal.title} — confirm all milestones on track`, urgency: 'medium' };
}

function formatCurrency(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(0)}`;
}

export function DealCloseCountdown({ deal, moneyResult, onCreateTask, onOpenDeal }: DealCloseCountdownProps) {
  const daysLeft = useMemo(() => {
    return Math.ceil((new Date(deal.closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }, [deal.closeDate]);

  const commission = moneyResult?.personalCommissionTotal ?? deal.personalCommissionTotal ?? deal.commission ?? 0;
  const suggestedAction = useMemo(() => getSuggestedAction(deal), [deal]);

  const urgencyConfig = useMemo(() => {
    if (daysLeft <= 3) return { border: 'border-red-500/40', bg: 'bg-red-500/5', text: 'text-red-500', label: 'CLOSING SOON' };
    if (daysLeft <= 7) return { border: 'border-amber-500/40', bg: 'bg-amber-500/5', text: 'text-amber-500', label: 'CLOSING SOON' };
    return { border: 'border-border', bg: 'bg-card', text: 'text-green-500', label: 'CLOSING SOON' };
  }, [daysLeft]);

  return (
    <div className={cn('rounded-lg border p-4 space-y-3', urgencyConfig.border, urgencyConfig.bg)}>
      {/* Label */}
      <p className={cn('text-[10px] uppercase tracking-widest font-medium', urgencyConfig.text)}>
        {urgencyConfig.label}
      </p>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{deal.title}</span>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('text-lg font-bold leading-tight', urgencyConfig.text)}>
            {daysLeft}d
          </p>
          {commission > 0 && (
            <p className="text-[10px] text-muted-foreground">{formatCurrency(commission)} commission</p>
          )}
        </div>
      </div>

      {/* Milestone checklist */}
      {deal.milestoneStatus && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Milestones</p>
          {(['inspection', 'financing', 'appraisal'] as const).map(key => {
            const val = deal.milestoneStatus?.[key] || 'unknown';
            const config = MILESTONE_CONFIG[key];
            const stateConfig = (config.states as any)[val] || config.states.unknown;

            return (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className={cn('text-base leading-none', stateConfig.color)}>{stateConfig.icon}</span>
                <span className="font-medium text-xs">{config.label}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{val.replace('_', ' ')}</span>
                {stateConfig.task && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px] gap-0.5 ml-auto"
                    onClick={() => onCreateTask(stateConfig.task.replace('{deal}', deal.title), deal.id)}
                  >
                    <Plus className="h-2.5 w-2.5" /> Task
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Risk flags */}
      {deal.riskFlags && deal.riskFlags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {deal.riskFlags.slice(0, 3).map((flag, i) => (
            <Badge key={i} variant="warning" className="text-[10px]">{flag}</Badge>
          ))}
        </div>
      )}

      {/* Suggested action */}
      {suggestedAction && (
        <div className={cn(
          'rounded-md border px-3 py-2 flex items-center justify-between gap-2',
          suggestedAction.urgency === 'high' ? 'border-red-500/30 bg-red-500/5' : 'border-border bg-muted/30'
        )}>
          <p className="text-xs">{suggestedAction.title}</p>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] shrink-0"
            onClick={() => onCreateTask(suggestedAction.title, deal.id)}
          >
            Create Task
          </Button>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          className="text-xs gap-1"
          onClick={() => onOpenDeal(deal)}
        >
          Open Deal Record
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
