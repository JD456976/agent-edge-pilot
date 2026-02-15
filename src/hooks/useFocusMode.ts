import { useState, useCallback } from 'react';
import type { FocusMode } from '@/components/FocusModeSelector';

const STORAGE_KEY = 'dp-focus-mode';

export function useFocusMode() {
  const [focusMode, setFocusMode] = useState<FocusMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'tactical' || stored === 'strategic' || stored === 'minimal') return stored;
    } catch {}
    return 'tactical';
  });

  const updateFocusMode = useCallback((mode: FocusMode) => {
    setFocusMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  return { focusMode, updateFocusMode };
}
