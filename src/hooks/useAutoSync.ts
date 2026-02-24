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
  auto_imported: { leads: number; deals: number };
  conflicts: SyncConflict[];
  total_checked: { leads: number; deals: number };
}

export function useAutoSync(onSyncComplete?: () => void) {
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [lastResult, setLastResult] = useState<AutoSyncResult | null>(null);
  const hasRunRef = useRef(false);
  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;

  const runSync = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const result = await callEdgeFunction<AutoSyncResult | { skipped: boolean }>('fub-auto-sync', {}, { timeoutMs: 25000 });

      if ('skipped' in result) {
        setSyncing(false);
        return;
      }

      const syncResult = result as AutoSyncResult;
      setLastResult(syncResult);

      const imported = syncResult.auto_imported;
      const totalImported = imported.leads + imported.deals;
      const conflictCount = syncResult.conflicts.length;

      if (totalImported > 0 || conflictCount > 0) {
        const parts: string[] = [];
        if (totalImported > 0) parts.push(`${totalImported} item${totalImported > 1 ? 's' : ''} synced`);
        if (conflictCount > 0) parts.push(`${conflictCount} conflict${conflictCount > 1 ? 's' : ''} to review`);
        toast({ description: parts.join(' · ') });
      } else if (!silent) {
        toast({ description: 'Everything is in sync' });
      }

      if (syncResult.conflicts.length > 0) {
        setConflicts(syncResult.conflicts);
      }

      // Refresh local data so UI reflects imported/updated records
      onSyncCompleteRef.current?.();
    } catch (err: any) {
      if (!silent) {
        toast({ description: 'Sync failed — will retry next launch', variant: 'destructive' });
      }
    } finally {
      setSyncing(false);
    }
  }, []);

  // Auto-sync on launch (once)
  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    // Small delay to let the app settle
    const timer = setTimeout(() => {
      runSync(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [runSync]);

  const resolveConflict = useCallback(async (
    conflict: SyncConflict,
    choice: 'keep_fub' | 'keep_dp'
  ) => {
    if (choice === 'keep_fub') {
      // Update local record with FUB values
      const updates: Record<string, any> = {};
      for (const diff of conflict.differences) {
        if (diff.field === 'new_in_fub') continue;
        updates[diff.field] = diff.fub_value;
      }

      // Link to FUB if not already linked
      updates.imported_from = `fub:${conflict.fub_id}`;

      if (conflict.entity_type === 'lead') {
        await supabase.from('leads').update(updates).eq('id', conflict.entity_id);
      } else {
        await supabase.from('deals').update(updates).eq('id', conflict.entity_id);
      }
    }
    // If keep_dp, no action needed — local data is already correct

    // Remove from conflicts list
    setConflicts(prev => prev.filter(c => !(c.entity_id === conflict.entity_id && c.fub_id === conflict.fub_id)));
    toast({ description: `${conflict.entity_name}: kept ${choice === 'keep_fub' ? 'FUB' : 'Deal Pilot'} version` });
    // Refresh local data to reflect resolution
    onSyncCompleteRef.current?.();
  }, []);

  const dismissConflict = useCallback((conflict: SyncConflict) => {
    setConflicts(prev => prev.filter(c => !(c.entity_id === conflict.entity_id && c.fub_id === conflict.fub_id)));
  }, []);

  return {
    syncing,
    conflicts,
    lastResult,
    runSync,
    resolveConflict,
    dismissConflict,
  };
}
