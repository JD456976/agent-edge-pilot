import { useMemo } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus, Activity, AlertTriangle, Info } from 'lucide-react';
import type { IncomePatternsResult } from '@/lib/incomePatternsEngine';
import { cn } from '@/lib/utils';

interface Props {
  patterns: IncomePatternsResult;
}

const PATTERN_ICONS: Record<string, React.ElementType> = {
  growing: TrendingUp,
  declining: TrendingDown,
  consistent: Minus,
  front_loaded: Activity,
  back_loaded: Activity,
  volatile: AlertTriangle,
  insufficient_data: Info,
};

const VOLATILITY_CONFIG = {
  low: { label: 'Low', className: 'text-emerald-400' },
  moderate: { label: 'Moderate', className: 'text-amber-400' },
  high: { label: 'High', className: 'text-red-400' },
};

function formatCurrency(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n}`;
}

export function IncomePatternsPanel({ patterns }: Props) {
  const PatternIcon = PATTERN_ICONS[patterns.pattern.type] || Info;
  const volConfig = VOLATILITY_CONFIG[patterns.volatilityLevel];

  // Simple bar chart
  const maxAmount = useMemo(() => Math.max(1, ...patterns.monthlyDistribution.map(m => m.amount)), [patterns.monthlyDistribution]);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Income Patterns</p>
      </div>

      <p className="text-xs text-muted-foreground">How your income typically behaves.</p>

      {/* Pattern type */}
      <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
        <PatternIcon className="h-5 w-5 text-primary shrink-0" />
        <div>
          <p className="text-sm font-medium">{patterns.pattern.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{patterns.pattern.description}</p>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground">Volatility</p>
          <p className={cn('text-sm font-semibold', volConfig.className)}>{volConfig.label}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Predictability</p>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{patterns.predictabilityScore}</p>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all',
                  patterns.predictabilityScore >= 70 ? 'bg-emerald-400/60' :
                  patterns.predictabilityScore >= 40 ? 'bg-amber-400/60' : 'bg-red-400/60'
                )}
                style={{ width: `${patterns.predictabilityScore}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Monthly distribution */}
      {patterns.monthlyDistribution.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Recent Monthly Income</p>
          <div className="flex items-end gap-1 h-16">
            {patterns.monthlyDistribution.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="w-full bg-primary/20 rounded-sm transition-all"
                  style={{ height: `${Math.max(4, (m.amount / maxAmount) * 100)}%` }}
                />
                <span className="text-[8px] text-muted-foreground">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Behavioral warnings */}
      {patterns.behavioralWarnings.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-amber-400">Early Warnings</p>
          {patterns.behavioralWarnings
            .filter(w => w.confidence !== 'LOW')
            .slice(0, 3)
            .map(w => (
              <div key={w.id} className="flex items-start gap-2 text-xs">
                <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{w.title}</p>
                  <p className="text-muted-foreground mt-0.5">{w.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Confidence: {w.confidence}</p>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
