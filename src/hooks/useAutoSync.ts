import { useState, useEffect, useCallback, useRef } from 'react';
import { callEdgeFunction } from '@/lib/edgeClient';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export interface SyncConflict {
  entity_type: 'lead' | 'deal';
  entity_id: string;
  fub_id: string;
  entity_name: string;
  differences: { field: string; fub_value: any; dp_value: any }[];
  fub_updated_at: string | null;
  dp_updated_at: string | null;
  newer: 'fub' | 'dp';
}

interface AutoSyncResult {
  auto_imported: { leads: number; deals: number; tasks_synced: number };
  conflicts: SyncConflict[];
  total_checked: { leads: number; deals: number; tasks: number };
}

const INTERVAL_KEY = 'dp_autosync_interval_minutes';
const DEFAULT_INTERVAL = 15;

// 0 = off
export const SYNC_INTERVAL_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: 'Every 5 min', value: 5 },
  { label: 'Every 15 min', value: 15 },
  { label: 'Every 30 min', value: 30 },
  { label: 'Every hour', value: 60 },
];

export function useAutoSync(onSyncComplete?: () => void) {
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [lastResult, setLastResult] = useState<AutoSyncResult | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [intervalMinutes, setIntervalMinutesState] = useState<number>(() => {
    const stored = localStorage.getItem(INTERVAL_KEY);
    const parsed = stored ? parseInt(stored, 10) : DEFAULT_INTERVAL;
    return isNaN(parsed) ? DEFAULT_INTERVAL : parsed;
  });

  const hasRunRef = useRef(false);
  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const result = await callEdgeFunction<AutoSyncResult | { skipped: boolean }>(
        'fub-auto-sync', {}, { timeoutMs: 25000 }
      );

      if ('skipped' in result) return;

      const syncResult = result as AutoSyncResult;
      setLastResult(syncResult);
      setLastSyncedAt(new Date());

      const imported = syncResult.auto_imported;
      const totalImported = (imported.leads || 0) + (imported.deals || 0);
      const conflictCount = syncResult.conflicts.length;

      if (totalImported > 0 || conflictCount > 0) {
        const parts: string[] = [];
        if (totalImported > 0) parts.push(`${totalImported} item${totalImported !== 1 ? 's' : ''} synced from FUB`);
        if (conflictCount > 0) parts.push(`${conflictCount} item${conflictCount !== 1 ? 's' : ''} need your attention`);
        toast({ description: parts.join(' · ') });
      } else if (!silent) {
        toast({ description: 'Everything is up to date' });
      }

      if (syncResult.conflicts.length > 0) {
        setConflicts(syncResult.conflicts);
      }

      // Auto-wipe demo data on successful FUB sync so real data takes over
      if (localStorage.getItem('dealPilot_demoSeeded')) {
        ['dealPilot_appointments','dealPilot_activityLog','dealPilot_deals',
         'dealPilot_enrollments','dealPilot_demoSeeded'].forEach(k => localStorage.removeItem(k));
      }

      onSyncCompleteRef.current?.();
    } catch (err: any) {
      if (!silent) {
        toast({ description: 'Sync failed — will retry', variant: 'destructive' });
      }
    } finally {
      setSyncing(false);
    }
  }, []);

  // Run once on launch (after a short settle delay)
  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    const timer = setTimeout(() => { runSync(true); }, 3000);
    return () => clearTimeout(timer);
  }, [runSync]);

  // Periodic polling — reset whenever intervalMinutes changes
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (intervalMinutes > 0) {
      intervalRef.current = setInterval(() => {
        runSync(true);
      }, intervalMinutes * 60 * 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [intervalMinutes, runSync]);

  const setIntervalMinutes = useCallback((minutes: number) => {
    localStorage.setItem(INTERVAL_KEY, String(minutes));
    setIntervalMinutesState(minutes);
  }, []);

  const resolveConflict = useCallback(async (
    conflict: SyncConflict,
    choice: 'keep_fub' | 'keep_dp'
  ) => {
    if (choice === 'keep_fub') {
      const updates: Record<string, any> = {};
      for (const diff of conflict.differences) {
        if (diff.field === 'new_in_fub') continue;
        updates[diff.field] = diff.fub_value;
      }
      updates.imported_from = `fub:${conflict.fub_id}`;
      if (conflict.entity_type === 'lead') {
        await supabase.from('leads').update(updates).eq('id', conflict.entity_id);
      } else {
        await supabase.from('deals').update(updates).eq('id', conflict.entity_id);
      }
    }
    setConflicts(prev => prev.filter(
      c => !(c.entity_id === conflict.entity_id && c.fub_id === conflict.fub_id)
    ));
    toast({ description: `${conflict.entity_name}: kept ${choice === 'keep_fub' ? 'FUB' : 'Deal Pilot'} version` });
    onSyncCompleteRef.current?.();
  }, []);

  const dismissConflict = useCallback((conflict: SyncConflict) => {
    setConflicts(prev => prev.filter(
      c => !(c.entity_id === conflict.entity_id && c.fub_id === conflict.fub_id)
    ));
  }, []);

  return {
    syncing,
    conflicts,
    lastResult,
    lastSyncedAt,
    intervalMinutes,
    setIntervalMinutes,
    runSync,
    resolveConflict,
    dismissConflict,
  };
}
