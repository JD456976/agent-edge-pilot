import { useMemo, useState } from 'react';
import { CloudSun, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, AlertTriangle, Lightbulb, BarChart3, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Deal, Lead } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { MarketConditions } from '@/lib/marketConditions';
import {
  analyzePipelineImpact,
  generateMarketAlerts,
  detectMarketOpportunities,
  computeStrategyAdjustments,
  computeForecastVolatility,
  generateWeeklyMarketBrief,
  type PipelineImpact,
  type MarketAlert,
  type MarketOpportunity,
  type StrategyAdjustment,
} from '@/lib/marketConditions';

interface Props {
  conditions: MarketConditions;
  deals: Deal[];
  leads: Lead[];
  moneyResults: MoneyModelResult[];
}

const effectColors = {
  positive: 'text-opportunity',
  neutral: 'text-muted-foreground',
  negative: 'text-urgent',
};

const severityBadge = {
  info: 'bg-muted text-muted-foreground',
  warning: 'bg-warning/15 text-warning border-warning/30',
  critical: 'bg-urgent/15 text-urgent border-urgent/30',
};

export function MarketConditionsPanel({ conditions, deals, leads, moneyResults }: Props) {
  const [expanded, setExpanded] = useState(false);

  const impacts = useMemo(() => analyzePipelineImpact(conditions), [conditions]);
  const alerts = useMemo(() => generateMarketAlerts(conditions, deals, leads, moneyResults), [conditions, deals, leads, moneyResults]);
  const opportunities = useMemo(() => detectMarketOpportunities(conditions, deals, leads), [conditions, deals, leads]);
  const strategyAdjustments = useMemo(() => computeStrategyAdjustments(conditions, deals), [conditions, deals]);
  const forecastVol = useMemo(() => computeForecastVolatility(conditions), [conditions]);
  const brief = useMemo(() => generateWeeklyMarketBrief(conditions, deals, leads), [conditions, deals, leads]);

  const negativeImpacts = impacts.filter(i => i.effect === 'negative');
  const positiveImpacts = impacts.filter(i => i.effect === 'positive');

  const volColor = forecastVol.volatility === 'high_uncertainty' ? 'text-urgent' : forecastVol.volatility === 'volatile' ? 'text-warning' : 'text-opportunity';
  const volLabel = forecastVol.volatility === 'high_uncertainty' ? 'High Uncertainty' : forecastVol.volatility === 'volatile' ? 'Volatile' : 'Stable';

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <CloudSun className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Market Awareness</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-medium', volColor)}>Forecast: {volLabel}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Weekly brief headline — always visible */}
      <p className="text-sm text-muted-foreground">{brief.headline}</p>

      {/* Summary stats */}
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
        {alerts.length > 0 && (
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-warning" />
            {alerts.length} market alert{alerts.length > 1 ? 's' : ''}
          </span>
        )}
        {opportunities.length > 0 && (
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-opportunity" />
            {opportunities.length} market opportunit{opportunities.length > 1 ? 'ies' : 'y'}
          </span>
        )}
        {negativeImpacts.length > 0 && (
          <span className="flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-urgent" />
            {negativeImpacts.length} headwind{negativeImpacts.length > 1 ? 's' : ''}
          </span>
        )}
        {positiveImpacts.length > 0 && (
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-opportunity" />
            {positiveImpacts.length} tailwind{positiveImpacts.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {expanded && (
        <div className="space-y-5 pt-2 border-t border-border">
          {/* Market Impact Alerts */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Market Impact Alerts
              </p>
              {alerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                  <span className={cn('mt-0.5 inline-block w-2 h-2 rounded-full shrink-0', alert.severity === 'critical' ? 'bg-urgent' : 'bg-warning')} />
                  <div>
                    <p className="text-xs font-medium">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{alert.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Opportunities */}
          {opportunities.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Zap className="h-3 w-3" /> Market-Driven Opportunities
              </p>
              {opportunities.map(opp => (
                <div key={opp.id} className="flex items-start gap-2 p-2 rounded-md bg-opportunity/5">
                  <TrendingUp className="h-3.5 w-3.5 text-opportunity mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium">{opp.title}</p>
                    <p className="text-xs text-muted-foreground">{opp.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pipeline Impact Analysis */}
          {impacts.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <BarChart3 className="h-3 w-3" /> Pipeline Impact Analysis
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {impacts.map((impact, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={cn('capitalize font-medium w-28 shrink-0', effectColors[impact.effect])}>
                      {impact.segment.replace('_', ' ')}
                    </span>
                    <span className="text-muted-foreground">{impact.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strategy Adjustments */}
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Lightbulb className="h-3 w-3" /> Strategy Adjusted for Market Conditions
            </p>
            {strategyAdjustments.map((adj, i) => (
              <div key={i} className="flex items-start gap-2">
                <Badge variant="outline" className={cn('text-[10px] shrink-0', adj.priority === 'high' ? 'border-warning/50 text-warning' : '')}>
                  {adj.priority}
                </Badge>
                <div>
                  <p className="text-xs font-medium">{adj.label}</p>
                  <p className="text-xs text-muted-foreground">{adj.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Weekly Actions */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">This Week's Market Actions</p>
            {brief.actions.map((action, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[10px] font-mono text-muted-foreground mt-0.5">{i + 1}.</span>
                <span className="text-xs">{action}</span>
              </div>
            ))}
          </div>

          {/* Forecast Confidence */}
          <div className="text-xs text-muted-foreground p-2 rounded-md bg-muted/30">
            <span className={cn('font-medium', volColor)}>Forecast confidence: {volLabel}</span>
            <span className="ml-1">— {forecastVol.explanation}</span>
          </div>
        </div>
      )}
    </div>
  );
}
