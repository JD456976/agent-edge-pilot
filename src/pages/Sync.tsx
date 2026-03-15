import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { FubDriftCard } from '@/components/FubDriftCard';
import { FubWatchlistPanel } from '@/components/FubWatchlistPanel';
import { FubImportReview } from '@/components/FubImportReview';
import { ImportMatchingRules, ImportDryRunPanel } from '@/components/ImportSettings';
import { ImportHealthPanel } from '@/components/ImportHealthPanel';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle,
  Link2, Users, RefreshCw, ChevronDown, ChevronUp,
  ArrowDownToLine, ArrowUpToLine, History, Settings2,
  Clock, Zap, AlertCircle,
} from 'lucide-react';
import { FubSyncPreviewModal } from '@/components/FubSyncPreviewModal';
import { EdgeErrorDisplay, EdgeDebugDrawer } from '@/components/EdgeErrorDisplay';
import { callEdgeFunction, type EdgeFunctionError } from '@/lib/edgeClient';
import { toast } from '@/hooks/use-toast';
import { LeadRoutingPanel } from '@/components/LeadRoutingPanel';
import { FubAppointmentsPanel } from '@/components/FubAppointmentsPanel';
import { SmartNumberInsightsPanel } from '@/components/SmartNumberInsightsPanel';
import { WebhookConfigPanel } from '@/components/WebhookConfigPanel';
import { FubTagSyncPanel } from '@/components/FubTagSyncPanel';
import { BulkFubPushModal } from '@/components/BulkFubPushModal';
import { FubSyncActivityLog } from '@/components/FubSyncActivityLog';
import { SyncConflictDrawer } from '@/components/SyncConflictDrawer';
import { useData } from '@/contexts/DataContext';
import { useAutoSync, SYNC_INTERVAL_OPTIONS } from '@/hooks/useAutoSync';

interface IntegrationState {
  status: 'disconnected' | 'connected' | 'invalid' | 'error';
  last4: string | null;
  lastValidated: string | null;
}

