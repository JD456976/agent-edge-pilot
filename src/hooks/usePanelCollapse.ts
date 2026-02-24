import { useState, useCallback } from 'react';

const STORAGE_KEY = 'dp-collapsed-panels';

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function writeCollapsed(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {}
}

export function usePanelCollapse() {
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);

  const toggleCollapse = useCallback((panelId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      writeCollapsed(next);
      return next;
    });
  }, []);

  const isCollapsed = useCallback((panelId: string) => collapsed.has(panelId), [collapsed]);

  return { isCollapsed, toggleCollapse };
}
