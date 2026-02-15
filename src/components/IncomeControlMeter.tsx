import { useMemo } from 'react';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StabilityResult } from '@/lib/stabilityModel';

interface Props {
  stabilityResult: StabilityResult;
  totalMoneyAtRisk: number;
  totalRevenue: number;
  overdueCount: number;
}

type ControlState = 'in-control' | 'watch' | 'slipping';

interface ControlConfig {
  label: string;
  description: string;
  barClass: string;
  textClass: string;
  percentage: number;
}

export function IncomeControlMeter({ stabilityResult, totalMoneyAtRisk, totalRevenue, overdueCount }: Props) {
  const state = useMemo((): ControlConfig => {
    let score = 0;

    // Stability contribution (0-40)
    if (stabilityResult.score >= 70) score += 40;
    else if (stabilityResult.score >= 50) score += 25;
    else if (stabilityResult.score >= 30) score += 10;

    // Money at risk ratio (0-30)
    const riskRatio = totalRevenue > 0 ? totalMoneyAtRisk / totalRevenue : 0;
    if (riskRatio < 0.1) score += 30;
    else if (riskRatio < 0.25) score += 20;
    else if (riskRatio < 0.5) score += 10;

    // Overdue tasks (0-30)
    if (overdueCount === 0) score += 30;
    else if (overdueCount <= 2) score += 20;
    else if (overdueCount <= 5) score += 10;

    if (score >= 65) {
      return {
        label: 'In Control',
        description: 'Pipeline stable and risks manageable.',
        barClass: 'bg-opportunity',
        textClass: 'text-opportunity',
        percentage: Math.min(score, 100),
      };
    }
    if (score >= 35) {
      return {
        label: 'Watch',
        description: 'Some areas need attention to maintain momentum.',
        barClass: 'bg-warning',
        textClass: 'text-warning',
        percentage: score,
      };
    }
    return {
      label: 'Slipping',
      description: 'Overdue tasks and rising deal risk need resolution.',
      barClass: 'bg-urgent',
      textClass: 'text-urgent',
      percentage: Math.max(score, 10),
    };
  }, [stabilityResult, totalMoneyAtRisk, totalRevenue, overdueCount]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Income Control</p>
        </div>
        <span className={cn('text-xs font-semibold', state.textClass)}>{state.label}</span>
      </div>

      {/* Meter bar */}
      <div className="relative h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', state.barClass)}
          style={{ width: `${state.percentage}%` }}
        />
      </div>

      <p className="text-xs text-muted-foreground">{state.description}</p>
    </div>
  );
}
