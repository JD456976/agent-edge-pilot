import { useState, useCallback } from 'react';
import { loadStrategicSettings, saveStrategicSettings, type StrategicSettings } from '@/lib/strategicEngine';

export function useStrategicSettings(userId?: string) {
  const [settings, setSettings] = useState<StrategicSettings>(() => loadStrategicSettings(userId));

  const updateSettings = useCallback((patch: Partial<StrategicSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveStrategicSettings(next, userId);
      // Mark goal as set so the onboarding widget dismisses immediately
      if (patch.weeklyTarget || patch.monthlyTarget || (patch as any).annualIncomeTarget) {
        localStorage.setItem('dp-goal-set', 'true');
      }
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
