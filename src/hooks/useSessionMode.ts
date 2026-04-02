import { useState, useEffect, useMemo } from 'react';

export type SessionMode = 'morning' | 'midday' | 'evening' | 'night';

const MODE_OVERRIDE_KEY = 'dp-session-mode-override';

function getTimeBasedMode(): SessionMode {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'midday';
  if (hour >= 16 && hour < 22) return 'evening';
  return 'night';
}

export function useSessionMode() {
  const [override, setOverride] = useState<SessionMode | null>(() => {
    const stored = localStorage.getItem(MODE_OVERRIDE_KEY);
    return stored as SessionMode | null;
  });

  const autoMode = useMemo(() => getTimeBasedMode(), []);
  const currentMode = override ?? autoMode;

  const setModeOverride = (mode: SessionMode | null) => {
    setOverride(mode);
    if (mode) {
      localStorage.setItem(MODE_OVERRIDE_KEY, mode);
    } else {
      localStorage.removeItem(MODE_OVERRIDE_KEY);
    }
  };

  return { currentMode, autoMode, override, setModeOverride };
}

// Session-start money snapshot for midday stabilization
const SESSION_START_KEY = 'dp-session-start-risk';

export interface SessionStartSnapshot {
  totalMoneyAtRisk: number;
  timestamp: string;
}

export function useSessionStartRisk(totalMoneyAtRisk: number, hasData: boolean) {
  const [startSnapshot, setStartSnapshot] = useState<SessionStartSnapshot | null>(null);

  useEffect(() => {
    if (!hasData) return;

    const existing = localStorage.getItem(SESSION_START_KEY);
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as SessionStartSnapshot;
        const age = Date.now() - new Date(parsed.timestamp).getTime();
        // Reset if older than 8 hours (new session)
        if (age < 8 * 60 * 60 * 1000) {
          setStartSnapshot(parsed);
          return;
        }
      } catch { /* ignore */ }
    }

    // Save new session start
    const snapshot: SessionStartSnapshot = {
      totalMoneyAtRisk,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_START_KEY, JSON.stringify(snapshot));
    setStartSnapshot(snapshot);
  }, [hasData]); // only on mount/data-ready, not on totalMoneyAtRisk changes

  return startSnapshot;
}
