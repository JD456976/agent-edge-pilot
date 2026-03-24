import { useState, useEffect, useMemo, useCallback } from 'react';
import { Phone, MessageSquare, Mail, Clock, ChevronDown, ChevronUp, Home, DollarSign, AlertTriangle, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useAutoSync } from '@/hooks/useAutoSync';
import { supabase } from '@/integrations/supabase/client';
import { BetaGettingStarted } from '@/components/BetaGettingStarted';
import { IncomeControlMeter } from '@/components/IncomeControlMeter';
import { ActionComposerDrawer } from '@/components/ActionComposerDrawer';
// LogTouchModal removed from home screen quick actions — used only in person record tabs
import { useCommandCenterData } from '@/hooks/useCommandCenterData';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from '@/hooks/use-toast';
import type { Lead } from '@/types';

interface TargetMarket {
  zipCodes: string[];
  minPrice: number | null;
}

function SyncDot({ syncing, lastSync }: { syncing: boolean; lastSync: string | null }) {
  if (syncing) return <span className="text-[10px] text-muted-foreground animate-pulse">Syncing…</span>;
  if (!lastSync) return null;
  const mins = Math.floor((Date.now() - new Date(lastSync).getTime()) / 60000);
  let label = 'just now';
  if (mins >= 1 && mins < 60) label = `${mins}m ago`;
  else if (mins >= 60 && mins < 1440) label = `${Math.floor(mins / 60)}h ago`;
  else if (mins >= 1440) label = `${Math.floor(mins / 1440)}d ago`;
  const stale = mins > 1440;
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full', stale ? 'bg-warning animate-pulse' : 'bg-opportunity')} />
      <span className="text-[10px] text-muted-foreground">Synced {label}</span>
    </div>
  );
}

function HeatBadge({ score }: { score: number }) {
  const variant = score >= 75 ? 'urgent' : score >= 50 ? 'warning' : 'secondary';
  const label = score >= 75 ? 'Hot' : score >= 50 ? 'Warm' : 'Cool';
  return (
    <Badge variant={variant as any} className="text-[10px] px-1.5 py-0 gap-0.5">
      <Flame className="h-2.5 w-2.5" /> {score} · {label}
    </Badge>
  );
}

