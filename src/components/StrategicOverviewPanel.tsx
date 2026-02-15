import { useMemo, useState } from 'react';
import { Compass, TrendingUp, Shield, Activity, Flame, AlertTriangle, Target, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StrategicOverview } from '@/lib/strategicEngine';

interface Props {
  overview: StrategicOverview;
  onOpenPlanner: () => void;
}

const MODE_ICON: Record<string, typeof Shield> = {
  growth: TrendingUp,
  protection: Shield,
  stability: Activity,
  opportunity: Flame,
};

const MODE_COLOR: Record<string, string> = {
  growth: 'text-opportunity',
  protection: 'text-urgent',
  stability: 'text-warning',
  opportunity: 'text-primary',
};

const MODE_BG: Record<string, string> = {
  growth: 'border-opportunity/20 bg-opportunity/5',
  protection: 'border-urgent/20 bg-urgent/5',
  stability: 'border-warning/20 bg-warning/5',
  opportunity: 'border-primary/20 bg-primary/5',
};

const ALIGNMENT_CONFIG: Record<string, { label: string; color: string }> = {
  on_track: { label: 'On Track', color: 'text-opportunity' },
  slightly_behind: { label: 'Slightly Behind', color: 'text-warning' },
  off_track: { label: 'Off Track', color: 'text-urgent' },
  critical_gap: { label: 'Critical Gap', color: 'text-urgent' },
};

const BALANCE_LABELS: Record<string, string> = {
  balanced: 'Balanced',
  buyer_heavy: 'Buyer-Heavy',
  seller_heavy: 'Seller-Heavy',
  early_stage_heavy: 'Early-Stage Heavy',
  risk_heavy: 'Risk-Heavy',
};

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n}`;
}

export function StrategicOverviewPanel({ overview, onOpenPlanner }: Props) {
  const [expanded, setExpanded] = useState(false);

  const ModeIcon = MODE_ICON[overview.mode] || Compass;
  const alignConfig = ALIGNMENT_CONFIG[overview.alignment];

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Strategic Overview</p>
        </div>
        <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold', MODE_BG[overview.mode])}>
          <ModeIcon className={cn('h-3.5 w-3.5', MODE_COLOR[overview.mode])} />
          <span>{overview.modeLabel}</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{overview.modeDescription}</p>

      {/* Target vs Projected */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-muted/50 p-3 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Weekly Target</p>
          <p className="text-lg font-bold">{formatCurrency(overview.weeklyTarget)}</p>
          <p className="text-xs text-muted-foreground">
            Projected: <span className="font-medium text-foreground">{formatCurrency(overview.projected30 / 4.3)}</span>
          </p>
          {overview.weeklyGap > 0 && (
            <p className="text-xs text-urgent font-medium">Gap: {formatCurrency(overview.weeklyGap)}</p>
          )}
        </div>
        <div className="rounded-md bg-muted/50 p-3 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly Target</p>
          <p className="text-lg font-bold">{formatCurrency(overview.monthlyTarget)}</p>
          <p className="text-xs text-muted-foreground">
            Projected: <span className="font-medium text-foreground">{formatCurrency(overview.projected30)}</span>
          </p>
          {overview.monthlyGap > 0 && (
            <p className="text-xs text-urgent font-medium">Gap: {formatCurrency(overview.monthlyGap)}</p>
          )}
        </div>
      </div>

      {/* Pipeline Coverage */}
      <div className="space-y-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pipeline Coverage</p>
        <div className="space-y-1.5">
          {[
            { label: '30-day', value: overview.pipelineCoverage30 },
            { label: '60-day', value: overview.pipelineCoverage60 },
            { label: '90-day', value: overview.pipelineCoverage90 },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-12">{item.label}</span>
              <Progress value={Math.min(100, item.value)} className="h-2 flex-1" />
              <span className={cn('text-xs font-medium w-10 text-right', item.value >= 80 ? 'text-opportunity' : item.value >= 50 ? 'text-warning' : 'text-urgent')}>
                {item.value}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Status Row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Risk to target:</span>
          <Badge variant={overview.riskToTarget === 'low' ? 'opportunity' : overview.riskToTarget === 'moderate' ? 'warning' : 'urgent'} className="text-[10px]">
            {overview.riskToTarget.charAt(0).toUpperCase() + overview.riskToTarget.slice(1)}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Alignment:</span>
          <span className={cn('text-xs font-semibold', alignConfig.color)}>{alignConfig.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Pipeline:</span>
          <span className="text-xs font-medium">{BALANCE_LABELS[overview.pipelineBalance]}</span>
        </div>
      </div>

      {/* Expandable Details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide Details' : 'View Gaps & Recommendations'}
      </button>

      {expanded && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Gaps */}
          {overview.gaps.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Strategic Gaps Detected
              </p>
              {overview.gaps.map((gap, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                  <span className={cn('status-dot mt-1.5 shrink-0', gap.severity === 'high' ? 'bg-urgent' : gap.severity === 'moderate' ? 'bg-warning' : 'bg-muted-foreground')} />
                  <div>
                    <p className="text-xs font-medium">{gap.label}</p>
                    <p className="text-[11px] text-muted-foreground">{gap.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {overview.recommendations.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Recommended Strategy This Week</p>
              {overview.recommendations.map((rec, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground">{i + 1}.</span>
                  <div>
                    <span className="text-xs font-medium">{rec.label}</span>
                    <span className="text-xs text-muted-foreground ml-1.5">— {rec.description}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Strategic Alerts */}
          {overview.alerts.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Strategic Alerts</p>
              {overview.alerts.map(alert => (
                <div key={alert.id} className={cn(
                  'p-2.5 rounded-md border text-xs',
                  alert.severity === 'critical' ? 'border-urgent/30 bg-urgent/5' : 'border-warning/20 bg-warning/5'
                )}>
                  <p className="font-medium">{alert.title}</p>
                  <p className="text-muted-foreground mt-0.5">{alert.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Plan My Week Button */}
      <Button size="sm" variant="outline" className="w-full" onClick={onOpenPlanner}>
        <Compass className="h-3.5 w-3.5 mr-1.5" />
        Plan My Week
      </Button>
    </div>
  );
}
