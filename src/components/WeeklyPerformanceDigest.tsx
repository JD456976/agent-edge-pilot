import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';

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

  // Force Sunday mode for April 12-13 2026 (demo window) or any real Sunday
  const today = new Date();
  const isSunday = today.getDay() === 0 || (today.getMonth() === 3 && (today.getDate() === 12 || today.getDate() === 13) && today.getFullYear() === 2026);
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
    if (contactsThisWeek >= 15) return { text: 'Strong week 💪 — keep the momentum', color: 'text-opportunity' };
    if (contactsThisWeek >= 8) return { text: 'Good progress 👍 — push harder next week', color: 'text-primary' };
    return { text: 'Time to turn it up 📈 — set a goal for Monday', color: 'text-warning' };
  }, [contactsThisWeek, isSunday]);

  if (loading) return null;

  return (
    <div className={cn(
      'rounded-xl border bg-card space-y-2',
      isSunday
        ? 'border-t-[3px] border-t-[hsl(45,90%,55%)] border-[hsl(45,90%,55%)] shadow-[0_0_16px_-4px_hsl(45,90%,55%,0.35)] p-5'
        : 'border-[hsl(45,80%,55%,0.4)] p-4'
    )}>
      {isSunday ? (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-foreground">📊 Week in Review — {week.label}</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            <div className="flex items-center gap-2">
              <span className="text-lg">📞</span>
              <div>
                <p className="text-xs text-muted-foreground">Contacts</p>
                <p className="text-lg font-bold text-foreground">{contactsThisWeek}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">📅</span>
              <div>
                <p className="text-xs text-muted-foreground">Appointments</p>
                <p className="text-lg font-bold text-foreground">{appointmentsThisWeek}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🔥</span>
              <div>
                <p className="text-xs text-muted-foreground">Streak</p>
                <p className="text-lg font-bold text-foreground">{streak}d</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🏆</span>
              <div>
                <p className="text-xs text-muted-foreground">Goal</p>
                <p className="text-lg font-bold text-foreground">{contactsThisWeek} / {weekGoal}</p>
              </div>
            </div>
          </div>
          {/* Goal progress bar */}
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', goalPct >= 100 ? 'bg-opportunity' : 'bg-primary')}
              style={{ width: `${goalPct}%` }}
            />
          </div>
          {verdict && (
            <p className={cn('text-sm font-semibold pt-1', verdict.color)}>{verdict.text}</p>
          )}
        </div>
      ) : (
        <>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <span>📊</span> This Week
          </h3>
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
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', goalPct >= 100 ? 'bg-opportunity' : 'bg-primary')}
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
