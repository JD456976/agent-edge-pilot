import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, ArrowRight, Clock, Shield, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface ImportResult {
  committed: {
    leads: number;
    deals: number;
    tasks: number;
    participants: number;
  };
  skipped: {
    leads: number;
    deals: number;
    tasks: number;
  };
  matched: {
    leads: number;
    deals: number;
    tasks: number;
  };
  isReviewer: boolean;
  partialFailures?: { type: string; title: string; error: string }[];
  durationMs?: number;
}

interface ImportCompletionModalProps {
  result: ImportResult;
  onViewHistory: () => void;
  onClose: () => void;
}

export function ImportCompletionModal({ result, onViewHistory, onClose }: ImportCompletionModalProps) {
  const navigate = useNavigate();
  const { isReviewer } = useAuth();
  const hasFailures = result.partialFailures && result.partialFailures.length > 0;
  const totalImported = result.committed.leads + result.committed.deals + result.committed.tasks;
  const totalSkipped = result.skipped.leads + result.skipped.deals + result.skipped.tasks;
  const totalMatched = result.matched.leads + result.matched.deals + result.matched.tasks;

  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      {/* Header */}
      <div className="text-center mb-6">
        {hasFailures ? (
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-warning/10 mb-3">
            <AlertTriangle className="h-6 w-6 text-warning" />
          </div>
        ) : (
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 mb-3">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
        )}
        <h1 className="text-xl font-bold">
          {hasFailures ? 'Import Partially Complete' : 'Import Complete'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isReviewer
            ? 'Demo import completed — no permanent data saved.'
            : hasFailures
              ? 'Some items could not be imported.'
              : 'All records have been safely processed.'}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{result.committed.leads}</p>
          <p className="text-xs text-muted-foreground">Leads Imported</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{result.committed.deals}</p>
          <p className="text-xs text-muted-foreground">Deals Imported</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{result.committed.tasks}</p>
          <p className="text-xs text-muted-foreground">Tasks Imported</p>
        </div>
      </div>

      {/* Additional stats row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-lg font-bold text-muted-foreground">{totalSkipped}</p>
          <p className="text-xs text-muted-foreground">Conflicts Skipped</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-lg font-bold text-muted-foreground">{totalMatched}</p>
          <p className="text-xs text-muted-foreground">Records Linked</p>
        </div>
      </div>

      {/* Partial Failures */}
      {hasFailures && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Items that could not be imported
          </h3>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {result.partialFailures!.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{f.type}: {f.title}</span>
                <span className="text-destructive">{f.error}</span>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="mt-2 w-full text-xs">
            Retry Failed Items
          </Button>
        </div>
      )}

      {/* Impact Section */}
      {!isReviewer && totalImported > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2">Your Command Center has been updated</h3>
          <div className="space-y-1.5">
            {result.committed.leads > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                {result.committed.leads} new opportunit{result.committed.leads === 1 ? 'y' : 'ies'} detected
              </p>
            )}
            {result.committed.deals > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                {result.committed.deals} new deal{result.committed.deals === 1 ? '' : 's'} added to pipeline
              </p>
            )}
            {result.committed.tasks > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                {result.committed.tasks} task{result.committed.tasks === 1 ? '' : 's'} added to Today/Upcoming
              </p>
            )}
          </div>
        </div>
      )}

      {/* Safety Confirmation */}
      <div className="rounded-lg border border-border bg-card p-3 mb-6 flex items-start gap-2">
        <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Your existing notes, commissions, and deal data were preserved. No records were overwritten.
        </p>
      </div>

      {/* Duration */}
      {result.durationMs != null && (
        <p className="text-xs text-muted-foreground text-center mb-4 flex items-center justify-center gap-1">
          <Clock className="h-3 w-3" />
          Completed in {(result.durationMs / 1000).toFixed(1)}s
        </p>
      )}

      {/* Primary Actions */}
      <div className="flex gap-3 mb-3">
        <Button className="flex-1" onClick={() => navigate('/')}>
          Go to Command Center
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
        <Button variant="outline" className="flex-1" onClick={onClose}>
          View Imported Items
        </Button>
      </div>

      {/* Secondary Link */}
      <button
        onClick={onViewHistory}
        className="w-full text-center text-xs text-primary hover:text-primary/80 transition-colors py-2"
      >
        View Import History
      </button>
    </div>
  );
}