function getLeadHeatScore(lead: Lead): number {
  let score = lead.engagementScore || 0;
  if (lead.leadTemperature === 'hot') score = Math.max(score, 75);
  else if (lead.leadTemperature === 'warm') score = Math.max(score, 50);
  // Boost for recent activity
  if (lead.lastTouchedAt) {
    const daysSince = (Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000;
    if (daysSince < 1) score += 15;
    else if (daysSince < 3) score += 8;
  }
  if (lead.statusTags?.some(t => ['pre-approved', 'pre_approved', 'showing', 'appointment set', 'cash_buyer'].includes(t.toLowerCase()))) score += 15;
  return Math.min(score, 100);
}

function isOutsideTarget(lead: Lead, target: TargetMarket): boolean {
  if (!target.zipCodes.length && !target.minPrice) return false;
  // Check notes/source for zip code mismatch (simple heuristic)
  if (target.zipCodes.length > 0) {
    const text = `${lead.notes || ''} ${lead.source || ''}`.toLowerCase();
    const hasMatch = target.zipCodes.some(z => text.includes(z));
    if (!hasMatch && text.length > 0) return true;
  }
  return false;
}

function PriorityLeadCard({ lead, score, onAction, onTapName }: {
  lead: Lead;
  score: number;
  onAction: (type: 'call' | 'text' | 'email' | 'snooze') => void;
  onTapName: () => void;
}) {
  const returning = lead.snoozeUntil && new Date(lead.snoozeUntil) > new Date();
  return (
    <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <button onClick={onTapName} className="text-base font-semibold truncate text-primary hover:underline text-left">{lead.name}</button>
          <p className="text-xs text-muted-foreground truncate">{lead.notes || lead.source || 'No recent activity'}</p>
        </div>
        <HeatBadge score={score} />
      </div>
      {returning && (
        <Badge variant="outline" className="text-[10px]">
          <Clock className="h-2.5 w-2.5 mr-0.5" /> Returning {new Date(lead.snoozeUntil!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Badge>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 h-11 min-h-[44px] text-sm font-medium" onClick={() => onAction('call')}>
          <Phone className="h-4 w-4 mr-1.5" /> Call
        </Button>
        <Button size="sm" variant="outline" className="h-11 min-h-[44px] min-w-[44px]" onClick={() => onAction('text')}>
          <MessageSquare className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" className="h-11 min-h-[44px] min-w-[44px]" onClick={() => onAction('email')}>
          <Mail className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="h-11 min-h-[44px] min-w-[44px] text-muted-foreground" onClick={() => onAction('snooze')}>
          <Clock className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function PipelineCard({ lead, score, outsideTarget, onTap }: {
  lead: Lead;
  score: number;
  outsideTarget: boolean;
  onTap: () => void;
}) {
  return (
    <div
      className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors flex items-center gap-3 min-h-[56px]"
    >
      <div className="flex-1 min-w-0">
        <button onClick={onTap} className="text-sm font-medium truncate text-primary hover:underline text-left">{lead.name}</button>
        <p className="text-[11px] text-muted-foreground truncate">{lead.source || 'Direct'}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {outsideTarget && (
          <Badge variant="warning" className="text-[9px] px-1 py-0">
            <AlertTriangle className="h-2 w-2 mr-0.5" /> Outside Target
          </Badge>
        )}
        <HeatBadge score={score} />
      </div>
    </div>
  );
}

function RecentVisitorsStrip() {
  const [visitors, setVisitors] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
      const { data } = await supabase
        .from('open_house_visitors')
        .select('full_name, created_at, responses')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setVisitors(data);
    })();
  }, []);

  if (visitors.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Recent Visitors</p>
      <div className="space-y-1.5">
        {visitors.map((v, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="font-medium truncate">{v.full_name}</span>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
              <span>{new Date(v.created_at).toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
              {v.responses?.working_with_agent && (
                <Badge variant={v.responses.working_with_agent === 'Yes' ? 'secondary' : 'outline'} className="text-[9px] px-1 py-0">
                  {v.responses.working_with_agent === 'Yes' ? 'Has Agent' : v.responses.working_with_agent}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BetaHomeScreen() {
  const { user } = useAuth();
  const { leads, deals, tasks, alerts, dealParticipants, hasData, loading, seedDemoData, refreshData } = useData();
  const { openWorkspace } = useWorkspace();
  const { syncing } = useAutoSync(refreshData);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [targetMarket, setTargetMarket] = useState<TargetMarket>({ zipCodes: [], minPrice: null });
  const [incomeExpanded, setIncomeExpanded] = useState(false);
  const [executionEntity, setExecutionEntity] = useState<any>(null);
  // LogTouch state removed — quick actions use native tel/sms/mailto
  const [snoozeLeadId, setSnoozeLeadId] = useState<string | null>(null);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'hot' | 'warm' | 'cool' | 'outside'>('all');

  // Load sync state + target market
  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      const [syncRes, profileRes] = await Promise.all([
        supabase.from('fub_sync_state' as any).select('last_successful_check_at').eq('user_id', u.id).maybeSingle() as any,
        supabase.from('profiles').select('target_zip_codes, target_min_price').eq('user_id', u.id).single(),
      ]);
      if (syncRes.data?.last_successful_check_at) setLastSync(syncRes.data.last_successful_check_at);
      if (profileRes.data) {
        const zips = ((profileRes.data as any).target_zip_codes || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        setTargetMarket({ zipCodes: zips, minPrice: (profileRes.data as any).target_min_price || null });
      }
    })();
  }, []);

  const ccData = useCommandCenterData(user?.id, leads, deals, tasks, alerts, dealParticipants, hasData);

  // Score and sort leads
  const scoredLeads = useMemo(() => {
    const now = new Date();
    return leads
      .filter(l => !l.snoozeUntil || new Date(l.snoozeUntil) <= now)
      .map(l => ({ lead: l, score: getLeadHeatScore(l) }))
      .sort((a, b) => b.score - a.score);
  }, [leads]);

  const snoozedLeads = useMemo(() => {
    const now = new Date();
    return leads.filter(l => l.snoozeUntil && new Date(l.snoozeUntil) > now);
  }, [leads]);

  const priorityLead = scoredLeads[0] || null;
  const allPipelineLeads = scoredLeads.slice(1);

  const filteredPipelineLeads = useMemo(() => {
    return allPipelineLeads.filter(({ lead, score }) => {
      switch (pipelineFilter) {
        case 'hot': return score >= 80;
        case 'warm': return score >= 60 && score < 80;
        case 'cool': return score < 60;
        case 'outside': return isOutsideTarget(lead, targetMarket);
        default: return true;
      }
    });
  }, [allPipelineLeads, pipelineFilter, targetMarket]);

  const hasFubConnected = ccData.hasFubIntegration;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const handleLeadAction = useCallback((lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => {
    if (type === 'snooze') {
      setSnoozeLeadId(lead.id);
      return;
    }
    const phone = (lead as any).phone as string | undefined;
    const email = (lead as any).email as string | undefined;
    if (type === 'call') {
      if (phone) { window.location.href = `tel:${phone}`; }
      else { toast({ description: 'No phone on file — update in FUB' }); }
    } else if (type === 'text') {
      if (phone) { window.location.href = `sms:${phone}`; }
      else { toast({ description: 'No phone on file — update in FUB' }); }
    } else if (type === 'email') {
      if (email) { window.location.href = `mailto:${email}`; }
      else { toast({ description: 'No email on file — update in FUB' }); }
    }
  }, []);

  const handleSnoozeConfirm = useCallback(async () => {
    if (!snoozeLeadId || !snoozeDate) return;
    await supabase.from('leads').update({ snooze_until: new Date(snoozeDate).toISOString() } as any).eq('id', snoozeLeadId);
    toast({ description: 'Lead snoozed — will resurface on the selected date.' });
    setSnoozeLeadId(null);
    setSnoozeDate('');
    refreshData();
  }, [snoozeLeadId, snoozeDate, refreshData]);

  const handleOpenLeadDetail = useCallback((lead: Lead) => {
    setExecutionEntity({ entity: lead, entityType: 'lead' });
  }, []);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto space-y-4 animate-pulse">
        <div className="h-12 bg-muted rounded-lg" />
        <div className="h-32 bg-muted rounded-xl" />
        <div className="h-24 bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* 1. Slim Top Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold leading-tight">{user?.name?.split(' ')[0] || 'Agent'}</h1>
          <p className="text-xs text-muted-foreground">{today}</p>
        </div>
        <SyncDot syncing={syncing} lastSync={lastSync} />
      </div>

      {/* Getting Started */}
      <BetaGettingStarted
        hasFubConnected={hasFubConnected}
        hasLeads={leads.length > 0}
        hasDeals={deals.length > 0}
        hasIncomeTarget={!!(ccData.strategicSettings as any)?.annualIncomeTarget}
        onConnectCrm={() => openWorkspace('sync')}
        onSetIncomeTarget={() => openWorkspace('settings')}
        onLoadDemo={seedDemoData}
      />

      {/* 2. Priority Lead Card */}
      {priorityLead && (
          <PriorityLeadCard
          lead={priorityLead.lead}
          score={priorityLead.score}
          onAction={(type) => handleLeadAction(priorityLead.lead, type)}
          onTapName={() => handleOpenLeadDetail(priorityLead.lead)}
        />
      )}

      {/* 3. My Pipeline */}
      {pipelineLeads.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground px-1">My Pipeline</h2>
          <div className="space-y-1.5">
            {pipelineLeads.map(({ lead, score }) => (
              <PipelineCard
                key={lead.id}
                lead={lead}
                score={score}
                outsideTarget={isOutsideTarget(lead, targetMarket)}
                onTap={() => handleOpenLeadDetail(lead)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Snoozed leads */}
      {snoozedLeads.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground px-1">Snoozed ({snoozedLeads.length})</p>
          {snoozedLeads.map(l => (
            <div key={l.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/50 text-sm">
              <button onClick={() => handleOpenLeadDetail(l)} className="text-primary hover:underline truncate text-left">{l.name}</button>
              <Badge variant="outline" className="text-[9px] shrink-0">
                <Clock className="h-2 w-2 mr-0.5" /> {new Date(l.snoozeUntil!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* 4. Open House */}
      <div className="space-y-2">
        <Button
          className="w-full h-12 min-h-[48px] text-base font-semibold"
          onClick={() => openWorkspace('openhouse')}
        >
          <Home className="h-5 w-5 mr-2" /> Open House
        </Button>
        <RecentVisitorsStrip />
      </div>

      {/* 5. Income Control (collapsed) */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-3 min-h-[44px]"
          onClick={() => setIncomeExpanded(e => !e)}
        >
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-opportunity" />
            <span className="text-sm font-medium">Income Control</span>
          </div>
          {incomeExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {incomeExpanded && (
          <div className="px-3 pb-3">
            <IncomeControlMeter
              stabilityResult={ccData.stabilityResult}
              totalMoneyAtRisk={ccData.totalMoneyAtRisk}
              totalRevenue={ccData.totalRevenue}
              overdueCount={ccData.overdueTasks?.length || 0}
            />
          </div>
        )}
      </div>

      {/* Snooze date picker modal */}
      {snoozeLeadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setSnoozeLeadId(null)}>
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-xs space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">Snooze Until</h3>
            <p className="text-xs text-muted-foreground">This lead will be hidden until the selected date, then automatically resurface.</p>
            <input
              type="date"
              value={snoozeDate}
              onChange={e => setSnoozeDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full h-11 rounded-md border border-border bg-background px-3 text-sm"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setSnoozeLeadId(null)}>Cancel</Button>
              <Button className="flex-1 h-11" onClick={handleSnoozeConfirm} disabled={!snoozeDate}>Snooze</Button>
            </div>
          </div>
        </div>
      )}

      {/* Execution drawer */}
      {executionEntity && (
        <ActionComposerDrawer
          open={!!executionEntity}
          entity={executionEntity.entity}
          entityType={executionEntity.entityType}
          onClose={() => setExecutionEntity(null)}
        />
      )}

    </div>
  );
}
