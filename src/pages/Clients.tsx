import { useState, useMemo } from 'react';
import { Search, Phone, MessageSquare, Mail, ChevronRight, Users, Flame, Clock, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useData } from '@/contexts/DataContext';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LeadScorePopover } from '@/components/LeadScorePopover';
import { ActionComposerDrawer } from '@/components/ActionComposerDrawer';
import type { Lead } from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────

function getLastContactDate(lead: Lead): Date | null {
  const dbDate = lead.lastTouchedAt || lead.lastContactAt;
  let best = dbDate ? new Date(dbDate) : null;
  try {
    const log = JSON.parse(localStorage.getItem('dealPilot_activityLog') || '[]') as Array<{ leadId?: string; leadName?: string; timestamp?: number }>;
    const entries = log.filter(e => e.leadId === lead.id || e.leadName === lead.name);
    if (entries.length > 0) {
      const latest = entries.reduce((a, b) => (a.timestamp || 0) > (b.timestamp || 0) ? a : b);
      const localDate = new Date(latest.timestamp || 0);
      if (!best || localDate > best) best = localDate;
    }
  } catch { /* ignore */ }
  return best;
}

function getLeadHeatScore(lead: Lead): number {
  let score = lead.engagementScore || 0;
  if (lead.leadTemperature === 'hot') score = Math.max(score, 75);
  else if (lead.leadTemperature === 'warm') score = Math.max(score, 50);
  const src = (lead.source || '').toLowerCase();
  if (src.includes('zillow preferred')) score = Math.max(score, 35);
  else if (src.includes('zillow')) score = Math.max(score, 25);
  else if (src.includes('referral') || src.includes('sphere')) score = Math.max(score, 30);
  else if (src.includes('realtor') || src.includes('redfin')) score = Math.max(score, 22);
  else if (lead.source) score = Math.max(score, 18);
  const lastContact = getLastContactDate(lead);
  if (lastContact) {
    const daysSince = (Date.now() - lastContact.getTime()) / 86400000;
    if (daysSince < 1) score += 20;
    else if (daysSince < 3) score += 12;
    else if (daysSince < 7) score += 6;
    else if (daysSince < 14) score += 2;
  }
  if (lead.statusTags?.some(t => ['pre-approved', 'pre_approved', 'showing', 'appointment set', 'cash_buyer'].includes(t.toLowerCase()))) score += 20;
  return Math.min(score, 100);
}

function formatLastContact(lead: Lead): { label: string; urgent: boolean; warn: boolean } {
  const d = getLastContactDate(lead);
  if (!d) return { label: 'Never', urgent: true, warn: false };
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return { label: 'Today', urgent: false, warn: false };
  if (days === 1) return { label: 'Yesterday', urgent: false, warn: false };
  return {
    label: `${days}d ago`,
    urgent: days > 14,
    warn: days > 7,
  };
}

function scoreBadgeStyle(score: number): string {
  if (score >= 75) return 'bg-urgent/15 text-urgent border-urgent/30';
  if (score >= 50) return 'bg-warning/15 text-warning border-warning/30';
  if (score >= 30) return 'bg-primary/10 text-primary border-primary/20';
  return 'bg-muted text-muted-foreground border-border';
}

type SortKey = 'score' | 'name' | 'lastContact';
type TempFilter = 'all' | 'hot' | 'warm' | 'cool';

// ── Row component ────────────────────────────────────────────────────

