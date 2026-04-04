import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, ArrowRight, Clock, Shield, AlertTriangle, Loader2, Undo2, RefreshCw, RotateCcw, AlertCircle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

export interface PartialFailure {
  type: string;
  title: string;
  error: string;
  retryable: boolean;
}

export interface ImportResult {
  importRunId: string;
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
  partialFailures?: PartialFailure[];
  durationMs?: number;
  committedAt?: string;
}

interface ImportCompletionModalProps {
  result: ImportResult;
  onViewHistory: () => void;
  onClose: () => void;
}

function categorizeFailure(f: PartialFailure): 'retryable' | 'fix_required' | 'blocked' {
  if (/permission|reviewer|unresolved|blocked/i.test(f.error)) return 'blocked';
  if (f.retryable) return 'retryable';
  return 'fix_required';
}

function getFailureGuidance(category: string): string {
  switch (category) {
    case 'retryable': return 'Temporary issue — retry should resolve this.';
    case 'fix_required': return 'Data mapping or validation issue — review the source data.';
    case 'blocked': return 'Permissions or configuration issue — contact your admin.';
    default: return '';
  }
}

export function ImportCompletionModal({ result, onViewHistory, onClose }: ImportCompletionModalProps) {
  const navigate = useNavigate();
  const { logAdminAction } = useAuth();
  const { refreshData } = useData();
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const [undoTimeLeft, setUndoTimeLeft] = useState(600); // 10 minutes in seconds
  const [rescoring, setRescoring] = useState(false);
  const [rescored, setRescored] = useState(false);

  const hasFailures = result.partialFailures && result.partialFailures.length > 0;
  const totalImported = result.committed.leads + result.committed.deals + result.committed.tasks;
  const totalSkipped = result.skipped.leads + result.skipped.deals + result.skipped.tasks;
  const totalMatched = result.matched.leads + result.matched.deals + result.matched.tasks;

  // Undo countdown timer
  useEffect(() => {
    if (isReviewer || undone) return;
    const committedAt = result.committedAt ? new Date(result.committedAt).getTime() : Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - committedAt) / 1000);
      const remaining = Math.max(0, 600 - elapsed);
      setUndoTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [result.committedAt, isReviewer, undone]);

  // Post-import scoring refresh
  useEffect(() => {
    if (totalImported === 0 || isReviewer) return;
    const timer = setTimeout(() => {
      setRescoring(true);
      // Trigger a data refresh which will cause Intelligence Engine to re-score
      refreshData().then(() => {
        setRescoring(false);
        setRescored(true);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [totalImported, isReviewer, refreshData]);

  const handleUndo = useCallback(async () => {
    setUndoing(true);
    try {
      const res = await supabase.functions.invoke('fub-undo', {
        body: { import_run_id: result.importRunId },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      const { deleted, skipped_edited, skipped_matched } = res.data;
      const totalSkippedEdited = (skipped_edited?.leads || 0) + (skipped_edited?.deals || 0) + (skipped_edited?.tasks || 0);
      setUndone(true);
      await refreshData();
      toast({ 
        description: totalSkippedEdited > 0
          ? `Import undone. ${totalSkippedEdited} item(s) not removed because they were edited after import.`
          : 'Import has been undone. All created records have been removed.',
      });
    } catch (err: any) {
      toast({ title: 'Undo failed', description: err.message, variant: 'destructive' });
    } finally {
      setUndoing(false);
    }
  }, [result.importRunId, refreshData]);

  const handleViewImported = useCallback(() => {
    // Store the import run ID for filtered views
    sessionStorage.setItem('dp-import-filter-run', result.importRunId);
    onClose();
  }, [result.importRunId, onClose]);

  if (undone) {
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-muted mb-3">
            <Undo2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold">Import Undone</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All records created by this import have been removed. Matched/linked records were not affected.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 mb-6 flex items-start gap-2">
          <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Your existing data remains intact. Only newly created records from this import were removed.
          </p>
        </div>
        <Button className="w-full" onClick={() => navigate('/')}>
          Return to Command Center
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    );
  }

  // Categorize failures
  const retryable = (result.partialFailures || []).filter(f => categorizeFailure(f) === 'retryable');
  const fixRequired = (result.partialFailures || []).filter(f => categorizeFailure(f) === 'fix_required');
  const blocked = (result.partialFailures || []).filter(f => categorizeFailure(f) === 'blocked');

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

      {/* Categorized Failure Recovery */}
      {retryable.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <RotateCcw className="h-4 w-4 text-warning" />
            Retryable ({retryable.length})
          </h3>
          <p className="text-xs text-muted-foreground mb-2">{getFailureGuidance('retryable')}</p>
          <div className="space-y-1.5 max-h-24 overflow-y-auto">
            {retryable.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{f.type}: {f.title}</span>
                <span className="text-warning">{f.error}</span>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="mt-2 w-full text-xs">
            <RefreshCw className="h-3 w-3 mr-1" /> Retry Failed Items
          </Button>
        </div>
      )}

      {fixRequired.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Fix Required ({fixRequired.length})
          </h3>
          <p className="text-xs text-muted-foreground mb-2">{getFailureGuidance('fix_required')}</p>
          <div className="space-y-1.5 max-h-24 overflow-y-auto">
            {fixRequired.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{f.type}: {f.title}</span>
                <span className="text-destructive">{f.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {blocked.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            Blocked ({blocked.length})
          </h3>
          <p className="text-xs text-muted-foreground mb-2">{getFailureGuidance('blocked')}</p>
          <div className="space-y-1.5 max-h-24 overflow-y-auto">
            {blocked.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{f.type}: {f.title}</span>
                <span className="text-muted-foreground">{f.error}</span>
              </div>
            ))}
          </div>
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

      {/* Scoring Refresh Indicator */}
      {rescoring && (
        <div className="flex items-center justify-center gap-2 mb-3 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Re-scoring {totalImported} items…
        </div>
      )}
      {rescored && !rescoring && (
        <div className="flex items-center justify-center gap-2 mb-3 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3 w-3 text-primary" />
          Re-scored {totalImported} items
        </div>
      )}

      {/* Safety Confirmation */}
      <div className="rounded-lg border border-border bg-card p-3 mb-4 flex items-start gap-2">
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

      {/* Undo Import */}
      {!isReviewer && undoTimeLeft > 0 && (
        <div className="rounded-lg border border-border bg-card p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Undo2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Undo available for {Math.floor(undoTimeLeft / 60)}:{String(undoTimeLeft % 60).padStart(2, '0')}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleUndo}
              disabled={undoing}
              className="text-xs h-7"
            >
              {undoing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Undo Import
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Only newly created records will be removed. Matched/linked records are not affected.
          </p>
        </div>
      )}

      {/* Primary Actions */}
      <div className="flex gap-3 mb-3">
        <Button className="flex-1" onClick={() => navigate('/')}>
          Go to Command Center
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
        <Button variant="outline" className="flex-1" onClick={handleViewImported}>
          View Imported Items
        </Button>
      </div>

      {/* Secondary Links */}
      <div className="flex gap-4 justify-center">
        <button
          onClick={onViewHistory}
          className="text-xs text-primary hover:text-primary/80 transition-colors py-2"
        >
          View Import History
        </button>
        <button
          onClick={() => navigate(`/settings?importRun=${result.importRunId}`)}
          className="text-xs text-primary hover:text-primary/80 transition-colors py-2"
        >
          Import Run Details
        </button>
      </div>
    </div>
  );
}
