import { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { Target, DollarSign, Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Deal, DealStage, RiskLevel } from '@/types';
import { cn } from '@/lib/utils';

const STAGES: { key: DealStage; label: string }[] = [
  { key: 'offer', label: 'Offer' },
  { key: 'offer_accepted', label: 'Accepted' },
  { key: 'pending', label: 'Pending' },
  { key: 'closed', label: 'Closed' },
];

const riskVariant: Record<RiskLevel, 'urgent' | 'warning' | 'opportunity'> = {
  red: 'urgent', yellow: 'warning', green: 'opportunity',
};

function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors space-y-2">
      <p className="text-sm font-semibold leading-tight">{deal.title}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <DollarSign className="h-3 w-3" />
        <span>${deal.price.toLocaleString()}</span>
        <span className="text-opportunity font-medium">${(deal.commission / 1000).toFixed(0)}K comm.</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {new Date(deal.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
        <Badge variant={riskVariant[deal.riskLevel]} className="text-[10px] px-1.5 py-0">
          {deal.riskLevel === 'red' ? 'Risk' : deal.riskLevel === 'yellow' ? 'Watch' : 'Good'}
        </Badge>
      </div>
    </button>
  );
}

function DealDetail({ deal, tasks, onClose }: { deal: Deal; tasks: { id: string; title: string; completedAt?: string }[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-t-2xl md:rounded-2xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{deal.title}</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-medium">${deal.price.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Commission</span><span className="font-medium text-opportunity">${deal.commission.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Close Date</span><span>{new Date(deal.closeDate).toLocaleDateString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Risk</span><Badge variant={riskVariant[deal.riskLevel]}>{deal.riskLevel}</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Stage</span><span className="capitalize">{deal.stage.replace('_', ' ')}</span></div>
        </div>
        {tasks.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold mb-2">Related Tasks</h3>
            <div className="space-y-1.5">
              {tasks.map(t => (
                <div key={t.id} className={cn("text-sm py-1", t.completedAt && "line-through text-muted-foreground")}>{t.title}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Pipeline() {
  const { deals, tasks, hasData, seedDemoData } = useData();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  if (!hasData) {
    return (
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold mb-1">Pipeline</h1>
        <p className="text-sm text-muted-foreground mb-6">Your deals by stage</p>
        <EmptyState title="No deals yet" description="Load demo data to see a realistic pipeline with deals at various stages." actionLabel="Load Demo Data" onAction={seedDemoData} icon={<Target className="h-8 w-8 text-muted-foreground" />} />
      </div>
    );
  }

  const relatedTasks = selectedDeal ? tasks.filter(t => t.relatedDealId === selectedDeal.id) : [];

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <h1 className="text-xl font-bold mb-1">Pipeline</h1>
      <p className="text-sm text-muted-foreground mb-4">Your deals by stage</p>

      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        {STAGES.map(stage => {
          const stageDeals = deals.filter(d => d.stage === stage.key);
          return (
            <div key={stage.key} className="min-w-[260px] md:min-w-0 md:flex-1">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{stageDeals.length}</span>
              </div>
              <div className="space-y-2">
                {stageDeals.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg py-8 text-center text-xs text-muted-foreground">No deals</div>
                ) : (
                  stageDeals.map(deal => <DealCard key={deal.id} deal={deal} onClick={() => setSelectedDeal(deal)} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDeal && <DealDetail deal={selectedDeal} tasks={relatedTasks} onClose={() => setSelectedDeal(null)} />}
    </div>
  );
}
