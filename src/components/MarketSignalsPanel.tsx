import { useMemo } from 'react';
import { Radio, TrendingDown, TrendingUp, Minus, AlertTriangle, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Deal, Lead } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';

interface Props {
  deals: Deal[];
  leads: Lead[];
  moneyResults: MoneyModelResult[];
}

interface MarketSignal {
  id: string;
  title: string;
  description: string;
  trend: 'rising' | 'falling' | 'stable';
  severity: 'info' | 'warning' | 'alert';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

function detectMarketSignals(deals: Deal[], leads: Lead[], moneyResults: MoneyModelResult[]): MarketSignal[] {
  const signals: MarketSignal[] = [];
  const now = new Date();
  const activeDeals = deals.filter(d => d.stage !== 'closed');

  // 1. Rising deal risk across pipeline
  const highRiskDeals = moneyResults.filter(r => r.riskScore >= 60);
  const riskPct = activeDeals.length > 0 ? highRiskDeals.length / activeDeals.length : 0;
  if (riskPct > 0.4 && activeDeals.length >= 3) {
    signals.push({
      id: 'rising_risk',
      title: 'Rising deal risk across pipeline',
      description: `${Math.round(riskPct * 100)}% of active deals are at elevated risk — more than typical.`,
      trend: 'rising',
      severity: 'warning',
      confidence: activeDeals.length >= 5 ? 'HIGH' : 'MEDIUM',
    });
  }

  // 2. Slowing closings
  const recentClosed = deals.filter(d => {
    if (d.stage !== 'closed') return false;
    const closeDate = new Date(d.closeDate);
    return (now.getTime() - closeDate.getTime()) < 30 * 24 * 60 * 60 * 1000;
  });
  const priorClosed = deals.filter(d => {
    if (d.stage !== 'closed') return false;
    const closeDate = new Date(d.closeDate);
    const diff = now.getTime() - closeDate.getTime();
    return diff >= 30 * 24 * 60 * 60 * 1000 && diff < 60 * 24 * 60 * 60 * 1000;
  });
  if (priorClosed.length > 0 && recentClosed.length < priorClosed.length * 0.5) {
    signals.push({
      id: 'slowing_closings',
      title: 'Slowing deal closings',
      description: `${recentClosed.length} closings this month vs ${priorClosed.length} last month — pace declining.`,
      trend: 'falling',
      severity: 'warning',
      confidence: 'MEDIUM',
    });
  }

  // 3. Increasing cancellations (cancelled_at present via risk level)
  const redDeals = activeDeals.filter(d => d.riskLevel === 'red');
  if (redDeals.length >= 2 && activeDeals.length >= 3) {
    signals.push({
      id: 'high_cancellation_risk',
      title: 'Elevated cancellation risk',
      description: `${redDeals.length} deals at red risk level — cancellation risk is above normal.`,
      trend: 'rising',
      severity: 'alert',
      confidence: 'HIGH',
    });
  }

  // 4. Lead temperature shifts
  const hotLeads = leads.filter(l => l.leadTemperature === 'hot');
  const warmLeads = leads.filter(l => l.leadTemperature === 'warm');
  const coldLeads = leads.filter(l => l.leadTemperature === 'cold' || !l.leadTemperature);
  if (leads.length >= 5) {
    const hotPct = hotLeads.length / leads.length;
    if (hotPct > 0.3) {
      signals.push({
        id: 'hot_lead_surge',
        title: 'Hot lead activity surge',
        description: `${Math.round(hotPct * 100)}% of leads are hot — capitalize on demand while it lasts.`,
        trend: 'rising',
        severity: 'info',
        confidence: leads.length >= 10 ? 'HIGH' : 'MEDIUM',
      });
    }
    const coldPct = coldLeads.length / leads.length;
    if (coldPct > 0.6) {
      signals.push({
        id: 'cold_lead_dominance',
        title: 'Lead pipeline cooling',
        description: `${Math.round(coldPct * 100)}% of leads are cold — re-engagement needed.`,
        trend: 'falling',
        severity: 'warning',
        confidence: 'MEDIUM',
      });
    }
  }

  // 5. Pipeline health — concentration
  if (activeDeals.length >= 2) {
    const totalValue = activeDeals.reduce((s, d) => s + d.commission, 0);
    const topDeal = [...activeDeals].sort((a, b) => b.commission - a.commission)[0];
    if (topDeal && totalValue > 0 && topDeal.commission / totalValue > 0.5) {
      signals.push({
        id: 'pipeline_concentration',
        title: 'Pipeline concentration risk',
        description: `"${topDeal.title}" represents ${Math.round((topDeal.commission / totalValue) * 100)}% of pipeline value.`,
        trend: 'stable',
        severity: 'warning',
        confidence: 'HIGH',
      });
    }
  }

  return signals.slice(0, 5);
}

const trendIcons = {
  rising: TrendingUp,
  falling: TrendingDown,
  stable: Minus,
};

const severityStyles = {
  info: 'border-muted',
  warning: 'border-warning/30',
  alert: 'border-destructive/30',
};

export function MarketSignalsPanel({ deals, leads, moneyResults }: Props) {
  const signals = useMemo(() => detectMarketSignals(deals, leads, moneyResults), [deals, leads, moneyResults]);

  if (signals.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Market Signals</p>
        </div>
        <p className="text-xs text-muted-foreground text-center py-4">
          No significant market signals detected. Pipeline is operating within normal ranges.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-primary" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Market Signals</p>
        <Badge variant="outline" className="text-[10px] ml-auto">{signals.length} signal{signals.length !== 1 ? 's' : ''}</Badge>
      </div>

      <div className="space-y-2">
        {signals.map(signal => {
          const TrendIcon = trendIcons[signal.trend];
          return (
            <div key={signal.id} className={cn('p-3 rounded-md border', severityStyles[signal.severity])}>
              <div className="flex items-start gap-2">
                <TrendIcon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0',
                  signal.trend === 'rising' ? 'text-emerald-400' :
                  signal.trend === 'falling' ? 'text-red-400' : 'text-muted-foreground'
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium">{signal.title}</p>
                    <span className="text-[9px] text-muted-foreground">{signal.confidence}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{signal.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Signals derived from your pipeline data. Used to position Deal Pilot as a market intelligence layer.
      </p>
    </div>
  );
}
