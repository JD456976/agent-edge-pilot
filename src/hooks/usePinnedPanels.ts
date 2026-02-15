import { useState, useCallback } from 'react';
import type { PanelId } from '@/hooks/useCommandCenterLayout';

const STORAGE_KEY = 'dp-pinned-panels';
const MAX_PINNED = 3;

function loadPinned(): PanelId[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function usePinnedPanels() {
  const [pinnedPanels, setPinnedPanels] = useState<PanelId[]>(loadPinned);

  const togglePin = useCallback((panelId: string) => {
    setPinnedPanels(prev => {
      const id = panelId as PanelId;
      let next: PanelId[];
      if (prev.includes(id)) {
        next = prev.filter(p => p !== id);
      } else if (prev.length >= MAX_PINNED) {
        // Replace oldest pin
        next = [...prev.slice(1), id];
      } else {
        next = [...prev, id];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isPinned = useCallback((panelId: string) => {
    return pinnedPanels.includes(panelId as PanelId);
  }, [pinnedPanels]);

  /** Sort panel order so pinned panels come first */
  const sortWithPins = useCallback((order: PanelId[]): PanelId[] => {
    if (pinnedPanels.length === 0) return order;
    const pinned = pinnedPanels.filter(p => order.includes(p));
    const rest = order.filter(p => !pinnedPanels.includes(p));
    return [...pinned, ...rest];
  }, [pinnedPanels]);

  return { pinnedPanels, togglePin, isPinned, sortWithPins };
}
