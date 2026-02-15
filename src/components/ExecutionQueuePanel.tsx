import { useMemo } from 'react';
import { Activity, AlertTriangle, Clock, Play, TrendingUp, Users, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Deal, Lead, Task } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import { detectStagnation, detectRelationshipOpportunities, computeExecutionConfidence, type MomentumSignal, type RelationshipOpportunity, type ConfidenceLevel } from '@/lib/executionEngine';

interface Props {
  deals: Deal[];
  leads: Lead[];
  tasks: Task[];
  moneyResults: MoneyModelResult[];
  opportunityResults: OpportunityHeatResult[];
  onStartAction?: (entityId: string, entityType: 'deal' | 'lead') => void;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const CONFIDENCE_STYLE: Record<ConfidenceLevel, string> = {
  HIGH: 'text-opportunity',
  MEDIUM: 'text-warning',
  LOW: 'text-muted-foreground',
};

export function ExecutionQueuePanel({ deals, leads, tasks, moneyResults, opportunityResults, onStartAction }: Props) {
  // Combine momentum signals + relationship opportunities into a unified queue
  const momentum = useMemo(() => detectStagnation(deals, leads, tasks), [deals, leads, tasks]);
  const relationships = useMemo(() => detectRelationshipOpportunities(leads), [leads]);

  // Build execution queue items with confidence
  const queueItems = useMemo(() => {
    const items: {
      id: string;
      title: string;
      reason: string;
      category: 'momentum' | 'relationship';
      entityId: string;
      entityType: 'deal' | 'lead';
      confidence: ConfidenceLevel;
      value: number;
      estimatedMinutes: number;
    }[] = [];

    for (const sig of momentum.slice(0, 4)) {
      const entity = sig.entityType === 'deal'
        ? deals.find(d => d.id === sig.entityId)
        : leads.find(l => l.id === sig.entityId);
      if (!entity) continue;

      const mr = sig.entityType === 'deal' ? moneyResults.find(r => r.dealId === sig.entityId) : null;
      const or = sig.entityType === 'lead' ? opportunityResults.find(r => r.leadId === sig.entityId) : null;
      const conf = computeExecutionConfidence(sig.entityType, entity, mr, or, tasks);

      items.push({
        id: `m-${sig.entityId}`,
        title: sig.title,
        reason: sig.signal,
        category: 'momentum',
        entityId: sig.entityId,
        entityType: sig.entityType,
        confidence: conf.level,
        value: conf.upside,
        estimatedMinutes: sig.entityType === 'deal' ? 20 : 10,
      });
    }

    for (const rel of relationships.slice(0, 3)) {
      items.push({
        id: `r-${rel.leadId}`,
        title: rel.name,
        reason: rel.reason,
        category: 'relationship',
        entityId: rel.leadId,
        entityType: 'lead',
        confidence: 'LOW',
        value: 0,
        estimatedMinutes: 5,
      });
    }

    return items;
  }, [momentum, relationships, deals, leads, moneyResults, opportunityResults, tasks]);

  if (queueItems.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Execution Queue</p>
        </div>
        <p className="text-sm text-muted-foreground">All entities are active. No stagnation detected.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Execution Queue</p>
        </div>
        <span className="text-[10px] text-muted-foreground">{queueItems.length} items</span>
      </div>

      <div className="space-y-2">
        {queueItems.map((item, i) => (
          <div key={item.id} className="flex items-start gap-3 p-2.5 rounded-md border border-border bg-background/50">
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              <span className="text-[10px] font-mono text-muted-foreground w-4">{i + 1}.</span>
              {item.category === 'momentum' ? (
                <TrendingUp className="h-3.5 w-3.5 text-warning" />
              ) : (
                <Users className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium leading-snug truncate">{item.title}</p>
                <span className={cn('text-[10px] font-medium', CONFIDENCE_STYLE[item.confidence])}>{item.confidence}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>
              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" /> ~{item.estimatedMinutes}min</span>
                {item.value > 0 && <span className="flex items-center gap-0.5"><DollarSign className="h-2.5 w-2.5" /> {formatCurrency(item.value)}</span>}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs shrink-0"
              onClick={() => onStartAction?.(item.entityId, item.entityType)}
            >
              <Play className="h-3 w-3 mr-1" /> Act
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
