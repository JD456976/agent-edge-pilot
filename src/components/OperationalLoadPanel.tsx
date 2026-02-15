import { useMemo } from 'react';
import { Activity, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Task, Deal, Lead } from '@/types';
import type { StabilityResult } from '@/lib/stabilityModel';
import { cn } from '@/lib/utils';

interface Props {
  tasks: Task[];
  deals: Deal[];
  leads: Lead[];
  stabilityResult: StabilityResult;
  stabilityScore: number;
  totalMoneyAtRisk: number;
}

type BurnoutLevel = 'low' | 'elevated' | 'high' | 'critical';

interface LoadAnalysis {
  level: BurnoutLevel;
  score: number;
  signals: { label: string; severity: 'high' | 'medium' | 'low' }[];
  guidance: string[];
}

function computeLoad(tasks: Task[], deals: Deal[], leads: Lead[], stabilityScore: number, totalMoneyAtRisk: number, now: Date): LoadAnalysis {
  const signals: LoadAnalysis['signals'] = [];
  let score = 0;

  // 1) Overdue tasks
  const overdue = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < now);
  if (overdue.length >= 8) {
    score += 30;
    signals.push({ label: `${overdue.length} overdue tasks`, severity: 'high' });
  } else if (overdue.length >= 4) {
    score += 15;
    signals.push({ label: `${overdue.length} overdue tasks`, severity: 'medium' });
  }

  // 2) Task density (pending tasks today/tomorrow)
  const tomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const dueSoon = tasks.filter(t => !t.completedAt && new Date(t.dueAt) >= now && new Date(t.dueAt) <= tomorrow);
  if (dueSoon.length >= 10) {
    score += 25;
    signals.push({ label: `${dueSoon.length} tasks due within 48h`, severity: 'high' });
  } else if (dueSoon.length >= 5) {
    score += 10;
    signals.push({ label: `${dueSoon.length} tasks due within 48h`, severity: 'medium' });
  }

  // 3) Low touch rate on high-value items
  const activeDeals = deals.filter(d => d.stage !== 'closed');
  const untouchedDeals = activeDeals.filter(d => {
    if (!d.lastTouchedAt) return true;
    const days = (now.getTime() - new Date(d.lastTouchedAt).getTime()) / (1000 * 60 * 60 * 24);
    return days > 3;
  });
  if (untouchedDeals.length >= 3) {
    score += 15;
    signals.push({ label: `${untouchedDeals.length} deals untouched >3 days`, severity: 'medium' });
  }

  // 4) Hot leads not followed up
  const hotLeadsUnfollowed = leads.filter(l => {
    if (l.leadTemperature !== 'hot') return false;
    const days = l.lastTouchedAt ? (now.getTime() - new Date(l.lastTouchedAt).getTime()) / (1000 * 60 * 60 * 24) : Infinity;
    return days > 2;
  });
  if (hotLeadsUnfollowed.length >= 2) {
    score += 10;
    signals.push({ label: `${hotLeadsUnfollowed.length} hot leads untouched`, severity: 'medium' });
  }

  // 5) Declining stability
  if (stabilityScore < 40) {
    score += 20;
    signals.push({ label: 'Stability score critical', severity: 'high' });
  } else if (stabilityScore < 60) {
    score += 10;
    signals.push({ label: 'Stability score declining', severity: 'low' });
  }

  score = Math.min(100, Math.max(0, score));

  let level: BurnoutLevel;
  if (score >= 70) level = 'critical';
  else if (score >= 50) level = 'high';
  else if (score >= 30) level = 'elevated';
  else level = 'low';

  const guidance: string[] = [];
  if (level === 'critical') {
    guidance.push('Reduce new commitments today');
    guidance.push('Focus only on top 3 deals');
    guidance.push('Clear overdue backlog first');
  } else if (level === 'high') {
    guidance.push('Clear backlog before taking new work');
    guidance.push('Focus on top deals only');
  } else if (level === 'elevated') {
    guidance.push('Consider deferring low-priority tasks');
  }

  return { level, score, signals, guidance };
}

const LEVEL_CONFIG: Record<BurnoutLevel, { label: string; className: string }> = {
  low: { label: 'Low', className: 'text-opportunity border-opportunity/30' },
  elevated: { label: 'Elevated', className: 'text-warning border-warning/30' },
  high: { label: 'High', className: 'text-urgent border-urgent/30' },
  critical: { label: 'Critical', className: 'text-urgent border-urgent/50' },
};

export function OperationalLoadPanel({ tasks, deals, leads, stabilityResult, stabilityScore, totalMoneyAtRisk }: Props) {
  const now = useMemo(() => new Date(), []);
  const load = useMemo(() => computeLoad(tasks, deals, leads, stabilityScore, totalMoneyAtRisk, now), [tasks, deals, leads, stabilityScore, totalMoneyAtRisk, now]);

  if (load.level === 'low' && load.signals.length === 0) return null;

  const config = LEVEL_CONFIG[load.level];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Operational Load</h2>
        <Badge variant="outline" className={cn('text-[10px] ml-auto', config.className)}>
          {config.label}
        </Badge>
      </div>

      <div className="space-y-3 mt-2">
        {/* Load bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Load Level</span>
            <span className="text-xs font-medium">{load.score}/100</span>
          </div>
          <Progress value={load.score} className="h-1.5" />
        </div>

        {/* Signals */}
        {load.signals.length > 0 && (
          <div className="space-y-1.5">
            {load.signals.slice(0, 4).map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={cn(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  s.severity === 'high' ? 'bg-urgent' : s.severity === 'medium' ? 'bg-warning' : 'bg-muted-foreground',
                )} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recovery guidance */}
        {load.guidance.length > 0 && (
          <div className="rounded-md border border-border p-2.5 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Suggested</p>
            {load.guidance.map((g, i) => (
              <p key={i} className="text-xs text-muted-foreground">• {g}</p>
            ))}
          </div>
        )}

        {/* Autopilot override notice */}
        {load.level === 'critical' && (
          <p className="text-[10px] text-urgent/80">Autopilot switching to Stability First mode.</p>
        )}
      </div>
    </div>
  );
}
