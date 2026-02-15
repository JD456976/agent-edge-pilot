import { useMemo } from 'react';
import { Home, TrendingDown, DollarSign, Megaphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Deal, Task } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  deals: Deal[];
  tasks: Task[];
}

type PerformanceLevel = 'hot' | 'normal' | 'cooling' | 'stalling';

interface ListingPrediction {
  dealId: string;
  dealTitle: string;
  level: PerformanceLevel;
  daysOnMarket: number;
  signals: string[];
  actions: string[];
}

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function predictListingPerformance(deal: Deal, tasks: Task[], now: Date): ListingPrediction | null {
  // Only analyze sell-side deals
  if ((deal as any).side !== 'sell' && (deal as any).side !== 'list') return null;
  if (deal.stage === 'closed') return null;

  const signals: string[] = [];
  let score = 50; // neutral start

  const dom = deal.createdAt ? Math.round(daysBetween(now, new Date(deal.createdAt))) : 0;

  // Days on market signal
  if (dom > 60) {
    score -= 25;
    signals.push(`${dom} days on market`);
  } else if (dom > 30) {
    score -= 15;
    signals.push(`${dom} days on market`);
  } else if (dom < 14) {
    score += 10;
    signals.push('Recently listed');
  }

  // Activity signals from tasks
  const dealTasks = tasks.filter(t => t.relatedDealId === deal.id);
  const recentTasks = dealTasks.filter(t => {
    const d = t.completedAt ? daysBetween(now, new Date(t.completedAt)) : Infinity;
    return d < 14;
  });
  if (recentTasks.length >= 2) {
    score += 10;
    signals.push('Active showing/task activity');
  } else if (recentTasks.length === 0 && dom > 14) {
    score -= 15;
    signals.push('No recent activity');
  }

  // Touch recency
  const touchDays = deal.lastTouchedAt ? daysBetween(now, new Date(deal.lastTouchedAt)) : Infinity;
  if (touchDays > 10) {
    score -= 10;
    signals.push('No recent seller contact');
  }

  // Stage progress
  if (deal.stage === 'offer_accepted' || deal.stage === 'pending') {
    score += 15;
    signals.push('Offer in progress');
  }

  let level: PerformanceLevel;
  if (score >= 60) level = 'hot';
  else if (score >= 40) level = 'normal';
  else if (score >= 20) level = 'cooling';
  else level = 'stalling';

  const actions: string[] = [];
  if (level === 'cooling' || level === 'stalling') {
    if (dom > 30) actions.push('Consider price review');
    if (recentTasks.length === 0) actions.push('Schedule marketing boost');
    actions.push('Review positioning strategy');
  }

  return {
    dealId: deal.id,
    dealTitle: deal.title,
    level,
    daysOnMarket: dom,
    signals,
    actions,
  };
}

const LEVEL_CONFIG: Record<PerformanceLevel, { label: string; className: string }> = {
  hot: { label: 'Hot', className: 'text-opportunity border-opportunity/30' },
  normal: { label: 'Normal', className: 'text-muted-foreground border-muted-foreground/30' },
  cooling: { label: 'Cooling', className: 'text-warning border-warning/30' },
  stalling: { label: 'Stalling', className: 'text-urgent border-urgent/30' },
};

export function ListingPerformancePanel({ deals, tasks }: Props) {
  const now = useMemo(() => new Date(), []);

  const listings = useMemo(() => {
    return deals
      .map(d => predictListingPerformance(d, tasks, now))
      .filter((p): p is ListingPrediction => p !== null)
      .filter(p => p.level === 'cooling' || p.level === 'stalling')
      .sort((a, b) => {
        const order: Record<PerformanceLevel, number> = { stalling: 0, cooling: 1, normal: 2, hot: 3 };
        return order[a.level] - order[b.level];
      })
      .slice(0, 5);
  }, [deals, tasks, now]);

  if (listings.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Home className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-semibold">Listings Needing Attention</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Sell-side deals that may need intervention.</p>

      <div className="space-y-2">
        {listings.map(listing => {
          const config = LEVEL_CONFIG[listing.level];
          return (
            <div key={listing.dealId} className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{listing.dealTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{listing.daysOnMarket} days on market</p>
                </div>
                <Badge variant="outline" className={cn('text-[10px] shrink-0 ml-2', config.className)}>
                  {config.label}
                </Badge>
              </div>
              {listing.signals.length > 0 && (
                <p className="text-xs text-muted-foreground">{listing.signals.join(' · ')}</p>
              )}
              {listing.actions.length > 0 && (
                <div className="space-y-0.5">
                  {listing.actions.map((a, i) => (
                    <p key={i} className="text-xs text-muted-foreground">• {a}</p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
