import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Phone, MessageSquare, Mail, Clock, ChevronDown, ChevronUp, ChevronRight,
  Home, DollarSign, AlertTriangle, Flame, ShieldAlert,
  Sun, CloudSun, Moon, TrendingUp, TrendingDown, Minus,
  CheckCircle2, Shield, Target, Zap, ArrowRight, X, User, Plus,
  Sparkles, MapPin, RefreshCw,
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
import { useNavigate } from 'react-router-dom';
import type { Lead, Deal, Task } from '@/types';
import { computeRisk, RiskDot, RiskPanel } from '@/components/DealRiskRadar';
import { WeeklyPerformanceDigest } from '@/components/WeeklyPerformanceDigest';
import { UnderContractBadge, UnderContractSheet, isUnderContract } from '@/components/UnderContractAction';
import { getDailyBriefing } from '@/lib/dailyIntelligence';
import { useDemo } from '@/contexts/DemoContext';

import { LeadScorePopover } from '@/components/LeadScorePopover';

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

function HeatBadge({ score, lead, allLeads, interactive }: { score: number; lead?: Lead; allLeads?: Lead[]; interactive?: boolean }) {
  const [open, setOpen] = useState(false);
  const bg = score >= 75 ? 'bg-urgent/15 text-urgent' : score >= 50 ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground';
  const label = score >= 75 ? 'Hot' : score >= 50 ? 'Warm' : 'Cool';

  const bullets = useMemo(() => {
    if (!interactive || !lead || !allLeads) return [];
    const lines: string[] = [];
    // Percentile
    const allScores = allLeads.map(l => getLeadHeatScore(l)).sort((a, b) => b - a);
    const rank = allScores.findIndex(s => s <= score);
    const pct = allScores.length > 1 ? Math.round(((rank) / allScores.length) * 100) : 0;
    if (pct <= 25) lines.push(`Score ${score} — top ${Math.max(pct, 1)}% of your pipeline`);
    else lines.push(`Score ${score} — ranks in the ${pct <= 50 ? 'upper' : 'lower'} half of your pipeline`);
    // Source
    if (lead.source) {
      const sameSource = allLeads.filter(l => l.source === lead.source);
      const avgScore = sameSource.length > 0 ? Math.round(sameSource.reduce((s, l) => s + getLeadHeatScore(l), 0) / sameSource.length) : 0;
      if (avgScore >= 60) lines.push(`From ${lead.source} — historically your strongest source`);
      else lines.push(`From ${lead.source} — avg score ${avgScore} across ${sameSource.length} lead${sameSource.length !== 1 ? 's' : ''}`);
    }
    // Recency
    if (!lead.lastTouchedAt) {
      lines.push('Never contacted — urgency is high');
    } else {
      const days = Math.floor((Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000);
      if (days === 0) lines.push('Contacted today — momentum is strong');
      else if (days <= 3) lines.push(`Touched ${days}d ago — still warm`);
      else if (days <= 7) lines.push(`${days}d since contact — follow up soon`);
      else lines.push(`${days}d silent — risk of going cold`);
    }
    return lines;
  }, [interactive, lead, allLeads, score]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    setOpen(o => !o);
  }, [interactive]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <span className="relative inline-flex">
      <span
        className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', bg, interactive && 'cursor-pointer')}
        onClick={handleClick}
      >
        <Flame className="h-2.5 w-2.5" /> {score} · {label}
      </span>
      {open && bullets.length > 0 && (
        <div
          className="absolute bottom-full right-0 mb-1.5 z-50 w-56 rounded-lg bg-foreground text-background p-2.5 shadow-lg text-[11px] space-y-1"
          onClick={e => e.stopPropagation()}
        >
          {bullets.map((b, i) => (
            <p key={i} className="leading-snug">• {b}</p>
          ))}
        </div>
      )}
    </span>
  );
}

function getLeadHeatScore(lead: Lead): number {
  let score = 0;

  // 1. Temperature base (most important signal)
  if (lead.leadTemperature === 'hot') score += 40;
  else if (lead.leadTemperature === 'warm') score += 25;
  else score += 10; // cold still gets a base

  // 2. Source quality signal
  const src = (lead.source || '').toLowerCase();
  if (src.includes('zillow preferred')) score += 15;
  else if (src.includes('zillow')) score += 10;
  else if (src.includes('sphere') || src.includes('referral')) score += 12;
  else if (src.includes('realtor') || src.includes('redfin')) score += 8;
  else if (src) score += 5;

  // 3. Recency of contact — more recent = higher score
  const contactDate = lead.lastTouchedAt || lead.lastContactAt;
  if (contactDate) {
    const daysSince = (Date.now() - new Date(contactDate).getTime()) / 86400000;
    if (daysSince < 1) score += 20;
    else if (daysSince < 3) score += 15;
    else if (daysSince < 7) score += 10;
    else if (daysSince < 14) score += 5;
    // Older than 14 days = no recency bonus
  }

  // 4. High-intent tags
  const tags = (lead.statusTags || []).map(t => t.toLowerCase());
  if (tags.some(t => ['pre-approved', 'pre_approved', 'cash_buyer', 'cash buyer'].includes(t))) score += 15;
  if (tags.some(t => ['showing', 'appointment set', 'appointment_set'].includes(t))) score += 12;
  if (tags.some(t => ['motivated', 'serious', 'vip', 'market vip'].includes(t))) score += 10;
  if (tags.some(t => ['buyer', 'seller', 'investor'].includes(t))) score += 5;

  // 5. Has contact info (shows engagement with the lead)
  if (lead.emailPrimary || lead.phonePrimary) score += 5;

  // 6. Use stored engagement score as additive if non-zero
  if ((lead.engagementScore || 0) > 0) {
    score += Math.min(lead.engagementScore, 20);
  }

  return Math.min(Math.max(score, 0), 100);
}

/** Returns 2-3 sentence plain-English explanation of why a lead has their score */
function explainLeadScore(lead: Lead): string {
  const score = getLeadHeatScore(lead);
  const reasons: string[] = [];

  // Temperature
  if (lead.leadTemperature === 'hot') reasons.push('marked Hot in FUB (+40)');
  else if (lead.leadTemperature === 'warm') reasons.push('marked Warm in FUB (+25)');
  else reasons.push('marked Cool/Cold in FUB (+10)');

  // Source
  const src = (lead.source || '').toLowerCase();
  if (src.includes('zillow preferred')) reasons.push('Zillow Preferred source (+15)');
  else if (src.includes('sphere') || src.includes('referral')) reasons.push('Sphere/Referral source (+12)');
  else if (src.includes('zillow')) reasons.push('Zillow source (+10)');

  // Recency
  const contactDate = lead.lastTouchedAt || lead.lastContactAt;
  if (contactDate) {
    const d = Math.floor((Date.now() - new Date(contactDate).getTime()) / 86400000);
    if (d < 1) reasons.push('contacted today (+20)');
    else if (d < 3) reasons.push(`contacted ${d}d ago (+15)`);
    else if (d < 7) reasons.push(`contacted ${d}d ago (+10)`);
    else if (d < 14) reasons.push(`contacted ${d}d ago (+5)`);
    else reasons.push(`no contact in ${d} days (−no recency bonus)`);
  } else {
    reasons.push('never contacted (−no recency bonus)');
  }

  // Tags
  const tags = (lead.statusTags || []).map(t => t.toLowerCase());
  if (tags.some(t => ['pre-approved', 'pre_approved', 'cash_buyer'].includes(t))) reasons.push('pre-approved or cash buyer (+15)');
  if (tags.some(t => ['showing', 'appointment set'].includes(t))) reasons.push('appointment/showing tag (+12)');

  const label = score >= 80 ? 'Hot 🔥' : score >= 60 ? 'Warm ☀️' : score >= 40 ? 'Warming Up' : 'Cool ❄️';
  return `Score ${score}/100 — ${label}. Factors: ${reasons.slice(0, 3).join(', ')}.`;
}

