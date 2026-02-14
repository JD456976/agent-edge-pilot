import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Activity, CheckCircle2, XCircle, Clock, AlertTriangle, FileText } from 'lucide-react';

interface ImportRun {
  id: string;
  status: string;
  committed_counts: any;
  source_counts: any;
  created_at: string;
  committed_at: string | null;
  duration_ms: number | null;
  mapping_version: number;
  undone_at: string | null;
}

interface AuditEvent {
  id: string;
  action: string;
  created_at: string;
  metadata: any;
}

export function ImportHealthPanel() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [recentErrors, setRecentErrors] = useState<AuditEvent[]>([]);
  const [integration, setIntegration] = useState<{ status: string; lastValidated: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    (async () => {
      const [{ data: runsData }, { data: errorsData }, { data: integData }] = await Promise.all([
        supabase.from('fub_import_runs' as any)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('admin_audit_events' as any)
          .select('*')
          .in('action', ['import_committed', 'import_staged', 'import_undone', 'import_cancelled'])
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('crm_integrations' as any)
          .select('status, last_validated_at')
          .limit(1)
          .maybeSingle(),
      ]);
      setRuns((runsData || []) as unknown as ImportRun[]);
      setRecentErrors((errorsData || []) as unknown as AuditEvent[]);
      if (integData) {
        setIntegration({
          status: (integData as any).status,
          lastValidated: (integData as any).last_validated_at,
        });
      }
      setLoading(false);
    })();
  }, [user]);

  if (loading) return null;

  const lastSuccess = runs.find(r => r.status === 'committed' && !r.undone_at);
  const failedRuns = runs.filter(r => r.status === 'failed');
  const undoneRuns = runs.filter(r => r.undone_at);
  const totalCommitted = runs.filter(r => r.status === 'committed').length;

  // Categorize by status
  const statusCounts: Record<string, number> = {};
  runs.forEach(r => {
    const key = r.undone_at ? 'undone' : r.status;
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  });

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-6">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4" /> Import Health
      </h2>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
          <p className="text-lg font-bold">{totalCommitted}</p>
          <p className="text-xs text-muted-foreground">Total Imports</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
          <p className="text-lg font-bold">{failedRuns.length}</p>
          <p className="text-xs text-muted-foreground">Failures</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
          <p className="text-lg font-bold">{undoneRuns.length}</p>
          <p className="text-xs text-muted-foreground">Undone</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            {integration?.status === 'connected' ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {integration?.status || 'Not connected'}
          </p>
        </div>
      </div>

      {/* Last successful run */}
      {lastSuccess && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold">Last Successful Import</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Run:</span>
              <span className="ml-1 font-mono">{lastSuccess.id.slice(0, 8)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">When:</span>
              <span className="ml-1">{new Date(lastSuccess.committed_at || lastSuccess.created_at).toLocaleString()}</span>
            </div>
            {lastSuccess.duration_ms && (
              <div>
                <span className="text-muted-foreground">Duration:</span>
                <span className="ml-1">{(lastSuccess.duration_ms / 1000).toFixed(1)}s</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Mapping v:</span>
              <span className="ml-1">{lastSuccess.mapping_version}</span>
            </div>
          </div>
        </div>
      )}

      {/* Validation status */}
      {integration?.lastValidated && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <Clock className="h-3.5 w-3.5" />
          Last validated: {new Date(integration.lastValidated).toLocaleString()}
          <span className="text-muted-foreground">
            ({Math.floor((Date.now() - new Date(integration.lastValidated).getTime()) / (1000 * 60 * 60))}h ago)
          </span>
        </div>
      )}

      {/* Recent audit events */}
      {recentErrors.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Recent Import Events
          </h3>
          <div className="space-y-1">
            {recentErrors.map(e => (
              <div key={e.id} className="flex items-center justify-between text-xs p-1.5 rounded-md hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {e.action.replace('import_', '')}
                  </Badge>
                  {e.metadata?.import_run_id && (
                    <span className="font-mono text-muted-foreground">
                      {String(e.metadata.import_run_id).slice(0, 8)}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground">
                  {new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import history table */}
      {runs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">All Runs (last 10)</h3>
          <div className="space-y-1">
            {runs.map(r => (
              <div key={r.id} className="flex items-center justify-between text-xs p-1.5 rounded-md hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">{r.id.slice(0, 8)}</span>
                  <Badge
                    variant={r.undone_at ? 'secondary' : r.status === 'committed' ? 'default' : r.status === 'failed' ? 'destructive' : 'outline'}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {r.undone_at ? 'undone' : r.status}
                  </Badge>
                  <span className="text-muted-foreground">v{r.mapping_version}</span>
                </div>
                <span className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
