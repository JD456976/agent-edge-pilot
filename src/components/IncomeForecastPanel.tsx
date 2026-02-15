import { useMemo, useState } from 'react';
import { DollarSign, ChevronRight, X, TrendingUp, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Deal, DealParticipant } from '@/types';
import { computeForecastBatch, type ForecastSummary, type ForecastDealResult } from '@/lib/forecastModel';

interface Props {
  deals: Deal[];
  participants: DealParticipant[];
  userId: string;
  onCreateTask: (title: string, dealId: string) => void;
}

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

const CONFIDENCE_STYLE: Record<string, string> = {
  HIGH: 'border-opportunity/30 text-opportunity',
  MEDIUM: 'border-warning/30 text-warning',
  LOW: 'border-muted-foreground/30 text-muted-foreground',
};

function ForecastDrawer({ forecast, onClose, onCreateTask }: {
  forecast: ForecastSummary;
  onClose: () => void;
  onCreateTask: (title: string, dealId: string) => void;
}) {
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
            <p className="text-xs text-muted-foreground mt-0.5">Top contributing deals</p>
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

            {/* Deals */}
            {forecast.topContributors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No deals contributing to forecast</p>
            ) : (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Contributors</h4>
                {forecast.topContributors.map(deal => (
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
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-semibold text-opportunity">{formatCurrency(deal.expectedPersonalCommission)}</p>
                        <Badge variant="outline" className={`text-[10px] ${CONFIDENCE_STYLE[deal.confidence]}`}>{deal.confidence}</Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => onCreateTask(`Move ${deal.dealTitle} forward this week`, deal.dealId)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Start Action
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border">
          <Button size="sm" variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </div>
    </>
  );
}

export function IncomeForecastPanel({ deals, participants, userId, onCreateTask }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const forecast = useMemo(() => {
    if (!userId) return null;
    return computeForecastBatch(deals, participants, userId);
  }, [deals, participants, userId]);

  if (!forecast) return null;

  const hasData = forecast.next90 > 0;

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
        <div
          className="cursor-pointer hover:bg-accent/30 rounded-md transition-colors p-1 -m-1"
          onClick={() => setDrawerOpen(true)}
        >
          <p className="text-2xl font-bold">{formatCurrency(forecast.next30)}</p>
          <p className="text-xs text-muted-foreground mb-2">expected next 30 days</p>

          <div className="flex items-center gap-4 mb-2">
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
      )}

      {drawerOpen && forecast && (
        <ForecastDrawer
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