function isOutsideTarget(lead: Lead, target: TargetMarket): boolean {
  // If the agent hasn't configured any target criteria, never show the badge
  if (!target.zipCodes.length && !target.minPrice) return false;

  // ZIP code check: only flag if lead text contains a 5-digit ZIP that doesn't match
  if (target.zipCodes.length > 0) {
    const text = `${lead.notes || ''} ${lead.source || ''}`.toLowerCase();
    // Extract any 5-digit ZIP codes from lead text
    const foundZips = text.match(/\b\d{5}\b/g);
    if (foundZips && foundZips.length > 0) {
      const hasMatch = foundZips.some(z => target.zipCodes.includes(z));
      if (!hasMatch) return true;
    }
    // If no ZIP codes found in lead data, we can't determine — don't flag
  }

  // Price check: only flag if lead has price data that's below minimum
  if (target.minPrice) {
    const text = `${lead.notes || ''}`;
    const priceMatch = text.match(/\$\s*([\d,]+)/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (price > 0 && price < target.minPrice) return true;
    }
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
            {/* Name taps straight to full profile */}
            <button onClick={onTapName} className="text-base font-semibold truncate block w-full text-primary hover:underline text-left">{lead.name}</button>
            <p className="text-[13px] text-muted-foreground truncate">{lead.source || 'No recent activity'}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <HeatBadge score={score} />
            {/* Explicit profile link so it's obviously tappable */}
            <button
              onClick={onTapName}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Open full profile"
            >
              <User className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Profile</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
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

function PipelineCard({ lead, score, outsideTarget, onTap, onAction, userId, onRefresh, allLeads }: {
  lead: Lead;
  score: number;
  outsideTarget: boolean;
  onTap: () => void;
  onAction: (type: 'call' | 'text' | 'email') => void;
  userId: string;
  onRefresh: () => void;
  allLeads?: Lead[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [ucOpen, setUcOpen] = useState(false);
  const [taskType, setTaskType] = useState<string>('call');
  const [taskDue, setTaskDue] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [taskNotes, setTaskNotes] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [ucRefresh, setUcRefresh] = useState(0);
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

  const handleSaveTask = async () => {
    setTaskSaving(true);
    const typeLabel = taskType.charAt(0).toUpperCase() + taskType.slice(1).replace('_', ' ');
    const { error } = await supabase.from('tasks').insert({
      type: taskType as any,
      due_at: new Date(taskDue).toISOString(),
      title: `${typeLabel} ${lead.name}`,
      related_lead_id: lead.id,
      assigned_to_user_id: userId,
    });
    setTaskSaving(false);
    if (error) { toast.error('Failed to save task'); return; }
    toast.success('Task created');
    setTaskOpen(false);
    setTaskNotes('');
    onRefresh();
  };

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md border-l-[3px]", borderColor)}>
      <div className="w-full text-left p-3 flex items-center gap-2 min-h-[56px] hover:bg-accent/50 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <RiskDot level={risk.level} />
        <div className="flex-1 min-w-0 overflow-hidden">
          <button onClick={(e) => { e.stopPropagation(); onTap(); }} className="text-sm font-medium truncate block w-full text-primary hover:underline text-left">{lead.name}</button>
          <p className="text-[13px] text-muted-foreground truncate">{lead.source || 'Direct'}</p>
          <p className={cn('text-[11px] truncate mt-0.5', verdict.color)}>{verdict.text}</p>
          <p className="text-xs text-muted-foreground mt-1">{statusLine}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[45%]">
          <UnderContractBadge leadId={lead.id} key={ucRefresh} />
          {outsideTarget && (
            <Badge variant="warning" className="text-[9px] px-1 py-0 whitespace-nowrap">
              <AlertTriangle className="h-2 w-2 mr-0.5" /> Outside
            </Badge>
          )}
          {(() => {
            const lastContact = lead.lastContactAt || lead.lastTouchedAt;
            if (!lastContact) {
              return <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-medium bg-warning/15 text-warning">Never</span>;
            }
            const days = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000);
            if (days === 0) {
              return <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-medium bg-opportunity/15 text-opportunity">Today</span>;
            }
            if (days > 14) {
              return <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-medium bg-urgent/15 text-urgent">{days}d ago</span>;
            }
            if (days >= 7) {
              return <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-medium bg-warning/15 text-warning">{days}d ago</span>;
            }
            return <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-medium bg-muted text-muted-foreground">{days}d ago</span>;
          })()}
          <HeatBadge score={score} lead={lead} allLeads={allLeads} interactive />
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
        <button onClick={(e) => { e.stopPropagation(); setUcOpen(true); }} className="text-muted-foreground hover:text-opportunity transition-colors" aria-label="Mark under contract" title="Under Contract">
          <Home className="h-3.5 w-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); setTaskOpen(true); }} className="text-muted-foreground hover:text-foreground transition-colors ml-auto" aria-label="Add task">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && <div className="px-3 pb-3"><RiskPanel lead={lead} risk={risk} /></div>}
      <UnderContractSheet lead={lead} open={ucOpen} onClose={() => setUcOpen(false)} onComplete={() => { setUcRefresh(r => r + 1); onRefresh(); }} />

      {/* Quick Task Bottom Sheet */}
      {taskOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setTaskOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-t-2xl bg-card border-t border-border p-4 space-y-3 animate-in slide-in-from-bottom-4 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Quick Task — {lead.name}</p>
              <button onClick={() => setTaskOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Type</label>
              <select value={taskType} onChange={e => setTaskType(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="call">Call</option>
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="follow_up">Follow Up</option>
                <option value="showing">Showing</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Due Date</label>
              <input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Notes (optional)</label>
              <input type="text" value={taskNotes} onChange={e => setTaskNotes(e.target.value)} placeholder="Quick note…" className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <Button className="w-full h-11 rounded-xl" onClick={handleSaveTask} disabled={taskSaving}>
              {taskSaving ? 'Saving…' : 'Save Task'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Showing Today Card ──────────────────────────────────────────────

function ShowingTodayCard({ userId, leads, refreshData }: { userId: string; leads: Lead[]; refreshData: () => void }) {
  const [showings, setShowings] = useState<any[]>([]);
  const [prepLoading, setPrepLoading] = useState<Record<string, boolean>>({});
  const [prepResults, setPrepResults] = useState<Record<string, string[]>>({});
  const [markingDone, setMarkingDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to_user_id', userId)
        .eq('type', 'showing')
        .is('completed_at', null)
        .gte('due_at', todayStart.toISOString())
        .lte('due_at', todayEnd.toISOString())
        .order('due_at', { ascending: true });
      if (data) setShowings(data);
    })();
  }, [userId]);

  const handlePrepWithAI = useCallback(async (task: any) => {
    const leadId = task.related_lead_id;
    if (!leadId) { toast.error('No lead linked to this showing'); return; }
    setPrepLoading(p => ({ ...p, [task.id]: true }));
    try {
      const resp = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: 'You are a real estate coach. Give concise showing prep as 3-4 bullet points. Each bullet starts with •',
          messages: [{ role: 'user', content: `Showing prep for: ${task.title}\nNotes: ${task.notes || 'None'}\nGive 3-4 tactical talking points the agent should use at this showing.` }],
        }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const result = await resp.json();
      const text = result?.content?.[0]?.text || '';
      const points = text.split('\n').map((l: string) => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);
      setPrepResults(p => ({ ...p, [task.id]: points.length > 0 ? points : [text] }));
    } catch {
      toast.error('Failed to generate prep');
    } finally {
      setPrepLoading(p => ({ ...p, [task.id]: false }));
    }
  }, []);

  const handleMarkDone = useCallback(async (taskId: string) => {
    setMarkingDone(p => ({ ...p, [taskId]: true }));
    await supabase.from('tasks').update({ completed_at: new Date().toISOString() } as any).eq('id', taskId);
    setShowings(prev => prev.filter(s => s.id !== taskId));
    setMarkingDone(p => ({ ...p, [taskId]: false }));
    toast.success('Showing marked complete');
    refreshData();
  }, [refreshData]);

  if (showings.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-[hsl(var(--accent))] bg-[hsl(var(--accent))/0.08] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Home className="h-5 w-5 text-[hsl(var(--accent))]" />
        <h3 className="text-sm font-bold text-foreground">Showings Today</h3>
        <Badge variant="secondary" className="text-[10px] ml-auto">{showings.length}</Badge>
      </div>
      <div className="space-y-3">
        {showings.map(task => {
          const lead = leads.find(l => l.id === task.related_lead_id);
          const leadName = lead?.name || task.title?.replace(/^Showing\s*/i, '') || 'Unknown';
          const notes = task.notes || '';
          const dueTime = new Date(task.due_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          const prep = prepResults[task.id];

          return (
            <div key={task.id} className="rounded-lg bg-card border border-border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{leadName}</p>
                  {notes && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 shrink-0" /> {notes}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  <Clock className="h-2.5 w-2.5 mr-0.5" /> {dueTime}
                </Badge>
              </div>

              {prep && (
                <div className="rounded-md bg-[hsl(var(--accent))/0.1] p-2.5 space-y-1.5">
                  <p className="text-[10px] font-semibold text-[hsl(var(--accent))] uppercase tracking-wide">Talking Points</p>
                  {prep.map((point, i) => (
                    <p key={i} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="text-[hsl(var(--accent))] font-bold shrink-0">{i + 1}.</span> {point}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-9 text-xs"
                  onClick={() => handlePrepWithAI(task)}
                  disabled={!!prepLoading[task.id]}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {prepLoading[task.id] ? 'Generating…' : prep ? 'Refresh Prep' : 'Prep with AI'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 text-xs text-opportunity"
                  onClick={() => handleMarkDone(task.id)}
                  disabled={!!markingDone[task.id]}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Done
                </Button>
              </div>
            </div>
          );
        })}
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

// ── Today's Activity Streak Strip ─────────────────────────────────

function useStreakCounter() {
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const lastActive = localStorage.getItem('dealPilot_lastActive');
    let currentStreak = parseInt(localStorage.getItem('dealPilot_streak') || '0', 10);

    if (lastActive === today) {
      // Same day — keep streak
    } else if (lastActive) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (lastActive === yesterday) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
      localStorage.setItem('dealPilot_streak', String(currentStreak));
      localStorage.setItem('dealPilot_lastActive', today);
    } else {
      currentStreak = 1;
      localStorage.setItem('dealPilot_streak', '1');
      localStorage.setItem('dealPilot_lastActive', today);
    }
    setStreak(currentStreak);
  }, []);
  return streak;
}

function readActivityStats() {
  try {
    const log = JSON.parse(localStorage.getItem('dealPilot_activityLog') || '[]') as Array<{ type?: string; date?: string; timestamp?: number }>;
    const now = new Date();
    const todayStr = now.toDateString();
    const day = now.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset).getTime();

    const todayEntries = log.filter(e => e.date && new Date(e.date).toDateString() === todayStr);
    const weekEntries = log.filter(e => e.timestamp && e.timestamp >= weekStart);
    const calls = todayEntries.filter(e => ['call', 'phone'].includes(e.type || '')).length;
    const contacts = todayEntries.filter(e => ['call', 'phone', 'text', 'sms', 'email', 'logged'].includes(e.type || '')).length;
    return { calls, contacts, weekContacts: weekEntries.length };
  } catch { return { calls: 0, contacts: 0, weekContacts: 0 }; }
}

function ActivityStreakStrip({ userId }: { userId: string }) {
  const [stats, setStats] = useState(() => readActivityStats());
  const streak = useStreakCounter();

  // Refresh stats when localStorage changes (e.g. after a contact is logged)
  useEffect(() => {
    setStats(readActivityStats());
    const interval = setInterval(() => setStats(readActivityStats()), 5000);
    return () => clearInterval(interval);
  }, [userId]);

  const weekGoal = 20;
  const weekPct = Math.min((stats.weekContacts / weekGoal) * 100, 100);
  const allZero = stats.calls === 0 && stats.contacts === 0 && streak === 0;
  const streakHot = streak >= 3;
  const goalMet = stats.weekContacts >= weekGoal;

  if (allZero) {
    return (
      <div className="rounded-md bg-muted/30 px-3 py-1.5 flex items-center justify-center h-9">
        <p className="text-[11px] text-muted-foreground">Start strong — log your first contact</p>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-muted/30 px-3 py-1.5 flex items-center justify-between h-9 gap-2">
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground min-w-0">
        <span className="flex items-center gap-1 shrink-0">
          <span>📞</span> <span className="font-medium text-foreground">{stats.calls}</span>
        </span>
        <span className="text-border">·</span>
        <span className="flex items-center gap-1 shrink-0">
          <span>✉️</span> <span className="font-medium text-foreground">{stats.contacts}</span>
        </span>
        <span className="text-border">·</span>
        <span className={cn('flex items-center gap-1 shrink-0', streakHot && 'text-warning')}>
          <span className={streakHot ? 'drop-shadow-[0_0_4px_hsl(var(--warning))]' : ''}>🔥</span>
          <span className="font-medium text-foreground">{streak}d</span>
        </span>
        <span className="text-border">·</span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span>⭐</span>
          <span className="font-medium text-foreground">{stats.weekContacts}/{weekGoal}</span>
          <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', goalMet ? 'bg-opportunity' : 'bg-primary')}
              style={{ width: `${weekPct}%` }}
            />
          </div>
        </span>
      </div>
    </div>
  );
}

// ── Empty Moves Card (shown when no leads) ───────────────────────

function EmptyMovesCard() {
  const { syncNow, isSyncing } = useSyncContext();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSync = async () => {
    setStatus('idle');
    try {
      await syncNow();
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-center">
      <Target className="h-8 w-8 text-muted-foreground mx-auto" />
      <h3 className="text-sm font-semibold">No leads yet</h3>
      <p className="text-xs text-muted-foreground">Tap Sync to import from Follow Up Boss</p>
      <Button
        size="sm"
        className="gap-1.5"
        onClick={handleSync}
        disabled={isSyncing}
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
        {isSyncing ? 'Syncing…' : status === 'success' ? 'Synced ✓' : 'Sync Now'}
      </Button>
    </div>
  );
}

// ── Pipeline Value Widget ─────────────────────────────────────────

function PipelineValueWidget({ leads }: { leads: Lead[] }) {
  const hotCount = leads.filter(l => l.leadTemperature === 'hot').length;
  const warmCount = leads.filter(l => l.leadTemperature === 'warm').length;
  
  const pipelineValue = hotCount * 485000 + warmCount * 350000;
  const projCommission = pipelineValue * 0.025 * 0.65;
  
  const formatCurrencyCompact = (n: number) => {
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `$${Math.round(n / 1000)}K`;
    return `$${Math.round(n)}`;
  };

  const isEmpty = leads.length === 0;

  return (
    <div className="rounded-lg border-l-[3px] border-l-primary bg-card border border-border p-3 space-y-2">
      <div className="flex items-stretch gap-3">
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <p className="text-lg font-bold text-foreground leading-tight">
            {pipelineValue > 0 ? formatCurrencyCompact(pipelineValue) : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Est. total deal value</p>
        </div>
        <div className="w-px bg-border self-stretch my-0.5" />
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5">
            <p className="text-lg font-bold text-primary leading-tight">{isEmpty ? '0' : (hotCount > 0 ? hotCount : '—')}</p>
            {!isEmpty && hotCount > 3 && <TrendingUp className="h-3.5 w-3.5 text-primary" />}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Needs action now</p>
        </div>
        <div className="w-px bg-border self-stretch my-0.5" />
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <p className="text-lg font-bold text-opportunity leading-tight">
            {hotCount > 0 ? formatCurrencyCompact(projCommission) : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">At 2.5% avg commission</p>
        </div>
      </div>
      {isEmpty && (
        <p className="text-[11px] text-muted-foreground text-center">Sync with FUB to see your pipeline</p>
      )}
    </div>
  );
}

// ── Morning Mode ────────────────────────────────────────────────────

function MorningMode({ intel, priorityLead, ccData, onLeadAction, onOpenLead, onOpenWorkspace, targetMarket, onAddLead, onSeeAll, onTaskTap, refreshData, userId }: {
  intel: ReturnType<typeof useTimeIntelligence>;
  priorityLead: { lead: Lead; score: number } | null;
  ccData: any;
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => void;
  onOpenLead: (lead: Lead) => void;
  onOpenWorkspace: (id: string) => void;
  targetMarket: TargetMarket;
  onAddLead?: () => void;
  onSeeAll?: () => void;
  onTaskTap: () => void;
  refreshData: () => Promise<void> | void;
  userId: string;
}) {
  const { isDemoMode } = useDemo();
  const { hotLeads, riskDeals, overdueTasks, closingSoonDeals, totalPipelineValue, atRiskValue, scoredLeads } = intel;

  // Build the 3 directive moves
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  const moves: { icon: typeof Shield; color: string; verb: string; detail: string; actionLabel?: string; onAction?: () => void; onRowTap?: () => void; taskId?: string }[] = [];

  if (riskDeals.length > 0) {
    const d = riskDeals[0];
    moves.push({
      icon: Shield, color: 'text-urgent',
      verb: `Call ${d.title.split(' ')[0]} about the ${d.riskFlags?.[0] || 'stalled'} risk`,
      detail: `${formatCurrency(d.commission)} at risk — don't let this slip another day`,
      actionLabel: 'Call Now',
      onAction: () => onOpenWorkspace(d.id),
      onRowTap: () => onOpenWorkspace(d.id),
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
      onRowTap: () => onOpenLead(l),
    });
  }
  // Overdue tasks handled by standalone OverdueTasksCard below
  // Fill remaining slots with warm leads
  if (moves.length < 3) {
    for (const { lead, score } of scoredLeads.filter(s => s.score >= 50).slice(0, 3 - moves.length)) {
      moves.push({
        icon: Flame, color: 'text-primary',
        verb: `Reach out to ${lead.name} before they cool off`,
        detail: `Score ${score} · last active ${lead.lastTouchedAt ? new Date(lead.lastTouchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'never'}`,
        actionLabel: 'Contact',
        onAction: () => onLeadAction(lead, 'call'),
        onRowTap: () => onOpenLead(lead),
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Your 3 Moves / Empty State */}
      {scoredLeads.length === 0 ? (
        <EmptyMovesCard />
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold">Priority Leads</h3>
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
                <div
                  key={i}
                  className={cn('flex items-start gap-2.5 rounded-lg -mx-1 px-1 py-1', m.onRowTap && 'cursor-pointer active:bg-muted/50 transition-colors')}
                  onClick={m.onRowTap}
                  role={m.onRowTap ? 'button' : undefined}
                >
                  <span className={cn('mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0', m.color === 'text-urgent' ? 'bg-urgent/15' : m.color === 'text-opportunity' ? 'bg-opportunity/15' : m.color === 'text-warning' ? 'bg-warning/15' : 'bg-primary/15')}>
                    <Icon className={cn('h-3 w-3', m.color)} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{m.verb}</p>
                    <p className="text-xs text-muted-foreground">{m.detail}</p>
                  </div>
                  {m.actionLabel && m.onAction && (
                    <Button size="sm" variant="outline" className="shrink-0 text-xs h-8 rounded-lg" onClick={(e) => { e.stopPropagation(); m.onAction!(); }}>
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
      )}

      {/* Pipeline Value Widget & Activity Streak rendered in top fixed sections */}

      {/* Weekly Performance Digest */}
      <WeeklyPerformanceDigest userId={userId} />

      {/* Priority Lead Action Card — hidden when no leads */}
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

      {isDemoMode && <DealMilestonesPanel />}

      {/* Ghosting Risk Strip */}
      <GhostingRiskStrip leads={intel.scoredLeads.map(s => s.lead)} onLeadAction={onLeadAction} onOpenLead={onOpenLead} />

      {scoredLeads.length > 1 && (
        <PipelineSection
          leads={scoredLeads.slice(1)}
          targetMarket={targetMarket}
          onTap={onOpenLead}
          onLeadAction={onLeadAction}
          label="Next Up"
          onAddLead={onAddLead}
          onSeeAll={onSeeAll}
          userId={userId}
          onRefresh={refreshData as () => void}
          allLeads={scoredLeads.map(s => s.lead)}
        />
      )}
    </div>
  );
}

// ── Midday Mode ─────────────────────────────────────────────────────

function MiddayMode({ intel, ccData, onLeadAction, onOpenLead, targetMarket, totalMoneyAtRisk, onTaskTap }: {
  intel: ReturnType<typeof useTimeIntelligence>;
  ccData: any;
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => void;
  onOpenLead: (lead: Lead) => void;
  targetMarket: TargetMarket;
  totalMoneyAtRisk: number;
  onTaskTap: () => void;
}) {
  const { isDemoMode } = useDemo();
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
  const middayDirectives: { icon: typeof Shield; color: string; verb: string; detail: string; actionLabel?: string; onAction?: () => void; onRowTap?: () => void }[] = [];

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
      onRowTap: () => onOpenLead(lead),
    });
  }
  // Overdue tasks
  if (overdueTasks.length > 0) {
    middayDirectives.push({
      icon: AlertTriangle, color: 'text-warning',
      verb: `Knock out "${overdueTasks[0].title}" — ${overdueTasks.length} overdue`,
      detail: 'Clear this before end of day',
      onRowTap: onTaskTap,
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
                <div
                  key={i}
                  className={cn('flex items-start gap-2.5 rounded-lg -mx-1 px-1 py-1', m.onRowTap && 'cursor-pointer active:bg-muted/50 transition-colors')}
                  onClick={m.onRowTap}
                  role={m.onRowTap ? 'button' : undefined}
                >
                  <span className={cn('mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0', m.color === 'text-urgent' ? 'bg-urgent/15' : m.color === 'text-opportunity' ? 'bg-opportunity/15' : 'bg-warning/15')}>
                    <Icon className={cn('h-3 w-3', m.color)} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{m.verb}</p>
                    <p className="text-xs text-muted-foreground">{m.detail}</p>
                  </div>
                  {m.actionLabel && m.onAction && (
                    <Button size="sm" variant="outline" className="shrink-0 text-xs h-8 rounded-lg" onClick={(e) => { e.stopPropagation(); m.onAction!(); }}>
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

      {isDemoMode && <DealMilestonesPanel />}
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

function EveningMode({ intel, ccData, onLeadAction, onOpenLead, onOpenWorkspace, targetMarket, onTaskTap }: {
  intel: ReturnType<typeof useTimeIntelligence>;
  ccData: any;
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => void;
  onOpenLead: (lead: Lead) => void;
  onOpenWorkspace: (id: string) => void;
  targetMarket: TargetMarket;
  onTaskTap: () => void;
}) {
  const { untouchedRiskDeals, untouchedHotLeads, overdueTasks, completedToday, riskDeals, hotLeads, scoredLeads, leadsAtRisk } = intel;
  const hasOpenItems = untouchedRiskDeals.length > 0 || untouchedHotLeads.length > 0 || overdueTasks.length > 0;

  // Build evening directives — specific actions, not counts
  const eveningActions: { icon: typeof Shield; color: string; verb: string; detail: string; actionLabel?: string; onAction?: () => void; onRowTap?: () => void }[] = [];

  for (const d of untouchedRiskDeals.slice(0, 2)) {
    eveningActions.push({
      icon: Shield, color: 'text-urgent',
      verb: `Send ${d.title.split(' ')[0]} a quick check-in text tonight`,
      detail: `${formatCurrency(d.commission)} at risk — a 30-second text keeps this alive`,
      actionLabel: 'Text',
      onAction: () => onOpenWorkspace(d.id),
      onRowTap: () => onOpenWorkspace(d.id),
    });
  }
  for (const { lead } of untouchedHotLeads.slice(0, 2)) {
    eveningActions.push({
      icon: Flame, color: 'text-opportunity',
      verb: `Drop ${lead.name} a quick note — they're hot and waiting`,
      detail: `${lead.source || 'Direct'} lead · hasn't heard from you today`,
      actionLabel: 'Text',
      onAction: () => onLeadAction(lead, 'text'),
      onRowTap: () => onOpenLead(lead),
    });
  }
  if (overdueTasks.length > 0) {
    eveningActions.push({
      icon: AlertTriangle, color: 'text-warning',
      verb: `Clear "${overdueTasks[0].title}" or reschedule it now`,
      detail: `${overdueTasks.length} overdue — don't carry this into tomorrow`,
      onRowTap: onTaskTap,
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
                <div
                  key={i}
                  className={cn('flex items-start gap-2.5 rounded-lg -mx-1 px-1 py-1', m.onRowTap && 'cursor-pointer active:bg-muted/50 transition-colors')}
                  onClick={m.onRowTap}
                  role={m.onRowTap ? 'button' : undefined}
                >
                  <span className={cn('mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0', m.color === 'text-urgent' ? 'bg-urgent/15' : m.color === 'text-opportunity' ? 'bg-opportunity/15' : 'bg-warning/15')}>
                    <Icon className={cn('h-3 w-3', m.color)} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{m.verb}</p>
                    <p className="text-xs text-muted-foreground">{m.detail}</p>
                  </div>
                  {m.actionLabel && m.onAction && (
                    <Button size="sm" variant="outline" className="shrink-0 text-xs h-8 rounded-lg" onClick={(e) => { e.stopPropagation(); m.onAction!(); }}>
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

// ── Ghosting Risk Strip ──────────────────────────────────────────────

function computeGhostScore(lead: Lead): { score: number; daysSinceTouch: number } {
  const now = Date.now();
  const touchDays = lead.lastTouchedAt
    ? (now - new Date(lead.lastTouchedAt).getTime()) / 86400000
    : lead.lastContactAt
      ? (now - new Date(lead.lastContactAt).getTime()) / 86400000
      : Infinity;
  const contactDays = lead.lastContactAt
    ? (now - new Date(lead.lastContactAt).getTime()) / 86400000
    : Infinity;
  const activityDays = lead.lastActivityAt
    ? (now - new Date(lead.lastActivityAt).getTime()) / 86400000
    : Infinity;

  let score = 0;
  if (contactDays > 10) score += 25;
  else if (contactDays > 5) score += 15;
  if ((lead.leadTemperature === 'hot' || lead.leadTemperature === 'warm') && lead.engagementScore <= 0) score += 15;
  if ((lead.leadTemperature === 'hot' || lead.leadTemperature === 'warm') && activityDays > 7) score += 15;
  if (touchDays > 7) score += 10;

  return { score: Math.min(100, score), daysSinceTouch: Math.round(touchDays) };
}

function GhostingRiskStrip({ leads, onLeadAction, onOpenLead }: {
  leads: Lead[];
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => void;
  onOpenLead: (lead: Lead) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const atRisk = useMemo(() => {
    return leads
      .filter(l => l.leadTemperature === 'hot' || l.leadTemperature === 'warm' || getLeadHeatScore(l) >= 50)
      .map(l => ({ lead: l, ...computeGhostScore(l) }))
      .filter(r => r.score >= 35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [leads]);

  if (atRisk.length === 0) return null;

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 overflow-hidden">
      <button
        className="w-full flex items-center gap-2.5 p-3 min-h-[44px] text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-base leading-none">⚠</span>
        <p className="flex-1 text-sm font-medium">
          {atRisk.length} lead{atRisk.length !== 1 ? 's' : ''} going quiet — tap to see who
        </p>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {atRisk.map(({ lead, daysSinceTouch }) => (
            <div key={lead.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-card border border-border">
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onOpenLead(lead)}
                  className="text-sm font-medium text-primary hover:underline truncate block text-left"
                >
                  {lead.name}
                </button>
                <p className="text-[11px] text-warning">
                  {daysSinceTouch === Infinity ? 'Never contacted' : `${daysSinceTouch}d since last contact`}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onLeadAction(lead, 'call'); }}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors"
              >
                <Phone className="h-3 w-3" /> Call
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared Pipeline Section ─────────────────────────────────────────

function PipelineSection({ leads, targetMarket, onTap, onLeadAction, label, onAddLead, onSeeAll, userId, onRefresh, allLeads }: {
  leads: { lead: Lead; score: number }[];
  targetMarket: TargetMarket;
  onTap: (lead: Lead) => void;
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email') => void;
  label: string;
  onAddLead?: () => void;
  onSeeAll?: () => void;
  userId: string;
  onRefresh: () => void;
  allLeads?: Lead[];
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? leads : leads.slice(0, 5);
  const hasMore = leads.length > 5;

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
        {visible.map(({ lead, score }) => (
          <PipelineCard
            key={lead.id}
            lead={lead}
            score={score}
            outsideTarget={isOutsideTarget(lead, targetMarket)}
            onTap={() => onTap(lead)}
            onAction={(type) => onLeadAction(lead, type)}
            userId={userId}
            onRefresh={onRefresh}
            allLeads={allLeads}
          />
        ))}
      </div>
      {hasMore && (
        <button onClick={() => setExpanded(e => !e)} className="w-full text-xs text-primary hover:underline py-1.5 flex items-center justify-center gap-1">
          {expanded ? 'Show less' : `Show ${leads.length - 5} more`}
          <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
      {onSeeAll && (
        <button onClick={onSeeAll} className="w-full text-xs text-primary hover:underline py-1 flex items-center justify-center gap-1">
          See all <ArrowRight className="h-3 w-3" />
        </button>
      )}
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

  if (mode === 'midday') {
    const eightHoursAgo = new Date(now.getTime() - 8 * 60 * 60 * 1000);
    const quietLeads = leads.filter(l => {
      if (l.snoozeUntil && new Date(l.snoozeUntil) > now) return false;
      if (!l.lastTouchedAt) return true;
      return new Date(l.lastTouchedAt) < eightHoursAgo;
    });
    const staleTop = [...quietLeads].sort((a, b) => getLeadHeatScore(b) - getLeadHeatScore(a))[0] || null;

    return (
      <div className="rounded-xl border-l-[3px] border-l-warning border border-border bg-card p-4 space-y-3">
        {staleTop ? (
          <>
            <h2 className="text-sm font-bold"><button onClick={() => onOpenLead(staleTop)} className="text-primary hover:underline cursor-pointer">{staleTop.name}</button> hasn't heard from you</h2>
            <p className="text-xs text-muted-foreground">
              Score {getLeadHeatScore(staleTop)} · Don't let that window close
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
    const hottest = [...activeLeads].sort((a, b) => getLeadHeatScore(b) - getLeadHeatScore(a))[0];
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

// ── Overdue Tasks Card ──────────────────────────────────────────────

const TASK_TYPE_ICONS: Record<string, typeof Phone> = {
  call: Phone, text: MessageSquare, email: Mail, follow_up: Clock,
  showing: Home, closing: CheckCircle2,
};

function OverdueTasksCard({ tasks: overdueTasks, refreshData }: { tasks: Task[]; refreshData: () => Promise<void> | void }) {
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);

  const handleMarkDone = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setCompleting(taskId);
    try {
      const { error } = await supabase.from('tasks').update({
        completed_at: new Date().toISOString(),
      } as any).eq('id', taskId);
      if (error) throw error;
      await refreshData();
      toast.success('Task completed');
    } catch {
      toast.error('Could not complete task');
    } finally {
      setCompleting(null);
    }
  };

  const count = overdueTasks.length;

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 overflow-hidden">
      <button
        className="w-full flex items-center gap-2.5 p-3.5 min-h-[44px] text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="h-5 w-5 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-3 w-3 text-warning" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {count} overdue {count === 1 ? 'action needs' : 'actions need'} attention
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-2">
          {overdueTasks.map(task => {
            const Icon = TASK_TYPE_ICONS[task.type] || Target;
            const daysOverdue = Math.ceil((Date.now() - new Date(task.dueAt).getTime()) / 86400000);
            const isCompleting = completing === task.id;

            let actionButton: React.ReactNode = null;
            if (task.type === 'call') {
              actionButton = (
                <a href="tel:" className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors">
                  <Phone className="h-3 w-3" /> Call
                </a>
              );
            } else if (task.type === 'text') {
              actionButton = (
                <a href="sms:" className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors">
                  <MessageSquare className="h-3 w-3" /> Text
                </a>
              );
            } else if (task.type === 'email') {
              actionButton = (
                <a href="mailto:" className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors">
                  <Mail className="h-3 w-3" /> Email
                </a>
              );
            } else {
              actionButton = (
              <button
                  onClick={(e) => handleMarkDone(e, task.id)}
                  disabled={isCompleting}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3 w-3" /> {isCompleting ? '...' : 'Done'}
                </button>
              );
            }

            return (
              <div key={task.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-card border border-border">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <p className="text-[11px] text-warning">{daysOverdue}d overdue</p>
                </div>
                {actionButton}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Inline Morning Brief (direct Anthropic) ─────────────────────────

function getMorningBriefKey(): string {
  const d = new Date();
  return `dealPilot_morningBrief_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function InlineMorningBrief({ leads, agentName }: { leads: Lead[]; agentName: string }) {
  const cached = useMemo(() => {
    try {
      const raw = localStorage.getItem(getMorningBriefKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.date === new Date().toDateString()) return parsed.text as string;
      return null;
    } catch { return null; }
  }, []);

  const [brief, setBrief] = useState<string | null>(cached);
  const [loading, setLoading] = useState(!cached);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const top = [...leads]
        .map(l => ({ l, s: getLeadHeatScore(l) }))
        .sort((a, b) => b.s - a.s)[0];
      const daysSince = top?.l.lastTouchedAt
        ? Math.floor((Date.now() - new Date(top.l.lastTouchedAt).getTime()) / 86400000)
        : top?.l.lastContactAt
          ? Math.floor((Date.now() - new Date(top.l.lastContactAt).getTime()) / 86400000)
          : null;
      const neverContacted = leads.filter(l => !l.lastTouchedAt && !l.lastContactAt).length;
      const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });

      const userMsg = `Today is ${weekday}. Pipeline has ${leads.length} leads. ${top ? `Top lead: ${top.l.name}, score ${top.s}, ${daysSince !== null ? daysSince + ' days since contact' : 'never contacted'}.` : ''} ${neverContacted} leads have never been contacted. Give the agent their #1 focus and first action for today.`;

      const resp = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: 'You are a real estate coach. Give a sharp daily briefing in 3 sentences max.',
          messages: [{ role: 'user', content: userMsg }],
        }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const result = await resp.json();
      const text = result?.content?.[0]?.text || 'Unable to generate brief.';
      setBrief(text);
      localStorage.setItem(getMorningBriefKey(), JSON.stringify({ text, date: new Date().toDateString() }));
    } catch (e) {
      console.error('Morning brief error:', e);
      setBrief('Focus on your highest-scoring lead first, follow up on pending appointments, and block 30 minutes for outreach before lunch.');
    } finally {
      setLoading(false);
    }
  }, [leads, agentName]);

  // Auto-generate on mount if no cache
  useEffect(() => {
    if (!cached) generate();
  }, []);

  return (
    <div className="rounded-xl p-[2px] bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(250,60%,50%)] to-[hsl(var(--primary))]">
      <div className="rounded-[10px] bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold flex items-center gap-1.5">☀️ Morning Brief</span>
          <Button
            size="sm"
            variant="ghost"
            className="text-[12px] h-7 gap-1 text-warning hover:text-warning"
            onClick={generate}
            disabled={loading}
          >
            {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loading ? '' : 'Generate'}
          </Button>
        </div>
        {loading && !brief ? (
          <div className="flex items-center gap-2 py-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
            <span className="text-sm text-muted-foreground">Generating your brief…</span>
          </div>
        ) : brief ? (
          <p className="text-sm text-foreground leading-relaxed">{brief}</p>
        ) : null}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function BetaHomeScreen() {
  const { user } = useAuth();
  const { leads: realLeads, deals, tasks, alerts, dealParticipants, hasData, loading, refreshData } = useData();
  const { isDemoMode, demoLeads } = useDemo();
  const leads = isDemoMode ? demoLeads : realLeads;
  const { openWorkspace } = useWorkspace();
  const navigate = useNavigate();
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
  const [loggedIds, setLoggedIds] = useState<Record<string, boolean>>({});

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
    const phone = lead.phonePrimary || lead.phoneMobile || ((lead.notes || '').match(/Phone:\s*([^\n,]+)/i)?.[1]?.trim()) || undefined;
    const email = lead.emailPrimary || lead.emailSecondary || ((lead.notes || '').match(/Email:\s*([^\n,]+)/i)?.[1]?.trim()) || undefined;
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
      // Write to localStorage immediately so ActivityStreakStrip updates even when Supabase is paused
      try {
        const log = JSON.parse(localStorage.getItem('dealPilot_activityLog') || '[]');
        log.push({ leadId: lead.id, leadName: lead.name, type, timestamp: Date.now(), date: new Date().toISOString() });
        localStorage.setItem('dealPilot_activityLog', JSON.stringify(log));
        // Update streak
        const today = new Date().toISOString().split('T')[0];
        const lastActive = localStorage.getItem('dealPilot_lastActive');
        if (lastActive !== today) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          const streak = lastActive === yesterday
            ? parseInt(localStorage.getItem('dealPilot_streak') || '0', 10) + 1
            : 1;
          localStorage.setItem('dealPilot_streak', String(streak));
          localStorage.setItem('dealPilot_lastActive', today);
        }
      } catch { /* ignore */ }
      // Also update Supabase if available
      supabase.from('leads').update({ last_touched_at: new Date().toISOString() } as any).eq('id', lead.id)
        .then(() => refreshData()).catch(() => refreshData());
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
    // Go straight to the full workspace — one tap, no intermediate sheet
    setExecutionEntity({ entity: lead, entityType: 'lead' });
  }, []);

  // Long-press / explicit quick-action sheet for when user wants just Call/Text/Email
  const handleQuickActionSheet = useCallback((lead: Lead) => {
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

      {/* ═══ TOP 3 FIXED SECTIONS ═══ */}

      {/* 1. Your 3 Moves Today */}
      {(() => {
        const top3 = [...leads]
          .map(l => ({ lead: l, score: getLeadHeatScore(l) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        const getVerb = (lead: Lead, score: number): { verb: string; color: string } => {
          const daysSince = (lead.lastTouchedAt || lead.lastContactAt)
            ? Math.floor((Date.now() - new Date((lead.lastTouchedAt || lead.lastContactAt)!).getTime()) / 86400000)
            : null;
          if (daysSince === null) return { verb: 'Make first contact', color: 'text-warning' };
          if (daysSince === 0) return { verb: 'Follow up today', color: 'text-opportunity' };
          if (score >= 80 && daysSince <= 2) return { verb: 'Keep momentum', color: 'text-opportunity' };
          if (score >= 75) return { verb: 'Call — hot lead', color: 'text-opportunity' };
          if (daysSince > 7) return { verb: `Re-engage — ${daysSince}d silent`, color: 'text-urgent' };
          if (daysSince > 3) return { verb: `Check in — ${daysSince}d ago`, color: 'text-warning' };
          return { verb: 'Nurture — stay warm', color: 'text-muted-foreground' };
        };

        const handleLogTouch = (lead: Lead) => {
          try {
            const existing = JSON.parse(localStorage.getItem('dealPilot_activityLog') || '[]');
            existing.push({ leadId: lead.id, leadName: lead.name, type: 'logged', timestamp: Date.now(), date: new Date().toISOString() });
            localStorage.setItem('dealPilot_activityLog', JSON.stringify(existing));
          } catch {}
          setLoggedIds(prev => ({ ...prev, [lead.id]: true }));
          setTimeout(() => setLoggedIds(prev => { const next = { ...prev }; delete next[lead.id]; return next; }), 1500);
        };

        return (
          <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
            <h3 className="text-sm font-bold text-foreground">🎯 Your 3 Moves Today</h3>
            {top3.length === 0 && <p className="text-xs text-muted-foreground">No leads yet — sync your CRM to get started.</p>}
            {top3.map(({ lead, score }) => {
              const { verb, color } = getVerb(lead, score);
              return (
                <div key={lead.id} className="flex items-start gap-3">
                  {/* Tap name → full workspace */}
                  <button
                    onClick={() => handleOpenLeadDetail(lead)}
                    className="flex-1 min-w-0 text-left space-y-0.5 active:opacity-70"
                  >
                    <p className="text-sm font-semibold text-foreground truncate">{lead.name}</p>
                    <p className={cn('text-[11px] font-medium', color)}>{verb}</p>
                  </button>
                  {/* Quick action buttons */}
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <button
                      className="h-8 w-8 rounded-lg bg-opportunity/15 flex items-center justify-center hover:bg-opportunity/25 transition-colors"
                      onClick={() => handleLeadAction(lead, 'call')}
                      title="Call"
                    ><Phone className="h-3.5 w-3.5 text-opportunity" /></button>
                    <button
                      className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center hover:bg-primary/25 transition-colors"
                      onClick={() => handleLeadAction(lead, 'text')}
                      title="Text"
                    ><MessageSquare className="h-3.5 w-3.5 text-primary" /></button>
                    <button
                      className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
                        loggedIds[lead.id] ? "bg-opportunity/20" : "bg-muted/60 hover:bg-muted")}
                      onClick={() => handleLogTouch(lead)}
                      title="Mark done"
                    >
                      {loggedIds[lead.id]
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-opportunity" />
                        : <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* 2. Pipeline Value Widget */}
      {(() => {
        const leadValues = leads.map(l => (l as any).price || (l as any).listingPrice || (l as any).dealValue || 0);
        const sumFromFields = leadValues.reduce((s: number, v: number) => s + v, 0);
        const totalValue = sumFromFields > 0 ? sumFromFields : leads.length * 350000;
        const hotCount = leads.filter(l => getLeadHeatScore(l) >= 80).length;
        const commission = totalValue * 0.025;
        const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${Math.round(n)}`;
        return (
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Pipeline</p>
              <p className="text-sm font-bold text-foreground">{fmt(totalValue)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Hot Leads</p>
              <p className="text-sm font-bold text-foreground">{hotCount}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Est. Commission</p>
              <p className="text-sm font-bold text-foreground">{fmt(commission)}</p>
            </div>
          </div>
        );
      })()}

      {/* 3. Activity Streak Strip */}
      {(() => {
        let calls = 0, texts = 0, streak = 0, goalProgress = 0;
        try {
          const log = JSON.parse(localStorage.getItem('dealPilot_activityLog') || '[]') as Array<{ type?: string; date?: string }>;
          const todayStr = new Date().toDateString();
          const todayEntries = log.filter(e => e.date && new Date(e.date).toDateString() === todayStr);
          calls = todayEntries.filter(e => e.type === 'call').length;
          texts = todayEntries.filter(e => e.type === 'text' || e.type === 'sms').length;
        } catch {}
        try { streak = parseInt(localStorage.getItem('dealPilot_streak') || '0', 10); } catch {}
        try {
          const log = JSON.parse(localStorage.getItem('dealPilot_activityLog') || '[]');
          const now = new Date();
          const day = now.getDay();
          const mondayOffset = day === 0 ? 6 : day - 1;
          const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
          goalProgress = (log as Array<{ date?: string }>).filter((e: any) => e.date && new Date(e.date) >= weekStart).length;
        } catch {}
        return (
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">📞 <span className="font-semibold text-foreground">{calls}</span></span>
            <span className="flex items-center gap-1">💬 <span className="font-semibold text-foreground">{texts}</span></span>
            <span className="flex items-center gap-1">🔥 <span className="font-semibold text-foreground">{streak}d</span></span>
            <span className="flex items-center gap-1">⭐ <span className="font-semibold text-foreground">{goalProgress}/20</span></span>
          </div>
        );
      })()}

      {/* Ghosting Risk Alert — leads not contacted in 7+ days */}
      {(() => {
        const now = Date.now();
        const ghosted = leads.filter(l => {
          const last = l.lastTouchedAt || l.lastContactAt;
          if (!last) return true; // never contacted
          const daysSince = Math.floor((now - new Date(last).getTime()) / 86400000);
          return daysSince >= 7;
        });
        if (ghosted.length === 0) return null;
        const top = ghosted.slice(0, 3);
        return (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-destructive text-sm">👻</span>
              <span className="text-xs font-semibold text-destructive">
                {ghosted.length} lead{ghosted.length !== 1 ? 's' : ''} going cold — no contact in 7+ days
              </span>
            </div>
            <div className="space-y-1">
              {top.map(l => {
                const last = l.lastTouchedAt || l.lastContactAt;
                const days = last ? Math.floor((now - new Date(last).getTime()) / 86400000) : null;
                return (
                  <button
                    key={l.id}
                    onClick={() => handleOpenLeadDetail(l)}
                    className="flex items-center justify-between text-[11px] w-full hover:bg-destructive/10 rounded px-1 -mx-1 py-0.5 transition-colors"
                  >
                    <span className="text-foreground font-medium text-left">{l.name}</span>
                    <span className="text-muted-foreground">{days !== null ? `${days}d ago` : 'never contacted'} →</span>
                  </button>
                );
              })}
              {ghosted.length > 3 && (
                <p className="text-[10px] text-muted-foreground">+{ghosted.length - 3} more</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Directive Brief Card — only when leads exist */}
      {leads.length > 0 && (
        <DirectiveBriefCard mode={currentMode} leads={leads} ccData={ccData} onLeadAction={handleLeadAction} onOpenLead={handleOpenLeadDetail} />
      )}

      {/* AI Morning Brief — inline, direct Anthropic call */}
      {currentMode === 'morning' && <InlineMorningBrief leads={leads} agentName={user?.name?.split(' ')[0] || 'Agent'} />}

      {/* Empty state when no leads */}
      {leads.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-3 text-center">
          <Target className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="text-base font-semibold">Welcome, {user?.name?.split(' ')[0] || 'Agent'} 👋</h3>
          <p className="text-sm text-muted-foreground">Your pipeline is empty. Tap Sync to import your leads from Follow Up Boss.</p>
          <Button className="gap-2 h-11" onClick={() => openWorkspace('sync')}>
            <RefreshCw className="h-4 w-4" /> Sync with FUB
          </Button>
        </div>
      )}

      {/* Income Progress Bar */}
      {(() => {
        const annualTarget = (ccData?.strategicSettings as any)?.annualIncomeTarget || 0;
        if (!annualTarget) return null;
        const projected = deals.reduce((sum, d) => sum + (d.commission || 0) * ((d.closeProbability ?? 50) / 100), 0);
        const pct = Math.min(Math.round((projected / annualTarget) * 100), 100);
        const projK = projected >= 1000 ? `$${Math.round(projected / 1000)}K` : `$${Math.round(projected)}`;
        const targetK = annualTarget >= 1000 ? `$${Math.round(annualTarget / 1000)}K` : `$${Math.round(annualTarget)}`;
        const gap = annualTarget - projected;
        const avgDealComm = deals.length > 0 ? deals.reduce((s, d) => s + (d.commission || 0), 0) / deals.length : 10000;
        const dealsNeeded = gap > 0 ? Math.ceil(gap / avgDealComm) : 0;
        const gapK = gap >= 1000 ? `$${Math.round(gap / 1000)}K` : `$${Math.round(gap)}`;
        return (
          <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">{projK} of {targetK} goal · <span className={pct >= 80 ? 'text-opportunity' : pct >= 50 ? 'text-foreground' : 'text-warning'}>{pct}% on track</span></p>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {gap > 0 && (
              <p className="text-[11px] text-warning">{gapK} gap — {dealsNeeded} more deal{dealsNeeded !== 1 ? 's' : ''} needed</p>
            )}
          </div>
        );
      })()}

      {/* Showings Today */}
      <ShowingTodayCard userId={user?.id || ''} leads={leads} refreshData={refreshData} />

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
          onSeeAll={() => navigate('/work')}
          onTaskTap={() => navigate('/work')}
          refreshData={refreshData}
          userId={user?.id || ''}
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
          onTaskTap={() => navigate('/work')}
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
          onTaskTap={() => navigate('/work')}
        />
      )}
      {currentMode === 'night' && (
        <NightMode intel={intel} />
      )}

      {/* Overdue Tasks Card */}
      {intel.overdueTasks.length > 0 && (
        <OverdueTasksCard tasks={intel.overdueTasks} refreshData={refreshData} />
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
        const phone = lead.phonePrimary || lead.phoneMobile || ((lead.notes || '').match(/Phone:\s*([^\n,]+)/i)?.[1]?.trim()) || undefined;
        const email = lead.emailPrimary || lead.emailSecondary || ((lead.notes || '').match(/Email:\s*([^\n,]+)/i)?.[1]?.trim()) || undefined;
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

      {/* Quick Add Lead Bottom Sheet */}
      {showQuickAddLead && (
        <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={() => setShowQuickAddLead(false)}>
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-border bg-card p-5 space-y-4 animate-slide-up max-w-lg mx-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="text-base font-bold">Quick Add Lead</h3>
              <button onClick={() => setShowQuickAddLead(false)} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 hover:bg-accent transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <input value={qaName} onChange={e => setQaName(e.target.value.slice(0, 100))} placeholder="Contact name" autoFocus maxLength={100} className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <input type="tel" value={qaPhone} onChange={e => setQaPhone(e.target.value)} placeholder="(555) 123-4567" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Source</label>
                  <select value={qaSource} onChange={e => setQaSource(e.target.value)} className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="Zillow">Zillow</option>
                    <option value="Realtor.com">Realtor.com</option>
                    <option value="Sphere">Sphere</option>
                    <option value="Open House">Open House</option>
                    <option value="Referral">Referral</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Temperature</label>
                  <select value={qaTemp} onChange={e => setQaTemp(e.target.value as 'hot' | 'warm' | 'cool')} className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="hot">🔥 Hot</option>
                    <option value="warm">☀️ Warm</option>
                    <option value="cool">❄️ Cool</option>
                  </select>
                </div>
              </div>
            </div>
            <Button className="w-full h-11" onClick={handleQuickAddSave} disabled={qaSaving || !qaName.trim()}>
              {qaSaving ? 'Saving...' : 'Save Lead'}
            </Button>
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
