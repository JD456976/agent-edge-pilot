import { useMemo, useState } from 'react';
import { DollarSign, ChevronRight, X, TrendingUp, TrendingDown, Minus, AlertTriangle, Plus, Shield, Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Deal, DealParticipant } from '@/types';
import { computeForecastBatch, type ForecastSummary, type ForecastDealResult } from '@/lib/forecastModel';
import type { MoneyModelResult } from '@/lib/moneyModel';
import { cn } from '@/lib/utils';

interface Props {
  deals: Deal[];
  participants: DealParticipant[];
  userId: string;
  moneyResults: MoneyModelResult[];
  typicalDealValue?: number;
  onCreateTask: (title: string, dealId: string) => void;
  onOpenMoneyAtRisk?: () => void;
  onOpenOpportunities?: () => void;
}

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

type Trajectory = 'up' | 'stable' | 'down';

function computeTrajectory(forecast: ForecastSummary): Trajectory {
  // Compare 7-day expected vs 30-day run rate
  if (forecast.next7 === 0 && forecast.next30 === 0) return 'stable';
  const weeklyRunRate = forecast.next30 / 4;
  if (forecast.next7 > weeklyRunRate * 1.2) return 'up';
  if (forecast.next7 < weeklyRunRate * 0.6) return 'down';
  return 'stable';
}

const TRAJECTORY_CONFIG: Record<Trajectory, { icon: typeof TrendingUp; label: string; className: string }> = {
  up: { icon: TrendingUp, label: 'Trending Up', className: 'text-opportunity' },
  stable: { icon: Minus, label: 'Stable', className: 'text-muted-foreground' },
  down: { icon: TrendingDown, label: 'Trending Down', className: 'text-urgent' },
};

const CONFIDENCE_STYLE: Record<string, string> = {
  HIGH: 'border-opportunity/30 text-opportunity',
  MEDIUM: 'border-warning/30 text-warning',
  LOW: 'border-muted-foreground/30 text-muted-foreground',
};

type DealGroup = 'likely' | 'at_risk' | 'long_shot';

function groupDeal(deal: ForecastDealResult): DealGroup {
  if (deal.stageProbability >= 0.6) return 'likely';
  if (deal.stageProbability >= 0.3) return 'at_risk';
  return 'long_shot';
}

const GROUP_LABELS: Record<DealGroup, string> = {
  likely: 'Likely Income',
  at_risk: 'At Risk Income',
  long_shot: 'Long-Shot Income',
};

