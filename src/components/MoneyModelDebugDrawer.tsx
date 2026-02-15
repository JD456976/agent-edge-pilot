import { useMemo, useState } from 'react';
import { X, Bug, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Deal, DealParticipant } from '@/types';
import { computeMoneyModelBatch, type MoneyModelResult } from '@/lib/moneyModel';
import { resolvePersonalCommission } from '@/lib/commissionResolver';

interface Props {
  open: boolean;
  onClose: () => void;
  deals: Deal[];
  participants: DealParticipant[];
  userId: string;
}

function formatCurrency(n: number) {
  return `$${n.toLocaleString()}`;
}

type ExclusionReason =
  | 'missing_price'
  | 'missing_commission'
  | 'missing_participant'
  | 'split_zero'
  | 'split_over_100'
  | 'stage_unmapped'
  | 'clamped_zero';

function getExclusionReasons(
  deal: Deal,
  result: MoneyModelResult,
  participants: DealParticipant[],
  userId: string,
): ExclusionReason[] {
  const reasons: ExclusionReason[] = [];
  if (!deal.price || deal.price <= 0) reasons.push('missing_price');
  if (!deal.commission && !deal.commissionRate) reasons.push('missing_commission');
  const hasP = participants.some(p => p.dealId === deal.id && p.userId === userId);
  if (!hasP) reasons.push('missing_participant');
  if (hasP) {
    const myP = participants.find(p => p.dealId === deal.id && p.userId === userId);
    if (myP && (myP.splitPercent ?? 0) <= 0 && !myP.commissionOverride) reasons.push('split_zero');
  }
  if (result.splitWarning) reasons.push('split_over_100');
  if (result.reasonCodes.includes('stage_unknown')) reasons.push('stage_unmapped');
  if (result.personalCommissionTotal === 0 && reasons.length === 0) reasons.push('clamped_zero');
  return reasons;
}

const REASON_LABELS: Record<ExclusionReason, string> = {
  missing_price: 'Missing price',
  missing_commission: 'Missing commission type/rate',
  missing_participant: 'No participant entry',
  split_zero: 'Split is 0%',
  split_over_100: 'Splits > 100%',
  stage_unmapped: 'Stage unmapped',
  clamped_zero: 'Clamped to $0',
};

