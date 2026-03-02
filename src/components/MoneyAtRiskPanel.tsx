import { useMemo, useState, useEffect } from 'react';
import { DollarSign, Shield, ChevronRight, Settings, Plus, AlertTriangle, Bug, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { PanelHelpTooltip } from '@/components/PanelHelpTooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CommissionDefaultsModal } from '@/components/CommissionDefaultsModal';
import { MoneyModelDebugDrawer } from '@/components/MoneyModelDebugDrawer';
import { BulkBackfillModal } from '@/components/BulkBackfillModal';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Deal, DealParticipant } from '@/types';
import { computeMoneyModelBatch, type MoneyModelResult, type RiskScoringWeights } from '@/lib/moneyModel';
import type { RankChange } from '@/hooks/useRankChangeTracker';

interface Props {
  deals: Deal[];
  participants: DealParticipant[];
  refreshData?: () => Promise<void>;
  userId: string;
  onSelect: (result: MoneyModelResult, deal: Deal) => void;
  onOpenDeal?: (deal: Deal) => void;
  onAddCommissionToDeals?: () => void;
  dealChanges?: Map<string, RankChange>;
  riskWeights?: RiskScoringWeights;
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

type EmptyReason = 'no_deals' | 'no_defaults' | 'no_price' | 'no_participant';

export function MoneyAtRiskPanel({ deals, participants, userId, onSelect, onOpenDeal, onAddCommissionToDeals, refreshData, dealChanges, riskWeights }: Props) {
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);
  const [showDebugDrawer, setShowDebugDrawer] = useState(false);
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const [hasDefaults, setHasDefaults] = useState<boolean | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const showDevTools = import.meta.env.DEV || isAdmin;

  const activeDeals = useMemo(() => deals.filter(d => d.stage !== 'closed'), [deals]);