function timeAgo(date: Date | string) {
  const diff = Date.now() - new Date(date).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function friendlyRunSummary(run: any) {
  const counts = run.committed_counts || run.source_counts || {};
  const leads = counts.leads || 0;
  const deals = counts.deals || 0;
  const tasks = counts.tasks || 0;
  const parts: string[] = [];
  if (leads) parts.push(`${leads} contact${leads !== 1 ? 's' : ''}`);
  if (deals) parts.push(`${deals} deal${deals !== 1 ? 's' : ''}`);
  if (tasks) parts.push(`${tasks} task${tasks !== 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'No records';
}

export default function Sync() {
  const { user, logAdminAction } = useAuth();
  const { leads, deals, refreshData } = useData();
  const [integration, setIntegration] = useState<IntegrationState>({ status: 'disconnected', last4: null, lastValidated: null });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<EdgeFunctionError | null>(null);
  const [staging, setStaging] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [pastRuns, setPastRuns] = useState<any[]>([]);
  const [lastError, setLastError] = useState<EdgeFunctionError | null>(null);
  const [bulkPushOpen, setBulkPushOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  // Auto-sync — wired into the same hook AppLayout uses
  const {
    syncing: autoSyncing,
    conflicts,
    lastSyncedAt,
    intervalMinutes,
    setIntervalMinutes,
    runSync,
    resolveConflict,
    dismissConflict,
  } = useAutoSync(refreshData);

  // Auto-open conflict drawer when new conflicts arrive
  useEffect(() => {
    if (conflicts.length > 0) setShowConflicts(true);
  }, [conflicts.length]);

  const loadIntegration = useCallback(async () => {
    if (!user) return;
    const [{ data: integData }, { data: runs }] = await Promise.all([
      supabase.from('crm_integrations' as any).select('status, api_key_last4, last_validated_at').eq('user_id', user.id).maybeSingle(),
      supabase.from('fub_import_runs' as any).select('id, status, source_counts, committed_counts, created_at, mapping_version, undone_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
    ]);
    if (integData) {
      setIntegration({
        status: (integData as any).status || 'disconnected',
        last4: (integData as any).api_key_last4 || null,
        lastValidated: (integData as any).last_validated_at || null,
      });
    }
    setPastRuns(runs || []);
  }, [user]);

  useEffect(() => { loadIntegration(); }, [loadIntegration]);

  const handleSaveAndValidate = async () => {
    if (!apiKeyInput.trim()) return;
    setSaving(true);
    setLastError(null);
    try {
      await callEdgeFunction('fub-save-key', { api_key: apiKeyInput.trim() });
      setApiKeyInput('');
      await logAdminAction('integration_saved', { provider: 'follow_up_boss' });
      const data = await callEdgeFunction<{ valid: boolean; account?: { name: string } }>('fub-validate');
      await loadIntegration();
      await logAdminAction(data.valid ? 'integration_validated_success' : 'integration_validated_failed', { provider: 'follow_up_boss' });
      toast({
        title: data.valid ? 'Follow Up Boss connected!' : 'Invalid API key',
        description: data.valid
          ? `Signed in as ${data.account?.name || 'your account'}`
          : 'Double-check your API key and try again.',
        variant: data.valid ? 'default' : 'destructive',
      });
      if (data.valid) runSync(true); // kick off first auto-sync right away
    } catch (err: any) {
      if (err?.kind) setLastError(err);
      toast({ title: 'Connection failed', description: err?.message || 'Could not connect. Please try again.', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleRevalidate = async () => {
    setValidating(true);
    setLastError(null);
    try {
      const data = await callEdgeFunction<{ valid: boolean; account?: { name: string } }>('fub-validate');
      await loadIntegration();
      toast({
        title: data.valid ? 'Connection is working!' : 'Connection problem',
        description: data.valid
          ? `Signed in as ${data.account?.name || 'your account'}`
          : 'Your API key may have changed. Please reconnect.',
        variant: data.valid ? 'default' : 'destructive',
      });
    } catch (err: any) {
      if (err?.kind) setLastError(err);
      toast({ title: 'Check failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally { setValidating(false); }
  };

  const handleSyncPreview = async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    try {
      await logAdminAction('sync_preview_opened', { provider: 'follow_up_boss' });
      const data = await callEdgeFunction('fub-preview', { limit: 20 });
      setPreviewData(data);
    } catch (err: any) {
      setPreviewError(err?.kind ? err : { kind: 'unknown', message: err?.message || 'Unknown error', requestId: 'N/A' });
    } finally { setPreviewLoading(false); }
  };

  const handleStageImport = async () => {
    setStaging(true);
    setLastError(null);
    try {
      const data = await callEdgeFunction<any>('fub-stage', { limit: 50 });
      setActiveRunId(data.import_run_id);
      const c = data.counts;
      toast({
        title: 'Ready to review!',
        description: `Found ${c.leads.total} contacts, ${c.deals.total} deals, and ${c.tasks.total} tasks from Follow Up Boss.`,
      });
    } catch (err: any) {
      if (err?.kind) setLastError(err);
      toast({ title: 'Sync failed', description: err?.message || 'Could not pull from Follow Up Boss. Please try again.', variant: 'destructive' });
    } finally { setStaging(false); }
  };

  const isConnected = integration.status === 'connected';

  const connectionStatusBadge = () => {
    switch (integration.status) {
      case 'connected':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3" />Connected</Badge>;
      case 'invalid':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Key Invalid</Badge>;
      case 'error':
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Error</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground gap-1"><XCircle className="h-3 w-3" />Not Connected</Badge>;
    }
  };

  if (activeRunId) {
    return <FubImportReview runId={activeRunId} onBack={() => { setActiveRunId(null); loadIntegration(); }} />;
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in space-y-4">

      {/* ── Auto-sync status bar ───────────────────────────────────── */}
      {isConnected && (
        <div className="rounded-lg border border-border bg-card px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            {autoSyncing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-primary" />
                <span className="truncate">Syncing with Follow Up Boss…</span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="truncate">
                  {lastSyncedAt
                    ? <>Auto-synced <strong className="text-foreground">{timeAgo(lastSyncedAt)}</strong></>
                    : 'Auto-sync active'}
                  {intervalMinutes > 0 && (
                    <span className="ml-1 text-muted-foreground/60">
                      · refreshes every {intervalMinutes < 60 ? `${intervalMinutes}m` : '1h'}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {conflicts.length > 0 && (
              <button
                onClick={() => setShowConflicts(true)}
                className="flex items-center gap-1 text-xs text-warning hover:text-warning/80 transition-colors"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                {conflicts.length} to review
              </button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => runSync(false)}
              disabled={autoSyncing}
              className="h-7 text-xs gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              Sync now
            </Button>
          </div>
        </div>
      )}

      {/* ── 1. Connection Card ─────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Follow Up Boss
          </h2>
          {connectionStatusBadge()}
        </div>

        {isConnected && integration.last4 && (
          <div className="flex items-center justify-between text-sm bg-emerald-500/5 border border-emerald-500/20 rounded-md px-3 py-2">
            <span className="text-muted-foreground text-xs">
              API key ending in <span className="font-mono font-medium text-foreground">••••{integration.last4}</span>
              {integration.lastValidated && (
                <span className="ml-2">· last verified {timeAgo(integration.lastValidated)}</span>
              )}
            </span>
            <Button size="sm" variant="ghost" onClick={handleRevalidate} disabled={validating} className="h-7 text-xs gap-1">
              {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Check
            </Button>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {isConnected ? 'Replace API Key' : 'Paste your Follow Up Boss API Key'}
          </Label>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Your FUB API key…"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apiKeyInput.trim() && handleSaveAndValidate()}
              className="text-sm"
            />
            <Button size="sm" onClick={handleSaveAndValidate} disabled={saving || !apiKeyInput.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isConnected ? 'Update' : 'Connect'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your key is encrypted and stored securely. Find it in FUB under Admin → API.
          </p>
        </div>

        {/* Auto-sync frequency picker */}
        {isConnected && (
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Background sync frequency</span>
            </div>
            <Select
              value={String(intervalMinutes)}
              onValueChange={(v) => setIntervalMinutes(parseInt(v, 10))}
            >
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYNC_INTERVAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {lastError && (
          <EdgeErrorDisplay error={lastError} functionName={lastError.details?.functionName || 'fub-validate'} />
        )}
        <EdgeDebugDrawer />
      </section>

      {/* ── 2. Manual Sync Actions ─────────────────────────────────── */}
      {isConnected && (
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Full Import
          </h2>
          <p className="text-xs text-muted-foreground">
            The background sync handles new contacts and updates automatically. Use a full import when you first connect, or to do a deep review of everything in FUB.
          </p>

          <ImportDryRunPanel integration={{ status: integration.status, lastValidated: integration.lastValidated }} />

          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="gap-2" onClick={handleStageImport} disabled={staging}>
              {staging
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Pulling from FUB…</>
                : <><ArrowDownToLine className="h-4 w-4" /> Import from FUB</>
              }
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setBulkPushOpen(true)}>
              <ArrowUpToLine className="h-4 w-4" /> Push to FUB
            </Button>
          </div>

          <button
            onClick={handleSyncPreview}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
          >
            Preview what will be imported first
          </button>
        </section>
      )}

      {/* ── 3. What's Changed (Drift & Watchlist) ─────────────────── */}
      {isConnected && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PanelErrorBoundary>
            <FubDriftCard hasIntegration onScopedStageComplete={(runId) => setActiveRunId(runId)} />
          </PanelErrorBoundary>
          <PanelErrorBoundary>
            <FubWatchlistPanel hasIntegration />
          </PanelErrorBoundary>
        </div>
      )}

      {/* ── 4. Appointments & Call Analytics ──────────────────────── */}
      {isConnected && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PanelErrorBoundary>
            <FubAppointmentsPanel hasIntegration={isConnected} />
          </PanelErrorBoundary>
          <PanelErrorBoundary>
            <SmartNumberInsightsPanel hasIntegration={isConnected} />
          </PanelErrorBoundary>
        </div>
      )}

      {/* ── 5. Tag Sync ───────────────────────────────────────────── */}
      {isConnected && (
        <PanelErrorBoundary>
          <FubTagSyncPanel leads={leads} hasIntegration={isConnected} />
        </PanelErrorBoundary>
      )}

      {/* ── 6. Recent Sync History (collapsed) ────────────────────── */}
      {pastRuns.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <button
            className="w-full flex items-center justify-between text-sm font-semibold"
            onClick={() => setShowHistory((v) => !v)}
          >
            <span className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              Import History
            </span>
            {showHistory ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-1">
              {pastRuns.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => setActiveRunId(r.id)}
                  className="w-full flex items-center justify-between text-xs p-2.5 rounded-md hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">
                      {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="text-muted-foreground">{friendlyRunSummary(r)}</span>
                  </div>
                  <Badge
                    variant={r.status === 'committed' ? 'default' : r.status === 'cancelled' ? 'secondary' : 'outline'}
                    className="text-xs capitalize"
                  >
                    {r.undone_at ? 'Reversed' : r.status === 'committed' ? 'Imported' : r.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 7. Lead Routing ───────────────────────────────────────── */}
      <PanelErrorBoundary>
        <LeadRoutingPanel />
      </PanelErrorBoundary>

      {/* ── 8. Advanced Settings (collapsed) ──────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-4">
        <button
          className="w-full flex items-center justify-between text-sm font-semibold"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            Advanced Settings
          </span>
          {showAdvanced ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <ImportMatchingRules />
            <PanelErrorBoundary>
              <FubSyncActivityLog />
            </PanelErrorBoundary>
            <PanelErrorBoundary>
              <WebhookConfigPanel hasIntegration={isConnected} />
            </PanelErrorBoundary>
            <PanelErrorBoundary>
              <ImportHealthPanel />
            </PanelErrorBoundary>
          </div>
        )}
      </section>

      {/* ── Modals ────────────────────────────────────────────────── */}
      <FubSyncPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        data={previewData}
        loading={previewLoading}
        error={previewError}
      />
      <BulkFubPushModal
        open={bulkPushOpen}
        onClose={() => setBulkPushOpen(false)}
        leads={leads}
        deals={deals}
      />
      {showConflicts && (
        <SyncConflictDrawer
          conflicts={conflicts}
          onResolve={resolveConflict}
          onDismiss={dismissConflict}
          onClose={() => setShowConflicts(false)}
        />
      )}
    </div>
  );
}
