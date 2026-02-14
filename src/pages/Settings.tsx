import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Sun, Moon, User, Link2, LogOut, Info, Loader2, CheckCircle2, XCircle, AlertTriangle, Eye, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FubSyncPreviewModal } from '@/components/FubSyncPreviewModal';
import { FubImportReview } from '@/components/FubImportReview';
import { toast } from '@/hooks/use-toast';

interface IntegrationState {
  status: 'disconnected' | 'connected' | 'invalid' | 'error';
  last4: string | null;
  lastValidated: string | null;
}

export default function Settings() {
  const { user, logout, isReviewer, logAdminAction } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // FUB integration state
  const [integration, setIntegration] = useState<IntegrationState>({ status: 'disconnected', last4: null, lastValidated: null });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Staging state
  const [staging, setStaging] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [pastRuns, setPastRuns] = useState<any[]>([]);

  // Load integration status + past runs
  const loadIntegration = useCallback(async () => {
    if (!user) return;
    const [{ data: integData }, { data: runs }] = await Promise.all([
      supabase.from('crm_integrations' as any).select('status, api_key_last4, last_validated_at').eq('user_id', user.id).maybeSingle(),
      supabase.from('fub_import_runs' as any).select('id, status, source_counts, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSaving(true);
    try {
      const res = await supabase.functions.invoke('fub-save-key', { body: { api_key: apiKeyInput.trim() } });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      setApiKeyInput('');
      await loadIntegration();
      await logAdminAction('integration_saved', { provider: 'follow_up_boss' });
      toast({ title: 'API key saved securely' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await supabase.functions.invoke('fub-validate');
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      await loadIntegration();
      const action = res.data?.valid ? 'integration_validated_success' : 'integration_validated_failed';
      await logAdminAction(action, { provider: 'follow_up_boss' });
      toast({
        title: res.data?.valid ? 'Connection valid!' : 'Invalid key',
        description: res.data?.valid ? `Connected as ${res.data.account?.name || 'Unknown'}` : 'Please check your API key.',
        variant: res.data?.valid ? 'default' : 'destructive',
      });
    } catch (err: any) {
      toast({ title: 'Validation failed', description: err.message, variant: 'destructive' });
    } finally { setValidating(false); }
  };

  const handleSyncPreview = async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    try {
      await logAdminAction('sync_preview_opened', { provider: 'follow_up_boss' });
      const res = await supabase.functions.invoke('fub-preview', { body: { limit: 20 } });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      setPreviewData(res.data);
    } catch (err: any) { setPreviewError(err.message); }
    finally { setPreviewLoading(false); }
  };

  const handleStageImport = async () => {
    setStaging(true);
    try {
      const res = await supabase.functions.invoke('fub-stage', { body: { limit: 50 } });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      setActiveRunId(res.data.import_run_id);
      toast({ title: 'Import staged!', description: `${res.data.counts.leads.total} leads, ${res.data.counts.deals.total} deals, ${res.data.counts.tasks.total} tasks staged for review.` });
    } catch (err: any) {
      toast({ title: 'Staging failed', description: err.message, variant: 'destructive' });
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

  // If viewing an import run, show the review screen
  if (activeRunId) {
    return <FubImportReview runId={activeRunId} onBack={() => { setActiveRunId(null); loadIntegration(); }} />;
  }

  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      <h1 className="text-xl font-bold mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">Preferences and account</p>

      {isReviewer && (
        <div className="rounded-lg border border-border bg-muted/50 p-3 mb-4 flex items-center gap-2 text-sm">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground">Reviewer Demo Mode is active.</span>
        </div>
      )}

      {/* Theme */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">Appearance</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
            <span className="text-sm">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
          </div>
          <button onClick={toggleTheme} className="relative inline-flex h-6 w-11 items-center rounded-full bg-muted transition-colors">
            <span className={`inline-block h-4 w-4 transform rounded-full bg-primary transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </section>

      {/* Profile */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><User className="h-4 w-4" /> Profile</h2>
        <div className="space-y-3">
          <div><Label className="text-xs text-muted-foreground">Name</Label><p className="text-sm font-medium">{user?.name}</p></div>
          <div><Label className="text-xs text-muted-foreground">Email</Label><p className="text-sm font-medium">{user?.email}</p></div>
          <div><Label className="text-xs text-muted-foreground">Role</Label><p className="text-sm font-medium capitalize">{user?.role}</p></div>
        </div>
      </section>

      {/* FUB Integration */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Link2 className="h-4 w-4" /> Follow Up Boss</h2>

        <div className="flex items-center justify-between mb-3">
          <span className="text-sm">Status</span>
          {statusBadge()}
        </div>

        {integration.last4 && <p className="text-xs text-muted-foreground mb-3">Key ending in ••••{integration.last4}</p>}
        {integration.lastValidated && <p className="text-xs text-muted-foreground mb-3">Last validated: {new Date(integration.lastValidated).toLocaleString()}</p>}

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <div className="flex gap-2 mt-1">
              <Input type="password" placeholder="Paste your FUB API key" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} className="text-sm" />
              <Button size="sm" onClick={handleSaveKey} disabled={saving || !apiKeyInput.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Your key is encrypted server-side and never stored in your browser.</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleValidate} disabled={validating || (integration.status === 'disconnected' && !integration.last4)}>
              {validating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Validate
            </Button>
            <Button size="sm" variant="outline" onClick={handleSyncPreview} disabled={integration.status !== 'connected'}>
              <Eye className="h-4 w-4 mr-1" /> Preview
            </Button>
            <Button size="sm" onClick={handleStageImport} disabled={integration.status !== 'connected' || staging}>
              {staging ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              Stage Import
            </Button>
          </div>
        </div>

        {/* Past import runs */}
        {pastRuns.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">Import History</h3>
            <div className="space-y-1">
              {pastRuns.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => setActiveRunId(r.id)}
                  className="w-full flex items-center justify-between text-xs p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <span className="font-mono text-muted-foreground">{r.id.slice(0, 8)}…</span>
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                  <Badge variant={r.status === 'committed' ? 'default' : r.status === 'cancelled' ? 'secondary' : 'outline'} className="text-xs">
                    {r.status}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Sign out */}
      <Button variant="outline" className="w-full" onClick={handleLogout}>
        <LogOut className="h-4 w-4 mr-2" /> Sign Out
      </Button>

      <FubSyncPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} data={previewData} loading={previewLoading} error={previewError} />
    </div>
  );
}
