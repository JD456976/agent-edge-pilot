import { useState, useEffect, useCallback } from 'react';
import { Zap, Phone, MessageSquare, Mail, ChevronRight, RefreshCw, Flame, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Lead } from '@/types';

interface Top3Lead {
  leadId: string;
  name: string;
  priority: string;   // "1", "2", "3"
  why: string;        // One sentence: why this person, right now
  opener: string;     // Pre-written first line to say/send
  action: 'call' | 'text' | 'email';
}

interface Props {
  leads: Lead[];
  onLeadAction: (lead: Lead, type: 'call' | 'text' | 'email' | 'snooze') => void;
  onOpenLead: (lead: Lead) => void;
}

const ACTION_ICONS = {
  call: Phone,
  text: MessageSquare,
  email: Mail,
};

const ACTION_LABELS = {
  call: 'Call',
  text: 'Text',
  email: 'Email',
};

function getTop3CacheKey(): string {
  return `dp-top3-${new Date().toDateString()}`;
}

function buildLeadSummary(lead: Lead): string {
  const tags = (lead.statusTags || []).join(', ');
  const daysAgo = lead.lastTouchedAt
    ? Math.floor((Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000)
    : null;
  const contact = daysAgo !== null ? `last contacted ${daysAgo}d ago` : 'never contacted';
  const temp = lead.leadTemperature || 'unknown';
  const source = lead.source || '';
  return `${lead.name} | temp: ${temp} | ${contact} | source: ${source}${tags ? ' | tags: ' + tags : ''}`;
}

export function AiTop3Panel({ leads, onLeadAction, onOpenLead }: Props) {
  const [picks, setPicks] = useState<Top3Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (force = false) => {
    if (leads.length === 0) return;

    const cacheKey = getTop3CacheKey();
    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPicks(parsed);
            return;
          }
        }
      } catch {
        // ignore bad cache
      }
    }

    setLoading(true);
    setError(false);
    try {
      // Score and sort leads, take top 10 to feed AI
      const sorted = [...leads]
        .filter(l => !l.snoozeUntil || new Date(l.snoozeUntil) < new Date())
        .sort((a, b) => {
          const tempScore = (t: string | undefined) =>
            t === 'hot' ? 3 : t === 'warm' ? 2 : t === 'cool' ? 1 : 0;
          const daysA = a.lastTouchedAt
            ? (Date.now() - new Date(a.lastTouchedAt).getTime()) / 86400000 : 999;
          const daysB = b.lastTouchedAt
            ? (Date.now() - new Date(b.lastTouchedAt).getTime()) / 86400000 : 999;
          return (tempScore(b.leadTemperature) * 10 - daysB) -
                 (tempScore(a.leadTemperature) * 10 - daysA);
        })
        .slice(0, 10);

      const leadLines = sorted.map(buildLeadSummary).join('\n');
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

      const resp = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          system: `You are a real estate sales coach. You pick the 3 most important leads an agent should contact TODAY and write one ready-to-send opening line for each.

Respond ONLY with a JSON array, no markdown, no explanation:
[
  {
    "leadId": "<exact name from input>",
    "name": "<first name only>",
    "priority": "1",
    "why": "<one sentence, specific, why TODAY>",
    "opener": "<one ready-to-send message, first-person, casual, 1-2 sentences>",
    "action": "call" | "text" | "email"
  },
  ...
]

Rules:
- Pick exactly 3 leads
- "why" must be specific to their situation (temp, days since contact, source) — no generic advice
- "opener" must be ready to copy-paste. Natural, not salesy. Reference their name.
- Use "call" for hot leads, "text" for warm, "email" for cold/never contacted
- Never use asterisks, bold, or markdown in any field`,
          messages: [{
            role: 'user',
            content: `Today is ${today}. Here are my leads:\n${leadLines}\n\nPick my top 3 to contact today.`,
          }],
        }),
      });

      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const result = await resp.json();
      if (result?.type === 'error') throw new Error('API error');

      const raw = result?.content?.[0]?.text || '';
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed: Top3Lead[] = JSON.parse(clean);

      // Match leadId (AI returns name) back to real lead IDs
      const enriched = parsed.map(p => {
        const match = sorted.find(
          l => l.name.toLowerCase().includes(p.leadId.toLowerCase()) ||
               p.leadId.toLowerCase().includes(l.name.split(' ')[0].toLowerCase())
        );
        return { ...p, leadId: match?.id || p.leadId };
      });

      localStorage.setItem(cacheKey, JSON.stringify(enriched));
      setPicks(enriched);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [leads]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = useCallback((pick: Top3Lead) => {
    const lead = leads.find(l => l.id === pick.leadId || l.name === pick.leadId);
    if (!lead) return;
    onLeadAction(lead, pick.action);
  }, [leads, onLeadAction]);

  const handleOpen = useCallback((pick: Top3Lead) => {
    const lead = leads.find(l => l.id === pick.leadId || l.name === pick.leadId);
    if (!lead) return;
    onOpenLead(lead);
  }, [leads, onOpenLead]);

  if (leads.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Zap className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Today's Top 3</p>
          <p className="text-[10px] text-muted-foreground">AI-picked — tap any to go</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Content */}
      <div className="px-3 pb-3 space-y-2">
        {loading && picks.length === 0 && (
          <div className="space-y-2 pt-1">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-lg bg-muted/40 p-3 space-y-2 animate-pulse">
                <div className="h-3 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {error && picks.length === 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground mb-2">Couldn't load priorities</p>
            <Button variant="outline" size="sm" onClick={() => load(true)} className="h-7 text-xs">
              Try again
            </Button>
          </div>
        )}

        {picks.map((pick, idx) => {
          const Icon = ACTION_ICONS[pick.action] || Phone;
          const priorityColors = ['text-[hsl(var(--urgent))]', 'text-[hsl(var(--opportunity))]', 'text-muted-foreground'];
          const priorityBg = ['bg-[hsl(var(--urgent))/0.08]', 'bg-[hsl(var(--opportunity))/0.08]', 'bg-muted/30'];

          return (
            <div
              key={idx}
              className={cn("rounded-lg p-3 space-y-1.5 cursor-pointer hover:brightness-95 transition-all", priorityBg[idx])}
              onClick={() => handleOpen(pick)}
            >
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] font-bold uppercase tracking-wider", priorityColors[idx])}>
                  #{pick.priority}
                </span>
                <span className="text-sm font-semibold flex-1 truncate">{pick.name}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              </div>

              <p className="text-[11px] text-muted-foreground leading-snug">{pick.why}</p>

              <div className="bg-background/60 rounded-md px-2.5 py-2 flex items-start gap-2">
                <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-foreground leading-snug flex-1 italic">"{pick.opener}"</p>
              </div>

              <div className="flex gap-2 pt-0.5">
                <Button
                  size="sm"
                  className="h-7 text-xs flex-1 gap-1.5"
                  onClick={e => { e.stopPropagation(); handleAction(pick); }}
                >
                  <Icon className="h-3 w-3" />
                  {ACTION_LABELS[pick.action]}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={e => { e.stopPropagation(); handleOpen(pick); }}
                >
                  Full file
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {picks.length > 0 && !loading && (
        <div className="flex items-center gap-1 px-4 py-2 border-t border-border">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground">Updates each morning — tap <RefreshCw className="h-2.5 w-2.5 inline" /> to refresh now</p>
        </div>
      )}
    </div>
  );
}