function ForecastDrawerV2({ forecast, onClose, onCreateTask }: {
  forecast: ForecastSummary;
  onClose: () => void;
  onCreateTask: (title: string, dealId: string) => void;
}) {
  const groups = useMemo(() => {
    const grouped: Record<DealGroup, ForecastDealResult[]> = { likely: [], at_risk: [], long_shot: [] };
    forecast.topContributors.forEach(deal => {
      grouped[groupDeal(deal)].push(deal);
    });
    // Sort each group by expected commission descending
    Object.values(grouped).forEach(arr => arr.sort((a, b) => b.expectedPersonalCommission - a.expectedPersonalCommission));
    return grouped;
  }, [forecast]);

  return (
    <>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 md:inset-y-0 md:left-auto md:right-0 md:w-96 bg-card border-t md:border-l border-border z-50 flex flex-col max-h-[85vh] md:max-h-full rounded-t-2xl md:rounded-none animate-fade-in">
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-opportunity shrink-0" />
              <h3 className="text-sm font-bold">Income Forecast Details</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Grouped by closing probability</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">7 Days</p>
                <p className="text-sm font-bold">{formatCurrency(forecast.next7)}</p>
              </div>
              <div className="rounded-lg border border-border p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">30 Days</p>
                <p className="text-sm font-bold">{formatCurrency(forecast.next30)}</p>
              </div>
              <div className="rounded-lg border border-border p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">90 Days</p>
                <p className="text-sm font-bold">{formatCurrency(forecast.next90)}</p>
              </div>
            </div>

            {/* Grouped deals */}
            {(['likely', 'at_risk', 'long_shot'] as DealGroup[]).map(group => {
              const deals = groups[group];
              if (deals.length === 0) return null;
              const groupTotal = deals.reduce((s, d) => s + d.expectedPersonalCommission, 0);
              return (
                <div key={group} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{GROUP_LABELS[group]}</h4>
                    <span className="text-xs font-medium">{formatCurrency(groupTotal)}</span>
                  </div>
                  {deals.map(deal => (
                    <div key={deal.dealId} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{deal.dealTitle}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground capitalize">{deal.stage.replace('_', ' ')}</span>
                            {deal.daysToClose !== null && (
                              <>
                                <span className="text-xs text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">
                                  {deal.daysToClose < 0 ? `${Math.abs(deal.daysToClose)}d overdue` : deal.daysToClose === 0 ? 'today' : `${deal.daysToClose}d`}
                                </span>
                              </>
                            )}
                            <span className="text-[10px] text-muted-foreground">({Math.round(deal.stageProbability * 100)}%)</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-sm font-semibold text-opportunity">{formatCurrency(deal.expectedPersonalCommission)}</p>
                          <Badge variant="outline" className={`text-[10px] ${CONFIDENCE_STYLE[deal.confidence]}`}>{deal.confidence}</Badge>
                        </div>
                      </div>
                      <Button
                        size="sm" variant="outline" className="w-full text-xs"
                        onClick={() => onCreateTask(`Move ${deal.dealTitle} forward this week`, deal.dealId)}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Start Action
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border">
          <Button size="sm" variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </div>
    </>
  );
}

export function IncomeForecastPanelV2({
  deals, participants, userId, moneyResults,
  typicalDealValue = 8000, onCreateTask,
  onOpenMoneyAtRisk, onOpenOpportunities,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const forecast = useMemo(() => {
    if (!userId) return null;
    return computeForecastBatch(deals, participants, userId);
  }, [deals, participants, userId]);

  const totalAtRisk = useMemo(() => {
    return moneyResults.reduce((s, r) => s + r.personalCommissionAtRisk, 0);
  }, [moneyResults]);

  const trajectory = useMemo(() => {
    if (!forecast) return 'stable' as Trajectory;
    return computeTrajectory(forecast);
  }, [forecast]);

  if (!forecast) return null;

  const hasData = forecast.next90 > 0;
  const riskExceedsForecast = totalAtRisk > forecast.next30 && forecast.next30 > 0;
  const forecastWeak = forecast.next30 < typicalDealValue * 2;
  const forecastStrongRiskHigh = forecast.next30 >= typicalDealValue * 2 && totalAtRisk > forecast.next30 * 0.3;

  // Opportunity gap calculation
  const additionalDealsNeeded = forecastWeak && typicalDealValue > 0
    ? Math.ceil((typicalDealValue * 3 - forecast.next30) / typicalDealValue)
    : 0;

  const TrajIcon = TRAJECTORY_CONFIG[trajectory].icon;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <DollarSign className="h-4 w-4 text-opportunity" />
        <h2 className="text-sm font-semibold">Income Forecast</h2>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center text-center py-6 px-4">
          <div className="mb-3 rounded-2xl bg-muted p-3">
            <DollarSign className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">No expected income from current pipeline</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Main forecast — clickable */}
          <div
            className="cursor-pointer hover:bg-accent/30 rounded-md transition-colors p-1 -m-1"
            onClick={() => setDrawerOpen(true)}
          >
            <div className="flex items-center gap-3">
              <div>
                <p className="text-2xl font-bold">{formatCurrency(forecast.next30)}</p>
                <p className="text-xs text-muted-foreground">expected next 30 days</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <TrajIcon className={cn('h-4 w-4', TRAJECTORY_CONFIG[trajectory].className)} />
                <span className={cn('text-xs font-medium', TRAJECTORY_CONFIG[trajectory].className)}>
                  {TRAJECTORY_CONFIG[trajectory].label}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-2 mb-2">
              <div>
                <span className="text-xs text-muted-foreground">7d: </span>
                <span className="text-xs font-medium">{formatCurrency(forecast.next7)}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">30d: </span>
                <span className="text-xs font-medium">{formatCurrency(forecast.next30)}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">90d: </span>
                <span className="text-xs font-medium">{formatCurrency(forecast.next90)}</span>
              </div>
              <Badge variant="outline" className={`text-[10px] ml-auto ${CONFIDENCE_STYLE[forecast.confidence30]}`}>
                {forecast.confidence30}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">{forecast.explanation}</p>

            <div className="flex items-center justify-end mt-1">
              <span className="text-xs text-primary flex items-center gap-0.5">
                Details <ChevronRight className="h-3 w-3" />
              </span>
            </div>
          </div>

          {/* Risk Exposure */}
          {totalAtRisk > 0 && (
            <div className={cn(
              'rounded-md border p-2.5 space-y-1',
              riskExceedsForecast ? 'border-urgent/20 bg-urgent/5' : 'border-border',
            )}>
              <div className="flex items-center gap-2">
                <AlertTriangle className={cn('h-3.5 w-3.5', riskExceedsForecast ? 'text-urgent' : 'text-warning')} />
                <span className="text-xs font-medium">Income at Risk (30 days)</span>
                <span className={cn('text-xs font-semibold ml-auto', riskExceedsForecast ? 'text-urgent' : 'text-warning')}>
                  {formatCurrency(totalAtRisk)}
                </span>
              </div>
              {riskExceedsForecast && (
                <p className="text-[10px] text-urgent/80">More income at risk than expected. Address deal risks immediately.</p>
              )}
            </div>
          )}

          {/* Opportunity Gap */}
          {forecastWeak && additionalDealsNeeded > 0 && (
            <div className="rounded-md border border-border p-2.5">
              <p className="text-xs text-muted-foreground">
                To reach {formatCurrency(typicalDealValue * 3)} in 30 days, approximately {additionalDealsNeeded} additional deal{additionalDealsNeeded !== 1 ? 's' : ''} needed.
              </p>
            </div>
          )}

          {/* Action CTA */}
          {(forecastWeak || forecastStrongRiskHigh) && (
            <Button
              size="sm" variant="outline" className="w-full text-xs"
              onClick={() => {
                if (forecastStrongRiskHigh && onOpenMoneyAtRisk) onOpenMoneyAtRisk();
                else if (onOpenOpportunities) onOpenOpportunities();
              }}
            >
              {forecastStrongRiskHigh ? (
                <><Shield className="h-3 w-3 mr-1" /> Protect Income</>
              ) : (
                <><Flame className="h-3 w-3 mr-1" /> Create Income</>
              )}
            </Button>
          )}
        </div>
      )}

      {drawerOpen && forecast && (
        <ForecastDrawerV2
          forecast={forecast}
          onClose={() => setDrawerOpen(false)}
          onCreateTask={(title, dealId) => {
            onCreateTask(title, dealId);
            setDrawerOpen(false);
          }}
        />
      )}
    </div>
  );
}