function ClientRow({
  lead,
  score,
  onOpen,
  onQuickAction,
}: {
  lead: Lead;
  score: number;
  onOpen: (lead: Lead) => void;
  onQuickAction: (lead: Lead, type: 'call' | 'text' | 'email', e: React.MouseEvent) => void;
}) {
  const contact = formatLastContact(lead);
  const initials = lead.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 active:bg-muted/60 transition-colors border-b border-border/50 cursor-pointer"
      onClick={() => onOpen(lead)}
    >
      {/* Avatar */}
      <div className={cn(
        'h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
        score >= 75 ? 'bg-urgent/20 text-urgent' :
        score >= 50 ? 'bg-warning/20 text-warning' :
        'bg-muted text-muted-foreground'
      )}>
        {initials}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{lead.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {lead.source && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[90px]">{lead.source}</span>
          )}
          <span className={cn(
            'text-[10px] flex items-center gap-0.5',
            contact.urgent ? 'text-urgent' : contact.warn ? 'text-warning' : 'text-muted-foreground'
          )}>
            <Clock className="h-2.5 w-2.5 shrink-0" />
            {contact.label}
          </span>
        </div>
      </div>

      {/* Score badge — tappable */}
      <div onClick={e => e.stopPropagation()}>
        <LeadScorePopover lead={lead} score={score}>
          <span className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums',
            scoreBadgeStyle(score)
          )}>
            {score}
          </span>
        </LeadScorePopover>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        {lead.phonePrimary && (
          <button
            className="h-7 w-7 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            onClick={e => onQuickAction(lead, 'call', e)}
          >
            <Phone className="h-3 w-3" />
          </button>
        )}
        {(lead.phonePrimary || lead.phoneMobile) && (
          <button
            className="h-7 w-7 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            onClick={e => onQuickAction(lead, 'text', e)}
          >
            <MessageSquare className="h-3 w-3" />
          </button>
        )}
        {lead.emailPrimary && (
          <button
            className="h-7 w-7 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            onClick={e => onQuickAction(lead, 'email', e)}
          >
            <Mail className="h-3 w-3" />
          </button>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 ml-0.5" />
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function Clients() {
  const { leads } = useData();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('score');
  const [tempFilter, setTempFilter] = useState<TempFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const scored = useMemo(
    () => leads.map(l => ({ lead: l, score: getLeadHeatScore(l) })),
    [leads]
  );

  const filtered = useMemo(() => {
    let list = scored;

    // Temp filter
    if (tempFilter !== 'all') {
      list = list.filter(({ lead }) => {
        if (tempFilter === 'hot') return lead.leadTemperature === 'hot';
        if (tempFilter === 'warm') return lead.leadTemperature === 'warm';
        if (tempFilter === 'cool') return !lead.leadTemperature || lead.leadTemperature === 'cold';
        return true;
      });
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(({ lead }) =>
        lead.name.toLowerCase().includes(q) ||
        (lead.source || '').toLowerCase().includes(q) ||
        (lead.emailPrimary || '').toLowerCase().includes(q)
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      if (sort === 'score') return b.score - a.score;
      if (sort === 'name') return a.lead.name.localeCompare(b.lead.name);
      if (sort === 'lastContact') {
        const da = getLastContactDate(a.lead)?.getTime() ?? 0;
        const db = getLastContactDate(b.lead)?.getTime() ?? 0;
        return db - da;
      }
      return 0;
    });

    return list;
  }, [scored, search, sort, tempFilter]);

  function openLead(lead: Lead) {
    setSelectedLead(lead);
    setDrawerOpen(true);
  }

  function handleQuickAction(lead: Lead, type: 'call' | 'text' | 'email', e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const log = JSON.parse(localStorage.getItem('dealPilot_activityLog') || '[]');
      log.push({ leadId: lead.id, leadName: lead.name, type, timestamp: Date.now(), date: new Date().toISOString() });
      localStorage.setItem('dealPilot_activityLog', JSON.stringify(log));
    } catch { /* ignore */ }
    // Open drawer on the relevant tab
    setSelectedLead(lead);
    setDrawerOpen(true);
  }

  const hotCount = scored.filter(({ lead }) => lead.leadTemperature === 'hot').length;
  const warmCount = scored.filter(({ lead }) => lead.leadTemperature === 'warm').length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header stats strip */}
      <div className="px-4 pt-3 pb-2 border-b border-border/50 bg-card/40">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold">{leads.length}</span>
            <span className="text-muted-foreground">total</span>
          </div>
          {hotCount > 0 && (
            <div className="flex items-center gap-1">
              <Flame className="h-3 w-3 text-urgent" />
              <span className="font-semibold text-urgent">{hotCount}</span>
              <span className="text-muted-foreground">hot</span>
            </div>
          )}
          {warmCount > 0 && (
            <div className="flex items-center gap-1">
              <Flame className="h-3 w-3 text-warning" />
              <span className="font-semibold text-warning">{warmCount}</span>
              <span className="text-muted-foreground">warm</span>
            </div>
          )}
          <span className="ml-auto text-muted-foreground">{filtered.length} shown</span>
        </div>
      </div>

      {/* Search + filter toggle */}
      <div className="px-4 py-2.5 flex gap-2 border-b border-border/50">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-9 px-3 gap-1.5', showFilters && 'bg-primary/10 border-primary/30 text-primary')}
          onClick={() => setShowFilters(f => !f)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Filter/sort panel */}
      {showFilters && (
        <div className="px-4 py-3 bg-muted/30 border-b border-border/50 space-y-3">
          {/* Temperature filter */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Temperature</p>
            <div className="flex gap-1.5">
              {(['all', 'hot', 'warm', 'cool'] as TempFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setTempFilter(f)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize',
                    tempFilter === f
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          {/* Sort */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Sort by</p>
            <div className="flex gap-1.5">
              {([['score', 'Heat Score'], ['lastContact', 'Last Contact'], ['name', 'Name']] as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    sort === key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
            <Users className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {search ? 'No clients match your search' : 'No clients yet — sync with Follow Up Boss to get started'}
            </p>
          </div>
        ) : (
          filtered.map(({ lead, score }) => (
            <ClientRow
              key={lead.id}
              lead={lead}
              score={score}
              onOpen={openLead}
              onQuickAction={handleQuickAction}
            />
          ))
        )}
      </div>

      {/* Action drawer */}
      <ActionComposerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entity={selectedLead}
        entityType="lead"
      />
    </div>
  );
}