  // Check if user has commission defaults
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('commission_defaults')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => setHasDefaults(!!data));
  }, [userId]);

  const results = useMemo(() => {
    const all = computeMoneyModelBatch(activeDeals, participants, userId, new Date(), riskWeights);
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

  // Determine empty state reason
  const allResults = useMemo(() => computeMoneyModelBatch(activeDeals, participants, userId, new Date(), riskWeights), [activeDeals, participants, userId, riskWeights]);

  const emptyReason = useMemo((): EmptyReason | null => {
    if (activeDeals.length === 0) return 'no_deals';
    if (hasDefaults === false && allResults.every(r => r.personalCommissionTotal === 0)) return 'no_defaults';
    const dealsWithoutPrice = activeDeals.filter(d => !d.price || d.price <= 0);
    if (dealsWithoutPrice.length === activeDeals.length) return 'no_price';
    const dealsMissingParticipant = activeDeals.filter(d => !participants.some(p => p.dealId === d.id && p.userId === userId));
    if (dealsMissingParticipant.length === activeDeals.length) return 'no_participant';
    if (allResults.every(r => r.personalCommissionTotal === 0)) return 'no_defaults';
    return null;
  }, [activeDeals, participants, userId, hasDefaults, allResults]);

  // Count deals missing commission setup
  const dealsMissingSetup = useMemo(() => {
    return activeDeals.filter(d => {
      const hasParticipant = participants.some(p => p.dealId === d.id && p.userId === userId);
      const hasCommission = d.commission > 0 || (d.commissionRate && d.commissionRate > 0);
      return !hasParticipant || !hasCommission;
    });
  }, [activeDeals, participants, userId]);

  const emptyStateContent = useMemo(() => {
    switch (emptyReason) {
      case 'no_deals':
        return {
          title: 'Income protection not active yet',
          message: 'Add deals to your pipeline to start tracking income at risk.',
          primaryLabel: null,
          primaryAction: null,
        };
      case 'no_defaults':
        return {
          title: 'Income protection not active yet',
          message: 'Set your commission defaults so Deal Pilot can calculate your income at risk automatically.',
          primaryLabel: 'Set Commission Defaults',
          primaryAction: () => setShowDefaultsModal(true),
        };
      case 'no_price':
        return {
          title: 'Deal prices needed',
          message: 'Add a price to your deals so Deal Pilot can compute commission at risk.',
          primaryLabel: 'Update Deals',
          primaryAction: onAddCommissionToDeals || null,
        };
      case 'no_participant':
        return {
          title: 'Add yourself to deals',
          message: 'Open each deal and tap "Add me" to track your personal commission.',
          primaryLabel: 'Go to Pipeline',
          primaryAction: onAddCommissionToDeals || null,
        };
      default:
        return null;
    }
  }, [emptyReason, onAddCommissionToDeals]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="h-4 w-4 text-urgent" />
        <h2 className="text-sm font-semibold">Income at Risk</h2>
        <PanelHelpTooltip text="Your commission dollars that could be lost if deals stall. Based on inactivity, missed milestones, and closing timelines." />
        {showDevTools && (
          <button
            onClick={() => setShowDebugDrawer(true)}
            className="p-1 rounded hover:bg-accent transition-colors ml-1"
            title="Money Model Diagnostics"
          >
            <Bug className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
        {!emptyStateContent && totalAtRisk > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs font-medium text-urgent ml-auto cursor-help">
                {formatCurrency(totalAtRisk)} at risk
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
              Total commission dollars that could be lost if at-risk deals stall or fall through. Based on inactivity, missed milestones, and closing timelines.
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {emptyStateContent ? (
        <div className="flex flex-col items-center text-center py-6 px-4">
          <div className="mb-3 rounded-2xl bg-muted p-3">
            <Shield className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold mb-1">{emptyStateContent.title}</h3>
          <p className="text-xs text-muted-foreground max-w-xs mb-4">
            {emptyStateContent.message}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {emptyStateContent.primaryLabel && emptyStateContent.primaryAction && (
              <Button size="sm" onClick={emptyStateContent.primaryAction}>
                <Settings className="h-3.5 w-3.5 mr-1" />
                {emptyStateContent.primaryLabel}
              </Button>
            )}
            {emptyReason !== 'no_deals' && hasDefaults === false && (
              <Button size="sm" variant="outline" onClick={() => setShowDefaultsModal(true)}>
                <Settings className="h-3.5 w-3.5 mr-1" />
                Set Defaults
              </Button>
            )}
            {dealsMissingSetup.length > 0 && hasDefaults && (
              <Button size="sm" variant="outline" onClick={() => setShowBackfillModal(true)}>
                <Wrench className="h-3.5 w-3.5 mr-1" />
                Apply defaults to {dealsMissingSetup.length} deals
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">Personal commission you could lose if deals stall or fail.</p>

          {/* Missing setup counter + backfill button */}
          {dealsMissingSetup.length > 0 && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {onAddCommissionToDeals && (
                <button
                  onClick={onAddCommissionToDeals}
                  className="flex items-center gap-1.5 text-[10px] text-warning hover:text-foreground transition-colors"
                >
                  <AlertTriangle className="h-3 w-3" />
                  <span>{dealsMissingSetup.length} deal{dealsMissingSetup.length !== 1 ? 's' : ''} missing commission setup</span>
                </button>
              )}
              {hasDefaults && (
                <button
                  onClick={() => setShowBackfillModal(true)}
                  className="flex items-center gap-1.5 text-[10px] text-primary hover:text-primary/80 transition-colors"
                >
                  <Wrench className="h-3 w-3" />
                  <span>Apply defaults</span>
                </button>
              )}
            </div>
          )}

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
                        <p
                          className={cn("text-sm font-medium leading-tight truncate", onOpenDeal && "hover:text-primary hover:underline underline-offset-2")}
                          onClick={(e) => { if (onOpenDeal) { e.stopPropagation(); onOpenDeal(deal); } }}
                        >{deal.title}</p>
                        {dealChanges?.get(result.dealId) && (
                          <span className="text-[10px] px-1 py-0 rounded bg-primary/10 text-primary">Changed</span>
                        )}
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

      <MoneyModelDebugDrawer
        open={showDebugDrawer}
        onClose={() => setShowDebugDrawer(false)}
        deals={deals}
        participants={participants}
        userId={userId}
      />

      <BulkBackfillModal
        open={showBackfillModal}
        onClose={() => setShowBackfillModal(false)}
        eligibleCount={dealsMissingSetup.length}
        onSuccess={() => { refreshData?.(); }}
      />
    </div>
  );
}
