import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Phone, MessageSquare, Mail, Clock, ChevronDown, ChevronUp,
  Home, DollarSign, AlertTriangle, Flame, ShieldAlert,
  Sun, CloudSun, Moon, TrendingUp, TrendingDown, Minus,
  CheckCircle2, Shield, Target, Zap, ArrowRight,
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
import { toast } from '@/hooks/use-toast';
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

function PipelineCard({ lead, score, outsideTarget, onTap }: {
  lead: Lead;
  score: number;
  outsideTarget: boolean;
  onTap: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const risk = useMemo(() => computeRisk(lead, score), [lead, score]);
  const borderColor = score >= 80 ? 'border-l-opportunity' : score >= 60 ? 'border-l-warning' : 'border-l-muted-foreground/30';

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md border-l-[3px]", borderColor)}>
      <div className="w-full text-left p-3 flex items-center gap-2 min-h-[56px] hover:bg-accent/50 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <RiskDot level={risk.level} />
        <div className="flex-1 min-w-0 overflow-hidden">
          <button onClick={(e) => { e.stopPropagation(); onTap(); }} className="text-sm font-medium truncate block w-full text-primary hover:underline text-left">{lead.name}</button>
          <p className="text-[13px] text-muted-foreground truncate">{lead.source || 'Direct'}</p>
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
    };
  }, [leads, deals, tasks]);
}

// ── Morning Mode ────────────────────────────────────────────────────

