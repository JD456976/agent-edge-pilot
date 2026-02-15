import { useState } from 'react';
import { X, DollarSign, Shield, AlertTriangle, Check, TrendingUp, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Deal } from '@/types';
import { suggestAction, type MoneyModelResult } from '@/lib/moneyModel';
import { LogTouchModal } from '@/components/LogTouchModal';
import { ActivityTrail } from '@/components/ActivityTrail';

interface Props {
  result: MoneyModelResult | null;
  deal: Deal | null;
  onClose: () => void;
  onStartAction: (deal: Deal, result: MoneyModelResult) => void;
}

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

function RiskBar({ label, value, maxValue = 100 }: { label: string; value: number; maxValue?: number }) {
  const pct = Math.min(100, (value / maxValue) * 100);
  const color = value >= 70 ? 'bg-urgent' : value >= 40 ? 'bg-warning' : 'bg-muted-foreground';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium w-10 text-right">{value}</span>
    </div>
  );
}

export function MoneyRiskDrawer({ result, deal, onClose, onStartAction }: Props) {
  const [showTouch, setShowTouch] = useState(false);

  if (!result || !deal) return null;

  const suggested = suggestAction(result, deal);
  const stageLabel = deal.stage.replace('_', ' ');

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-x-0 bottom-0 md:inset-y-0 md:left-auto md:right-0 md:w-96 bg-card border-t md:border-l border-border z-50 flex flex-col max-h-[85vh] md:max-h-full rounded-t-2xl md:rounded-none animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-urgent shrink-0" />
              <h3 className="text-sm font-bold leading-tight">Money Risk Breakdown</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{deal.title} · <span className="capitalize">{stageLabel}</span></p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0 ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Commission at Risk</p>
              <p className="text-lg font-bold text-urgent">{formatCurrency(result.personalCommissionAtRisk)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Expected Commission</p>
              <p className="text-lg font-bold">{formatCurrency(result.expectedPersonalCommission)}</p>
            </div>
          </div>

          {/* Detail rows */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score Breakdown</h4>
            <RiskBar label="Risk Score" value={result.riskScore} />
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0">Stage Probability</span>
              <span className="text-xs font-medium">{formatPct(result.stageProbability)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0">Total Commission</span>
              <span className="text-xs font-medium">{formatCurrency(result.personalCommissionTotal)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0">Confidence</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                result.confidence === 'high' ? 'bg-muted text-foreground/80' :
                result.confidence === 'medium' ? 'bg-muted/50 text-muted-foreground' :
                'bg-muted/30 text-muted-foreground/60'
              }`}>{result.confidence}</span>
            </div>
          </div>

          {/* Split warning */}
          {result.splitWarning && (
            <div className="flex items-start gap-2 text-xs text-warning border-l-2 border-warning/50 pl-3">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Participant splits total exceeds 100%. Confidence degraded.</span>
            </div>
          )}

          {/* Triggered risk components */}
          {result.reasonCodes.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risk Factors</h4>
              <ul className="space-y-1.5">
                {result.reasonCodes.map((code, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="status-dot bg-urgent mt-1.5 shrink-0" />
                    <span className="text-xs">{formatReasonCode(code)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested next action */}
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Suggested Next Action</p>
            <p className="text-sm font-medium">{suggested.title}</p>
          </div>

          {/* Activity Trail */}
          <ActivityTrail entityType="deal" entityId={deal.id} />
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-border flex gap-2">
          <Button size="sm" variant="default" className="flex-1" onClick={() => onStartAction(deal, result)}>
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            Start Action
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowTouch(true)}>
            <Phone className="h-3.5 w-3.5 mr-1" />
            Log Touch
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <LogTouchModal
        open={showTouch}
        onClose={() => setShowTouch(false)}
        entityType="deal"
        entityId={deal.id}
        entityTitle={deal.title}
      />
    </>
  );
}

function formatReasonCode(code: string): string {
  const labels: Record<string, string> = {
    no_participant: 'No personal commission assigned',
    split_zero: 'Split is 0% — no income from this deal',
    split_over_100: 'Total splits exceed 100%',
    no_activity_3d: 'No deal activity in 3+ days',
    no_activity_7d: 'No deal activity in 7+ days',
    close_7d: 'Closing within 7 days',
    close_3d: 'Closing within 3 days',
    inspection_unresolved: 'Inspection pending or unresolved',
    financing_unresolved: 'Financing not yet approved',
    appraisal_unknown: 'Appraisal status unknown',
    drift_conflict: 'Drift or conflict detected',
    missing_timestamps: 'Missing activity timestamps',
    missing_commission_details: 'Commission details incomplete',
    missing_milestones: 'Milestone data unavailable',
    stage_unknown: 'Deal stage not recognized',
  };
  return labels[code] || code;
}
