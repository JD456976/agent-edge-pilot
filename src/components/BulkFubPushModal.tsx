import { useState, useMemo } from 'react';
import { Upload, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { callEdgeFunction } from '@/lib/edgeClient';
import { toast } from '@/hooks/use-toast';
import type { Lead, Deal } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  leads: Lead[];
  deals: Deal[];
}

type EntitySelection = { entity_type: 'lead' | 'deal'; entity_id: string; name: string };

export function BulkFubPushModal({ open, onClose, leads, deals }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);
  const [results, setResults] = useState<{ entity_id: string; ok: boolean; error?: string }[] | null>(null);
  const [tab, setTab] = useState<'leads' | 'deals'>('leads');

  const entities = useMemo(() => {
    const items: EntitySelection[] = [];
    for (const l of leads) items.push({ entity_type: 'lead', entity_id: l.id, name: l.name });
    for (const d of deals) items.push({ entity_type: 'deal', entity_id: d.id, name: d.title });
    return items;
  }, [leads, deals]);

  const filteredEntities = entities.filter(e => tab === 'leads' ? e.entity_type === 'lead' : e.entity_type === 'deal');

  const toggleEntity = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < 50) next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    const next = new Set(selected);
    for (const e of filteredEntities.slice(0, 50 - next.size)) next.add(e.entity_id);
    setSelected(next);
  };

  const handlePush = async () => {
    if (selected.size === 0) return;
    setPushing(true);
    setResults(null);
    try {
      const batch = entities.filter(e => selected.has(e.entity_id)).map(e => ({
        entity_type: e.entity_type,
        entity_id: e.entity_id,
      }));
      const data = await callEdgeFunction<{ succeeded: number; failed: number; results: any[] }>('fub-bulk-push', { entities: batch });
      setResults(data.results);
      toast({ description: `${data.succeeded} pushed, ${data.failed} failed` });
    } catch (err: any) {
      toast({ description: err?.message || 'Bulk push failed', variant: 'destructive' });
    } finally {
      setPushing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Bulk Push to FUB
          </DialogTitle>
          <DialogDescription className="text-xs">Select up to 50 entities to push to Follow Up Boss.</DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          {(['leads', 'deals'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              {t === 'leads' ? `Leads (${leads.length})` : `Deals (${deals.length})`}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{selected.size}/50 selected</span>
          <Button size="sm" variant="ghost" className="text-xs h-6" onClick={selectAll}>Select All</Button>
        </div>

        <ScrollArea className="h-[240px] border border-border rounded-md">
          <div className="p-2 space-y-0.5">
            {filteredEntities.map(e => {
              const checked = selected.has(e.entity_id);
              const result = results?.find(r => r.entity_id === e.entity_id);
              return (
                <label
                  key={e.entity_id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleEntity(e.entity_id)} />
                  <span className="truncate flex-1">{e.name}</span>
                  {result && (
                    result.ok
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  )}
                </label>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={handlePush} disabled={pushing || selected.size === 0}>
            {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            Push {selected.size} to FUB
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
        </div>

        {results && (
          <div className="text-xs text-muted-foreground">
            {results.filter(r => r.ok).length} succeeded, {results.filter(r => !r.ok).length} failed
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
