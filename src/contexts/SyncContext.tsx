import { createContext, useContext, type ReactNode } from 'react';
import { useAutoSync, type SyncConflict } from '@/hooks/useAutoSync';

interface SyncContextValue {
  syncing: boolean;
  conflicts: SyncConflict[];
  lastResult: ReturnType<typeof useAutoSync>['lastResult'];
  lastSyncedAt: Date | null;
  intervalMinutes: number;
  setIntervalMinutes: (m: number) => void;
  runSync: (silent?: boolean) => Promise<void>;
  resolveConflict: (conflict: SyncConflict, choice: 'keep_fub' | 'keep_dp') => Promise<void>;
  dismissConflict: (conflict: SyncConflict) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children, onSyncComplete }: { children: ReactNode; onSyncComplete?: () => void }) {
  const sync = useAutoSync(onSyncComplete);

  return (
    <SyncContext.Provider value={sync}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be used within SyncProvider');
  return ctx;
}
