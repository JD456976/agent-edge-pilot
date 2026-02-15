import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export type WorkspaceType = 'pipeline' | 'tasks' | 'settings' | 'admin';

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
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType | null>(paramWorkspace);

  // Sync from URL on mount / param change
  useEffect(() => {
    const valid: WorkspaceType[] = ['pipeline', 'tasks', 'settings', 'admin'];
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
  }, [setSearchParams]);

  const closeWorkspace = useCallback(() => {
    setActiveWorkspace(null);
    setSearchParams({}, { replace: true });
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
