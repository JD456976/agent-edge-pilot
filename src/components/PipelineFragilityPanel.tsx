import { useMemo } from 'react';
import { Layers, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Deal, DealParticipant } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { ForecastDealResult } from '@/lib/forecastModel';
import { cn } from '@/lib/utils';

interface Props {
  deals: Deal[];
  moneyResults: MoneyModelResult[];
  forecast: { next30: number; next90: number; topContributors: ForecastDealResult[] } | null;
  onOpenOpportunities?: () => void;
}

function formatCurrency(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

interface FragilityAnalysis {
  score: number; // 0-100, higher = more fragile
  factors: { label: string; severity: 'high' | 'medium' | 'low' }[];
  label: string;
}

function computeFragility(deals: Deal[], moneyResults: MoneyModelResult[], forecast: Props['forecast']): FragilityAnalysis {
  const factors: FragilityAnalysis['factors'] = [];
  let score = 0;
  const activeDeals = deals.filter(d => d.stage !== 'closed');

  // 1) Concentration: top 1-2 deals > 50% of expected income
  if (forecast && forecast.next30 > 0 && forecast.topContributors.length > 0) {
    const sorted = [...forecast.topContributors]
      .filter(c => c.windows.w30)
      .sort((a, b) => b.expectedPersonalCommission - a.expectedPersonalCommission);
    const top2 = sorted.slice(0, 2).reduce((s, c) => s + c.expectedPersonalCommission, 0);
    const share = top2 / forecast.next30;
    if (share > 0.7) {
      score += 35;
      factors.push({ label: 'Income concentrated in 1–2 deals', severity: 'high' });
    } else if (share > 0.5) {
      score += 20;
      factors.push({ label: 'Income moderately concentrated', severity: 'medium' });
    }
  }

  // 2) Stage risk: most deals in early stages
  if (activeDeals.length >= 2) {
    const earlyStage = activeDeals.filter(d => d.stage === 'offer').length;
    const earlyRatio = earlyStage / activeDeals.length;
    if (earlyRatio > 0.7) {
      score += 25;
      factors.push({ label: 'Pipeline early-stage heavy — future income uncertain', severity: 'high' });
    } else if (earlyRatio > 0.5) {
      score += 15;
      factors.push({ label: 'Many deals still in offer stage', severity: 'medium' });
    }
  }

  // 3) Client concentration (deals with same title pattern — simplified check)
  if (activeDeals.length >= 3) {
    const titleTokens = activeDeals.map(d => d.title.toLowerCase().split(/\s+/).slice(0, 2).join(' '));
    const freq = new Map<string, number>();
    titleTokens.forEach(t => freq.set(t, (freq.get(t) || 0) + 1));
    const maxRepeat = Math.max(...freq.values());
    if (maxRepeat >= 3) {
      score += 20;
      factors.push({ label: 'Multiple deals may depend on same client', severity: 'medium' });
    }
  }

  // 4) Low deal count
  if (activeDeals.length <= 2) {
    score += 20;
    factors.push({ label: 'Very few active deals in pipeline', severity: 'high' });
  } else if (activeDeals.length <= 4) {
    score += 10;
    factors.push({ label: 'Limited pipeline depth', severity: 'low' });
  }

  score = Math.min(100, Math.max(0, score));

  let label: string;
  if (score >= 70) label = 'Fragile';
  else if (score >= 40) label = 'Moderate';
  else label = 'Resilient';

  return { score, factors, label };
}

const LABEL_STYLE: Record<string, string> = {
  Fragile: 'text-urgent border-urgent/30',
  Moderate: 'text-warning border-warning/30',
  Resilient: 'text-opportunity border-opportunity/30',
};

export function PipelineFragilityPanel({ deals, moneyResults, forecast, onOpenOpportunities }: Props) {
  const fragility = useMemo(() => computeFragility(deals, moneyResults, forecast), [deals, moneyResults, forecast]);

  const activeCount = deals.filter(d => d.stage !== 'closed').length;
  if (activeCount === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Deal Health</h2>
        <Badge variant="outline" className={cn('text-[10px] ml-auto', LABEL_STYLE[fragility.label] || '')}>
          {fragility.label}
        </Badge>
      </div>

      <div className="space-y-3 mt-2">
        {/* Score bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Fragility Score</span>
            <span className="text-xs font-medium">{fragility.score}/100</span>
          </div>
          <Progress value={fragility.score} className="h-1.5" />
        </div>

        {/* Factors */}
        {fragility.factors.length > 0 && (
          <div className="space-y-1.5">
            {fragility.factors.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={cn(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  f.severity === 'high' ? 'bg-urgent' : f.severity === 'medium' ? 'bg-warning' : 'bg-muted-foreground',
                )} />
                <span className="text-xs text-muted-foreground">{f.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Guidance */}
        {fragility.score >= 40 && onOpenOpportunities && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Secure additional deals to stabilize pipeline.</p>
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={onOpenOpportunities}>
              <Shield className="h-3 w-3 mr-1" /> Find Opportunities
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