function DealDiagnosticRow({ deal, result, participants, userId }: {
  deal: Deal; result: MoneyModelResult; participants: DealParticipant[]; userId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const included = result.personalCommissionAtRisk > 0;
  const exclusionReasons = included ? [] : getExclusionReasons(deal, result, participants, userId);
  const resolution = resolvePersonalCommission(deal, participants, userId);

  const myP = participants.find(p => p.dealId === deal.id && p.userId === userId);

  return (
    <div className="border border-border rounded-md">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-accent/30 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{deal.title}</p>
        </div>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${included ? 'border-opportunity/30 bg-opportunity/10 text-opportunity' : 'border-muted-foreground/30 bg-muted/50 text-muted-foreground'}`}>
          {included ? 'Included' : 'Excluded'}
        </Badge>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Commission Total</span>
              <p className="font-medium">{formatCurrency(result.personalCommissionTotal)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Expected</span>
              <p className="font-medium">{formatCurrency(result.expectedPersonalCommission)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Risk Score</span>
              <p className="font-medium">{result.riskScore}</p>
            </div>
            <div>
              <span className="text-muted-foreground">At Risk</span>
              <p className="font-medium text-urgent">{formatCurrency(result.personalCommissionAtRisk)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Confidence</span>
              <Badge variant="outline" className={`text-[10px] mt-0.5 ${
                result.confidence === 'high' ? 'border-opportunity/30 text-opportunity' :
                result.confidence === 'medium' ? 'border-warning/30 text-warning' :
                'border-muted-foreground/30 text-muted-foreground'
              }`}>{result.confidence.toUpperCase()}</Badge>
            </div>
          </div>

          {/* Exclusion reasons */}
          {exclusionReasons.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Exclusion Reasons</p>
              <div className="flex flex-wrap gap-1">
                {exclusionReasons.map(r => (
                  <Badge key={r} variant="outline" className="text-[10px] border-urgent/30 bg-urgent/5 text-urgent">
                    {REASON_LABELS[r]}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Inputs */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Inputs (Read-only)</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Price</span>
              <span className="font-mono">{deal.price ? formatCurrency(deal.price) : '—'}</span>
              <span className="text-muted-foreground">Commission Type</span>
              <span className="font-mono">{resolution.details.commissionType}</span>
              <span className="text-muted-foreground">Rate / Amount</span>
              <span className="font-mono">
                {resolution.details.commissionRate ? `${resolution.details.commissionRate}%` :
                  resolution.details.flatAmount ? formatCurrency(resolution.details.flatAmount) : '—'}
              </span>
              <span className="text-muted-foreground">User Split %</span>
              <span className="font-mono">{myP ? `${myP.splitPercent}%` : '—'}</span>
              <span className="text-muted-foreground">Referral Out %</span>
              <span className="font-mono">{resolution.details.referralOutPct ? `${resolution.details.referralOutPct}%` : '—'}</span>
              <span className="text-muted-foreground">Referral In %</span>
              <span className="font-mono">{resolution.details.referralInPct ? `${resolution.details.referralInPct}%` : '—'}</span>
              <span className="text-muted-foreground">Override</span>
              <span className="font-mono">{resolution.details.flatOverride ? formatCurrency(resolution.details.flatOverride) : '—'}</span>
              <span className="text-muted-foreground">Stage</span>
              <span className="font-mono capitalize">{deal.stage.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MoneyModelDebugDrawer({ open, onClose, deals, participants, userId }: Props) {
  const [copied, setCopied] = useState(false);

  const activeDeals = useMemo(() => deals.filter(d => d.stage !== 'closed'), [deals]);
  const sortedDeals = useMemo(() =>
    [...activeDeals].sort((a, b) => new Date(b.lastTouchedAt || b.createdAt || '').getTime() - new Date(a.lastTouchedAt || a.createdAt || '').getTime()).slice(0, 25),
    [activeDeals]
  );
  const results = useMemo(() => computeMoneyModelBatch(sortedDeals, participants, userId), [sortedDeals, participants, userId]);
  const resultMap = useMemo(() => new Map(results.map(r => [r.dealId, r])), [results]);

  const handleCopy = () => {
    const diagnostics = sortedDeals.map(deal => {
      const r = resultMap.get(deal.id);
      const res = resolvePersonalCommission(deal, participants, userId);
      return {
        title: deal.title,
        dealId: deal.id,
        included: (r?.personalCommissionAtRisk ?? 0) > 0,
        personalCommissionTotal: r?.personalCommissionTotal ?? 0,
        expectedPersonalCommission: r?.expectedPersonalCommission ?? 0,
        riskScore: r?.riskScore ?? 0,
        personalCommissionAtRisk: r?.personalCommissionAtRisk ?? 0,
        confidence: r?.confidence ?? 'low',
        details: res.details,
        warnings: res.warnings,
      };
    });
    navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-bold">Money Model Diagnostics</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Why deals are included or excluded from Money at Risk.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0 ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {sortedDeals.map(deal => {
              const result = resultMap.get(deal.id);
              if (!result) return null;
              return (
                <DealDiagnosticRow
                  key={deal.id}
                  deal={deal}
                  result={result}
                  participants={participants}
                  userId={userId}
                />
              );
            })}
            {sortedDeals.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No active deals to diagnose.</p>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <Button size="sm" variant="outline" className="w-full" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
            {copied ? 'Copied' : 'Copy diagnostics'}
          </Button>
        </div>
      </div>
    </>
  );
}
