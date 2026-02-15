import { useMemo } from 'react';
import { ShieldCheck, AlertTriangle, Clock, FileWarning, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { QuickActionBar } from '@/components/QuickActionBar';
import type { Deal, Task } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';

interface Threat {
  id: string;
  title: string;
  reason: string;
  severity: 'high' | 'medium' | 'low';
  value: number;
  dealId: string;
  action: string;
}

interface Props {
  deals: Deal[];
  tasks: Task[];
  moneyResults: MoneyModelResult[];
  totalMoneyAtRisk: number;
  userId?: string;
  onAction?: (threat: Threat) => void;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

export function IncomeProtectionShield({ deals, tasks, moneyResults, totalMoneyAtRisk, userId, onAction }: Props) {
  const threats = useMemo((): Threat[] => {
    const result: Threat[] = [];
    const now = new Date();

    for (const r of moneyResults) {
      if (r.personalCommissionAtRisk <= 0) continue;
      const deal = deals.find(d => d.id === r.dealId);
      if (!deal || deal.stage === 'closed') continue;

      const reasons: string[] = [];
      let action = 'Review deal status';
      let severity: Threat['severity'] = 'low';

      if (r.riskScore >= 70) severity = 'high';
      else if (r.riskScore >= 40) severity = 'medium';

      // Financing uncertainty
      if (deal.milestoneStatus?.financing === 'unknown') {
        reasons.push('Financing status unknown');
        action = 'Confirm financing status';
      }
      // Inspection issues
      if (deal.milestoneStatus?.inspection === 'unknown') {
        reasons.push('Inspection not scheduled');
        action = 'Schedule inspection';
      }
      // Inactivity
      const lastTouch = deal.lastTouchedAt ? new Date(deal.lastTouchedAt) : null;
      if (!lastTouch || (now.getTime() - lastTouch.getTime()) > 7 * 24 * 60 * 60 * 1000) {
        reasons.push('No recent activity');
        action = 'Log touch or follow up';
      }
      // Timeline compression
      const daysToClose = (new Date(deal.closeDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysToClose < 14 && daysToClose > 0) {
        reasons.push(`Closing in ${Math.round(daysToClose)} days`);
        action = 'Verify closing timeline';
      }
      // Overdue tasks
      const dealOverdue = tasks.filter(t => t.relatedDealId === deal.id && !t.completedAt && new Date(t.dueAt) < now);
      if (dealOverdue.length > 0) {
        reasons.push(`${dealOverdue.length} overdue task${dealOverdue.length > 1 ? 's' : ''}`);
        action = 'Clear overdue tasks';
      }

      if (reasons.length > 0) {
        result.push({
          id: r.dealId,
          title: deal.title,
          reason: reasons.join(' · '),
          severity,
          value: r.personalCommissionAtRisk,
          dealId: deal.id,
          action,
        });
      }
    }

    return result.sort((a, b) => b.value - a.value).slice(0, 5);
  }, [deals, tasks, moneyResults]);

  const shieldStatus = useMemo(() => {
    if (threats.length === 0) return { label: 'Protected', className: 'bg-opportunity/10 text-opportunity border-opportunity/20' };
    const highCount = threats.filter(t => t.severity === 'high').length;
    if (highCount >= 2) return { label: 'Exposed', className: 'bg-urgent/10 text-urgent border-urgent/20' };
    if (highCount >= 1) return { label: 'Vulnerable', className: 'bg-warning/10 text-warning border-warning/20' };
    return { label: 'Watch', className: 'bg-muted text-muted-foreground border-border' };
  }, [threats]);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Income Shield</p>
        </div>
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full border', shieldStatus.className)}>{shieldStatus.label}</span>
      </div>

      {totalMoneyAtRisk > 0 && (
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
          <span className="text-sm font-medium">{formatCurrency(totalMoneyAtRisk)} total income at risk</span>
        </div>
      )}

      {threats.length === 0 ? (
        <p className="text-sm text-muted-foreground">All projected income is currently secured. No active threats.</p>
      ) : (
        <div className="space-y-2">
          {threats.map(threat => (
            <div key={threat.id} className="flex items-start gap-3 p-2.5 rounded-md border border-border bg-background/50">
              <FileWarning className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', threat.severity === 'high' ? 'text-urgent' : threat.severity === 'medium' ? 'text-warning' : 'text-muted-foreground')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium leading-snug truncate">{threat.title}</p>
                  <span className="text-xs font-medium text-urgent">{formatCurrency(threat.value)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{threat.reason}</p>
                {userId && (
                  <div className="mt-1">
                    <QuickActionBar entityType="deal" entityId={threat.dealId} entityTitle={threat.title} userId={userId} compact />
                  </div>
                )}
              </div>
              <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={() => onAction?.(threat)}>
                <Play className="h-3 w-3 mr-1" /> {threat.action.split(' ').slice(0, 2).join(' ')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
