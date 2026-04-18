import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { X, TrendingUp, Clock, Tag, Phone, Flame, Snowflake, Sun, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Lead } from '@/types';

interface Props {
  lead: Lead;
  score: number;
  children: ReactNode;
}

interface Factor {
  label: string;
  points: number;
  icon: React.ElementType;
  positive: boolean;
}

function getScoreFactors(lead: Lead, score: number): Factor[] {
  const factors: Factor[] = [];

  // Temperature
  if (lead.leadTemperature === 'hot') {
    factors.push({ label: 'Marked Hot in CRM', points: 40, icon: Flame, positive: true });
  } else if (lead.leadTemperature === 'warm') {
    factors.push({ label: 'Marked Warm in CRM', points: 25, icon: Sun, positive: true });
  } else {
    factors.push({ label: 'Marked Cool/Cold in CRM', points: 10, icon: Snowflake, positive: false });
  }

  // Source
  const src = (lead.source || '').toLowerCase();
  if (src.includes('zillow preferred')) {
    factors.push({ label: 'Zillow Preferred lead', points: 15, icon: TrendingUp, positive: true });
  } else if (src.includes('sphere') || src.includes('referral')) {
    factors.push({ label: 'Sphere / Referral source', points: 12, icon: TrendingUp, positive: true });
  } else if (src.includes('zillow')) {
    factors.push({ label: 'Zillow source', points: 10, icon: TrendingUp, positive: true });
  } else if (src.includes('realtor') || src.includes('redfin')) {
    factors.push({ label: `${lead.source} source`, points: 8, icon: TrendingUp, positive: true });
  } else if (lead.source) {
    factors.push({ label: `${lead.source} source`, points: 5, icon: TrendingUp, positive: true });
  }

  // Recency
  const contactDate = lead.lastTouchedAt || lead.lastContactAt;
  if (contactDate) {
    const d = Math.floor((Date.now() - new Date(contactDate).getTime()) / 86400000);
    if (d < 1) factors.push({ label: 'Contacted today', points: 20, icon: Clock, positive: true });
    else if (d < 3) factors.push({ label: `Last contact ${d}d ago`, points: 15, icon: Clock, positive: true });
    else if (d < 7) factors.push({ label: `Last contact ${d}d ago`, points: 10, icon: Clock, positive: true });
    else if (d < 14) factors.push({ label: `Last contact ${d}d ago`, points: 5, icon: Clock, positive: true });
    else factors.push({ label: `No contact for ${d} days`, points: 0, icon: Clock, positive: false });
  } else {
    factors.push({ label: 'Never contacted', points: 0, icon: Clock, positive: false });
  }

  // Tags
  const tags = (lead.statusTags || []).map(t => t.toLowerCase());
  if (tags.some(t => ['pre-approved', 'pre_approved', 'cash_buyer', 'cash buyer'].includes(t))) {
    factors.push({ label: 'Pre-approved / Cash buyer', points: 15, icon: Tag, positive: true });
  }
  if (tags.some(t => ['showing', 'appointment set', 'appointment_set'].includes(t))) {
    factors.push({ label: 'Showing / Appointment set', points: 12, icon: Tag, positive: true });
  }
  if (tags.some(t => ['motivated', 'serious', 'vip', 'market vip'].includes(t))) {
    factors.push({ label: 'Motivated / Serious / VIP', points: 10, icon: Tag, positive: true });
  }
  if (lead.emailPrimary || lead.phonePrimary) {
    factors.push({ label: 'Has contact info on file', points: 5, icon: Phone, positive: true });
  }

  return factors;
}

function scoreConfig(score: number) {
  if (score >= 80) return { ring: 'ring-red-500/40', bar: 'bg-red-500', text: 'text-red-400', label: 'Hot 🔥', tip: 'High intent — prioritize a call today.' };
  if (score >= 60) return { ring: 'ring-amber-400/40', bar: 'bg-amber-400', text: 'text-amber-400', label: 'Warm ☀️', tip: 'Good momentum — keep up consistent contact.' };
  if (score >= 40) return { ring: 'ring-primary/30', bar: 'bg-primary', text: 'text-primary', label: 'Warming Up', tip: 'Log a contact to push this lead higher.' };
  return { ring: 'ring-muted-foreground/20', bar: 'bg-muted-foreground/50', text: 'text-muted-foreground', label: 'Cool ❄️', tip: 'Low activity. Consider a re-engagement or archive.' };
}

export function LeadScorePopover({ lead, score, children }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(o => !o);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const factors = getScoreFactors(lead, score);
  const cfg = scoreConfig(score);

  return (
    <>
      <span onClick={toggle} className="cursor-pointer inline-flex items-center gap-1 group">
        {children}
        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/15 group-hover:bg-primary/30 transition-colors shrink-0">
          <Info className="h-2.5 w-2.5 text-primary/80 group-hover:text-primary transition-colors" />
        </span>
      </span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4 mx-0 sm:mx-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{lead.name}</h3>
                <p className="text-xs text-muted-foreground">Score Breakdown</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="shrink-0 h-7 w-7 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Score + bar */}
            <div className="flex items-center gap-4">
              <div className={cn('h-14 w-14 rounded-full ring-4 flex items-center justify-center shrink-0', cfg.ring)}>
                <span className={cn('text-xl font-bold tabular-nums', cfg.text)}>{score}</span>
              </div>
              <div className="flex-1 space-y-1.5">
                <p className={cn('text-sm font-semibold', cfg.text)}>{cfg.label}</p>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all duration-500', cfg.bar)} style={{ width: `${score}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground">{score} / 100 points</p>
              </div>
            </div>

            {/* Factors */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">What's driving this score</p>
              {factors.map((f, i) => {
                const Icon = f.icon;
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className={cn('h-5 w-5 rounded flex items-center justify-center shrink-0',
                      f.positive ? 'bg-emerald-500/10' : 'bg-muted/60'
                    )}>
                      <Icon className={cn('h-2.5 w-2.5', f.positive ? 'text-emerald-400' : 'text-muted-foreground')} />
                    </div>
                    <span className="text-xs flex-1 text-foreground">{f.label}</span>
                    <span className={cn('text-xs font-bold tabular-nums shrink-0 min-w-[28px] text-right',
                      f.points > 0 ? 'text-emerald-400' : 'text-muted-foreground'
                    )}>
                      {f.points > 0 ? `+${f.points}` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Tip */}
            <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 leading-relaxed border border-border/50">
              💡 {cfg.tip}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
