import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, Eye, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface DeltaItem {
  entity_type: string;
  fub_id: string;
  label: string;
  status: 'new' | 'updated' | 'conflict';
  changes: string[];
  fub_updated: string;
  local_modified?: string;
  urgency: number;
}

interface Props {
  items: DeltaItem[];
  onClose: () => void;
  onRefresh: () => void;
}

const STATUS_CONFIG = {
  new: { label: 'New', variant: 'opportunity' as const },
  updated: { label: 'Updated', variant: 'warning' as const },
  conflict: { label: 'Potential Conflict', variant: 'urgent' as const },
};

export function FubDriftReviewModal({ items, onClose, onRefresh }: Props) {
  const [ignoringIds, setIgnoringIds] = useState<Set<string>>(new Set());
  const [watchingIds, setWatchingIds] = useState<Set<string>>(new Set());

  const leads = items.filter(i => i.entity_type === 'lead');
  const deals = items.filter(i => i.entity_type === 'deal');
  const tasks = items.filter(i => i.entity_type === 'task');

  const handleIgnore = useCallback(async (item: DeltaItem) => {
    setIgnoringIds(prev => new Set(prev).add(item.fub_id));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('fub_ignored_changes' as any).insert({
        user_id: user.id,
        entity_type: item.entity_type,
        fub_id: item.fub_id,
      });
      toast({ description: `Ignored "${item.label}" for 7 days.`, duration: 2000 });
    } catch {
      toast({ description: 'Failed to ignore item.', duration: 2000 });
    }
  }, []);

  const handleWatch = useCallback(async (item: DeltaItem) => {
    setWatchingIds(prev => new Set(prev).add(item.fub_id));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('fub_watchlist' as any).insert({
        user_id: user.id,
        entity_type: item.entity_type,
        fub_id: item.fub_id,
        label: item.label,
      });
      toast({ description: `"${item.label}" added to watchlist.`, duration: 2000 });
    } catch {
      toast({ description: 'Failed to add to watchlist.', duration: 2000 });
    }
  }, []);

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const renderItems = (list: DeltaItem[]) => {
    if (list.length === 0) {
      return <p className="text-sm text-muted-foreground text-center py-6">No changes detected</p>;
    }
    return (
      <div className="space-y-2">
        {list.map((item) => {
          const cfg = STATUS_CONFIG[item.status];
          const isIgnored = ignoringIds.has(item.fub_id);
          const isWatched = watchingIds.has(item.fub_id);
          return (
            <div
              key={`${item.entity_type}-${item.fub_id}`}
              className={`p-3 rounded-md border border-border bg-card/50 space-y-2 ${isIgnored ? 'opacity-40' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0 shrink-0">{cfg.label}</Badge>
                    <span className="text-sm font-medium truncate">{item.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                    <span>FUB: {formatDate(item.fub_updated)}</span>
                    {item.local_modified && <span>Local: {formatDate(item.local_modified)}</span>}
                  </div>
                </div>
              </div>

              {item.changes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.changes.map((c, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c}</span>
                  ))}
                </div>
              )}

              {item.status === 'conflict' && (
                <p className="text-[11px] text-warning italic">
                  This record was edited locally after import and also changed in FUB.
                </p>
              )}

              <div className="flex gap-1.5">
                {!isIgnored && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => handleIgnore(item)}>
                    <X className="h-3 w-3 mr-0.5" /> Ignore
                  </Button>
                )}
                {!isWatched && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => handleWatch(item)}>
                    <Eye className="h-3 w-3 mr-0.5" /> Watch
                  </Button>
                )}
                {isIgnored && <span className="text-[10px] text-muted-foreground italic">Ignored for 7 days</span>}
                {isWatched && <span className="text-[10px] text-muted-foreground italic">Added to watchlist</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review FUB Changes</DialogTitle>
          <DialogDescription>
            Changes detected in Follow Up Boss since your last sync. Review and decide how to proceed.
          </DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No changes to review.</p>
        ) : (
          <>
            <div className="flex gap-2 mb-2 text-xs">
              <span className="text-muted-foreground">{items.length} total change{items.length !== 1 ? 's' : ''}</span>
              {items.filter(i => i.status === 'conflict').length > 0 && (
                <span className="text-urgent flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {items.filter(i => i.status === 'conflict').length} potential conflict{items.filter(i => i.status === 'conflict').length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <Tabs defaultValue="all">
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1">All ({items.length})</TabsTrigger>
                <TabsTrigger value="leads" className="flex-1">Leads ({leads.length})</TabsTrigger>
                <TabsTrigger value="deals" className="flex-1">Deals ({deals.length})</TabsTrigger>
                <TabsTrigger value="tasks" className="flex-1">Tasks ({tasks.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="all">{renderItems(items)}</TabsContent>
              <TabsContent value="leads">{renderItems(leads)}</TabsContent>
              <TabsContent value="deals">{renderItems(deals)}</TabsContent>
              <TabsContent value="tasks">{renderItems(tasks)}</TabsContent>
            </Tabs>
          </>
        )}

        <div className="flex justify-between pt-2 border-t border-border">
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          <Button size="sm" variant="outline" onClick={() => { onClose(); onRefresh(); }}>
            <ArrowRight className="h-3 w-3 mr-1" /> Re-check
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
