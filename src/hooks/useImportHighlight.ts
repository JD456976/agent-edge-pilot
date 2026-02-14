import { useState, useEffect, useCallback } from 'react';

const IMPORT_HIGHLIGHT_KEY = 'dp-import-highlight';

interface ImportHighlight {
  timestamp: string;
  sessionId: string;
}

function getSessionId(): string {
  const key = 'dp-session-id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function markImportCompleted() {
  const highlight: ImportHighlight = {
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
  };
  localStorage.setItem(IMPORT_HIGHLIGHT_KEY, JSON.stringify(highlight));
}

export function useImportHighlight() {
  const [showBadge, setShowBadge] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(IMPORT_HIGHLIGHT_KEY);
    if (!raw) return;

    try {
      const highlight: ImportHighlight = JSON.parse(raw);
      const importTime = new Date(highlight.timestamp).getTime();
      const now = Date.now();
      const hoursSince = (now - importTime) / (1000 * 60 * 60);

      // Fade after session change or 24 hours
      if (hoursSince >= 24 || highlight.sessionId !== getSessionId()) {
        localStorage.removeItem(IMPORT_HIGHLIGHT_KEY);
        return;
      }

      setShowBadge(true);

      // Auto-clear after remaining time
      const remainingMs = (24 * 60 * 60 * 1000) - (now - importTime);
      const timer = setTimeout(() => {
        setShowBadge(false);
        localStorage.removeItem(IMPORT_HIGHLIGHT_KEY);
      }, remainingMs);

      return () => clearTimeout(timer);
    } catch {
      localStorage.removeItem(IMPORT_HIGHLIGHT_KEY);
    }
  }, []);

  return showBadge;
}
