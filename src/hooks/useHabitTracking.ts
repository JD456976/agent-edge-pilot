import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'dp-habit-tracking';

interface HabitLog {
  date: string; // YYYY-MM-DD
  briefViewed: boolean;
  eodCompleted: boolean;
}

interface HabitStats {
  briefStreak: number;
  eodStreak: number;
  last7: HabitLog[];
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function loadLogs(): HabitLog[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveLogs(logs: HabitLog[]) {
  // Keep only last 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffKey = cutoff.toISOString().split('T')[0];
  const trimmed = logs.filter(l => l.date >= cutoffKey);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

function computeStreak(logs: HabitLog[], field: 'briefViewed' | 'eodCompleted'): number {
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  const today = todayKey();
  const d = new Date();

  for (let i = 0; i < 30; i++) {
    const key = d.toISOString().split('T')[0];
    const log = sorted.find(l => l.date === key);
    if (log && log[field]) {
      streak++;
    } else if (key !== today) {
      // Allow today to not be completed yet
      break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function useHabitTracking() {
  const [logs, setLogs] = useState<HabitLog[]>(loadLogs);

  const markBriefViewed = useCallback(() => {
    setLogs(prev => {
      const key = todayKey();
      const existing = prev.find(l => l.date === key);
      let next: HabitLog[];
      if (existing) {
        next = prev.map(l => l.date === key ? { ...l, briefViewed: true } : l);
      } else {
        next = [...prev, { date: key, briefViewed: true, eodCompleted: false }];
      }
      saveLogs(next);
      return next;
    });
  }, []);

  const markEodCompleted = useCallback(() => {
    setLogs(prev => {
      const key = todayKey();
      const existing = prev.find(l => l.date === key);
      let next: HabitLog[];
      if (existing) {
        next = prev.map(l => l.date === key ? { ...l, eodCompleted: true } : l);
      } else {
        next = [...prev, { date: key, briefViewed: false, eodCompleted: true }];
      }
      saveLogs(next);
      return next;
    });
  }, []);

  const stats: HabitStats = {
    briefStreak: computeStreak(logs, 'briefViewed'),
    eodStreak: computeStreak(logs, 'eodCompleted'),
    last7: logs.filter(l => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      return l.date >= cutoff.toISOString().split('T')[0];
    }).sort((a, b) => a.date.localeCompare(b.date)),
  };

  return { stats, markBriefViewed, markEodCompleted };
}
