import { useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { callEdgeFunction } from '@/lib/edgeClient';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  eligibleCount: number;
  onSuccess: () => void;
}

interface BackfillResult {
  deals_considered: number;
  deals_updated: number;
  participants_created: number;
  skipped_edited: number;
  skipped_missing_price: number;
  skipped_no_defaults: number;
  skipped_other: number;
  skipped_details: { deal_id: string; reason: string }[];
}

export function BulkBackfillModal({ open, onClose, eligibleCount, onSuccess }: Props) {
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);

  const canApply = confirmation === 'APPLY';

  const handleApply = async () => {
    setLoading(true);
    try {
      const data = await callEdgeFunction<BackfillResult>('commission-backfill', {}, { timeoutMs: 30000 });
      setResult(data);
      toast({
        title: `Defaults applied to ${data.deals_updated} deal${data.deals_updated !== 1 ? 's' : ''}`,
        description: data.skipped_missing_price > 0
          ? `Add price to ${data.skipped_missing_price} deal${data.skipped_missing_price !== 1 ? 's' : ''} to calculate money at risk.`
          : undefined,
      });
      onSuccess();
    } catch (err: any) {
      toast({
        title: 'Backfill failed',
        description: err?.message || 'An unexpected error occurred.',
        // paused edge function
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setConfirmation('');
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-4 w-4 text-opportunity" />
                Backfill Complete
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Deals considered</span>
                <span className="font-medium">{result.deals_considered}</span>
                <span className="text-muted-foreground">Deals updated</span>
                <span className="font-medium text-opportunity">{result.deals_updated}</span>
                <span className="text-muted-foreground">Participants created</span>
                <span className="font-medium">{result.participants_created}</span>
                {result.skipped_edited > 0 && (<>
                  <span className="text-muted-foreground">Skipped (edited)</span>
                  <span className="font-medium">{result.skipped_edited}</span>
                </>)}
                {result.skipped_missing_price > 0 && (<>
                  <span className="text-muted-foreground">Skipped (no price)</span>
                  <span className="font-medium">{result.skipped_missing_price}</span>
                </>)}
              </div>
              {result.skipped_missing_price > 0 && (
                <p className="text-xs text-muted-foreground">
                  Add price to {result.skipped_missing_price} deal{result.skipped_missing_price !== 1 ? 's' : ''} to calculate money at risk.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button size="sm" onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Apply your commission defaults?</DialogTitle>
              <DialogDescription>
                This will add you as a participant (if missing) and apply your default commission rate (if missing)
                to eligible deals. It will not overwrite any deal you edited.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex items-start gap-2 text-xs text-muted-foreground border-l-2 border-border pl-3">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                <span>Up to {eligibleCount} deal{eligibleCount !== 1 ? 's' : ''} may be updated. Edited deals are never touched.</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Type <span className="font-mono font-bold">APPLY</span> to confirm
                </label>
                <Input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="APPLY"
                  className="font-mono"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button size="sm" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button size="sm" onClick={handleApply} disabled={!canApply || loading}>
                {loading ? 'Applying…' : `Apply defaults to ${eligibleCount} deals`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
