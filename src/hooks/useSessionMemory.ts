import { useEffect, useRef } from 'react';
import type { Lead, Deal, Task, Alert } from '@/types';

const SESSION_KEY = 'dp-session-memory';

export interface SessionSnapshot {
  lastOpenedAt: string;
  urgentCount: number;
  overdueTaskIds: string[];
  riskDealIds: string[];
  leadIds: string[];
  dealIds: string[];
}

function loadSnapshot(): SessionSnapshot | null {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSnapshot(snapshot: SessionSnapshot) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
}

export function useSessionMemory(
  leads: Lead[],
  deals: Deal[],
  tasks: Task[],
  alerts: Alert[],
  hasData: boolean,
) {
  const previousSnapshot = useRef<SessionSnapshot | null>(null);
  const snapshotLoaded = useRef(false);

  // Load previous snapshot once on mount
  if (!snapshotLoaded.current) {
    previousSnapshot.current = loadSnapshot();
    snapshotLoaded.current = true;
  }

  // Save current snapshot when data changes
  useEffect(() => {
    if (!hasData) return;

    const now = new Date();
    const overdueTasks = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < now);
    const riskDeals = deals.filter(d => d.stage !== 'closed' && (d.riskLevel === 'red' || d.riskLevel === 'yellow'));

    const snapshot: SessionSnapshot = {
      lastOpenedAt: now.toISOString(),
      urgentCount: overdueTasks.length + riskDeals.length,
      overdueTaskIds: overdueTasks.map(t => t.id),
      riskDealIds: riskDeals.map(d => d.id),
      leadIds: leads.map(l => l.id),
      dealIds: deals.map(d => d.id),
    };

    // Delay save so we capture "previous" state on first render
    const timer = setTimeout(() => saveSnapshot(snapshot), 2000);
    return () => clearTimeout(timer);
  }, [leads, deals, tasks, alerts, hasData]);

  return previousSnapshot.current;
}
