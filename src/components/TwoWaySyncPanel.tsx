import { useState } from 'react';
import { ArrowUpDown, Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { callEdgeFunction } from '@/lib/edgeClient';
import { toast } from '@/hooks/use-toast';
import type { Deal, Lead } from '@/types';

interface Props {
  entity: Deal | Lead;
  entityType: 'deal' | 'lead';
}

export function TwoWaySyncPanel({ entity, entityType }: Props) {
  const [pushing, setPushing] = useState(false);
  const [lastPush, setLastPush] = useState<{ ok: boolean; message: string } | null>(null);

  const isImported = 'importedFrom' in entity && (entity as any).importedFrom?.startsWith('fub:');
  const fubId = isImported ? (entity as any).importedFrom?.replace('fub:', '') : null;

  const handlePush = async (action: 'update' | 'create') => {
    setPushing(true);
    setLastPush(null);
    try {
      const fields: Record<string, unknown> = {};
      if (entityType === 'lead') {
        const lead = entity as Lead;
        fields.tags = lead.statusTags;
      } else {
        const deal = entity as Deal;
        fields.price = deal.price;
        fields.stage = deal.stage;
      }

      await callEdgeFunction('fub-push', {
        entity_type: entityType,
        entity_id: entity.id,
        action,
        fields,
      });
      setLastPush({ ok: true, message: `Successfully ${action === 'update' ? 'updated' : 'created'} in FUB` });
      toast({ description: `${entityType === 'deal' ? 'Deal' : 'Lead'} synced to FUB` });
    } catch (err: any) {
      setLastPush({ ok: false, message: err?.message || 'Push failed' });
      toast({ description: 'Failed to sync to FUB', variant: 'destructive' });
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Two-Way Sync</span>
        {isImported && <Badge variant="outline" className="text-[10px]">FUB #{fubId}</Badge>}
      </div>

      <div className="flex gap-2">
        {isImported ? (
          <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => handlePush('update')} disabled={pushing}>
            {pushing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
            Push Updates to FUB
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => handlePush('create')} disabled={pushing}>
            {pushing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
            Create in FUB
          </Button>
        )}
      </div>

      {lastPush && (
        <div className={`text-xs p-2 rounded-md flex items-center gap-1 ${lastPush.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
          {lastPush.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {lastPush.message}
        </div>
      )}
    </div>
  );
}
