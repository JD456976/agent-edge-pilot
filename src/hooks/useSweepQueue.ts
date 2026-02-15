import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Task, Lead, Deal } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';

// ── Types ────────────────────────────────────────────────────────────

export type SweepItem =
  | { kind: 'task'; id: string; title: string; reason: string; task: Task; commissionAtRisk?: number }
  | { kind: 'lead'; id: string; title: string; reason: string; lead: Lead; opportunityValue?: number };

export interface SweepStats {
  completed: number;
  touches: number;
  followUps: number;
}

export interface SnoozedEntry {
  id: string;
  until: string; // ISO timestamp
}

interface SweepPersistence {
  active: boolean;
  processedIds: string[];
  snoozedEntries: SnoozedEntry[];
  stats: SweepStats;
  savedAt: string;
}

const SWEEP_STORAGE_KEY = 'dp-sweep-state';
const SWEEP_TTL_MS = 24 * 60 * 60 * 1000;

// ── Persistence ──────────────────────────────────────────────────────

function loadPersistedSweep(): SweepPersistence | null {
  try {
    const raw = localStorage.getItem(SWEEP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SweepPersistence;
    if (Date.now() - new Date(parsed.savedAt).getTime() > SWEEP_TTL_MS) {
      localStorage.removeItem(SWEEP_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistSweep(state: SweepPersistence) {
  try {
    localStorage.setItem(SWEEP_STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function clearPersistedSweep() {
  localStorage.removeItem(SWEEP_STORAGE_KEY);
}

// ── Smart follow-up logic ────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export interface SmartFollowUp {
  title: string;
  type: string;
  dueAt: string;
  relatedLeadId?: string;
  relatedDealId?: string;
}

export function buildSmartFollowUp(
  item: SweepItem,
  deals: Deal[],
  recentTouchType?: string,
): SmartFollowUp {
  const now = new Date();
  const hour = now.getHours();
  const isPastEight = hour >= 20;

  if (item.kind === 'lead') {
    // Task type: Call default, Text if last touch was Call within 24h
    const taskType = recentTouchType === 'call' ? 'text' : 'call';

    // Due date
    const due = new Date();
    if (isPastEight) {
      due.setDate(due.getDate() + 2);
    } else {
      due.setDate(due.getDate() + 1);
    }
    due.setHours(9, 0, 0, 0);

    const reason = item.lead.leadTemperature === 'hot' ? 'hot lead' : 'follow-up';
    return {
      title: `${taskType === 'call' ? 'Call' : 'Text'} ${item.lead.name} re: ${reason}`,
      type: taskType,
      dueAt: due.toISOString(),
      relatedLeadId: item.lead.id,
    };
  }

  // Task kind — find linked deal
  const linkedDeal = item.task.relatedDealId
    ? deals.find(d => d.id === item.task.relatedDealId)
    : undefined;

  // Task type
  let taskType = 'follow_up';
  if (linkedDeal?.closeDate) {
    const daysToClose = daysBetween(new Date(linkedDeal.closeDate), now);
    if (daysToClose >= 0 && daysToClose <= 7) {
      taskType = 'closing';
    }
  }

  // Due date
  const due = new Date();
  const closingSoon = linkedDeal?.closeDate && daysBetween(new Date(linkedDeal.closeDate), now) <= 3;
  if (closingSoon) {
    due.setDate(due.getDate() + 1);
    due.setHours(8, 0, 0, 0);
  } else if (isPastEight) {
    due.setDate(due.getDate() + 2);
    due.setHours(9, 0, 0, 0);
  } else {
    due.setDate(due.getDate() + 1);
    due.setHours(9, 0, 0, 0);
  }

  const reason = item.reason;
  const dealTitle = linkedDeal?.title || item.task.title;
  return {
    title: `Follow up: ${dealTitle} (${reason})`,
    type: taskType,
    dueAt: due.toISOString(),
    relatedDealId: item.task.relatedDealId,
    relatedLeadId: item.task.relatedLeadId,
  };
}

// ── Snooze helpers ───────────────────────────────────────────────────

export function getSnoozeOptions(): { label: string; until: Date }[] {
  const now = new Date();
  const hour = now.getHours();

  // "Later tonight" — today 8 PM, or tomorrow 8 PM if past
  const tonight = new Date();
  tonight.setHours(20, 0, 0, 0);
  if (hour >= 20) tonight.setDate(tonight.getDate() + 1);

  // "Tomorrow morning" — tomorrow 9 AM
  const tomorrowAm = new Date();
  tomorrowAm.setDate(tomorrowAm.getDate() + 1);
  tomorrowAm.setHours(9, 0, 0, 0);

  return [
    { label: 'Later tonight', until: tonight },
    { label: 'Tomorrow morning', until: tomorrowAm },
  ];
}

// ── "Why this is next" reason builder ────────────────────────────────

function buildItemReason(item: SweepItem, deals: Deal[]): string {
  if (item.kind === 'task') {
    const dueDate = new Date(item.task.dueAt);
    const now = new Date();
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    // Check if linked to a deal with commission at risk
    if (item.commissionAtRisk && item.commissionAtRisk > 0) {
      return `Protecting $${Math.round(item.commissionAtRisk).toLocaleString()} at risk`;
    }

    const linkedDeal = item.task.relatedDealId ? deals.find(d => d.id === item.task.relatedDealId) : undefined;
    if (linkedDeal?.closeDate) {
      const daysToClose = Math.floor(daysBetween(new Date(linkedDeal.closeDate), now));
      if (daysToClose >= 0 && daysToClose <= 7) {
        return `Closing in ${daysToClose} day${daysToClose !== 1 ? 's' : ''}`;
      }
    }

    if (daysOverdue <= 0) return 'Due today';
    return `Overdue ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}`;
  }

  // Lead
  if (item.opportunityValue && item.opportunityValue > 0) {
    const temp = item.lead.leadTemperature;
    const tempLabel = temp === 'hot' ? 'Hot' : temp === 'warm' ? 'Warm' : '';
    return `Untouched today${tempLabel ? ` · ${tempLabel}` : ''} · $${Math.round(item.opportunityValue).toLocaleString()} opportunity`;
  }

  const temp = item.lead.leadTemperature;
  return `Untouched today${temp ? ` · ${temp.charAt(0).toUpperCase() + temp.slice(1)}` : ''}`;
}

// ── Main hook ────────────────────────────────────────────────────────

export function useSweepQueue(
  overdueTasks: Task[],
  untouchedHotLeads: Lead[],
  deals: Deal[],
  moneyResults: MoneyModelResult[],
  opportunityResults: OpportunityHeatResult[],
) {
  // Try to restore persisted state
  const persisted = useMemo(() => loadPersistedSweep(), []);

  const [sweepMode, setSweepMode] = useState(persisted?.active ?? false);
  const [processedIds, setProcessedIds] = useState<Set<string>>(
    new Set(persisted?.processedIds ?? [])
  );
  const [snoozedEntries, setSnoozedEntries] = useState<SnoozedEntry[]>(
    persisted?.snoozedEntries ?? []
  );
  const [sweepStats, setSweepStats] = useState<SweepStats>(
    persisted?.stats ?? { completed: 0, touches: 0, followUps: 0 }
  );
  const [resumeNextTime, setResumeNextTime] = useState(true);

  // Build money lookup maps
  const moneyByDealId = useMemo(() => {
    const map = new Map<string, MoneyModelResult>();
    moneyResults.forEach(r => map.set(r.dealId, r));
    return map;
  }, [moneyResults]);

  const oppByLeadId = useMemo(() => {
    const map = new Map<string, OpportunityHeatResult>();
    opportunityResults.forEach(r => map.set(r.leadId, r));
    return map;
  }, [opportunityResults]);

  // Active snoozed ids (filter out expired snoozes)
  const activeSnoozedIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      snoozedEntries
        .filter(e => new Date(e.until).getTime() > now)
        .map(e => e.id)
    );
  }, [snoozedEntries]);

  // Build the sweep queue with money-aware ordering
  const sweepQueue = useMemo((): SweepItem[] => {
    // 1. Tasks linked to deals, sorted by personalCommissionAtRisk
    const dealLinkedTasks: SweepItem[] = [];
    const nonDealTasks: SweepItem[] = [];

    [...overdueTasks]
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .forEach(t => {
        const moneyResult = t.relatedDealId ? moneyByDealId.get(t.relatedDealId) : undefined;
        const item: SweepItem = {
          kind: 'task',
          id: t.id,
          title: t.title,
          reason: '', // filled below
          task: t,
          commissionAtRisk: moneyResult?.personalCommissionAtRisk,
        };
        if (moneyResult && moneyResult.personalCommissionAtRisk > 0) {
          dealLinkedTasks.push(item);
        } else {
          nonDealTasks.push(item);
        }
      });

    // Sort deal-linked tasks by commission at risk (highest first)
    dealLinkedTasks.sort((a, b) => {
      const aRisk = a.kind === 'task' ? (a.commissionAtRisk ?? 0) : 0;
      const bRisk = b.kind === 'task' ? (b.commissionAtRisk ?? 0) : 0;
      return bRisk - aRisk;
    });

    // 2. Leads sorted by opportunityValue
    const leadItems: SweepItem[] = [...untouchedHotLeads]
      .map(l => {
        const opp = oppByLeadId.get(l.id);
        return {
          kind: 'lead' as const,
          id: l.id,
          title: l.name,
          reason: '', // filled below
          lead: l,
          opportunityValue: opp?.opportunityValue ?? 0,
        };
      })
      .sort((a, b) => (b.opportunityValue ?? 0) - (a.opportunityValue ?? 0));

    // Final order: deal-linked tasks → other overdue tasks → leads
    const queue = [...dealLinkedTasks, ...nonDealTasks, ...leadItems];

    // Fill reasons
    queue.forEach(item => {
      item.reason = buildItemReason(item, deals);
    });

    return queue;
  }, [overdueTasks, untouchedHotLeads, moneyByDealId, oppByLeadId, deals]);

  // Active queue: exclude processed and snoozed, also exclude items that no longer exist
  const activeQueue = useMemo(
    () => sweepQueue.filter(i => !processedIds.has(i.id) && !activeSnoozedIds.has(i.id)),
    [sweepQueue, processedIds, activeSnoozedIds]
  );

  const currentItem = activeQueue.length > 0 ? activeQueue[0] : null;
  const sweepDone = sweepMode && !currentItem;
  const totalItems = sweepQueue.length;

  // Persist state on changes
  useEffect(() => {
    if (sweepMode && resumeNextTime) {
      persistSweep({
        active: true,
        processedIds: Array.from(processedIds),
        snoozedEntries,
        stats: sweepStats,
        savedAt: new Date().toISOString(),
      });
    }
  }, [sweepMode, processedIds, snoozedEntries, sweepStats, resumeNextTime]);

  const startSweep = useCallback(() => setSweepMode(true), []);

  const exitSweep = useCallback(() => {
    setSweepMode(false);
    if (!resumeNextTime) {
      clearPersistedSweep();
    }
  }, [resumeNextTime]);

  const resetSweep = useCallback(() => {
    setSweepMode(false);
    setProcessedIds(new Set());
    setSnoozedEntries([]);
    setSweepStats({ completed: 0, touches: 0, followUps: 0 });
    clearPersistedSweep();
  }, []);

  const advanceSweep = useCallback((itemId: string) => {
    setProcessedIds(p => new Set(p).add(itemId));
  }, []);

  const snoozeItem = useCallback((itemId: string, until: Date) => {
    setSnoozedEntries(prev => [...prev.filter(e => e.id !== itemId), { id: itemId, until: until.toISOString() }]);
    setProcessedIds(p => new Set(p).add(itemId)); // remove from current view
  }, []);

  const recordStat = useCallback((key: keyof SweepStats) => {
    setSweepStats(p => ({ ...p, [key]: p[key] + 1 }));
  }, []);

  return {
    sweepMode,
    sweepQueue,
    activeQueue,
    currentItem,
    sweepDone,
    totalItems,
    sweepStats,
    resumeNextTime,
    setResumeNextTime,
    startSweep,
    exitSweep,
    resetSweep,
    advanceSweep,
    snoozeItem,
    recordStat,
  };
}
