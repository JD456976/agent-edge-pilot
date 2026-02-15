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
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Eye, Upload, Wifi, Link2 } from 'lucide-react';
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
import { useData } from '@/contexts/DataContext';

interface IntegrationState {
  status: 'disconnected' | 'connected' | 'invalid' | 'error';
  last4: string | null;
  lastValidated: string | null;
}

export default function Sync() {
  const { user, logAdminAction } = useAuth();
  const { leads, deals } = useData();
  const [integration, setIntegration] = useState<IntegrationState>({ status: 'disconnected', last4: null, lastValidated: null });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthResult, setHealthResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<EdgeFunctionError | null>(null);
  const [staging, setStaging] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [pastRuns, setPastRuns] = useState<any[]>([]);
  const [lastError, setLastError] = useState<EdgeFunctionError | null>(null);
  const [bulkPushOpen, setBulkPushOpen] = useState(false);

  const loadIntegration = useCallback(async () => {
    if (!user) return;
    const [{ data: integData }, { data: runs }] = await Promise.all([
      supabase.from('crm_integrations' as any).select('status, api_key_last4, last_validated_at').eq('user_id', user.id).maybeSingle(),
      supabase.from('fub_import_runs' as any).select('id, status, source_counts, created_at, mapping_version, undone_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
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

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSaving(true);
    setLastError(null);
    try {
      await callEdgeFunction('fub-save-key', { api_key: apiKeyInput.trim() });
      setApiKeyInput('');
      await loadIntegration();
      await logAdminAction('integration_saved', { provider: 'follow_up_boss' });
      toast({ title: 'API key saved securely' });
    } catch (err: any) {
      if (err?.kind) setLastError(err);
      toast({ title: 'Error', description: err?.message || 'Failed to save key', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleValidate = async () => {
    setValidating(true);
    setLastError(null);
    try {
      const data = await callEdgeFunction<{ valid: boolean; account?: { name: string } }>('fub-validate');
      await loadIntegration();
      await logAdminAction(data.valid ? 'integration_validated_success' : 'integration_validated_failed', { provider: 'follow_up_boss' });
      toast({
        title: data.valid ? 'Connection valid!' : 'Invalid key',
        description: data.valid ? `Connected as ${data.account?.name || 'Unknown'}` : 'Please check your API key.',
        variant: data.valid ? 'default' : 'destructive',
      });
    } catch (err: any) {
      if (err?.kind) setLastError(err);
      toast({ title: 'Validation failed', description: err?.message || 'Unknown error', variant: 'destructive' });
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
      toast({ title: 'Import staged!', description: `${data.counts.leads.total} leads, ${data.counts.deals.total} deals, ${data.counts.tasks.total} tasks staged for review.` });
    } catch (err: any) {
      if (err?.kind) setLastError(err);
      toast({ title: 'Staging failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally { setStaging(false); }
  };

  const statusBadge = () => {
    switch (integration.status) {
      case 'connected': return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>;
      case 'invalid': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Invalid</Badge>;
      case 'error': return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Error</Badge>;
      default: return <Badge variant="outline" className="text-muted-foreground">Disconnected</Badge>;
    }
  };

  if (activeRunId) {
    return <FubImportReview runId={activeRunId} onBack={() => { setActiveRunId(null); loadIntegration(); }} />;
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in space-y-4">
      {/* Connection */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Link2 className="h-4 w-4" /> Follow Up Boss</h2>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm">Status</span>
          {statusBadge()}
        </div>
        {integration.last4 && <p className="text-xs text-muted-foreground mb-3">Key ending in ••••{integration.last4}</p>}
        {integration.lastValidated && <p className="text-xs text-muted-foreground mb-3">Last validated: {new Date(integration.lastValidated).toLocaleString()}</p>}
        {lastError && <div className="mb-3"><EdgeErrorDisplay error={lastError} functionName={lastError.details?.functionName || "fub-validate"} /></div>}
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <div className="flex gap-2 mt-1">
              <Input type="password" placeholder="Paste your FUB API key" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} className="text-sm" />
              <Button size="sm" onClick={handleSaveKey} disabled={saving || !apiKeyInput.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Encrypted server-side. Never stored in browser.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleValidate} disabled={validating || (integration.status === 'disconnected' && !integration.last4)}>
              {validating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Validate
            </Button>
            <Button size="sm" variant="outline" onClick={handleSyncPreview} disabled={integration.status !== 'connected'}>
              <Eye className="h-4 w-4 mr-1" /> Preview
            </Button>
            <Button size="sm" variant="outline" onClick={async () => {
              setHealthChecking(true); setHealthResult(null);
              try {
                const data = await callEdgeFunction<{ ok: boolean; requestId: string }>('health-check');
                setHealthResult({ ok: true, message: `Connected (ID: ${data.requestId?.slice(0, 8) || 'ok'})` });
              } catch (err: any) {
                setHealthResult({ ok: false, message: err?.message || 'Connection failed' });
              } finally { setHealthChecking(false); }
            }} disabled={healthChecking}>
              {healthChecking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wifi className="h-4 w-4 mr-1" />} Test
            </Button>
          </div>
          {healthResult && (
            <div className={`text-xs p-2 rounded-md ${healthResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
              {healthResult.ok ? <CheckCircle2 className="h-3 w-3 inline mr-1" /> : <XCircle className="h-3 w-3 inline mr-1" />}
              {healthResult.message}
            </div>
          )}
          {integration.status === 'connected' && <ImportDryRunPanel integration={{ status: integration.status, lastValidated: integration.lastValidated }} />}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleStageImport} disabled={integration.status !== 'connected' || staging}>
              {staging ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />} Stage Import
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBulkPushOpen(true)} disabled={integration.status !== 'connected'}>
              <Upload className="h-4 w-4 mr-1" /> Bulk Push
            </Button>
          </div>
        </div>
        <EdgeDebugDrawer />
      </section>

      {/* Drift & Watchlist */}
      {integration.status === 'connected' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PanelErrorBoundary>
            <FubDriftCard hasIntegration onScopedStageComplete={(runId) => setActiveRunId(runId)} />
          </PanelErrorBoundary>
          <PanelErrorBoundary>
            <FubWatchlistPanel hasIntegration />
          </PanelErrorBoundary>
        </div>
      )}

      {/* Appointments, Smart Numbers & Tag Sync */}
      {integration.status === 'connected' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PanelErrorBoundary>
            <FubAppointmentsPanel hasIntegration={integration.status === 'connected'} />
          </PanelErrorBoundary>
          <PanelErrorBoundary>
            <SmartNumberInsightsPanel hasIntegration={integration.status === 'connected'} />
          </PanelErrorBoundary>
        </div>
      )}
      {integration.status === 'connected' && (
        <PanelErrorBoundary>
          <FubTagSyncPanel leads={leads} hasIntegration={integration.status === 'connected'} />
        </PanelErrorBoundary>
      )}

      {/* Import History */}
      {pastRuns.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-2">Import History</h3>
          <div className="space-y-1">
            {pastRuns.map((r: any) => (
              <button key={r.id} onClick={() => setActiveRunId(r.id)} className="w-full flex items-center justify-between text-xs p-2 rounded-md hover:bg-muted/50 transition-colors">
                <span className="font-mono text-muted-foreground">{r.id.slice(0, 8)}…</span>
                <span className="text-muted-foreground">v{r.mapping_version || 1}</span>
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                <Badge variant={r.status === 'committed' ? 'default' : r.status === 'cancelled' ? 'secondary' : 'outline'} className="text-xs">
                  {r.undone_at ? 'undone' : r.status}
                </Badge>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Lead Routing */}
      <PanelErrorBoundary>
        <LeadRoutingPanel />
      </PanelErrorBoundary>

      {/* Import Matching Rules */}
      <ImportMatchingRules />

      {/* Webhook Configuration */}
      <PanelErrorBoundary>
        <WebhookConfigPanel hasIntegration={integration.status === 'connected'} />
      </PanelErrorBoundary>

      {/* Import Health (admin view) */}
      <PanelErrorBoundary>
        <ImportHealthPanel />
      </PanelErrorBoundary>

      <FubSyncPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} data={previewData} loading={previewLoading} error={previewError} />
      <BulkFubPushModal open={bulkPushOpen} onClose={() => setBulkPushOpen(false)} leads={leads} deals={deals} />
    </div>
  );
}
