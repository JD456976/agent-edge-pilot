import { useState } from 'react';
import { Ghost, Zap, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callEdgeFunction } from '@/lib/edgeClient';
import { toast } from '@/hooks/use-toast';

interface Props {
  leadId: string;
  leadName: string;
  ghostScore: number;
}

export function GhostingRecoveryAction({ leadId, leadName, ghostScore }: Props) {
  const [triggering, setTriggering] = useState(false);
  const [actionPlanId, setActionPlanId] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleTrigger = async () => {
    setTriggering(true);
    setResult(null);
    try {
      await callEdgeFunction('fub-ghosting-recovery', {
        lead_id: leadId,
        action_plan_id: actionPlanId.trim() || undefined,
      });
      setResult({ ok: true, message: `Recovery triggered for ${leadName}` });
      toast({ description: `Ghosting recovery sent to FUB for ${leadName}` });
    } catch (err: any) {
      setResult({ ok: false, message: err?.message || 'Failed to trigger recovery' });
      toast({ description: 'Ghosting recovery requires FUB integration to be active.' });
    } finally {
      setTriggering(false);
    }
  };

  if (ghostScore < 50) return null;

  return (
    <div className="rounded-md border border-warning/20 bg-warning/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Ghost className="h-3.5 w-3.5 text-warning" />
        <span className="text-xs font-medium">Auto-Recovery Available</span>
        <Badge variant="outline" className="text-[10px] border-warning/30 text-warning">Score {ghostScore}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Trigger a FUB action plan and add a recovery note for this unresponsive client.
      </p>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-[10px] text-muted-foreground">FUB Action Plan ID (optional)</Label>
          <Input
            type="text"
            placeholder="e.g. 12345"
            value={actionPlanId}
            onChange={e => setActionPlanId(e.target.value)}
            className="h-7 text-xs mt-0.5"
          />
        </div>
        <Button size="sm" variant="outline" className="text-xs h-7 shrink-0" onClick={handleTrigger} disabled={triggering}>
          {triggering ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
          Trigger Recovery
        </Button>
      </div>
      {result && (
        <div className={`text-xs p-2 rounded-md flex items-center gap-1 ${result.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
          {result.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {result.message}
        </div>
      )}
    </div>
  );
}
