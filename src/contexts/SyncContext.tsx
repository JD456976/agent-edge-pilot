import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAutoSync, type SyncConflict } from '@/hooks/useAutoSync';

export interface SyncContextValue {
  lastSyncedAt: Date | null;
  isSyncing: boolean;
  conflicts: SyncConflict[];
  intervalMinutes: number;
  setIntervalMinutes: (m: number) => void;
  syncNow: (silent?: boolean) => Promise<void>;
  resolveConflict: (conflict: SyncConflict, choice: 'keep_fub' | 'keep_dp') => Promise<void>;
  dismissConflict: (conflict: SyncConflict) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children, onSyncComplete }: { children: ReactNode; onSyncComplete?: () => void }) {
  const sync = useAutoSync(onSyncComplete);

  const value = useMemo<SyncContextValue>(() => ({
    lastSyncedAt: sync.lastSyncedAt,
    isSyncing: sync.syncing,
    conflicts: sync.conflicts,
    intervalMinutes: sync.intervalMinutes,
    setIntervalMinutes: sync.setIntervalMinutes,
    syncNow: sync.runSync,
    resolveConflict: sync.resolveConflict,
    dismissConflict: sync.dismissConflict,
  }), [sync.lastSyncedAt, sync.syncing, sync.conflicts, sync.intervalMinutes, sync.setIntervalMinutes, sync.runSync, sync.resolveConflict, sync.dismissConflict]);

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be used within SyncProvider');
  return ctx;
}
