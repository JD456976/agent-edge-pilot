import { useMemo } from 'react';
import { Radar, Flame, Clock, UserCheck, DollarSign, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Deal, Lead, Task } from '@/types';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';

interface RadarItem {
  id: string;
  title: string;
  reason: string;
  type: 'warm_decay' | 'past_client' | 'uncontacted_referral' | 'ready_buyer' | 'price_adjust';
  estimatedValue?: number;
  entityId: string;
  entityType: 'lead' | 'deal';
}

interface Props {
  leads: Lead[];
  deals: Deal[];
  tasks: Task[];
  opportunityResults: OpportunityHeatResult[];
  onAction?: (item: RadarItem) => void;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const TYPE_LABELS: Record<RadarItem['type'], { label: string; icon: typeof Flame }> = {
  warm_decay: { label: 'Warming lead going cold', icon: Clock },
  past_client: { label: 'Past client follow-up', icon: UserCheck },
  uncontacted_referral: { label: 'Referral not contacted', icon: Flame },
  ready_buyer: { label: 'Buyer ready to act', icon: DollarSign },
  price_adjust: { label: 'Listing price review', icon: DollarSign },
};

export function OpportunityRadarPanel({ leads, deals, tasks, opportunityResults, onAction }: Props) {
  const items = useMemo((): RadarItem[] => {
    const result: RadarItem[] = [];
    const now = new Date();

    // Warm leads going cold (no touch > 5 days)
    for (const lead of leads) {
      if (lead.leadTemperature !== 'warm') continue;
      const lastTouch = lead.lastTouchedAt ? new Date(lead.lastTouchedAt) : new Date(lead.lastContactAt);
      const daysSince = (now.getTime() - lastTouch.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 5) {
        const opp = opportunityResults.find(r => r.leadId === lead.id);
        result.push({
          id: `warm-${lead.id}`,
          title: `Re-engage ${lead.name}`,
          reason: `Warm lead — no contact in ${Math.round(daysSince)} days`,
          type: 'warm_decay',
          estimatedValue: opp?.opportunityValue,
          entityId: lead.id,
          entityType: 'lead',
        });
      }
    }

    // Referrals not contacted (source = referral, no tasks)
    for (const lead of leads) {
      if (!lead.source?.toLowerCase().includes('referral')) continue;
      const hasTasks = tasks.some(t => t.relatedLeadId === lead.id);
      if (!hasTasks) {
        const opp = opportunityResults.find(r => r.leadId === lead.id);
        result.push({
          id: `ref-${lead.id}`,
          title: `Contact referral: ${lead.name}`,
          reason: 'Referral lead — no outreach yet',
          type: 'uncontacted_referral',
          estimatedValue: opp?.opportunityValue,
          entityId: lead.id,
          entityType: 'lead',
        });
      }
    }

    // Hot leads ready to act
    for (const lead of leads) {
      if (lead.leadTemperature !== 'hot') continue;
      if (lead.engagementScore >= 60) {
        const opp = opportunityResults.find(r => r.leadId === lead.id);
        if (opp && opp.opportunityScore >= 50) {
          result.push({
            id: `hot-${lead.id}`,
            title: `${lead.name} is ready to act`,
            reason: `High engagement (${lead.engagementScore}) — hot lead`,
            type: 'ready_buyer',
            estimatedValue: opp.opportunityValue,
            entityId: lead.id,
            entityType: 'lead',
          });
        }
      }
    }

    // Listings needing price review (sell-side, > 30 days)
    for (const deal of deals) {
      if (deal.stage === 'closed') continue;
      const dom = Math.floor((now.getTime() - new Date(deal.createdAt || deal.closeDate).getTime()) / (1000 * 60 * 60 * 24));
      if (dom > 30) {
        result.push({
          id: `price-${deal.id}`,
          title: `Review pricing: ${deal.title}`,
          reason: `${dom} days on market — consider adjustment`,
          type: 'price_adjust',
          estimatedValue: deal.commission,
          entityId: deal.id,
          entityType: 'deal',
        });
      }
    }

    return result.sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0)).slice(0, 6);
  }, [leads, deals, tasks, opportunityResults]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-opportunity" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Opportunity Radar</p>
        </div>
        <p className="text-sm text-muted-foreground">No hidden opportunities detected right now.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-opportunity" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Opportunity Radar</p>
        </div>
        <span className="text-[10px] text-muted-foreground">{items.length} found</span>
      </div>

      <div className="space-y-2">
        {items.map(item => {
          const config = TYPE_LABELS[item.type];
          const Icon = config.icon;
          return (
            <div key={item.id} className="flex items-start gap-3 p-2.5 rounded-md border border-border bg-background/50">
              <Icon className="h-3.5 w-3.5 text-opportunity shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug truncate">{item.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{item.reason}</span>
                  {item.estimatedValue && <span className="text-xs font-medium text-opportunity">{formatCurrency(item.estimatedValue)}</span>}
                </div>
              </div>
              <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => onAction?.(item)}>
                <Play className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
