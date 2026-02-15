import { useMemo } from 'react';
import { AlertTriangle, TrendingDown, Shield, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Deal, DealParticipant } from '@/types';
import type { ForecastDealResult } from '@/lib/forecastModel';
import { cn } from '@/lib/utils';

interface Props {
  deals: Deal[];
  participants: DealParticipant[];
  userId: string;
  forecast: { next7: number; next30: number; next90: number; topContributors: ForecastDealResult[] } | null;
  typicalMonthlyIncome?: number;
  onOpenOpportunities?: () => void;
}

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

type CoverageLevel = 'fully_covered' | 'partially_covered' | 'at_risk' | 'critical_gap';

const COVERAGE_CONFIG: Record<CoverageLevel, { label: string; className: string }> = {
  fully_covered: { label: 'Fully Covered', className: 'text-opportunity border-opportunity/30' },
  partially_covered: { label: 'Partially Covered', className: 'text-warning border-warning/30' },
  at_risk: { label: 'At Risk', className: 'text-urgent border-urgent/30' },
  critical_gap: { label: 'Critical Gap', className: 'text-urgent border-urgent/50' },
};

function computeWindowDeals(deals: Deal[], windowStart: number, windowEnd: number, now: Date) {
  return deals.filter(d => {
    if (d.stage === 'closed' || !d.closeDate) return false;
    const days = (new Date(d.closeDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return days >= windowStart && days < windowEnd;
  });
}

export function IncomeVolatilityPanel({ deals, participants, userId, forecast, typicalMonthlyIncome = 8000, onOpenOpportunities }: Props) {
  const now = useMemo(() => new Date(), []);

  const windows = useMemo(() => {
    const w0_30 = computeWindowDeals(deals, -30, 30, now);
    const w30_60 = computeWindowDeals(deals, 30, 60, now);
    const w60_90 = computeWindowDeals(deals, 60, 90, now);
    return { w0_30, w30_60, w60_90 };
  }, [deals, now]);

  const gapDetected = useMemo(() => {
    const current = windows.w0_30.length;
    if (current === 0) return null;
    if (windows.w30_60.length <= current * 0.4 && current >= 2) {
      return { windowLabel: '30–60 days', count: windows.w30_60.length, currentCount: current };
    }
    if (windows.w60_90.length <= current * 0.3 && current >= 2) {
      return { windowLabel: '60–90 days', count: windows.w60_90.length, currentCount: current };
    }
    return null;
  }, [windows]);

  const coverageLevel = useMemo((): CoverageLevel => {
    if (!forecast || typicalMonthlyIncome <= 0) return 'at_risk';
    const ratio = forecast.next90 / (typicalMonthlyIncome * 3);
    if (ratio >= 0.8) return 'fully_covered';
    if (ratio >= 0.5) return 'partially_covered';
    if (ratio >= 0.25) return 'at_risk';
    return 'critical_gap';
  }, [forecast, typicalMonthlyIncome]);

  const runwayDays = useMemo(() => {
    if (!forecast || forecast.next90 <= 0 || typicalMonthlyIncome <= 0) return null;
    const dailyRate = forecast.next90 / 90;
    const dailyNeed = typicalMonthlyIncome / 30;
    if (dailyRate >= dailyNeed) return null;
    // Estimate when cumulative income falls short
    const daysOfCoverage = Math.round(forecast.next90 / dailyNeed);
    return Math.max(0, daysOfCoverage);
  }, [forecast, typicalMonthlyIncome]);

  const hasWarning = gapDetected || coverageLevel === 'at_risk' || coverageLevel === 'critical_gap';
  const coverage = COVERAGE_CONFIG[coverageLevel];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <TrendingDown className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Income Stability Outlook</h2>
      </div>

      {!forecast || forecast.next90 <= 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No pipeline data to analyze</p>
      ) : (
        <div className="space-y-3 mt-2">
          {/* Coverage Ratio */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">90-Day Coverage</span>
            <Badge variant="outline" className={cn('text-[10px]', coverage.className)}>
              {coverage.label}
            </Badge>
          </div>

          {/* Window breakdown */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-border p-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">0–30d</p>
              <p className="text-sm font-semibold">{windows.w0_30.length} deals</p>
            </div>
            <div className={cn('rounded-md border p-2 text-center', gapDetected?.windowLabel === '30–60 days' ? 'border-warning/30' : 'border-border')}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">30–60d</p>
              <p className="text-sm font-semibold">{windows.w30_60.length} deals</p>
            </div>
            <div className={cn('rounded-md border p-2 text-center', gapDetected?.windowLabel === '60–90 days' ? 'border-warning/30' : 'border-border')}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">60–90d</p>
              <p className="text-sm font-semibold">{windows.w60_90.length} deals</p>
            </div>
          </div>

          {/* Gap Warning */}
          {gapDetected && (
            <div className="rounded-md border border-warning/20 bg-warning/5 p-2.5 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium">Pipeline gap detected in {gapDetected.windowLabel}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {gapDetected.count} deal{gapDetected.count !== 1 ? 's' : ''} vs {gapDetected.currentCount} in the current window.
                </p>
              </div>
            </div>
          )}

          {/* Runway Estimate */}
          {runwayDays !== null && (
            <p className="text-xs text-muted-foreground">
              At current pace, income may decline in approximately <span className="font-medium text-foreground">{runwayDays} days</span>.
            </p>
          )}

          {/* Action CTA */}
          {hasWarning && onOpenOpportunities && (
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={onOpenOpportunities}>
              <Shield className="h-3 w-3 mr-1" /> Build Pipeline Now
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
