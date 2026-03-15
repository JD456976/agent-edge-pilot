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
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle,
  Link2, Users, RefreshCw, ChevronDown, ChevronUp,
  ArrowDownToLine, ArrowUpToLine, History, Settings2
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
import { useData } from '@/contexts/DataContext';

interface IntegrationState {
  status: 'disconnected' | 'connected' | 'invalid' | 'error';
  last4: string | null;
  lastValidated: string | null;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
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
  const { leads, deals } = useData();
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

      {/* 1. Connection Card */}
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
            <span className="text-muted-foreground">
              API key ending in <span className="font-mono font-medium text-foreground">••••{integration.last4}</span>
              {integration.lastValidated && (
                <span className="ml-2 text-xs">· last checked {timeAgo(integration.lastValidated)}</span>
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

        {lastError && (
          <EdgeErrorDisplay error={lastError} functionName={lastError.details?.functionName || 'fub-validate'} />
        )}
        <EdgeDebugDrawer />
      </section>

      {/* 2. Sync Actions */}
      {isConnected && (
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Sync Your Contacts &amp; Deals
          </h2>
          <p className="text-xs text-muted-foreground">
            Pull your latest contacts, deals, and tasks from Follow Up Boss into Deal Pilot, or push Deal Pilot updates back.
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

      {/* 3. What's Changed */}
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

      {/* 4. Appointments & Call Analytics */}
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

      {/* 5. Tag Sync */}
      {isConnected && (
        <PanelErrorBoundary>
          <FubTagSyncPanel leads={leads} hasIntegration={isConnected} />
        </PanelErrorBoundary>
      )}

      {/* 6. Recent Sync History */}
      {pastRuns.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <button
            className="w-full flex items-center justify-between text-sm font-semibold"
            onClick={() => setShowHistory((v) => !v)}
          >
            <span className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              Recent Syncs
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

      {/* 7. Lead Routing */}
      <PanelErrorBoundary>
        <LeadRoutingPanel />
      </PanelErrorBoundary>

      {/* 8. Advanced Settings — collapsed by default */}
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
    </div>
  );
}
