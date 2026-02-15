import { useMemo } from 'react';
import { TrendingUp, DollarSign, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Deal, Lead } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  leads: Lead[];
  deals: Deal[];
}

interface SourceForecast {
  source: string;
  leadCount: number;
  closedDeals: number;
  activeDeals: number;
  historicalRevenue: number;
  conversionRate: number;
  avgDealValue: number;
  projectedRevenue: number;
  pipelineValue: number;
}

export function CommissionForecastBySource({ leads, deals }: Props) {
  const forecasts = useMemo(() => {
    const sourceMap = new Map<string, { leads: Lead[]; deals: Deal[] }>();

    for (const lead of leads) {
      const src = lead.source || 'Unknown';
      if (!sourceMap.has(src)) sourceMap.set(src, { leads: [], deals: [] });
      sourceMap.get(src)!.leads.push(lead);
    }

    for (const deal of deals) {
      // Try to match deal to lead source
      const matchedLead = leads.find(l => l.assignedToUserId === deal.assignedToUserId && l.source);
      const src = matchedLead?.source || (deal.importedFrom?.includes('fub') ? 'Follow Up Boss' : 'Direct');
      if (!sourceMap.has(src)) sourceMap.set(src, { leads: [], deals: [] });
      sourceMap.get(src)!.deals.push(deal);
    }

    const results: SourceForecast[] = [];
    for (const [source, data] of sourceMap) {
      const closedDeals = data.deals.filter(d => d.stage === 'closed');
      const activeDeals = data.deals.filter(d => d.stage !== 'closed');
      const historicalRevenue = closedDeals.reduce((s, d) => s + (d.userCommission ?? d.commission ?? 0), 0);
      const avgDealValue = closedDeals.length > 0 ? historicalRevenue / closedDeals.length : 0;
      const conversionRate = data.leads.length > 0 ? closedDeals.length / data.leads.length : 0;

      // Pipeline value: active deals * stage-weighted probability
      const stageProb: Record<string, number> = { offer: 0.15, offer_accepted: 0.45, pending: 0.75, closed: 1 };
      const pipelineValue = activeDeals.reduce((s, d) => {
        const prob = stageProb[d.stage] ?? 0.3;
        return s + (d.userCommission ?? d.commission ?? 0) * prob;
      }, 0);

      // Projected: unconverted leads * conversion rate * avg deal value
      const unconvertedLeads = data.leads.filter(l => !l.importedFrom?.includes('converted')).length;
      const projectedFromLeads = unconvertedLeads * conversionRate * avgDealValue;
      const projectedRevenue = pipelineValue + projectedFromLeads;

      results.push({
        source,
        leadCount: data.leads.length,
        closedDeals: closedDeals.length,
        activeDeals: activeDeals.length,
        historicalRevenue,
        conversionRate: conversionRate * 100,
        avgDealValue,
        projectedRevenue,
        pipelineValue,
      });
    }

    return results.sort((a, b) => b.projectedRevenue - a.projectedRevenue).slice(0, 6);
  }, [leads, deals]);

  const maxProjected = Math.max(...forecasts.map(f => f.projectedRevenue), 1);
  const totalProjected = forecasts.reduce((s, f) => s + f.projectedRevenue, 0);

  if (forecasts.length === 0) return null;

  const fmtK = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${Math.round(v)}`;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Commission Forecast by Source</h2>
        </div>
        <Badge variant="outline" className="text-xs">{fmtK(totalProjected)} projected</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Future commission projected from conversion rates, active pipeline, and lead volume per source.
      </p>

      <div className="space-y-3">
        {forecasts.map(f => (
          <div key={f.source} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">{f.source}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{f.leadCount} leads</Badge>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">{fmtK(f.historicalRevenue)} earned</span>
                  <ArrowRight className="h-3 w-3 inline mx-1 text-muted-foreground" />
                  <span className="text-xs font-medium text-primary">{fmtK(f.projectedRevenue)}</span>
                </div>
              </div>
            </div>
            <Progress value={(f.projectedRevenue / maxProjected) * 100} className="h-1.5" />
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>{f.conversionRate.toFixed(0)}% conv</span>
              <span>{f.activeDeals} active deals</span>
              {f.avgDealValue > 0 && <span>Avg {fmtK(f.avgDealValue)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
