import { useMemo, useState, useEffect } from 'react';
import { TrendingUp, Flame, Settings, ChevronRight, X, Check, Plus, Phone } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { PanelHelpTooltip } from '@/components/PanelHelpTooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CommissionDefaultsModal } from '@/components/CommissionDefaultsModal';
import { LogTouchModal } from '@/components/LogTouchModal';
import { ActivityTrail } from '@/components/ActivityTrail';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { Lead, Task } from '@/types';
import {
  computeOpportunityBatch,
  type OpportunityHeatResult,
  type UserCommissionDefaults,
  type OpportunityScoringWeights,
} from '@/lib/leadMoneyModel';
import type { RankChange } from '@/hooks/useRankChangeTracker';

interface Props {
  leads: Lead[];
  tasks: Task[];
  userId: string;
  onStartAction?: (lead: Lead, result: OpportunityHeatResult) => void;
  leadChanges?: Map<string, RankChange>;
  oppWeights?: OpportunityScoringWeights;
}

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

const HEAT_BADGE: Record<string, { label: string; className: string }> = {
  hot: { label: 'Hot', className: 'border-urgent/30 bg-urgent/10 text-urgent' },
  warm: { label: 'Warm', className: 'border-warning/30 bg-warning/10 text-warning' },
  watch: { label: 'Watch', className: 'border-border bg-muted/50 text-muted-foreground' },
};

const CONFIDENCE_STYLE: Record<string, string> = {
  HIGH: 'text-foreground',
  MEDIUM: 'text-muted-foreground',
  LOW: 'text-muted-foreground/50',
};

// ── Drawer ──────────────────────────────────────────────────────────