function MorningMode({ intel, priorityLead, ccData, onLeadAction, onOpenLead, onOpenWorkspace, targetMarket }: {
  intel: ReturnType<typeof useTimeIntelligence>;
  priorityLead: { lead: Lead; score: number } | null;
  ccData: any;
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => void;
  onOpenLead: (lead: Lead) => void;
  onOpenWorkspace: (id: string) => void;
  targetMarket: TargetMarket;
}) {
  const { hotLeads, riskDeals, overdueTasks, closingSoonDeals, totalPipelineValue, atRiskValue, scoredLeads } = intel;

  return (
    <div className="space-y-4">
      {/* Morning Intel Briefing */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-warning/15 flex items-center justify-center">
            <Zap className="h-4 w-4 text-warning" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Today's Intelligence</h2>
            <p className="text-[11px] text-muted-foreground">Here's what needs your attention</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-lg font-bold text-foreground">{hotLeads.length}</p>
            <p className="text-[10px] text-muted-foreground">Hot Leads</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-lg font-bold text-urgent">{riskDeals.length}</p>
            <p className="text-[10px] text-muted-foreground">At-Risk Deals</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-lg font-bold text-foreground">{overdueTasks.length}</p>
            <p className="text-[10px] text-muted-foreground">Overdue</p>
          </div>
        </div>
        {totalPipelineValue > 0 && (
          <p className="text-xs text-muted-foreground">
            {formatCurrency(totalPipelineValue)} in pipeline • {atRiskValue > 0 ? <span className="text-urgent">{formatCurrency(atRiskValue)} at risk</span> : 'No income at risk'}
          </p>
        )}
      </div>

      {/* Focus First — top 3 priorities */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Your 3 Moves Today</h3>
        </div>
        <div className="space-y-2">
          {riskDeals.length > 0 && (
            <div className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-urgent/15 flex items-center justify-center shrink-0">
                <Shield className="h-3 w-3 text-urgent" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{riskDeals[0].title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(riskDeals[0].commission)} at risk — {riskDeals[0].riskFlags?.join(', ') || 'needs attention'}
                </p>
              </div>
            </div>
          )}
          {priorityLead && (
            <div className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-opportunity/15 flex items-center justify-center shrink-0">
                <Flame className="h-3 w-3 text-opportunity" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{priorityLead.lead.name}</p>
                <p className="text-xs text-muted-foreground">
                  Score {priorityLead.score} — {priorityLead.lead.source || 'direct'} lead
                </p>
              </div>
            </div>
          )}
          {overdueTasks.length > 0 && (
            <div className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-3 w-3 text-warning" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{overdueTasks.length} overdue task{overdueTasks.length !== 1 ? 's' : ''}</p>
                <p className="text-xs text-muted-foreground">{overdueTasks[0]?.title}</p>
              </div>
            </div>
          )}
          {!riskDeals.length && !priorityLead && !overdueTasks.length && (
            <p className="text-sm text-muted-foreground">Clear skies — start with growth opportunities.</p>
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

      {/* Deal Milestones */}
      <DealMilestonesPanel />

      {/* Pipeline list (top 5 non-priority) */}
      {scoredLeads.length > 1 && (
        <PipelineSection
          leads={scoredLeads.slice(1, 6)}
          targetMarket={targetMarket}
          onTap={onOpenLead}
          label="Next Up"
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

  return (
    <div className="space-y-4">
      {/* Midday Progress Tracker */}
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

        {/* Progress stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-lg font-bold text-opportunity">{completedToday.length}</p>
            <p className="text-[10px] text-muted-foreground">Done Today</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-lg font-bold text-foreground">{tasksRemaining}</p>
            <p className="text-[10px] text-muted-foreground">Remaining</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-lg font-bold text-foreground">{hotLeads.length}</p>
            <p className="text-[10px] text-muted-foreground">Hot Leads</p>
          </div>
        </div>

        {/* Leads touched today */}
        {intel.touchedToday.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{intel.touchedToday.length}</span> lead{intel.touchedToday.length !== 1 ? 's' : ''} touched today
            </p>
            <div className="flex flex-wrap gap-1">
              {intel.touchedToday.map(l => (
                <span key={l.id} className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[11px] font-medium text-foreground">
                  {l.name.split(' ')[0]} {l.name.split(' ')[1]?.[0] ? `${l.name.split(' ')[1][0]}.` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Momentum indicator */}
        <div className={cn('flex items-center gap-2 text-sm font-medium', momentumColor)}>
          <MomentumIcon className="h-4 w-4" />
          <span>{momentumLabel}</span>
        </div>
        {sessionStart && (
          <p className="text-[11px] text-muted-foreground">
            Risk {riskDelta <= 0 ? '↓' : '↑'} {formatCurrency(Math.abs(riskDelta))} since this morning
          </p>
        )}
      </div>

      {/* Remaining actions — what still needs doing */}
      {(riskDeals.length > 0 || overdueTasks.length > 0) && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-primary" /> Still Needs Attention
          </h3>
          <div className="space-y-2">
            {riskDeals.slice(0, 3).map(d => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <Shield className="h-3.5 w-3.5 text-urgent shrink-0" />
                <span className="truncate">{d.title}</span>
                <span className="text-xs text-muted-foreground shrink-0 ml-auto">{formatCurrency(d.commission)}</span>
              </div>
            ))}
            {overdueTasks.slice(0, 2).map(t => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                <span className="truncate">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hot leads to pursue now */}
      {hotLeads.length > 0 && (
        <PipelineSection
          leads={hotLeads.slice(0, 5)}
          targetMarket={targetMarket}
          onTap={onOpenLead}
          label="Hot Leads — Act Now"
        />
      )}

      <DealMilestonesPanel />
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
  const { untouchedRiskDeals, untouchedHotLeads, overdueTasks, completedToday, riskDeals, hotLeads, scoredLeads } = intel;
  const hasOpenItems = untouchedRiskDeals.length > 0 || untouchedHotLeads.length > 0 || overdueTasks.length > 0;

  return (
    <div className="space-y-4">
      {/* End-of-Day Safety Check */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', hasOpenItems ? 'bg-warning/15' : 'bg-opportunity/15')}>
            {hasOpenItems ? <AlertTriangle className="h-4 w-4 text-warning" /> : <CheckCircle2 className="h-4 w-4 text-opportunity" />}
          </div>
          <div>
            <h2 className="text-sm font-bold">{hasOpenItems ? 'Before You Log Off' : "You're Clear"}</h2>
            <p className="text-[11px] text-muted-foreground">
              {hasOpenItems ? 'A few things to address or note for tomorrow' : 'Nothing urgent left — enjoy your evening'}
            </p>
          </div>
        </div>

        {hasOpenItems ? (
          <div className="space-y-2">
            {untouchedRiskDeals.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-urgent shrink-0" />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{untouchedRiskDeals.length}</span> at-risk deal{untouchedRiskDeals.length !== 1 ? 's' : ''} untouched today
                </span>
              </div>
            )}
            {untouchedHotLeads.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-opportunity shrink-0" />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{untouchedHotLeads.length}</span> hot lead{untouchedHotLeads.length !== 1 ? 's' : ''} not contacted
                </span>
              </div>
            )}
            {overdueTasks.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-warning shrink-0" />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{overdueTasks.length}</span> overdue task{overdueTasks.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-opportunity font-medium">
            <CheckCircle2 className="h-4 w-4" /> All risk items addressed today
          </div>
        )}
      </div>

      {/* Today's Scorecard */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold">Today's Results</h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-lg font-bold text-opportunity">{completedToday.length}</p>
            <p className="text-[10px] text-muted-foreground">Completed</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-lg font-bold text-foreground">{hotLeads.length}</p>
            <p className="text-[10px] text-muted-foreground">Hot Leads</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-lg font-bold text-foreground">{riskDeals.length}</p>
            <p className="text-[10px] text-muted-foreground">Deals at Risk</p>
          </div>
        </div>
        {/* Leads touched today */}
        {intel.touchedToday.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{intel.touchedToday.length}</span> lead{intel.touchedToday.length !== 1 ? 's' : ''} touched today
            </p>
            <div className="flex flex-wrap gap-1">
              {intel.touchedToday.map(l => (
                <span key={l.id} className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[11px] font-medium text-foreground">
                  {l.name.split(' ')[0]} {l.name.split(' ')[1]?.[0] ? `${l.name.split(' ')[1][0]}.` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tomorrow's Top Priority */}
      {scoredLeads.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Sun className="h-4 w-4 text-warning" /> Tomorrow's First Call
          </h3>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{scoredLeads[0].lead.name}</p>
              <p className="text-xs text-muted-foreground">{scoredLeads[0].lead.source || 'Direct'} · Score {scoredLeads[0].score}</p>
            </div>
            <HeatBadge score={scoredLeads[0].score} />
          </div>
        </div>
      )}

      {/* Open House + Visitors */}
      <div className="space-y-2">
        <Button className="w-full h-12 min-h-[48px] text-base font-semibold" onClick={() => onOpenWorkspace('openhouse')}>
          <Home className="h-5 w-5 mr-2" /> Open House
        </Button>
        <RecentVisitorsStrip />
      </div>
    </div>
  );
}

// ── Shared Pipeline Section ─────────────────────────────────────────

function PipelineSection({ leads, targetMarket, onTap, label }: {
  leads: { lead: Lead; score: number }[];
  targetMarket: TargetMarket;
  onTap: (lead: Lead) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground px-1 flex items-center gap-2">
        <span className="w-[3px] h-4 rounded-full bg-primary inline-block" />{label}
      </h2>
      <div className="space-y-1.5">
        {leads.map(({ lead, score }) => (
          <PipelineCard
            key={lead.id}
            lead={lead}
            score={score}
            outsideTarget={isOutsideTarget(lead, targetMarket)}
            onTap={() => onTap(lead)}
          />
        ))}
      </div>
    </div>
  );
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
    if (type === 'call') {
      if (phone) window.location.href = `tel:${phone}`;
      else toast({ description: 'No phone on file — update in FUB' });
    } else if (type === 'text') {
      if (phone) window.location.href = `sms:${phone}`;
      else toast({ description: 'No phone on file — update in FUB' });
    } else if (type === 'email') {
      if (email) window.location.href = `mailto:${email}`;
      else toast({ description: 'No email on file — update in FUB' });
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

      {/* Time-of-Day Content */}
      {currentMode === 'morning' && (
        <MorningMode
          intel={intel}
          priorityLead={priorityLead}
          ccData={ccData}
          onLeadAction={handleLeadAction}
          onOpenLead={handleOpenLeadDetail}
          onOpenWorkspace={openWorkspace}
          targetMarket={targetMarket}
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

      {/* Open House — morning & midday */}
      {currentMode !== 'evening' && (
        <div className="space-y-2">
          <Button className="w-full h-12 min-h-[48px] text-base font-semibold" onClick={() => openWorkspace('openhouse')}>
            <Home className="h-5 w-5 mr-2" /> Open House
          </Button>
          <RecentVisitorsStrip />
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
