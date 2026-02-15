import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

interface RoutingRule {
  id: string;
  rule_name: string;
  criteria: { source?: string; temperature?: string; region?: string };
  target_user_id: string | null;
  priority: number;
  enabled: boolean;
}

interface TeamMember {
  user_id: string;
  name: string;
}

export function LeadRoutingPanel() {
  const { user } = useAuth();
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('user_id', user.id).single();
    if (!profile?.organization_id) { setLoading(false); return; }

    const [{ data: rulesData }, { data: profilesData }] = await Promise.all([
      supabase.from('lead_routing_rules' as any).select('*').eq('organization_id', profile.organization_id).order('priority'),
      supabase.from('profiles').select('user_id, name').eq('organization_id', profile.organization_id),
    ]);

    setRules((rulesData || []) as unknown as RoutingRule[]);
    setMembers((profilesData || []).map((p: any) => ({ user_id: p.user_id, name: p.name || 'Unknown' })));
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const addRule = async () => {
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('user_id', user.id).single();
    if (!profile?.organization_id) return;

    const { data } = await (supabase.from('lead_routing_rules' as any).insert({
      organization_id: profile.organization_id,
      rule_name: `Rule ${rules.length + 1}`,
      criteria: {},
      priority: rules.length,
    }).select().single() as any);

    if (data) setRules(prev => [...prev, data as RoutingRule]);
  };

  const updateRule = async (id: string, updates: Partial<RoutingRule>) => {
    await supabase.from('lead_routing_rules' as any).update(updates as any).eq('id', id);
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const deleteRule = async (id: string) => {
    await supabase.from('lead_routing_rules' as any).delete().eq('id', id);
    setRules(prev => prev.filter(r => r.id !== id));
    toast({ description: 'Routing rule removed' });
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Smart Lead Routing</h2>
        </div>
        <Button size="sm" variant="outline" className="text-xs" onClick={addRule}>
          <Plus className="h-3 w-3 mr-1" /> Add Rule
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Auto-assign FUB leads by source, temperature, or region.</p>

      {rules.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No routing rules configured. New leads won't be auto-assigned.</p>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={rule.rule_name}
                  onChange={e => updateRule(rule.id, { rule_name: e.target.value })}
                  className="text-xs h-7 flex-1"
                  placeholder="Rule name"
                />
                <Switch checked={rule.enabled} onCheckedChange={v => updateRule(rule.id, { enabled: v })} />
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteRule(rule.id)}>
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={(rule.criteria as any)?.source || ''}
                  onValueChange={v => updateRule(rule.id, { criteria: { ...rule.criteria, source: v } })}
                >
                  <SelectTrigger className="text-xs h-7"><SelectValue placeholder="Any source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any source</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="zillow">Zillow</SelectItem>
                    <SelectItem value="realtor">Realtor.com</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={(rule.criteria as any)?.temperature || ''}
                  onValueChange={v => updateRule(rule.id, { criteria: { ...rule.criteria, temperature: v } })}
                >
                  <SelectTrigger className="text-xs h-7"><SelectValue placeholder="Any temp" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any temperature</SelectItem>
                    <SelectItem value="hot">Hot</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Select
                value={rule.target_user_id || ''}
                onValueChange={v => updateRule(rule.id, { target_user_id: v })}
              >
                <SelectTrigger className="text-xs h-7"><SelectValue placeholder="Assign to..." /></SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
