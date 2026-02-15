import { useMemo, useState } from 'react';
import { DollarSign, Shield, ChevronRight, Settings, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CommissionDefaultsModal } from '@/components/CommissionDefaultsModal';
import type { Deal, DealParticipant } from '@/types';
import { computeMoneyModelBatch, type MoneyModelResult } from '@/lib/moneyModel';

interface Props {
  deals: Deal[];
  participants: DealParticipant[];
  userId: string;
  onSelect: (result: MoneyModelResult, deal: Deal) => void;
  onAddCommissionToDeals?: () => void;
}

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function daysUntilClose(closeDate: string): string {
  const days = Math.ceil((new Date(closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'today';
  return `${days}d`;
}

function riskBadgeProps(riskScore: number): { label: string; className: string } {
  if (riskScore >= 70) return { label: 'High Risk', className: 'border-urgent/30 bg-urgent/10 text-urgent' };
  if (riskScore >= 40) return { label: 'At Risk', className: 'border-warning/30 bg-warning/10 text-warning' };
  return { label: 'Watch', className: 'border-border bg-muted/50 text-muted-foreground' };
}

function confidenceBadge(confidence: string): string {
  if (confidence === 'high') return 'bg-muted/50 text-muted-foreground';
  if (confidence === 'medium') return 'bg-muted/50 text-muted-foreground';
  return 'bg-muted/30 text-muted-foreground/60';
}

export function MoneyAtRiskPanel({ deals, participants, userId, onSelect, onAddCommissionToDeals }: Props) {
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);
  const activeDeals = useMemo(() => deals.filter(d => d.stage !== 'closed'), [deals]);

  const results = useMemo(() => {
    const all = computeMoneyModelBatch(activeDeals, participants, userId);
    return all
      .filter(r => r.personalCommissionAtRisk > 0)
      .sort((a, b) => {
        const diff = b.personalCommissionAtRisk - a.personalCommissionAtRisk;
        if (diff !== 0) return diff;
        const rDiff = b.riskScore - a.riskScore;
        if (rDiff !== 0) return rDiff;
        const dealA = activeDeals.find(d => d.id === a.dealId);
        const dealB = activeDeals.find(d => d.id === b.dealId);
        return new Date(dealA?.closeDate || '').getTime() - new Date(dealB?.closeDate || '').getTime();
      })
      .slice(0, 5);
  }, [activeDeals, participants, userId]);

  const totalAtRisk = useMemo(() => results.reduce((s, r) => s + r.personalCommissionAtRisk, 0), [results]);

  const dealMap = useMemo(() => new Map(activeDeals.map(d => [d.id, d])), [activeDeals]);

  // Determine if we should show the empty intelligence state
  const allResults = useMemo(() => computeMoneyModelBatch(activeDeals, participants, userId), [activeDeals, participants, userId]);
  const showEmptyState = activeDeals.length === 0 || allResults.every(r => r.personalCommissionTotal === 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="h-4 w-4 text-urgent" />
        <h2 className="text-sm font-semibold">Money at Risk</h2>
        {!showEmptyState && totalAtRisk > 0 && (
          <span className="text-xs font-medium text-urgent ml-auto">
            {formatCurrency(totalAtRisk)} at risk
          </span>
        )}
      </div>

      {showEmptyState ? (
        <div className="flex flex-col items-center text-center py-6 px-4">
          <div className="mb-3 rounded-2xl bg-muted p-3">
            <Shield className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold mb-1">Income protection not active yet</h3>
          <p className="text-xs text-muted-foreground max-w-xs mb-4">
            Add your commission details to track income at risk and protect deals that matter most.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowDefaultsModal(true)}>
              <Settings className="h-3.5 w-3.5 mr-1" />
              Set Commission Defaults
            </Button>
            {activeDeals.length > 0 && onAddCommissionToDeals && (
              <Button size="sm" variant="outline" onClick={onAddCommissionToDeals}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Commission to Deals
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">Personal commission you could lose if deals stall or fail.</p>

          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No commission at risk right now</p>
          ) : (
            <div className="space-y-2">
              {results.map(result => {
                const deal = dealMap.get(result.dealId);
                if (!deal) return null;
                const risk = riskBadgeProps(result.riskScore);
                const stageLabel = deal.stage.replace('_', ' ');

                return (
                  <div
                    key={result.dealId}
                    className="flex items-start gap-3 p-2.5 rounded-md hover:bg-accent/50 transition-colors cursor-pointer group"
                    onClick={() => onSelect(result, deal)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium leading-tight truncate">{deal.title}</p>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${risk.className}`}>
                          {risk.label}
                        </Badge>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${confidenceBadge(result.confidence)}`}>
                          {result.confidence}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground capitalize">{stageLabel}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">closes in {daysUntilClose(deal.closeDate)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{result.reasonPrimary}</p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold text-urgent">{formatCurrency(result.personalCommissionAtRisk)}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <CommissionDefaultsModal open={showDefaultsModal} onClose={() => setShowDefaultsModal(false)} />
    </div>
  );
}
