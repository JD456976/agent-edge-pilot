import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Phone, MessageSquare, Mail, Clock, ChevronDown, ChevronUp,
  Home, DollarSign, AlertTriangle, Flame, ShieldAlert,
  Sun, CloudSun, Moon, TrendingUp, TrendingDown, Minus,
  CheckCircle2, Shield, Target, Zap, ArrowRight, X, User, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useSyncContext } from '@/contexts/SyncContext';
import { supabase } from '@/integrations/supabase/client';
import { BetaGettingStarted } from '@/components/BetaGettingStarted';
import { IncomeControlMeter } from '@/components/IncomeControlMeter';
import { ActionComposerDrawer } from '@/components/ActionComposerDrawer';
import { VoiceLeadCaptureFAB } from '@/components/VoiceLeadCaptureFAB';
import { DealMilestonesPanel } from '@/components/DealMilestonesPanel';
import { useCommandCenterData } from '@/hooks/useCommandCenterData';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useSessionMode, useSessionStartRisk } from '@/hooks/useSessionMode';
import { toast } from 'sonner';
import type { Lead, Deal, Task } from '@/types';
import { computeRisk, RiskDot, RiskPanel } from '@/components/DealRiskRadar';
import { getDailyBriefing } from '@/lib/dailyIntelligence';

// ── Helpers ─────────────────────────────────────────────────────────

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
  const bg = score >= 75 ? 'bg-urgent/15 text-urgent' : score >= 50 ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground';
  const label = score >= 75 ? 'Hot' : score >= 50 ? 'Warm' : 'Cool';
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', bg)}>
      <Flame className="h-2.5 w-2.5" /> {score} · {label}
    </span>
  );
}

