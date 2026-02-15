import { useState, useCallback } from 'react';
import type { PanelId } from '@/hooks/useCommandCenterLayout';

const STORAGE_KEY = 'dp-collapsed-panels';

function readCollapsed(): Set<PanelId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function writeCollapsed(set: Set<PanelId>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {}
}

export function usePanelCollapse() {
  const [collapsed, setCollapsed] = useState<Set<PanelId>>(readCollapsed);

  const toggleCollapse = useCallback((panelId: PanelId) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      writeCollapsed(next);
      return next;
    });
  }, []);

  const isCollapsed = useCallback((panelId: PanelId) => collapsed.has(panelId), [collapsed]);

  return { isCollapsed, toggleCollapse };
}
