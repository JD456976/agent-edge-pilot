import { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useHabitTracking } from '@/hooks/useHabitTracking';
import { BarChart3, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Where Your Leads Come From ────────────────────────────────────────────────
export function LeadSourcesInsight() {
  const { leads } = useData();
  const sources = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const map = new Map<string, { count: number; totalScore: number; activeCount: number }>();
    for (const lead of leads) {
      const src = lead.source || 'Unknown';
      const entry = map.get(src) || { count: 0, totalScore: 0, activeCount: 0 };
      entry.count++;
      entry.totalScore += lead.engagementScore ?? 0;
      if (lead.lastTouchedAt && new Date(lead.lastTouchedAt) >= thirtyDaysAgo) entry.activeCount++;
      map.set(src, entry);
    }
    return Array.from(map.entries())
      .map(([source, d]) => ({ source, count: d.count, avgScore: d.count > 0 ? Math.round(d.totalScore / d.count) : 0, activeCount: d.activeCount }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  const maxCount = Math.max(...sources.map(s => s.count), 1);
  if (sources.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <BarChart3 className="h-4 w-4" /> Where Your Leads Come From
      </h2>
      <p className="text-xs text-muted-foreground mb-3">{leads.length} total leads across {sources.length} sources</p>
      <div className="space-y-2 mb-4">
        {sources.map(s => (
          <div key={s.source} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate">{s.source}</span>
              <span className="text-muted-foreground shrink-0 ml-2">{s.count}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(s.count / maxCount) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border pt-3">
        <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 px-1">
          <span>Source</span><span className="text-right">Count</span><span className="text-right">Avg Score</span><span className="text-right">Active (30d)</span>
        </div>
        {sources.map(s => (
          <div key={s.source} className="grid grid-cols-4 gap-2 text-sm py-1.5 px-1 rounded hover:bg-muted/50">
            <span className="font-medium truncate">{s.source}</span>
            <span className="text-right text-muted-foreground">{s.count}</span>
            <span className="text-right text-muted-foreground">{s.avgScore}</span>
            <span className="text-right text-muted-foreground">{s.activeCount}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Daily Consistency ─────────────────────────────────────────────────────────
export function DailyConsistencyPanel() {
  const { stats: habitStats } = useHabitTracking();

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Calendar className="h-4 w-4" /> Daily Consistency
      </h2>
      <p className="text-xs text-muted-foreground mb-3">Your daily operating loop performance.</p>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Morning Brief</p>
          <p className="text-lg font-semibold">{habitStats.briefStreak} day{habitStats.briefStreak !== 1 ? 's' : ''}</p>
          <p className="text-[10px] text-muted-foreground">Consecutive days viewed</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">EOD Review</p>
          <p className="text-lg font-semibold">{habitStats.eodStreak} day{habitStats.eodStreak !== 1 ? 's' : ''}</p>
          <p className="text-[10px] text-muted-foreground">Consecutive days completed</p>
        </div>
      </div>
      {habitStats.last7.length > 0 && (
        <div className="pt-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Last 7 Days</p>
          <div className="flex gap-1">
            {habitStats.last7.map((day: any) => (
              <div key={day.date} className="flex flex-col items-center gap-0.5">
                <div className={cn('w-5 h-5 rounded-sm', day.briefViewed && day.eodCompleted ? 'bg-opportunity/20' : day.briefViewed || day.eodCompleted ? 'bg-warning/20' : 'bg-muted')} />
                <span className="text-[8px] text-muted-foreground">
                  {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
