import { useMemo, useRef } from 'react';
import type { Task, Lead } from '@/types';

export interface EndOfDaySummary {
  overdueTasks: Task[];
  untouchedHotLeads: Lead[];
  counts: { overdueTasks: number; untouchedHotLeads: number };
  computedAt: Date;
}

export function useEndOfDaySummary(tasks: Task[], leads: Lead[]): EndOfDaySummary {
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const now = useMemo(() => new Date(), []);

  return useMemo(() => {
    const overdueTasks = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < now);
    const untouchedHotLeads = leads.filter(
      l => (l.leadTemperature === 'hot' || l.engagementScore >= 80) &&
           (!l.lastTouchedAt || new Date(l.lastTouchedAt) < todayStart)
    );

    return {
      overdueTasks,
      untouchedHotLeads,
      counts: {
        overdueTasks: overdueTasks.length,
        untouchedHotLeads: untouchedHotLeads.length,
      },
      computedAt: new Date(),
    };
  }, [tasks, leads, now, todayStart]);
}
