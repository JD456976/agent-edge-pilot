import { useMemo } from 'react';
import { BarChart3, TrendingUp, ArrowUp, ArrowDown, Minus, Shield } from 'lucide-react';
import { useNetworkBenchmarks } from '@/hooks/useNetworkBenchmarks';
import { cn } from '@/lib/utils';

interface AgentMetrics {
  timeToFirstTouchHot?: string;
  followUpCompletionRate?: number;
  dealCloseRate?: number;
}

interface Props {
  agentMetrics: AgentMetrics;
}

const TIME_BUCKET_LABELS: Record<string, string> = {
  under_5m: 'Under 5 min',
  under_1h: 'Under 1 hour',
  same_day: 'Same day',
  next_day: 'Next day',
  '2_3_days': '2–3 days',
  '4_7_days': '4–7 days',
  over_7_days: 'Over 7 days',
};

const TIME_BUCKET_ORDER = ['under_5m', 'under_1h', 'same_day', 'next_day', '2_3_days', '4_7_days', 'over_7_days'];

function compareBucket(yours: string | undefined, cohort: string | null | undefined): 'above' | 'near' | 'below' | null {
  if (!yours || !cohort) return null;
  const yi = TIME_BUCKET_ORDER.indexOf(yours);
  const ci = TIME_BUCKET_ORDER.indexOf(cohort);
  if (yi < 0 || ci < 0) return null;
  if (yi < ci) return 'above'; // faster = above
  if (yi > ci) return 'below'; // slower = below
  return 'near';
}

function compareRate(yours: number | undefined, cohort: number | null | undefined): 'above' | 'near' | 'below' | null {
  if (yours === undefined || cohort === null || cohort === undefined) return null;
  const diff = yours - cohort;
  if (diff > 0.05) return 'above';
  if (diff < -0.05) return 'below';
  return 'near';
}

function BandBadge({ band }: { band: 'above' | 'near' | 'below' | null }) {
  if (!band) return null;
  const config = {
    above: { icon: ArrowUp, label: 'Above cohort', className: 'text-emerald-400' },
    near: { icon: Minus, label: 'Near cohort', className: 'text-muted-foreground' },
    below: { icon: ArrowDown, label: 'Below cohort', className: 'text-amber-400' },
  };
  const { icon: Icon, label, className } = config[band];
  return (
    <span className={cn('flex items-center gap-1 text-[10px] font-medium', className)}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

export function NetworkBenchmarksPanel({ agentMetrics }: Props) {
  const { benchmark, loading } = useNetworkBenchmarks();

  const comparisons = useMemo(() => {
    if (!benchmark) return [];
    const items: { label: string; yours: string; cohort: string; band: 'above' | 'near' | 'below' | null }[] = [];

    // Time to first touch on hot leads
    if (benchmark.metrics.median_time_to_first_touch_hot) {
      const yoursBucket = agentMetrics.timeToFirstTouchHot || 'unknown';
      const cohortBucket = benchmark.metrics.median_time_to_first_touch_hot;
      items.push({
        label: 'Time to first touch (hot leads)',
        yours: TIME_BUCKET_LABELS[yoursBucket] || yoursBucket,
        cohort: TIME_BUCKET_LABELS[cohortBucket] || cohortBucket,
        band: compareBucket(agentMetrics.timeToFirstTouchHot, cohortBucket),
      });
    }

    // Follow-up completion rate
    if (benchmark.metrics.follow_up_task_completion_rate !== null && benchmark.metrics.follow_up_task_completion_rate !== undefined) {
      const yoursRate = agentMetrics.followUpCompletionRate;
      items.push({
        label: 'Follow-up completion rate',
        yours: yoursRate !== undefined ? `${Math.round(yoursRate * 100)}%` : '—',
        cohort: `${Math.round(benchmark.metrics.follow_up_task_completion_rate * 100)}%`,
        band: compareRate(yoursRate, benchmark.metrics.follow_up_task_completion_rate),
      });
    }

    // Deal close rate
    if (benchmark.metrics.deal_close_rate !== null && benchmark.metrics.deal_close_rate !== undefined) {
      items.push({
        label: 'Deal close rate',
        yours: agentMetrics.dealCloseRate !== undefined ? `${Math.round(agentMetrics.dealCloseRate * 100)}%` : '—',
        cohort: `${Math.round(benchmark.metrics.deal_close_rate * 100)}%`,
        band: compareRate(agentMetrics.dealCloseRate, benchmark.metrics.deal_close_rate),
      });
    }

    return items;
  }, [benchmark, agentMetrics]);

  if (loading) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Benchmarks</p>
        <Shield className="h-3 w-3 text-muted-foreground ml-auto" />
        <span className="text-[10px] text-muted-foreground">Privacy-first</span>
      </div>

      {!benchmark ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No cohort benchmarks available yet. Benchmarks appear when enough agents participate (minimum 25).
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Comparing your metrics to {benchmark.cohortSize} agents in your cohort. All data is aggregated and anonymized.
          </p>

          <div className="space-y-3">
            {comparisons.map((item, i) => (
              <div key={i} className="space-y-1">
                <p className="text-xs font-medium">{item.label}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">You: <span className="text-foreground font-medium">{item.yours}</span></span>
                  <span className="text-muted-foreground">Cohort: <span className="text-foreground font-medium">{item.cohort}</span></span>
                  <BandBadge band={item.band} />
                </div>
              </div>
            ))}
          </div>

          {comparisons.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Not enough data for comparisons yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
