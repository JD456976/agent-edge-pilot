import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export type WorkspaceType = 'work' | 'sync' | 'insights' | 'settings' | 'openhouse' | 'calendar' | 'listingwriter' | 'commissioncoach';

const SESSION_STORAGE_KEY = 'dp-last-workspace';

interface WorkspaceState {
  activeWorkspace: WorkspaceType | null;
  openWorkspace: (type: WorkspaceType) => void;
  closeWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceState>({
  activeWorkspace: null,
  openWorkspace: () => {},
  closeWorkspace: () => {},
});

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramWorkspace = searchParams.get('workspace') as WorkspaceType | null;
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType | null>(() => {
    // Restore last workspace from session if no URL param
    if (paramWorkspace) return paramWorkspace;
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    const valid: WorkspaceType[] = ['work', 'sync', 'insights', 'settings', 'openhouse', 'calendar', 'listingwriter', 'commissioncoach'];
    if (stored && valid.includes(stored as WorkspaceType)) return stored as WorkspaceType;
    } catch {}
    return null;
  });

  // Sync from URL on mount / param change
  useEffect(() => {
    const valid: WorkspaceType[] = ['work', 'sync', 'insights', 'settings', 'openhouse', 'calendar', 'listingwriter', 'commissioncoach'];
    const param = searchParams.get('workspace') as WorkspaceType | null;
    if (param && valid.includes(param)) {
      setActiveWorkspace(param);
    } else if (!param) {
      setActiveWorkspace(null);
    }
  }, [searchParams]);

  const openWorkspace = useCallback((type: WorkspaceType) => {
    setActiveWorkspace(type);
    setSearchParams({ workspace: type }, { replace: true });
    try { sessionStorage.setItem(SESSION_STORAGE_KEY, type); } catch {}
  }, [setSearchParams]);

  const closeWorkspace = useCallback(() => {
    setActiveWorkspace(null);
    setSearchParams({}, { replace: true });
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch {}
  }, [setSearchParams]);

  return (
    <WorkspaceContext.Provider value={{ activeWorkspace, openWorkspace, closeWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
