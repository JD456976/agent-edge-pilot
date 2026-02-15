import { useState } from 'react';
import { Shield, Trash2, Loader2, Globe, Info, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNetworkTelemetry } from '@/hooks/useNetworkTelemetry';
import { toast } from '@/hooks/use-toast';

export function NetworkSettingsSection() {
  const { participation, setOptedIn, setUseNetworkPriors, deleteMyData } = useNetworkTelemetry();
  const [deleting, setDeleting] = useState(false);

  if (participation.loading) return null;

  const handleDelete = async () => {
    setDeleting(true);
    await deleteMyData();
    toast({ description: 'Your benchmark contributions have been deleted.' });
    setDeleting(false);
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4" /> Network Benchmarks
      </h2>

      <div className="space-y-4">
        {/* Explanation */}
        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
          <div className="flex items-start gap-2">
            <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
            <div>
              <p className="font-medium text-foreground">Privacy-first benchmarks</p>
              <p className="mt-1">When enabled, Deal Pilot contributes <span className="font-medium text-foreground">aggregated, bucketed metrics only</span> — never names, emails, addresses, notes, or message content.</p>
              <p className="mt-1">Benchmarks only appear when cohort size ≥ 25, with noise applied to prevent reverse-engineering.</p>
            </div>
          </div>
        </div>

        {/* Opt-in toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Contribute anonymized benchmarks</p>
            <p className="text-xs text-muted-foreground mt-0.5">Share bucketed outcome metrics to help improve cohort insights.</p>
          </div>
          <button
            onClick={() => setOptedIn(!participation.optedIn)}
            className="relative inline-flex h-6 w-11 items-center rounded-full bg-muted transition-colors"
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-primary transition-transform ${participation.optedIn ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Network priors toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Use network priors
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Allow cohort benchmarks to inform default probabilities and suggestions. Never overwrites your settings.
            </p>
          </div>
          <button
            onClick={() => setUseNetworkPriors(!participation.useNetworkPriors)}
            className="relative inline-flex h-6 w-11 items-center rounded-full bg-muted transition-colors"
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-primary transition-transform ${participation.useNetworkPriors ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* What's shared */}
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" /> What is and isn't shared
          </summary>
          <div className="mt-2 pl-4 space-y-1.5 text-muted-foreground">
            <p className="font-medium text-foreground">Shared (bucketed only):</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Event type (task completed, deal closed, etc.)</li>
              <li>Channel (call, text, email)</li>
              <li>Time-to-action bucket (under 1h, same day, etc.)</li>
              <li>Outcome bucket (converted, lost)</li>
              <li>Commission bracket (not exact amount)</li>
              <li>Risk and opportunity bands</li>
            </ul>
            <p className="font-medium text-foreground mt-2">Never shared:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Client names, emails, or phone numbers</li>
              <li>Deal addresses or property details</li>
              <li>Notes, messages, or communication content</li>
              <li>Exact dollar amounts</li>
            </ul>
          </div>
        </details>

        {/* Delete data */}
        {participation.optedIn && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
            Delete my benchmark contributions
          </Button>
        )}
      </div>
    </section>
  );
}
