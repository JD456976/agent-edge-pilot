import { useMemo } from 'react';
import { BarChart3, TrendingUp, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Deal, Lead } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  leads: Lead[];
  deals: Deal[];
}

interface SourceROI {
  source: string;
  leadCount: number;
  dealCount: number;
  totalRevenue: number;
  conversionRate: number;
  avgDealValue: number;
}

export function LeadSourceROIPanel({ leads, deals }: Props) {
  const sources = useMemo(() => {
    const sourceMap = new Map<string, { leads: Lead[]; deals: Deal[] }>();

    for (const lead of leads) {
      const src = lead.source || 'Unknown';
      if (!sourceMap.has(src)) sourceMap.set(src, { leads: [], deals: [] });
      sourceMap.get(src)!.leads.push(lead);
    }

    // Map deals to sources via assignedToUserId matching
    for (const deal of deals) {
      const matchedLead = leads.find(l => l.assignedToUserId === deal.assignedToUserId);
      const src = matchedLead?.source || deal.importedFrom?.includes('fub') ? 'Follow Up Boss' : 'Direct';
      if (!sourceMap.has(src)) sourceMap.set(src, { leads: [], deals: [] });
      sourceMap.get(src)!.deals.push(deal);
    }

    const results: SourceROI[] = [];
    for (const [source, data] of sourceMap) {
      const closedDeals = data.deals.filter(d => d.stage === 'closed');
      const totalRevenue = closedDeals.reduce((s, d) => s + d.commission, 0);
      results.push({
        source,
        leadCount: data.leads.length,
        dealCount: closedDeals.length,
        totalRevenue,
        conversionRate: data.leads.length > 0 ? (closedDeals.length / data.leads.length) * 100 : 0,
        avgDealValue: closedDeals.length > 0 ? totalRevenue / closedDeals.length : 0,
      });
    }

    return results.sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 8);
  }, [leads, deals]);

  const maxRevenue = Math.max(...sources.map(s => s.totalRevenue), 1);

  if (sources.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Lead Source ROI</h2>
      </div>
      <p className="text-xs text-muted-foreground">Revenue by lead source cross-referenced with FUB data.</p>

      <div className="space-y-2">
        {sources.map(s => (
          <div key={s.source} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">{s.source}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{s.leadCount} leads</Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {s.totalRevenue > 0 && (
                  <span className="text-xs font-medium text-opportunity flex items-center gap-0.5">
                    <DollarSign className="h-3 w-3" />
                    {s.totalRevenue >= 1000 ? `${(s.totalRevenue / 1000).toFixed(0)}K` : s.totalRevenue}
                  </span>
                )}
                <span className={cn('text-xs', s.conversionRate >= 10 ? 'text-opportunity' : 'text-muted-foreground')}>
                  {s.conversionRate.toFixed(0)}% conv.
                </span>
              </div>
            </div>
            <Progress value={(s.totalRevenue / maxRevenue) * 100} className="h-1" />
          </div>
        ))}
      </div>

      {/* Top insight */}
      {sources[0] && sources[0].totalRevenue > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-opportunity/5 border border-opportunity/10">
          <TrendingUp className="h-3.5 w-3.5 text-opportunity shrink-0" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">{sources[0].source}</strong> is your highest-performing source
            with ${sources[0].totalRevenue >= 1000 ? `${(sources[0].totalRevenue / 1000).toFixed(0)}K` : sources[0].totalRevenue} in revenue.
          </p>
        </div>
      )}
    </div>
  );
}
