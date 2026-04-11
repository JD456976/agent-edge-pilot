import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { FubImportReview } from '@/components/FubImportReview';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, Settings2, Clock,
} from 'lucide-react';
import { EdgeDebugDrawer } from '@/components/EdgeErrorDisplay';
import { callEdgeFunction } from '@/lib/edgeClient';
import { toast } from '@/hooks/use-toast';
import { useData } from '@/contexts/DataContext';
import { useSyncContext } from '@/contexts/SyncContext';
import { SYNC_INTERVAL_OPTIONS } from '@/hooks/useAutoSync';

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

export default function Sync() {
  const { user, logAdminAction } = useAuth();
  const { leads } = useData();
  const [integration, setIntegration] = useState<IntegrationState>({ status: 'disconnected', last4: null, lastValidated: null });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ success: boolean; count?: number; time?: string } | null>(null);

  const {
    isSyncing: autoSyncing,
    lastSyncedAt,
    intervalMinutes,
    setIntervalMinutes,
    syncNow: runSync,
  } = useSyncContext();

  const loadIntegration = useCallback(async () => {
    if (!user) return;
    const { data: integData } = await supabase
      .from('crm_integrations' as any)
      .select('status, api_key_last4, last_validated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (integData) {
      setIntegration({
        status: (integData as any).status || 'disconnected',
        last4: (integData as any).api_key_last4 || null,
        lastValidated: (integData as any).last_validated_at || null,
      });
    }
  }, [user]);

  useEffect(() => { loadIntegration(); }, [loadIntegration]);

  const isConnected = integration.status === 'connected';

  const handleBigSync = async () => {
    setSyncResult(null);
    try {
      await runSync(true);
      const count = leads.length;
      setSyncResult({ success: true, count, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
    } catch {
      setSyncResult({ success: false });
    }
  };

  const handleSaveAndValidate = async () => {
    if (!apiKeyInput.trim()) return;
    setSaving(true);
    try {
      await callEdgeFunction('fub-save-key', { api_key: apiKeyInput.trim() });
      setApiKeyInput('');
      await logAdminAction('integration_saved', { provider: 'follow_up_boss' });
      const data = await callEdgeFunction<{ valid: boolean; account?: { name: string } }>('fub-validate');
      await loadIntegration();
      toast({
        title: data.valid ? 'Follow Up Boss connected!' : 'Invalid API key',
        description: data.valid
          ? `Signed in as ${data.account?.name || 'your account'}`
          : 'Double-check your API key and try again.',
        variant: data.valid ? 'default' : 'destructive',
      });
      if (data.valid) runSync(true);
    } catch (err: any) {
      toast({ title: 'Connection failed', description: err?.message || 'Could not connect.', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (activeRunId) {
    return <FubImportReview runId={activeRunId} onBack={() => { setActiveRunId(null); loadIntegration(); }} />;
  }

  return (
    <div className="max-w-xl mx-auto animate-fade-in space-y-4 pt-2">

      {/* ── Big Sync Button ──────────────────────────────────────── */}
      {isConnected ? (
        <div className="space-y-3">
          <Button
            className="w-full h-[52px] text-base font-semibold gap-2"
            onClick={handleBigSync}
            disabled={autoSyncing}
          >
            {autoSyncing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Syncing…
              </>
            ) : (
              <>
                <RefreshCw className="h-5 w-5" />
                Sync with Follow Up Boss
              </>
            )}
          </Button>

          {/* Result feedback */}
          {syncResult && (
            <div className={`flex items-center justify-center gap-2 text-sm font-medium ${syncResult.success ? 'text-emerald-400' : 'text-destructive'}`}>
              {syncResult.success ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Synced {syncResult.count} leads · {syncResult.time}
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Sync failed — check your API key in Advanced
                </>
              )}
            </div>
          )}

          {/* Last synced line */}
          <p className="text-center text-xs text-muted-foreground">
            {lastSyncedAt ? `Last synced: ${timeAgo(lastSyncedAt)}` : 'Never synced'}
          </p>

          {/* Connection badge */}
          <div className="flex justify-center">
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1 text-xs">
              <CheckCircle2 className="h-3 w-3" />
              Connected {integration.last4 ? `· ••••${integration.last4}` : ''}
            </Badge>
          </div>
        </div>
      ) : (
        /* Not connected — show connect form prominently */
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="text-center space-y-1">
            <RefreshCw className="h-8 w-8 text-primary mx-auto mb-2" />
            <h2 className="font-bold text-foreground">Connect Follow Up Boss</h2>
            <p className="text-xs text-muted-foreground">Paste your API key to start syncing leads automatically.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Follow Up Boss API Key</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Your FUB API key…"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && apiKeyInput.trim() && handleSaveAndValidate()}
                className="text-sm"
              />
              <Button onClick={handleSaveAndValidate} disabled={saving || !apiKeyInput.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Find it in FUB under Admin → API.</p>
          </div>
        </section>
      )}

      {/* ── Advanced (collapsed) ─────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card">
        <button
          className="w-full flex items-center justify-between p-4 text-sm font-semibold"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            Advanced
          </span>
          {showAdvanced ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showAdvanced && (
          <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
            {/* API key replacement */}
            {isConnected && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Replace API Key</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="New API key…"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && apiKeyInput.trim() && handleSaveAndValidate()}
                    className="text-sm"
                  />
                  <Button size="sm" onClick={handleSaveAndValidate} disabled={saving || !apiKeyInput.trim()}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update'}
                  </Button>
                </div>
              </div>
            )}

            {/* Sync frequency */}
            {isConnected && (
              <div className="flex items-center justify-between">
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
          </div>
        )}
      </section>

      <EdgeDebugDrawer />
    </div>
  );
}
