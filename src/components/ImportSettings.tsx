import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Settings2, Loader2, Clock, BarChart3, CheckCircle2, AlertTriangle } from 'lucide-react';

interface DedupRules {
  lead_email_match: boolean;
  lead_phone_match: boolean;
  lead_name_fuzzy: boolean;
  deal_title_close_date: boolean;
  deal_address_match: boolean;
  task_title_due_date: boolean;
  task_title_only: boolean;
}

const DEFAULT_RULES: DedupRules = {
  lead_email_match: true,
  lead_phone_match: false,
  lead_name_fuzzy: false,
  deal_title_close_date: true,
  deal_address_match: false,
  task_title_due_date: true,
  task_title_only: false,
};

interface DryRunEstimate {
  lastRunDuration: number | null;
  lastRunCounts: { leads: number; deals: number; tasks: number } | null;
  lastValidated: string | null;
  validationStatus: string;
  estimatedTime: string;
}

export function ImportMatchingRules() {
  const { user } = useAuth();
  const [rules, setRules] = useState<DedupRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('import_dedup_rules' as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setRules({
          lead_email_match: (data as any).lead_email_match,
          lead_phone_match: (data as any).lead_phone_match,
          lead_name_fuzzy: (data as any).lead_name_fuzzy,
          deal_title_close_date: (data as any).deal_title_close_date,
          deal_address_match: (data as any).deal_address_match,
          task_title_due_date: (data as any).task_title_due_date,
          task_title_only: (data as any).task_title_only,
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const saveRules = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('import_dedup_rules' as any)
        .upsert({
          user_id: user.id,
          ...rules,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ description: 'Matching rules updated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof DedupRules) => {
    setRules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Settings2 className="h-4 w-4" /> Import Matching Rules
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Control how imported records are matched against existing data during staging.
      </p>

      {/* Leads */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Leads</h3>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Email exact match</Label>
            <Switch checked={rules.lead_email_match} onCheckedChange={() => toggle('lead_email_match')} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Phone exact match</Label>
            <Switch checked={rules.lead_phone_match} onCheckedChange={() => toggle('lead_phone_match')} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Name fuzzy match</Label>
            <Switch checked={rules.lead_name_fuzzy} onCheckedChange={() => toggle('lead_name_fuzzy')} />
          </div>
        </div>
      </div>

      {/* Deals */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Deals</h3>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Title + close date window</Label>
            <Switch checked={rules.deal_title_close_date} onCheckedChange={() => toggle('deal_title_close_date')} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Address match if present</Label>
            <Switch checked={rules.deal_address_match} onCheckedChange={() => toggle('deal_address_match')} />
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Tasks</h3>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Title + due date</Label>
            <Switch checked={rules.task_title_due_date} onCheckedChange={() => toggle('task_title_due_date')} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Title only</Label>
            <Switch checked={rules.task_title_only} onCheckedChange={() => toggle('task_title_only')} />
          </div>
        </div>
      </div>

      <Button size="sm" onClick={saveRules} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
        Save Rules
      </Button>
    </section>
  );
}

interface DryRunPanelProps {
  integration: { status: string; lastValidated: string | null };
}

export function ImportDryRunPanel({ integration }: DryRunPanelProps) {
  const { user } = useAuth();
  const [estimate, setEstimate] = useState<DryRunEstimate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Fetch last completed run for estimates
      const { data: lastRun } = await supabase
        .from('fub_import_runs' as any)
        .select('duration_ms, committed_counts, source_counts, created_at')
        .eq('user_id', user.id)
        .eq('status', 'committed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const runData = lastRun as any;
      const lastCounts = runData?.source_counts;
      const lastDuration = runData?.duration_ms as number | null;

      let estimatedTime = '< 30 seconds';
      if (lastDuration) {
        const seconds = Math.ceil(lastDuration / 1000);
        estimatedTime = seconds < 60 ? `~${seconds}s` : `~${Math.ceil(seconds / 60)}m`;
      }

      const validationAge = integration.lastValidated
        ? `${Math.floor((Date.now() - new Date(integration.lastValidated).getTime()) / (1000 * 60 * 60))}h ago`
        : 'Never';

      setEstimate({
        lastRunDuration: lastDuration,
        lastRunCounts: lastCounts ? { leads: lastCounts.leads || 0, deals: lastCounts.deals || 0, tasks: lastCounts.tasks || 0 } : null,
        lastValidated: integration.lastValidated,
        validationStatus: integration.status,
        estimatedTime,
      });
      setLoading(false);
    })();
  }, [user, integration]);

  if (loading || !estimate) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 mb-3">
      <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
        Import Estimate
      </h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {estimate.lastRunCounts && (
          <div>
            <span className="text-muted-foreground">Last run items:</span>
            <span className="ml-1 font-medium">
              {estimate.lastRunCounts.leads}L / {estimate.lastRunCounts.deals}D / {estimate.lastRunCounts.tasks}T
            </span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Est. time:</span>
          <span className="ml-1 font-medium">{estimate.estimatedTime}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Validation:</span>
          {estimate.validationStatus === 'connected' ? (
            <Badge variant="outline" className="text-[10px] border-primary/20 text-primary/80 px-1.5 py-0">
              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
              Valid
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              {estimate.validationStatus}
            </Badge>
          )}
        </div>
        {estimate.lastValidated && (
          <div>
            <span className="text-muted-foreground">Checked:</span>
            <span className="ml-1 font-medium">
              {Math.floor((Date.now() - new Date(estimate.lastValidated).getTime()) / (1000 * 60 * 60))}h ago
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