function getLeadHeatScore(lead: Lead): number {
  let score = lead.engagementScore || 0;
  if (lead.leadTemperature === 'hot') score = Math.max(score, 75);
  else if (lead.leadTemperature === 'warm') score = Math.max(score, 50);
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
  if (target.zipCodes.length > 0) {
    const text = `${lead.notes || ''} ${lead.source || ''}`.toLowerCase();
    const hasMatch = target.zipCodes.some(z => text.includes(z));
    if (!hasMatch && text.length > 0) return true;
  }
  return false;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(0)}`;
}

// ── Reusable Cards ──────────────────────────────────────────────────

function PriorityLeadCard({ lead, score, onAction, onTapName }: {
  lead: Lead;
  score: number;
  onAction: (type: 'call' | 'text' | 'email' | 'snooze') => void;
  onTapName: () => void;
}) {
  const returning = lead.snoozeUntil && new Date(lead.snoozeUntil) > new Date();
  return (
    <div className="relative rounded-xl p-[2px] bg-gradient-to-r from-primary to-[hsl(var(--accent))]">
      <div className="rounded-[10px] bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 overflow-hidden">
            <button onClick={onTapName} className="text-base font-semibold truncate block w-full text-primary hover:underline text-left">{lead.name}</button>
            <p className="text-[13px] text-muted-foreground truncate">{lead.notes || lead.source || 'No recent activity'}</p>
          </div>
          <HeatBadge score={score} />
        </div>
        {returning && (
          <Badge variant="outline" className="text-[11px]">
            <Clock className="h-2.5 w-2.5 mr-0.5" /> Returning {new Date(lead.snoozeUntil!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Badge>
        )}
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-11 min-h-[44px] text-sm font-medium rounded-xl" onClick={() => onAction('call')}>
            <Phone className="h-4 w-4 mr-1.5" /> Call
          </Button>
          <Button size="sm" variant="outline" className="h-11 min-h-[44px] w-11 rounded-full border-border/50 p-0 flex-none" onClick={() => onAction('text')}>
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-11 min-h-[44px] w-11 rounded-full border-border/50 p-0 flex-none" onClick={() => onAction('email')}>
            <Mail className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-11 min-h-[44px] w-11 rounded-full p-0 flex-none text-muted-foreground" onClick={() => onAction('snooze')}>
            <Clock className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function getClientVerdict(lead: Lead, score: number, riskLevel: string): { text: string; color: string } {
  const daysSinceContact = lead.lastTouchedAt
    ? Math.floor((Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000)
    : null;
  const hasIntentTags = lead.statusTags?.some(t =>
    ['pre-approved', 'pre_approved', 'showing', 'appointment set', 'cash_buyer'].includes(t.toLowerCase())
  );
  const notes = (lead.notes || '').toLowerCase();
  const hasNegativeSignal = /cancel|ghost|unresponsive|no.?show|not interested/i.test(notes);

  if (hasNegativeSignal) return { text: 'Disengaging — re-qualify before investing more time', color: 'text-urgent' };
  if (riskLevel === 'high' && daysSinceContact !== null && daysSinceContact > 7)
    return { text: `Silent ${daysSinceContact}d — at risk of going cold`, color: 'text-urgent' };
  if (score >= 80 && hasIntentTags) return { text: 'Serious buyer — high intent signals detected', color: 'text-opportunity' };
  if (score >= 80) return { text: 'Highly engaged — keep momentum going', color: 'text-opportunity' };
  if (score >= 60 && hasIntentTags) return { text: 'Engaged with intent — push toward showing', color: 'text-primary' };
  if (score >= 60) return { text: 'Warming up — needs one more quality touch', color: 'text-primary' };
  if (daysSinceContact === null) return { text: 'Never contacted — make first touch today', color: 'text-warning' };
  if (daysSinceContact > 14) return { text: `No contact in ${daysSinceContact}d — likely browsing`, color: 'text-muted-foreground' };
  if (score >= 40) return { text: 'Early stage — qualify budget and timeline', color: 'text-muted-foreground' };
  return { text: 'Cold — low activity, low engagement', color: 'text-muted-foreground' };
}

function PipelineCard({ lead, score, outsideTarget, onTap, onAction }: {
  lead: Lead;
  score: number;
  outsideTarget: boolean;
  onTap: () => void;
  onAction: (type: 'call' | 'text' | 'email') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const risk = useMemo(() => computeRisk(lead, score), [lead, score]);
  const verdict = useMemo(() => getClientVerdict(lead, score, risk.level), [lead, score, risk.level]);
  const borderColor = score >= 80 ? 'border-l-opportunity' : score >= 60 ? 'border-l-warning' : 'border-l-muted-foreground/30';

  const statusLine = useMemo(() => {
    if (!lead.lastTouchedAt) return 'Never contacted — make the first move.';
    const daysSince = Math.floor((Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000);
    const temp = lead.leadTemperature;
    if (daysSince > 14 && (temp === 'hot' || temp === 'warm'))
      return `Gone quiet for ${daysSince} days. High risk of losing this one.`;
    if (daysSince > 30)
      return `No contact in ${daysSince} days. Consider archiving.`;
    if (temp === 'hot' && daysSince <= 2)
      return 'Active and hot — strike while the iron is hot.';
    return `Last touched ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`;
  }, [lead.lastTouchedAt, lead.leadTemperature]);

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md border-l-[3px]", borderColor)}>
      <div className="w-full text-left p-3 flex items-center gap-2 min-h-[56px] hover:bg-accent/50 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <RiskDot level={risk.level} />
        <div className="flex-1 min-w-0 overflow-hidden">
          <button onClick={(e) => { e.stopPropagation(); onTap(); }} className="text-sm font-medium truncate block w-full text-primary hover:underline text-left">{lead.name}</button>
          <p className="text-[13px] text-muted-foreground truncate">{lead.source || 'Direct'}</p>
          <p className={cn('text-[11px] truncate mt-0.5', verdict.color)}>{verdict.text}</p>
          <p className="text-xs text-slate-400 mt-1">{statusLine}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[45%]">
          {outsideTarget && (
            <Badge variant="warning" className="text-[9px] px-1 py-0 whitespace-nowrap">
              <AlertTriangle className="h-2 w-2 mr-0.5" /> Outside
            </Badge>
          )}
          <HeatBadge score={score} />
          <ShieldAlert className={cn(
            'h-3.5 w-3.5 transition-transform shrink-0',
            expanded && 'rotate-180',
            risk.level === 'healthy' ? 'text-opportunity' : risk.level === 'medium' ? 'text-warning' : 'text-urgent'
          )} />
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 pb-2">
        <button onClick={(e) => { e.stopPropagation(); onAction('call'); }} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Call">
          <Phone className="h-3.5 w-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onAction('text'); }} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Text">
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onAction('email'); }} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Email">
          <Mail className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && <div className="px-3 pb-3"><RiskPanel lead={lead} risk={risk} /></div>}
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

// ── Mode Pill Selector ──────────────────────────────────────────────

const MODE_CONFIG = {
  morning: { icon: Sun, label: 'Morning', color: 'text-warning' },
  midday: { icon: CloudSun, label: 'Midday', color: 'text-primary' },
  evening: { icon: Moon, label: 'Evening', color: 'text-muted-foreground' },
  night: { icon: Moon, label: 'Night', color: 'text-muted-foreground' },
} as const;

function ModePillSelector({ currentMode, autoMode, override, onOverride }: {
  currentMode: string;
  autoMode: string;
  override: string | null;
  onOverride: (mode: any) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-muted/50 rounded-full p-0.5">
      {(['morning', 'midday', 'evening', 'night'] as const).map(mode => {
        const cfg = MODE_CONFIG[mode];
        const Icon = cfg.icon;
        const active = currentMode === mode;
        return (
          <button
            key={mode}
            onClick={() => onOverride(override === mode ? null : mode)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all',
              active ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className={cn('h-3 w-3', active && cfg.color)} />
            <span className="hidden sm:inline">{cfg.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Intelligence Computations ───────────────────────────────────────

function useTimeIntelligence(leads: Lead[], deals: Deal[], tasks: Task[]) {
  return useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Lead scoring
    const scoredLeads = leads
      .filter(l => !l.snoozeUntil || new Date(l.snoozeUntil) <= now)
      .map(l => ({ lead: l, score: getLeadHeatScore(l) }))
      .sort((a, b) => b.score - a.score);

    const hotLeads = scoredLeads.filter(s => s.score >= 75);
    const warmLeads = scoredLeads.filter(s => s.score >= 50 && s.score < 75);

    // Deal intelligence
    const activeDeals = deals.filter(d => d.stage !== 'closed');
    const riskDeals = activeDeals.filter(d => d.riskLevel === 'red' || d.riskLevel === 'yellow');
    const closingSoonDeals = activeDeals.filter(d => {
      const daysToClose = (new Date(d.closeDate).getTime() - now.getTime()) / 86400000;
      return daysToClose > 0 && daysToClose <= 7;
    });

    // Task intelligence
    const overdueTasks = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < now);
    const todayTasks = tasks.filter(t => !t.completedAt && new Date(t.dueAt) >= todayStart && new Date(t.dueAt) < new Date(todayStart.getTime() + 86400000));
    const completedToday = tasks.filter(t => t.completedAt && new Date(t.completedAt) >= todayStart);

    // Money at stake
    const totalPipelineValue = activeDeals.reduce((sum, d) => sum + d.commission, 0);
    const atRiskValue = riskDeals.reduce((sum, d) => sum + d.commission, 0);

    // Untouched today (for evening)
    const untouchedRiskDeals = riskDeals.filter(d => {
      if (!d.lastTouchedAt) return true;
      return new Date(d.lastTouchedAt) < todayStart;
    });
    const untouchedHotLeads = hotLeads.filter(({ lead }) => {
      if (!lead.lastTouchedAt) return true;
      return new Date(lead.lastTouchedAt) < todayStart;
    });

    // Snoozed leads
    const snoozedLeads = leads.filter(l => l.snoozeUntil && new Date(l.snoozeUntil) > now);

    // Leads touched today
    const touchedToday = leads.filter(l => l.lastTouchedAt && new Date(l.lastTouchedAt) >= todayStart);

    // Leads at risk: engaged (score >= 50) but untouched or stale > 7 days
    const leadsAtRisk = leads.filter(l => {
      const score = getLeadHeatScore(l);
      if (score < 50) return false;
      if (!l.lastTouchedAt) return true;
      const daysSince = (now.getTime() - new Date(l.lastTouchedAt).getTime()) / 86400000;
      return daysSince > 7;
    });

    return {
      scoredLeads,
      hotLeads,
      warmLeads,
      activeDeals,
      riskDeals,
      closingSoonDeals,
      overdueTasks,
      todayTasks,
      completedToday,
      totalPipelineValue,
      atRiskValue,
      untouchedRiskDeals,
      untouchedHotLeads,
      snoozedLeads,
      touchedToday,
      leadsAtRisk,
    };
  }, [leads, deals, tasks]);
}

// ── Morning Mode ────────────────────────────────────────────────────

function MorningMode({ intel, priorityLead, ccData, onLeadAction, onOpenLead, onOpenWorkspace, targetMarket, onAddLead }: {
  intel: ReturnType<typeof useTimeIntelligence>;
  priorityLead: { lead: Lead; score: number } | null;
  ccData: any;
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => void;
  onOpenLead: (lead: Lead) => void;
  onOpenWorkspace: (id: string) => void;
  targetMarket: TargetMarket;
  onAddLead?: () => void;
}) {
  const { hotLeads, riskDeals, overdueTasks, closingSoonDeals, totalPipelineValue, atRiskValue, scoredLeads } = intel;

  // Build the 3 directive moves
  const moves: { icon: typeof Shield; color: string; verb: string; detail: string; actionLabel?: string; onAction?: () => void }[] = [];

  if (riskDeals.length > 0) {
    const d = riskDeals[0];
    moves.push({
      icon: Shield, color: 'text-urgent',
      verb: `Call ${d.title.split(' ')[0]} about the ${d.riskFlags?.[0] || 'stalled'} risk`,
      detail: `${formatCurrency(d.commission)} at risk — don't let this slip another day`,
      actionLabel: 'Call Now',
      onAction: () => onOpenWorkspace(d.id),
    });
  }
  if (priorityLead) {
    const l = priorityLead.lead;
    const channel = l.statusTags?.some(t => t.toLowerCase().includes('text')) ? 'Text' : 'Call';
    moves.push({
      icon: Flame, color: 'text-opportunity',
      verb: `${channel} ${l.name} — score ${priorityLead.score}, ready to move`,
      detail: `${l.source || 'Direct'} lead · ${l.leadTemperature === 'hot' ? 'hot' : 'warming up'}`,
      actionLabel: channel,
      onAction: () => onLeadAction(l, channel === 'Text' ? 'text' : 'call'),
    });
  }
  if (overdueTasks.length > 0) {
    moves.push({
      icon: AlertTriangle, color: 'text-warning',
      verb: `Clear "${overdueTasks[0].title}" — it's overdue`,
      detail: overdueTasks.length > 1 ? `+${overdueTasks.length - 1} more overdue` : 'Get this off your plate first',
    });
  }
  // Fill remaining slots with warm leads
  if (moves.length < 3) {
    for (const { lead, score } of scoredLeads.filter(s => s.score >= 50).slice(0, 3 - moves.length)) {
      moves.push({
        icon: Flame, color: 'text-primary',
        verb: `Reach out to ${lead.name} before they cool off`,
        detail: `Score ${score} · last active ${lead.lastTouchedAt ? new Date(lead.lastTouchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'never'}`,
        actionLabel: 'Contact',
        onAction: () => onLeadAction(lead, 'call'),
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Your 3 Moves */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Your 3 Moves Today</h3>
        </div>
        {totalPipelineValue > 0 && (
          <p className="text-xs text-muted-foreground">
            {formatCurrency(totalPipelineValue)} in pipeline{atRiskValue > 0 ? <> · <span className="text-urgent">{formatCurrency(atRiskValue)} at risk</span></> : ''}
          </p>
        )}
        <div className="space-y-2.5">
          {moves.length > 0 ? moves.map((m, i) => {
            const Icon = m.icon;
            return (
              <div key={i} className="flex items-start gap-2.5">
                <span className={cn('mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0', m.color === 'text-urgent' ? 'bg-urgent/15' : m.color === 'text-opportunity' ? 'bg-opportunity/15' : m.color === 'text-warning' ? 'bg-warning/15' : 'bg-primary/15')}>
                  <Icon className={cn('h-3 w-3', m.color)} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">{m.verb}</p>
                  <p className="text-xs text-muted-foreground">{m.detail}</p>
                </div>
                {m.actionLabel && m.onAction && (
                  <Button size="sm" variant="outline" className="shrink-0 text-xs h-8 rounded-lg" onClick={m.onAction}>
                    {m.actionLabel}
                  </Button>
                )}
              </div>
            );
          }) : (
            <p className="text-sm text-muted-foreground">Clear skies — pick a warm lead and start a conversation.</p>
          )}
        </div>
      </div>

      {/* Priority Lead Action Card */}
      {priorityLead && (
        <PriorityLeadCard
          lead={priorityLead.lead}
          score={priorityLead.score}
          onAction={(type) => onLeadAction(priorityLead.lead, type)}
          onTapName={() => onOpenLead(priorityLead.lead)}
        />
      )}

      {/* Closing soon deals */}
      {closingSoonDeals.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Clock className="h-4 w-4 text-warning" /> Closing This Week
          </h3>
          {closingSoonDeals.map(d => {
            const daysLeft = Math.ceil((new Date(d.closeDate).getTime() - Date.now()) / 86400000);
            return (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span className="font-medium truncate">{d.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {daysLeft}d · {formatCurrency(d.commission)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <DealMilestonesPanel />

      {scoredLeads.length > 1 && (
        <PipelineSection
          leads={scoredLeads.slice(1, 6)}
          targetMarket={targetMarket}
          onTap={onOpenLead}
          onLeadAction={onLeadAction}
          label="Next Up"
          onAddLead={onAddLead}
        />
      )}
    </div>
  );
}

// ── Midday Mode ─────────────────────────────────────────────────────

function MiddayMode({ intel, ccData, onLeadAction, onOpenLead, targetMarket, totalMoneyAtRisk }: {
  intel: ReturnType<typeof useTimeIntelligence>;
  ccData: any;
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => void;
  onOpenLead: (lead: Lead) => void;
  targetMarket: TargetMarket;
  totalMoneyAtRisk: number;
}) {
  const { hotLeads, riskDeals, overdueTasks, completedToday, todayTasks, scoredLeads, totalPipelineValue, atRiskValue } = intel;
  const sessionStart = useSessionStartRisk(totalMoneyAtRisk, true);

  const riskDelta = sessionStart ? totalMoneyAtRisk - sessionStart.totalMoneyAtRisk : 0;
  const tasksRemaining = todayTasks.length + overdueTasks.length;

  let momentumIcon = Minus;
  let momentumLabel = 'Holding steady';
  let momentumColor = 'text-muted-foreground';
  if (riskDelta < -500) {
    momentumIcon = TrendingDown;
    momentumLabel = 'Risk decreasing — keep going';
    momentumColor = 'text-opportunity';
  } else if (riskDelta > 500) {
    momentumIcon = TrendingUp;
    momentumLabel = 'Risk increasing — take action';
    momentumColor = 'text-urgent';
  }
  const MomentumIcon = momentumIcon;

  // Build directive midday actions
  const middayDirectives: { icon: typeof Shield; color: string; verb: string; detail: string; actionLabel?: string; onAction?: () => void }[] = [];

  // Most urgent: risk deals not yet touched
  for (const d of riskDeals.slice(0, 2)) {
    const touched = d.lastTouchedAt && new Date(d.lastTouchedAt) >= new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    middayDirectives.push({
      icon: Shield, color: 'text-urgent',
      verb: touched ? `Follow up on ${d.title} — keep momentum` : `You haven't touched ${d.title} today — call now`,
      detail: `${formatCurrency(d.commission)} on the line`,
    });
  }
  // Hot leads not yet contacted
  for (const { lead } of hotLeads.filter(({ lead: l }) => !intel.touchedToday.find(t => t.id === l.id)).slice(0, 2)) {
    middayDirectives.push({
      icon: Flame, color: 'text-opportunity',
      verb: `Contact ${lead.name} — hot lead going cold`,
      detail: `${lead.source || 'Direct'} · hasn't heard from you today`,
      actionLabel: 'Call',
      onAction: () => onLeadAction(lead, 'call'),
    });
  }
  // Overdue tasks
  if (overdueTasks.length > 0) {
    middayDirectives.push({
      icon: AlertTriangle, color: 'text-warning',
      verb: `Knock out "${overdueTasks[0].title}" — ${overdueTasks.length} overdue`,
      detail: 'Clear this before end of day',
    });
  }

  return (
    <div className="space-y-4">
      {/* Midday Directive Card */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center">
            <CloudSun className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Here's what's changed</h2>
            {(() => {
              const annualTarget = (ccData?.strategicSettings as any)?.annualIncomeTarget;
              const monthlyTarget = annualTarget ? annualTarget / 12 : 0;
              const projectedK = totalPipelineValue >= 1000 ? `$${Math.round(totalPipelineValue / 1000)}K` : formatCurrency(totalPipelineValue);
              const gap = monthlyTarget > 0 ? monthlyTarget - totalPipelineValue : 0;
              const gapStr = gap > 0 ? (gap >= 1000 ? `$${Math.round(gap / 1000)}K` : formatCurrency(gap)) : null;
              return (
                <p className="text-[11px] text-muted-foreground">
                  {projectedK} projected{gapStr ? <> · {gapStr} needed to hit goal</> : monthlyTarget > 0 ? ' · On track' : ''}
                </p>
              );
            })()}
          </div>
        </div>

        {/* Momentum */}
        <div className={cn('flex items-center gap-2 text-sm font-medium', momentumColor)}>
          <MomentumIcon className="h-4 w-4" />
          <span>{momentumLabel}</span>
        </div>

        {/* Touched today chips */}
        {intel.touchedToday.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{intel.touchedToday.length} touched:</span>
            {intel.touchedToday.slice(0, 6).map(l => (
              <span key={l.id} className="inline-flex items-center px-2 py-0.5 rounded-full bg-opportunity/10 text-[11px] font-medium text-opportunity">
                {l.name.split(' ')[0]}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Directive actions */}
      {middayDirectives.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-primary" /> Do This Now
          </h3>
          <div className="space-y-2.5">
            {middayDirectives.slice(0, 4).map((m, i) => {
              const Icon = m.icon;
              return (
                <div key={i} className="flex items-start gap-2.5">
                  <span className={cn('mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0', m.color === 'text-urgent' ? 'bg-urgent/15' : m.color === 'text-opportunity' ? 'bg-opportunity/15' : 'bg-warning/15')}>
                    <Icon className={cn('h-3 w-3', m.color)} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{m.verb}</p>
                    <p className="text-xs text-muted-foreground">{m.detail}</p>
                  </div>
                  {m.actionLabel && m.onAction && (
                    <Button size="sm" variant="outline" className="shrink-0 text-xs h-8 rounded-lg" onClick={m.onAction}>
                      {m.actionLabel}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {middayDirectives.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <CheckCircle2 className="h-5 w-5 text-opportunity mx-auto mb-1" />
          <p className="text-sm font-medium">You're on top of everything</p>
          <p className="text-xs text-muted-foreground">Pipeline is moving — keep this pace.</p>
        </div>
      )}

      <DealMilestonesPanel />
    </div>
  );
}

// ── Night Mode ──────────────────────────────────────────────────────

function NightMode({ intel }: { intel: ReturnType<typeof useTimeIntelligence> }) {
  const { completedToday, touchedToday } = intel;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-center">
        <Moon className="h-8 w-8 text-muted-foreground mx-auto opacity-60" />
        <h2 className="text-base font-bold">Nice work today</h2>
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          {completedToday.length > 0 && <span><span className="font-semibold text-foreground">{completedToday.length}</span> task{completedToday.length !== 1 ? 's' : ''} done</span>}
          {touchedToday.length > 0 && <span><span className="font-semibold text-foreground">{touchedToday.length}</span> lead{touchedToday.length !== 1 ? 's' : ''} touched</span>}
          {completedToday.length === 0 && touchedToday.length === 0 && <span>Rest up for tomorrow</span>}
        </div>
        <p className="text-xs text-muted-foreground pt-1">See you in the morning ☕</p>
      </div>
    </div>
  );
}

// ── Evening Mode ────────────────────────────────────────────────────

function EveningMode({ intel, ccData, onLeadAction, onOpenLead, onOpenWorkspace, targetMarket }: {
  intel: ReturnType<typeof useTimeIntelligence>;
  ccData: any;
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => void;
  onOpenLead: (lead: Lead) => void;
  onOpenWorkspace: (id: string) => void;
  targetMarket: TargetMarket;
}) {
  const { untouchedRiskDeals, untouchedHotLeads, overdueTasks, completedToday, riskDeals, hotLeads, scoredLeads, leadsAtRisk } = intel;
  const hasOpenItems = untouchedRiskDeals.length > 0 || untouchedHotLeads.length > 0 || overdueTasks.length > 0;

  // Build evening directives — specific actions, not counts
  const eveningActions: { icon: typeof Shield; color: string; verb: string; detail: string; actionLabel?: string; onAction?: () => void }[] = [];

  for (const d of untouchedRiskDeals.slice(0, 2)) {
    eveningActions.push({
      icon: Shield, color: 'text-urgent',
      verb: `Send ${d.title.split(' ')[0]} a quick check-in text tonight`,
      detail: `${formatCurrency(d.commission)} at risk — a 30-second text keeps this alive`,
      actionLabel: 'Text',
      onAction: () => onOpenWorkspace(d.id),
    });
  }
  for (const { lead } of untouchedHotLeads.slice(0, 2)) {
    eveningActions.push({
      icon: Flame, color: 'text-opportunity',
      verb: `Drop ${lead.name} a quick note — they're hot and waiting`,
      detail: `${lead.source || 'Direct'} lead · hasn't heard from you today`,
      actionLabel: 'Text',
      onAction: () => onLeadAction(lead, 'text'),
    });
  }
  if (overdueTasks.length > 0) {
    eveningActions.push({
      icon: AlertTriangle, color: 'text-warning',
      verb: `Clear "${overdueTasks[0].title}" or reschedule it now`,
      detail: `${overdueTasks.length} overdue — don't carry this into tomorrow`,
    });
  }

  return (
    <div className="space-y-4">
      {/* End-of-Day Directive */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', hasOpenItems ? 'bg-warning/15' : 'bg-opportunity/15')}>
            {hasOpenItems ? <AlertTriangle className="h-4 w-4 text-warning" /> : <CheckCircle2 className="h-4 w-4 text-opportunity" />}
          </div>
          <div>
            <h2 className="text-sm font-bold">{hasOpenItems ? 'Before You Log Off' : "You're Clear"}</h2>
            <p className="text-[11px] text-muted-foreground">
              {hasOpenItems ? `${eveningActions.length} thing${eveningActions.length !== 1 ? 's' : ''} to handle — 5 minutes max` : 'Nothing urgent left — enjoy your evening'}
            </p>
          </div>
        </div>

        {eveningActions.length > 0 ? (
          <div className="space-y-2.5">
            {eveningActions.map((m, i) => {
              const Icon = m.icon;
              return (
                <div key={i} className="flex items-start gap-2.5">
                  <span className={cn('mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0', m.color === 'text-urgent' ? 'bg-urgent/15' : m.color === 'text-opportunity' ? 'bg-opportunity/15' : 'bg-warning/15')}>
                    <Icon className={cn('h-3 w-3', m.color)} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{m.verb}</p>
                    <p className="text-xs text-muted-foreground">{m.detail}</p>
                  </div>
                  {m.actionLabel && m.onAction && (
                    <Button size="sm" variant="outline" className="shrink-0 text-xs h-8 rounded-lg" onClick={m.onAction}>
                      {m.actionLabel}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-opportunity font-medium">
            <CheckCircle2 className="h-4 w-4" /> All risk items addressed today
          </div>
        )}
      </div>

      {/* Today's scorecard — compact */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-bold">Today's Results</h3>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span><span className="font-semibold text-foreground">{intel.touchedToday.length}</span> tasks done</span>
          <span><span className="font-semibold text-foreground">{intel.touchedToday.length}</span> leads touched</span>
          <span><span className="font-semibold text-foreground">{leadsAtRisk.length}</span> at risk</span>
        </div>
      </div>

      {/* Tomorrow's directive */}
      {scoredLeads.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Sun className="h-4 w-4 text-warning" /> Tomorrow Morning: Call <button onClick={() => onOpenLead(scoredLeads[0].lead)} className="text-primary hover:underline cursor-pointer">{scoredLeads[0].lead.name}</button>
          </h3>
          <p className="text-xs text-muted-foreground">
            Score {scoredLeads[0].score} · {scoredLeads[0].lead.source || 'Direct'} — make this your first move
          </p>
        </div>
      )}

    </div>
  );
}

// ── Shared Pipeline Section ─────────────────────────────────────────

function PipelineSection({ leads, targetMarket, onTap, onLeadAction, label, onAddLead }: {
  leads: { lead: Lead; score: number }[];
  targetMarket: TargetMarket;
  onTap: (lead: Lead) => void;
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email') => void;
  label: string;
  onAddLead?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <span className="w-[3px] h-4 rounded-full bg-primary inline-block" />{label}
        </h2>
        {onAddLead && (
          <button onClick={onAddLead} className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center hover:bg-primary/25 transition-colors" aria-label="Add lead">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {leads.map(({ lead, score }) => (
          <PipelineCard
            key={lead.id}
            lead={lead}
            score={score}
            outsideTarget={isOutsideTarget(lead, targetMarket)}
            onTap={() => onTap(lead)}
            onAction={(type) => onLeadAction(lead, type)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Directive Brief Card ────────────────────────────────────────────

function DirectiveBriefCard({ mode, leads, ccData, onLeadAction, onOpenLead }: {
  mode: string;
  leads: Lead[];
  ccData: any;
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => void;
  onOpenLead: (lead: Lead) => void;
}) {
  const now = new Date();
  const firstName = ccData?.agentProfile?.user_id ? undefined : undefined; // not available here, handled in parent
  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (mode === 'morning') {
    const top3 = [...leads]
      .filter(l => !l.snoozeUntil || new Date(l.snoozeUntil) <= now)
      .sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0))
      .slice(0, 3);

    const hasHighRisk = top3.some(l => {
      const risk = computeRisk(l, getLeadHeatScore(l));
      return risk.level === 'high';
    });

    return (
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          background: 'linear-gradient(#0F172A,#0F172A) padding-box, linear-gradient(to right,#6366f1,#9333ea) border-box',
          border: '1px solid transparent',
        }}
      >
        <p className="text-xs text-muted-foreground">{today}</p>
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Your 3 Moves Today
        </h2>

        <ol className="space-y-2">
          {top3.map((lead, i) => {
            const daysSince = lead.lastTouchedAt
              ? Math.floor((now.getTime() - new Date(lead.lastTouchedAt).getTime()) / 86400000)
              : null;
            const channel = lead.statusTags?.some(t => t.toLowerCase().includes('text')) ? 'text' as const : 'call' as const;
            return (
              <li key={lead.id} className="flex items-start gap-2 text-sm">
                <span className="text-xs font-bold text-primary mt-0.5 shrink-0">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <button onClick={() => onOpenLead(lead)} className="font-medium text-primary hover:underline cursor-pointer text-left">{lead.name}</button>
                  <span className="text-xs text-muted-foreground ml-1.5">
                    Score {lead.engagementScore || 0} · {lead.source || 'Direct'} · {daysSince !== null ? `${daysSince}d ago` : 'never contacted'}
                  </span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => onLeadAction(lead, 'call')} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label={`Call ${lead.name}`}>
                    <Phone className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => onLeadAction(lead, 'text')} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label={`Text ${lead.name}`}>
                    <MessageSquare className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
          {top3.length === 0 && (
            <li className="text-sm text-muted-foreground">No active leads yet.</li>
          )}
        </ol>

        {ccData.totalRevenue > 0 && (
          <p className="text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3 inline -mt-0.5 text-opportunity" /> {formatCurrency(ccData.totalRevenue)} active pipeline revenue
          </p>
        )}

        {hasHighRisk && (
          <div className="flex items-center gap-1.5 text-xs text-urgent font-medium">
            <ShieldAlert className="h-3.5 w-3.5" /> A top lead has high risk — act fast
          </div>
        )}
      </div>
    );
  }

  if (mode === 'midday') {
    const eightHoursAgo = new Date(now.getTime() - 8 * 60 * 60 * 1000);
    const quietLeads = leads.filter(l => {
      if (l.snoozeUntil && new Date(l.snoozeUntil) > now) return false;
      if (!l.lastTouchedAt) return true;
      return new Date(l.lastTouchedAt) < eightHoursAgo;
    });
    const staleTop = [...quietLeads].sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0))[0] || null;

    return (
      <div className="rounded-xl border-l-[3px] border-l-warning border border-border bg-card p-4 space-y-3">
        {staleTop ? (
          <>
            <h2 className="text-sm font-bold"><button onClick={() => onOpenLead(staleTop)} className="text-primary hover:underline cursor-pointer">{staleTop.name}</button> hasn't heard from you</h2>
            <p className="text-xs text-muted-foreground">
              Score {staleTop.engagementScore || 0} · Don't let that window close
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="h-9 text-sm rounded-xl" onClick={() => onLeadAction(staleTop, 'call')}>
                <Phone className="h-3.5 w-3.5 mr-1" /> Call
              </Button>
              <Button size="sm" variant="outline" className="h-9 text-sm rounded-xl" onClick={() => onLeadAction(staleTop, 'text')}>
                <MessageSquare className="h-3.5 w-3.5 mr-1" /> Text
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">All leads contacted recently — nice work.</p>
        )}
        {quietLeads.length > 1 && (
          <p className="text-[11px] text-muted-foreground">{quietLeads.length} lead{quietLeads.length !== 1 ? 's' : ''} quiet for 8+ hours</p>
        )}
      </div>
    );
  }

  if (mode === 'evening') {
    const activeLeads = leads.filter(l => !l.snoozeUntil || new Date(l.snoozeUntil) <= now);
    const hottest = [...activeLeads].sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0))[0];
    const leastRecent = [...activeLeads].sort((a, b) => {
      const aT = a.lastTouchedAt ? new Date(a.lastTouchedAt).getTime() : 0;
      const bT = b.lastTouchedAt ? new Date(b.lastTouchedAt).getTime() : 0;
      return aT - bT;
    })[0];
    const rev = ccData.totalRevenue || 0;

    return (
      <div className="rounded-xl border-l-[3px] border-l-[#9333ea] border border-border bg-card p-4 space-y-2">
        <p className="text-sm">
          <span className="font-bold">{activeLeads.length}</span> lead{activeLeads.length !== 1 ? 's' : ''} in your pipeline
          {hottest && <> · Hottest: <button onClick={() => onOpenLead(hottest)} className="font-semibold text-primary hover:underline cursor-pointer">{hottest.name}</button></>}
        </p>
        {leastRecent && leastRecent.id !== hottest?.id && (
          <p className="text-xs text-muted-foreground">
            <Sun className="h-3 w-3 inline -mt-0.5 text-warning" /> Tomorrow start with <button onClick={() => onOpenLead(leastRecent)} className="font-medium text-primary hover:underline cursor-pointer">{leastRecent.name}</button>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {rev > 0 ? `${formatCurrency(rev)} pipeline — keep protecting it.` : 'Build your pipeline tomorrow.'}
        </p>
      </div>
    );
  }

  // night — no extra card
  return null;
}

// ── Main Component ──────────────────────────────────────────────────

export default function BetaHomeScreen() {
  const { user } = useAuth();
  const { leads, deals, tasks, alerts, dealParticipants, hasData, loading, seedDemoData, refreshData } = useData();
  const { openWorkspace } = useWorkspace();
  const { isSyncing: syncing } = useSyncContext();
  const { currentMode, autoMode, override, setModeOverride } = useSessionMode();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [targetMarket, setTargetMarket] = useState<TargetMarket>({ zipCodes: [], minPrice: null });
  const [incomeExpanded, setIncomeExpanded] = useState(false);
  const [executionEntity, setExecutionEntity] = useState<any>(null);
  const [snoozeLeadId, setSnoozeLeadId] = useState<string | null>(null);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [quickActionLead, setQuickActionLead] = useState<{ lead: Lead; score: number } | null>(null);
  const [showQuickAddLead, setShowQuickAddLead] = useState(false);
  const [qaName, setQaName] = useState('');
  const [qaPhone, setQaPhone] = useState('');
  const [qaSource, setQaSource] = useState('Referral');
  const [qaTemp, setQaTemp] = useState<'hot' | 'warm' | 'cool'>('warm');
  const [qaSaving, setQaSaving] = useState(false);

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
  const intel = useTimeIntelligence(leads, deals, tasks);
  const briefing = useMemo(() => getDailyBriefing(ccData.panels, tasks, deals, leads), [ccData.panels, tasks, deals, leads]);

  const priorityLead = intel.scoredLeads[0] || null;
  const hasFubConnected = ccData.hasFubIntegration;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const handleLeadAction = useCallback((lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => {
    if (type === 'snooze') {
      setSnoozeLeadId(lead.id);
      return;
    }
    const phone = (lead as any).phone as string | undefined;
    const email = (lead as any).email as string | undefined;
    let acted = false;
    if (type === 'call') {
      if (phone) { window.location.href = `tel:${phone}`; acted = true; }
      else toast.error('No phone on file');
    } else if (type === 'text') {
      if (phone) { window.location.href = `sms:${phone}`; acted = true; }
      else toast.error('No phone on file');
    } else if (type === 'email') {
      if (email) { window.location.href = `mailto:${email}`; acted = true; }
      else toast.error('No email on file');
    }
    if (acted) {
      supabase.from('leads').update({ last_touched_at: new Date().toISOString() } as any).eq('id', lead.id).then(() => refreshData());
    }
  }, [refreshData]);

  const handleSnoozeConfirm = useCallback(async () => {
    if (!snoozeLeadId || !snoozeDate) return;
    await supabase.from('leads').update({ snooze_until: new Date(snoozeDate).toISOString() } as any).eq('id', snoozeLeadId);
    toast.success('Lead snoozed — will resurface on the selected date.');
    setSnoozeLeadId(null);
    setSnoozeDate('');
    refreshData();
  }, [snoozeLeadId, snoozeDate, refreshData]);

  const handleOpenLeadDetail = useCallback((lead: Lead) => {
    const score = getLeadHeatScore(lead);
    setQuickActionLead({ lead, score });
  }, []);

  const handleQuickAddSave = useCallback(async () => {
    if (!qaName.trim() || !user?.id) return;
    setQaSaving(true);
    try {
      await supabase.from('leads').insert({
        name: qaName.trim(),
        source: qaSource,
        lead_temperature: qaTemp,
        assigned_to_user_id: user.id,
        last_contact_at: new Date().toISOString(),
        engagement_score: qaTemp === 'hot' ? 80 : qaTemp === 'warm' ? 50 : 25,
      } as any);
      await refreshData();
      setShowQuickAddLead(false);
      setQaName(''); setQaPhone(''); setQaSource('Referral'); setQaTemp('warm');
      toast.success('Lead added');
    } finally {
      setQaSaving(false);
    }
  }, [qaName, qaPhone, qaSource, qaTemp, user?.id, refreshData]);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto space-y-4 animate-pulse">
        <div className="h-12 bg-muted rounded-lg" />
        <div className="h-32 bg-muted rounded-xl" />
        <div className="h-24 bg-muted rounded-lg" />
      </div>
    );
  }

  // Mode greeting
  const greetings: Record<string, string> = {
    morning: `Good morning, ${user?.name?.split(' ')[0] || 'Agent'}`,
    midday: `Here's what's changed`,
    evening: `Evening wrap-up`,
    night: `You're off the clock`,
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Top Bar with Mode Selector */}
      <div className="flex items-center justify-between pt-1 gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">{greetings[currentMode]}</h1>
          <p className="text-[13px] text-muted-foreground">{today}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ModePillSelector
            currentMode={currentMode}
            autoMode={autoMode}
            override={override}
            onOverride={setModeOverride}
          />
          <SyncDot syncing={syncing} lastSync={lastSync} />
        </div>
      </div>

      {/* Directive Brief Card — above everything */}
      <DirectiveBriefCard mode={currentMode} leads={leads} ccData={ccData} onLeadAction={handleLeadAction} onOpenLead={handleOpenLeadDetail} />

      {/* Time-of-Day Content — first element */}
      {currentMode === 'morning' && (
        <MorningMode
          intel={intel}
          priorityLead={priorityLead}
          ccData={ccData}
          onLeadAction={handleLeadAction}
          onOpenLead={handleOpenLeadDetail}
          onOpenWorkspace={openWorkspace}
          targetMarket={targetMarket}
          onAddLead={() => setShowQuickAddLead(true)}
        />
      )}
      {currentMode === 'midday' && (
        <MiddayMode
          intel={intel}
          ccData={ccData}
          onLeadAction={handleLeadAction}
          onOpenLead={handleOpenLeadDetail}
          targetMarket={targetMarket}
          totalMoneyAtRisk={ccData.totalMoneyAtRisk || 0}
        />
      )}
      {currentMode === 'evening' && (
        <EveningMode
          intel={intel}
          ccData={ccData}
          onLeadAction={handleLeadAction}
          onOpenLead={handleOpenLeadDetail}
          onOpenWorkspace={openWorkspace}
          targetMarket={targetMarket}
        />
      )}
      {currentMode === 'night' && (
        <NightMode intel={intel} />
      )}

      {/* Daily Briefing */}
      <div className="rounded-xl border border-border bg-card p-3.5 flex items-start gap-3">
        <span className="text-xl leading-none mt-0.5">{briefing.icon}</span>
        <p className="text-sm text-foreground leading-relaxed min-[0px]:text-[15px]">{briefing.text}</p>
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

      {/* Snoozed leads — all modes */}
      {intel.snoozedLeads.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground px-1 flex items-center gap-2">
            <span className="w-[3px] h-4 rounded-full bg-primary inline-block" />Snoozed ({intel.snoozedLeads.length})
          </p>
          {intel.snoozedLeads.map(l => (
            <div key={l.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/50 text-sm">
              <button onClick={() => handleOpenLeadDetail(l)} className="text-primary hover:underline truncate text-left">{l.name}</button>
              <Badge variant="outline" className="text-[9px] shrink-0">
                <Clock className="h-2 w-2 mr-0.5" /> {new Date(l.snoozeUntil!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Badge>
            </div>
          ))}
        </div>
      )}


      {/* Income Control (collapsed) — all modes */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button className="w-full flex items-center justify-between p-3 min-h-[44px]" onClick={() => setIncomeExpanded(e => !e)}>
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

      {/* Snooze modal */}
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

      {/* Lead Quick Action Bottom Sheet */}
      {quickActionLead && (() => {
        const { lead, score } = quickActionLead;
        const phone = (lead as any).phone as string | undefined;
        const email = (lead as any).email as string | undefined;
        const daysSince = lead.lastTouchedAt
          ? Math.floor((Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000)
          : null;
        const verdict = getClientVerdict(lead, score, computeRisk(lead, score).level);
        return (
          <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={() => setQuickActionLead(null)}>
            <div
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-border bg-card p-5 space-y-4 animate-slide-up max-w-lg mx-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="text-base font-bold truncate">{lead.name}</h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{lead.source || 'Direct'}</Badge>
                    <HeatBadge score={score} />
                  </div>
                </div>
                <button onClick={() => setQuickActionLead(null)} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 hover:bg-accent transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Contact info */}
              <div className="space-y-1.5">
                {phone && (
                  <a href={`tel:${phone}`} className="flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer">
                    <Phone className="h-3.5 w-3.5" /> {phone}
                  </a>
                )}
                {email && (
                  <a href={`mailto:${email}`} className="flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer">
                    <Mail className="h-3.5 w-3.5" /> {email}
                  </a>
                )}
                {!phone && !email && (
                  <p className="text-xs text-muted-foreground">No contact info on file</p>
                )}
              </div>

              {/* Status line */}
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">
                  {daysSince !== null ? `Last touched ${daysSince} day${daysSince !== 1 ? 's' : ''} ago` : 'Never contacted'}
                </p>
                <p className={cn('text-xs font-medium', verdict.color)}>{verdict.text}</p>
              </div>

              {/* 2x2 Action Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => { handleLeadAction(lead, 'call'); setQuickActionLead(null); }}
                  className="flex items-center justify-center gap-2 h-12 rounded-xl bg-opportunity/15 text-opportunity font-medium text-sm hover:bg-opportunity/25 transition-colors"
                >
                  <Phone className="h-4 w-4" /> Call
                </button>
                <button
                  onClick={() => { handleLeadAction(lead, 'text'); setQuickActionLead(null); }}
                  className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary/15 text-primary font-medium text-sm hover:bg-primary/25 transition-colors"
                >
                  <MessageSquare className="h-4 w-4" /> Text
                </button>
                <button
                  onClick={() => { handleLeadAction(lead, 'email'); setQuickActionLead(null); }}
                  className="flex items-center justify-center gap-2 h-12 rounded-xl bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))] font-medium text-sm hover:bg-[hsl(var(--accent))]/25 transition-colors"
                >
                  <Mail className="h-4 w-4" /> Email
                </button>
                <button
                  onClick={() => { setQuickActionLead(null); setExecutionEntity({ entity: lead, entityType: 'lead' }); }}
                  className="flex items-center justify-center gap-2 h-12 rounded-xl bg-muted text-muted-foreground font-medium text-sm hover:bg-accent hover:text-foreground transition-colors"
                >
                  <User className="h-4 w-4" /> Open File
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Execution drawer */}
      {executionEntity && (
        <ActionComposerDrawer
          open={!!executionEntity}
          entity={executionEntity.entity}
          entityType={executionEntity.entityType}
          onClose={() => setExecutionEntity(null)}
        />
      )}

      {/* Voice Lead Capture FAB */}
      <VoiceLeadCaptureFAB />
    </div>
  );
}
