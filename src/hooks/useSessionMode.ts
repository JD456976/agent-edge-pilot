import { useState, useEffect, useMemo } from 'react';

export type SessionMode = 'morning' | 'midday' | 'evening' | 'night';

const MODE_OVERRIDE_KEY = 'dp-session-mode-override';
const MODE_OVERRIDE_TS_KEY = 'dp-session-mode-override-ts';
const OVERRIDE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours — overrides expire automatically

function getTimeBasedMode(): SessionMode {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function readStoredOverride(): SessionMode | null {
  try {
    const stored = localStorage.getItem(MODE_OVERRIDE_KEY);
    const ts = localStorage.getItem(MODE_OVERRIDE_TS_KEY);
    if (!stored) return null;
    // Expire stale overrides
    if (ts && Date.now() - Number(ts) > OVERRIDE_TTL_MS) {
      localStorage.removeItem(MODE_OVERRIDE_KEY);
      localStorage.removeItem(MODE_OVERRIDE_TS_KEY);
      return null;
    }
    return stored as SessionMode;
  } catch {
    return null;
  }
}

export function useSessionMode() {
  const [override, setOverride] = useState<SessionMode | null>(() => readStoredOverride());

  const autoMode = useMemo(() => getTimeBasedMode(), []);
  const currentMode = override ?? autoMode;

  const setModeOverride = (mode: SessionMode | null) => {
    setOverride(mode);
    if (mode) {
      localStorage.setItem(MODE_OVERRIDE_KEY, mode);
      localStorage.setItem(MODE_OVERRIDE_TS_KEY, String(Date.now()));
    } else {
      localStorage.removeItem(MODE_OVERRIDE_KEY);
      localStorage.removeItem(MODE_OVERRIDE_TS_KEY);
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
