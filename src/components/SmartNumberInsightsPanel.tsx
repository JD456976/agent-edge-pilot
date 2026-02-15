import { useState, useCallback } from 'react';
import { Phone, BarChart, Clock, TrendingUp, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { callEdgeFunction } from '@/lib/edgeClient';
import { cn } from '@/lib/utils';

interface CallMetrics {
  totalCalls: number;
  answeredCalls: number;
  answerRate: number;
  avgDurationSeconds: number;
  inboundCalls: number;
  outboundCalls: number;
  avgResponseTimeSeconds: number | null;
  bestTimeOfDay: string | null;
  bestDayOfWeek: string | null;
  callsPerDay: number;
}

interface Props {
  hasIntegration: boolean;
}

export function SmartNumberInsightsPanel({ hasIntegration }: Props) {
  const [metrics, setMetrics] = useState<CallMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callEdgeFunction<CallMetrics>('fub-smart-numbers');
      setMetrics(data);
    } catch (err) {
      console.error('Smart numbers failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  if (!hasIntegration) return null;

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Smart Number Insights</h2>
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={loadMetrics} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          {!metrics ? 'Load' : 'Refresh'}
        </Button>
      </div>

      {!metrics ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Click Load to fetch your 30-day call analytics from FUB.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Key metrics grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-border p-2 text-center">
              <p className="text-lg font-bold">{metrics.totalCalls}</p>
              <p className="text-[10px] text-muted-foreground">Total Calls</p>
            </div>
            <div className="rounded-md border border-border p-2 text-center">
              <p className="text-lg font-bold">{metrics.answerRate}%</p>
              <p className="text-[10px] text-muted-foreground">Answer Rate</p>
            </div>
            <div className="rounded-md border border-border p-2 text-center">
              <p className="text-lg font-bold">{formatDuration(metrics.avgDurationSeconds)}</p>
              <p className="text-[10px] text-muted-foreground">Avg Duration</p>
            </div>
          </div>

          {/* Answer rate bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Answer Rate</span>
              <span className={cn('font-medium', metrics.answerRate >= 50 ? 'text-opportunity' : 'text-warning')}>
                {metrics.answerRate}%
              </span>
            </div>
            <Progress value={metrics.answerRate} className="h-1.5" />
          </div>

          {/* Direction split */}
          <div className="flex items-center gap-2 text-xs">
            <BarChart className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{metrics.outboundCalls} outbound</span>
            <span className="text-muted-foreground">·</span>
            <span>{metrics.inboundCalls} inbound</span>
            <span className="text-muted-foreground">·</span>
            <span>{metrics.callsPerDay}/day avg</span>
          </div>

          {/* Insights */}
          <div className="space-y-1.5">
            {metrics.bestTimeOfDay && (
              <div className="flex items-center gap-2 text-xs p-2 rounded-md bg-primary/5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>Best call time: <strong>{metrics.bestTimeOfDay}</strong></span>
              </div>
            )}
            {metrics.bestDayOfWeek && (
              <div className="flex items-center gap-2 text-xs p-2 rounded-md bg-primary/5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span>Most active day: <strong>{metrics.bestDayOfWeek}</strong></span>
              </div>
            )}
            {metrics.avgResponseTimeSeconds && (
              <div className="flex items-center gap-2 text-xs p-2 rounded-md bg-primary/5">
                <Phone className="h-3.5 w-3.5 text-primary" />
                <span>Avg response: <strong>{formatDuration(metrics.avgResponseTimeSeconds)}</strong></span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