function OpportunityDrawer({ result, lead, onClose, onStartAction }: {
  result: OpportunityHeatResult;
  lead: Lead;
  onClose: () => void;
  onStartAction: (lead: Lead, result: OpportunityHeatResult) => void;
}) {
  const [showTouch, setShowTouch] = useState(false);
  const heat = HEAT_BADGE[result.heatLevel];

  return (
    <>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 md:inset-y-0 md:left-auto md:right-0 md:w-96 bg-card border-t md:border-l border-border z-50 flex flex-col max-h-[85vh] md:max-h-full rounded-t-2xl md:rounded-none animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-opportunity shrink-0" />
              <h3 className="text-sm font-bold leading-tight truncate">{lead.name}</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lead.source} · <Badge variant="outline" className={`text-[10px] ${heat.className}`}>{heat.label}</Badge>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0 ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Heat Score</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-lg font-bold text-opportunity cursor-help">{result.opportunityScore}</p>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
                    0–100 scale. Higher means stronger buying/selling signals. Based on engagement, lead temperature, and recency.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Est. Commission</p>
                <p className={`text-lg font-bold ${CONFIDENCE_STYLE[result.estimate.confidence]}`}>
                  {result.estimate.estimatedPersonalCommission > 0 ? formatCurrency(result.estimate.estimatedPersonalCommission) : '—'}
                </p>
              </div>
            </div>

            {/* Commission estimate breakdown */}
            {result.estimate.estimatedPersonalCommission > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estimate Breakdown</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Assumed Price</span>
                  <span className="font-mono">{result.estimate.inputsUsed.assumedPrice ? formatCurrency(result.estimate.inputsUsed.assumedPrice) : '—'}</span>
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-mono">{result.estimate.inputsUsed.assumedRate ? `${result.estimate.inputsUsed.assumedRate}%` : '—'}</span>
                  <span className="text-muted-foreground">Split</span>
                  <span className="font-mono">{result.estimate.inputsUsed.assumedSplit ? `${result.estimate.inputsUsed.assumedSplit}%` : '—'}</span>
                  <span className="text-muted-foreground">Confidence</span>
                  <Badge variant="outline" className={`text-[10px] w-fit ${
                    result.estimate.confidence === 'HIGH' ? 'border-opportunity/30 text-opportunity' :
                    result.estimate.confidence === 'MEDIUM' ? 'border-warning/30 text-warning' :
                    'border-muted-foreground/30 text-muted-foreground'
                  }`}>{result.estimate.confidence}</Badge>
                </div>
              </div>
            )}

            {/* Score breakdown */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Heat Signals</h4>
              <ul className="space-y-1.5">
                {result.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="status-dot bg-opportunity mt-1.5 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Warnings */}
            {result.estimate.warnings.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</h4>
                {result.estimate.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{w}</p>
                ))}
              </div>
            )}

            {/* Suggested action */}
            <div className="rounded-lg border border-border p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Suggested Next Action</p>
              <p className="text-sm font-medium">
                {lead.leadTemperature === 'hot' ? `Call ${lead.name} — hot lead` :
                  `Follow up with ${lead.name}`}
              </p>
            </div>

            {/* Activity Trail */}
            <ActivityTrail entityType="lead" entityId={lead.id} />
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="p-4 border-t border-border flex gap-2">
          <Button size="sm" variant="default" className="flex-1" onClick={() => onStartAction(lead, result)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
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
        entityType="lead"
        entityId={lead.id}
        entityTitle={lead.name}
      />
    </>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────

export function OpportunityHeatPanel({ leads, tasks, userId, onStartAction, leadChanges, oppWeights }: Props) {
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);
  const [drawerResult, setDrawerResult] = useState<OpportunityHeatResult | null>(null);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [userDefaults, setUserDefaults] = useState<UserCommissionDefaults | undefined>();
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('commission_defaults')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUserDefaults({
            typicalCommissionRate: data.default_commission_rate ? Number(data.default_commission_rate) : undefined,
            typicalSplitPct: data.default_split ? Number(data.default_split) : undefined,
            typicalReferralFeePct: data.default_referral_fee ? Number(data.default_referral_fee) : undefined,
            typicalPriceMid: (data as any).typical_price_mid ? Number((data as any).typical_price_mid) : undefined,
          });
        }
        setDefaultsLoaded(true);
      });
  }, [userId]);

  const results = useMemo(() => {
    if (!defaultsLoaded) return [];
    return computeOpportunityBatch(leads, tasks, userDefaults, new Date(), oppWeights).slice(0, 5);
  }, [leads, tasks, userDefaults, defaultsLoaded, oppWeights]);

  const leadMap = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads]);

  const allLowConfidence = results.length > 0 && results.every(r => r.estimate.confidence === 'LOW');
  const hasMissingPrice = allLowConfidence && !userDefaults?.typicalPriceMid;

  const handleStartAction = (lead: Lead, result: OpportunityHeatResult) => {
    onStartAction?.(lead, result);
    setDrawerResult(null);
    setDrawerLead(null);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="h-4 w-4 text-opportunity" />
        <h2 className="text-sm font-semibold">Opportunities Heating Up</h2>
        <PanelHelpTooltip text="Leads showing the strongest buying or selling signals. Scored by engagement, temperature, and recency of contact." />
        {results.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {results.length} lead{results.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">Leads showing strong buying or selling signals.</p>

      {/* CTA for missing typical price */}
      {hasMissingPrice && (
        <button
          onClick={() => setShowDefaultsModal(true)}
          className="flex items-center gap-1.5 text-[10px] text-primary mb-2 hover:text-primary/80 transition-colors"
        >
          <Settings className="h-3 w-3" />
          <span>Set typical price to estimate commission</span>
        </button>
      )}

      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No hot leads right now</p>
      ) : (
        <div className="space-y-2">
          {results.map(result => {
            const lead = leadMap.get(result.leadId);
            if (!lead) return null;
            const heat = HEAT_BADGE[result.heatLevel];

            return (
              <div
                key={result.leadId}
                className="flex items-start gap-3 p-2.5 rounded-md hover:bg-accent/50 transition-colors cursor-pointer group"
                onClick={() => { setDrawerResult(result); setDrawerLead(lead); }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium leading-tight truncate">{lead.name}</p>
                    {leadChanges?.get(result.leadId) && (
                      <span className="text-[10px] px-1 py-0 rounded bg-primary/10 text-primary">Changed</span>
                    )}
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${heat.className}`}>
                      {heat.label}
                    </Badge>
                    {result.estimate.estimatedPersonalCommission > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 ${CONFIDENCE_STYLE[result.estimate.confidence]}`}>
                        {result.estimate.confidence}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{lead.source || 'Unknown source'}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{result.reasonPrimary}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  {result.estimate.estimatedPersonalCommission > 0 ? (
                    <span className={`text-sm font-semibold ${result.estimate.confidence === 'LOW' ? 'text-muted-foreground/50' : 'text-opportunity'}`}>
                      {formatCurrency(result.estimate.estimatedPersonalCommission)}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground/50">—</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CommissionDefaultsModal open={showDefaultsModal} onClose={() => setShowDefaultsModal(false)} />

      {drawerResult && drawerLead && (
        <OpportunityDrawer
          result={drawerResult}
          lead={drawerLead}
          onClose={() => { setDrawerResult(null); setDrawerLead(null); }}
          onStartAction={handleStartAction}
        />
      )}
    </div>
  );
}
