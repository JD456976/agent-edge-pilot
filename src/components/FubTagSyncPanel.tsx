import { useState, useMemo } from 'react';
import { Tags, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { callEdgeFunction } from '@/lib/edgeClient';
import { toast } from '@/hooks/use-toast';
import type { Lead } from '@/types';

interface Props {
  leads: Lead[];
  hasIntegration: boolean;
}

export function FubTagSyncPanel({ leads, hasIntegration }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ succeeded: number; failed: number } | null>(null);

  const eligibleLeads = useMemo(
    () => leads.filter(l => l.importedFrom?.startsWith('fub:')),
    [leads]
  );

  const handleSync = async () => {
    if (eligibleLeads.length === 0) return;
    setSyncing(true);
    setResult(null);
    try {
      const data = await callEdgeFunction<{ succeeded: number; failed: number }>('fub-tag-sync', {
        lead_ids: eligibleLeads.slice(0, 50).map(l => l.id),
      });
      setResult(data);
      toast({ description: `Tags synced: ${data.succeeded} updated, ${data.failed} failed` });
    } catch (err: any) {
      toast({ description: err?.message || 'Tag sync failed', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  if (!hasIntegration) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Tags className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Tag Sync to FUB</h3>
        <Badge variant="outline" className="text-[10px]">{eligibleLeads.length} linked</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Push Deal Pilot status tags and temperature labels to FUB contacts as tags (e.g., <code className="bg-muted px-1 rounded">dp:hot</code>).
      </p>
      <Button
        size="sm"
        variant="outline"
        className="text-xs"
        onClick={handleSync}
        disabled={syncing || eligibleLeads.length === 0}
      >
        {syncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Tags className="h-3 w-3 mr-1" />}
        Sync Tags ({Math.min(eligibleLeads.length, 50)} leads)
      </Button>
      {result && (
        <div className={`text-xs p-2 rounded-md flex items-center gap-1 ${result.failed === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-warning/10 text-warning'}`}>
          {result.failed === 0 ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {result.succeeded} synced{result.failed > 0 ? `, ${result.failed} failed` : ''}
        </div>
      )}
    </div>
  );
}
