import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface WeeklyDigestProps {
  userId: string;
}

function getWeekRange(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
}

export function WeeklyPerformanceDigest({ userId }: WeeklyDigestProps) {
  const [contactsThisWeek, setContactsThisWeek] = useState(0);
  const [appointmentsThisWeek, setAppointmentsThisWeek] = useState(0);
  const [loading, setLoading] = useState(true);

  const isSunday = new Date().getDay() === 0;
  const week = useMemo(() => getWeekRange(), []);
  const streak = useMemo(() => {
    try {
      return parseInt(localStorage.getItem('dealPilot_streak') || '0', 10);
    } catch { return 0; }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const weekStartISO = week.start.toISOString();

      // Contacts from activity_events
      const { data: events } = await supabase
        .from('activity_events')
        .select('id')
        .eq('user_id', userId)
        .gte('created_at', weekStartISO);

      // Appointments from localStorage
      let apptCount = 0;
      try {
        const stored = localStorage.getItem('dealPilot_appointments');
        if (stored) {
          const appts = JSON.parse(stored) as Array<{ date?: string; createdAt?: string }>;
          apptCount = appts.filter(a => {
            const d = a.createdAt || a.date;
            return d && new Date(d) >= week.start;
          }).length;
        }
      } catch {}

      if (!cancelled) {
        setContactsThisWeek(events?.length || 0);
        setAppointmentsThisWeek(apptCount);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, week.start]);

  const weekGoal = 20;
  const goalPct = Math.min((contactsThisWeek / weekGoal) * 100, 100);

  const verdict = useMemo(() => {
    if (!isSunday) return null;
    if (contactsThisWeek >= 15) return { text: 'Strong week 💪', color: 'text-opportunity' };
    if (contactsThisWeek >= 8) return { text: 'Good progress 👍', color: 'text-primary' };
    return { text: 'Pick it up next week 📈', color: 'text-warning' };
  }, [contactsThisWeek, isSunday]);

  if (loading) return null;

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 space-y-2',
      isSunday ? 'border-[hsl(45,90%,55%)] shadow-[0_0_12px_-4px_hsl(45,90%,55%,0.3)]' : 'border-[hsl(45,80%,55%,0.4)]'
    )}>
      {isSunday && (
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-foreground">Week in Review — {week.label}</h3>
          {verdict && (
            <p className={cn('text-sm font-semibold', verdict.color)}>{verdict.text}</p>
          )}
        </div>
      )}
      {!isSunday && (
        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <span>📊</span> This Week
        </h3>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div className="flex items-center gap-1.5">
          <span>📞</span>
          <span className="text-muted-foreground">Contacts</span>
          <span className="font-semibold text-foreground ml-auto">{contactsThisWeek}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>📅</span>
          <span className="text-muted-foreground">Appointments</span>
          <span className="font-semibold text-foreground ml-auto">{appointmentsThisWeek}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>🔥</span>
          <span className="text-muted-foreground">Streak</span>
          <span className="font-semibold text-foreground ml-auto">{streak}d</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>🏆</span>
          <span className="text-muted-foreground">Goal</span>
          <span className="font-semibold text-foreground ml-auto">{contactsThisWeek} / {weekGoal}</span>
        </div>
      </div>
      {/* Goal progress bar */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', goalPct >= 100 ? 'bg-opportunity' : 'bg-primary')}
          style={{ width: `${goalPct}%` }}
        />
      </div>
    </div>
  );
}
