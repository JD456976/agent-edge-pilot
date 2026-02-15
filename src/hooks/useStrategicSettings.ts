import { useState, useCallback } from 'react';
import { loadStrategicSettings, saveStrategicSettings, type StrategicSettings } from '@/lib/strategicEngine';

export function useStrategicSettings(userId?: string) {
  const [settings, setSettings] = useState<StrategicSettings>(() => loadStrategicSettings(userId));

  const updateSettings = useCallback((patch: Partial<StrategicSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveStrategicSettings(next, userId);
      return next;
    });
  }, [userId]);

  const resetSettings = useCallback(() => {
    const defaults = loadStrategicSettings(); // returns DEFAULT_STRATEGIC_SETTINGS
    setSettings(defaults);
    saveStrategicSettings(defaults, userId);
  }, [userId]);

  return { settings, updateSettings, resetSettings };
}
