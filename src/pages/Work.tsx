import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useData } from '@/contexts/DataContext';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ActionComposerDrawer } from '@/components/ActionComposerDrawer';
import { Flame, Search } from 'lucide-react';
import Pipeline from '@/pages/Pipeline';
import Tasks from '@/pages/Tasks';
import type { Lead } from '@/types';

const TABS = ['Leads', 'Pipeline', 'Tasks'] as const;
const HEAT_FILTERS = ['All', 'Hot', 'Warm', 'Cool'] as const;

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

function getClientVerdict(lead: Lead, score: number): { text: string; color: string } {
  const daysSinceContact = lead.lastTouchedAt
    ? Math.floor((Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000)
    : null;
  const hasIntentTags = lead.statusTags?.some(t =>
    ['pre-approved', 'pre_approved', 'showing', 'appointment set', 'cash_buyer'].includes(t.toLowerCase())
  );
  const notes = (lead.notes || '').toLowerCase();
  const hasNegativeSignal = /cancel|ghost|unresponsive|no.?show|not interested/i.test(notes);

  if (hasNegativeSignal) return { text: 'Disengaging — re-qualify before investing more time', color: 'text-urgent' };
  if (score >= 80 && hasIntentTags) return { text: 'Serious buyer — high intent signals detected', color: 'text-opportunity' };
  if (score >= 80) return { text: 'Highly engaged — keep momentum going', color: 'text-opportunity' };
  if (score >= 60 && hasIntentTags) return { text: 'Engaged with intent — push toward showing', color: 'text-primary' };
  if (score >= 60) return { text: 'Warming up — needs one more quality touch', color: 'text-primary' };
  if (daysSinceContact === null) return { text: 'Never contacted — make first touch today', color: 'text-warning' };
  if (daysSinceContact > 14) return { text: `No contact in ${daysSinceContact}d — likely browsing`, color: 'text-muted-foreground' };
  if (score >= 40) return { text: 'Early stage — qualify budget and timeline', color: 'text-muted-foreground' };
  return { text: 'Cold — low activity, low engagement', color: 'text-muted-foreground' };
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

function LeadsTab() {
  const { leads } = useData();
  const [search, setSearch] = useState('');
  const [heatFilter, setHeatFilter] = useState<typeof HEAT_FILTERS[number]>('All');
  const [executionEntity, setExecutionEntity] = useState<{ entity: Lead; entityType: 'lead' } | null>(null);

  const scored = useMemo(() =>
    leads.map(l => ({ lead: l, score: getLeadHeatScore(l) })).sort((a, b) => b.score - a.score),
    [leads]
  );

  const filtered = useMemo(() => {
    let list = scored;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(({ lead }) => lead.name.toLowerCase().includes(q));
    }
    if (heatFilter === 'Hot') list = list.filter(({ score }) => score >= 75);
    else if (heatFilter === 'Warm') list = list.filter(({ score }) => score >= 50 && score < 75);
    else if (heatFilter === 'Cool') list = list.filter(({ score }) => score < 50);
    return list;
  }, [scored, search, heatFilter]);

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search leads…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Heat filter chips */}
      <div className="flex gap-1.5">
        {HEAT_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setHeatFilter(f)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              heatFilter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</p>

      {/* Lead rows */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No leads match your filters.</p>
      ) : (
        <div className="space-y-1">
          {filtered.map(({ lead, score }) => {
            const daysSince = lead.lastTouchedAt
              ? Math.floor((Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000)
              : null;
            const verdict = getClientVerdict(lead, score);
            return (
              <button
                key={lead.id}
                onClick={() => setExecutionEntity({ entity: lead, entityType: 'lead' })}
                className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate text-primary cursor-pointer underline-offset-2 hover:underline">{lead.name}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{lead.source || 'Direct'}</Badge>
                    <HeatBadge score={score} />
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {daysSince !== null ? `${daysSince}d since last touch` : 'Never contacted'}
                    </span>
                  </div>
                  <p className={cn('text-xs', verdict.color)}>{verdict.text}</p>
                </div>
              </button>
            );
          })}
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

export default function Work() {
  const [tab, setTab] = useState<typeof TABS[number]>('Leads');

  return (
    <div className="animate-fade-in">
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1 max-w-sm">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 text-sm font-medium py-1.5 rounded-md transition-colors',
              tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Leads' && <LeadsTab />}
      {tab === 'Pipeline' && <Pipeline />}
      {tab === 'Tasks' && <Tasks />}
    </div>
  );
}
