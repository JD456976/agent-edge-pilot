import { createContext, useContext, type ReactNode } from 'react';
import { useAutoSync, type SyncConflict } from '@/hooks/useAutoSync';
import { SYNC_INTERVAL_OPTIONS } from '@/hooks/useAutoSync';

interface AutoSyncContextValue {
  syncing: boolean;
  conflicts: SyncConflict[];
  lastResult: ReturnType<typeof useAutoSync>['lastResult'];
  lastSyncedAt: Date | null;
  intervalMinutes: number;
  setIntervalMinutes: (m: number) => void;
  runSync: (silent?: boolean) => Promise<void>;
  resolveConflict: ReturnType<typeof useAutoSync>['resolveConflict'];
  dismissConflict: ReturnType<typeof useAutoSync>['dismissConflict'];
}

const AutoSyncContext = createContext<AutoSyncContextValue | null>(null);

export function AutoSyncProvider({ onSyncComplete, children }: { onSyncComplete?: () => void; children: ReactNode }) {
  const value = useAutoSync(onSyncComplete);
  return <AutoSyncContext.Provider value={value}>{children}</AutoSyncContext.Provider>;
}

export function useAutoSyncContext() {
  const ctx = useContext(AutoSyncContext);
  if (!ctx) throw new Error('useAutoSyncContext must be used within AutoSyncProvider');
  return ctx;
}

export { SYNC_INTERVAL_OPTIONS };
