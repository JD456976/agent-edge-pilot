import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

// ── Stable Panel IDs ──────────────────────────────────────────────────
export type PanelId =
  | 'autopilot'
  | 'prepared-actions'
  | 'money-at-risk'
  | 'opportunity-heat'
  | 'income-forecast'
  | 'stability-score'
  | 'end-of-day'
  | 'execution-queue'
  | 'income-volatility'
  | 'pipeline-fragility'
  | 'lead-decay'
  | 'operational-load'
  | 'deal-failure'
  | 'ghosting-risk'
  | 'referral-conversion'
  | 'listing-performance'
  | 'time-allocation'
  | 'opportunity-radar'
  | 'income-protection'
  | 'market-conditions'
  | 'learning-transparency'
  | 'network-benchmarks'
  | 'weekly-review'
  | 'agent-profile'
  | 'income-patterns'
  | 'market-signals';

export const DEFAULT_PANEL_ORDER: PanelId[] = [
  'autopilot',
  'prepared-actions',
  'execution-queue',
  'money-at-risk',
  'opportunity-heat',
  'income-forecast',
  'stability-score',
  'income-volatility',
  'pipeline-fragility',
  'lead-decay',
  'operational-load',
  'deal-failure',
  'ghosting-risk',
  'referral-conversion',
  'listing-performance',
  'time-allocation',
  'opportunity-radar',
  'income-protection',
  'market-conditions',
  'learning-transparency',
  'network-benchmarks',
  'agent-profile',
  'income-patterns',
  'market-signals',
  'weekly-review',
  'end-of-day',
];

export type PresetKey = 'default' | 'prospecting' | 'listing' | 'stability';

export const PRESETS: Record<PresetKey, { label: string; description: string; order: PanelId[] }> = {
  default: {
    label: 'Default',
    description: 'Balanced view for daily operations',
    order: DEFAULT_PANEL_ORDER,
  },
  prospecting: {
    label: 'Prospecting-heavy',
    description: 'Leads and opportunities first',
    order: [
      'opportunity-heat', 'opportunity-radar', 'lead-decay', 'referral-conversion',
      'autopilot', 'prepared-actions', 'execution-queue',
      'money-at-risk', 'income-forecast', 'stability-score',
      'income-volatility', 'pipeline-fragility', 'operational-load',
      'deal-failure', 'ghosting-risk', 'listing-performance',
      'time-allocation', 'income-protection', 'market-conditions',
      'learning-transparency', 'network-benchmarks', 'agent-profile',
      'income-patterns', 'market-signals', 'weekly-review', 'end-of-day',
    ],
  },
  listing: {
    label: 'Listing-heavy',
    description: 'Listings and deal management first',
    order: [
      'listing-performance', 'money-at-risk', 'income-protection', 'pipeline-fragility',
      'deal-failure', 'autopilot', 'prepared-actions', 'execution-queue',
      'opportunity-heat', 'income-forecast', 'stability-score',
      'income-volatility', 'lead-decay', 'operational-load',
      'ghosting-risk', 'referral-conversion', 'time-allocation',
      'opportunity-radar', 'market-conditions', 'learning-transparency',
      'network-benchmarks', 'agent-profile', 'income-patterns',
      'market-signals', 'weekly-review', 'end-of-day',
    ],
  },
  stability: {
    label: 'Stability-first',
    description: 'Risk management and income protection',
    order: [
      'stability-score', 'income-protection', 'money-at-risk',
      'deal-failure', 'ghosting-risk', 'operational-load',
      'income-volatility', 'pipeline-fragility',
      'autopilot', 'prepared-actions', 'execution-queue',
      'opportunity-heat', 'income-forecast', 'lead-decay',
      'referral-conversion', 'listing-performance',
      'time-allocation', 'opportunity-radar', 'market-conditions',
      'learning-transparency', 'network-benchmarks', 'agent-profile',
      'income-patterns', 'market-signals', 'weekly-review', 'end-of-day',
    ],
  },
};

// ── Storage / Validation ──────────────────────────────────────────────
const STORAGE_KEY = 'dp-panel-layout-v2';

interface PersistedLayout {
  panelOrder: PanelId[];
  updatedAt: string;
}

const ALL_PANEL_IDS = new Set<string>(DEFAULT_PANEL_ORDER);

function isValidPanelId(id: unknown): id is PanelId {
  return typeof id === 'string' && ALL_PANEL_IDS.has(id);
}

/** Ensure all panels are present, remove unknown, append missing */
function normalizeOrder(order: PanelId[]): PanelId[] {
  const seen = new Set<PanelId>();
  const filtered: PanelId[] = [];
  for (const id of order) {
    if (isValidPanelId(id) && !seen.has(id)) {
      seen.add(id);
      filtered.push(id);
    }
  }
  for (const id of DEFAULT_PANEL_ORDER) {
    if (!seen.has(id)) filtered.push(id);
  }
  return filtered;
}

function readLocalStorage(): PersistedLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.panelOrder)) {
      return { panelOrder: parsed.panelOrder, updatedAt: parsed.updatedAt || '' };
    }
  } catch {}
  return null;
}

function writeLocalStorage(layout: PersistedLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────
export function useCommandCenterLayout(userId?: string) {
  const [panelOrder, setPanelOrder] = useState<PanelId[]>(() => {
    const cached = readLocalStorage();
    return cached ? normalizeOrder(cached.panelOrder) : DEFAULT_PANEL_ORDER;
  });
  const [editMode, setEditMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Race-condition protection
  const hasHydrated = useRef(false);
  const lastLocalChangeAt = useRef<number>(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load from DB (once) ──────────────────────────────────────────
  useEffect(() => {
    if (!userId || hasHydrated.current) return;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('command_center_layout')
          .eq('user_id', userId)
          .maybeSingle();

        if (cancelled || hasHydrated.current) return;
        hasHydrated.current = true;

        if (data?.command_center_layout) {
          const dbLayout = data.command_center_layout as any;
          const dbOrder = Array.isArray(dbLayout?.panelOrder) ? dbLayout.panelOrder : (Array.isArray(dbLayout) ? dbLayout : null);
          const dbUpdatedAt = dbLayout?.updatedAt || '';

          if (dbOrder) {
            // Only apply DB data if user hasn't made local changes already
            if (lastLocalChangeAt.current === 0) {
              const local = readLocalStorage();
              const localIsNewer = local?.updatedAt && dbUpdatedAt && local.updatedAt > dbUpdatedAt;

              if (!localIsNewer) {
                const normalized = normalizeOrder(dbOrder);
                setPanelOrder(normalized);
                writeLocalStorage({ panelOrder: normalized, updatedAt: dbUpdatedAt });
              }
            }
          }
        }
      } catch {
        hasHydrated.current = true;
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // ── Debounced persist to DB ──────────────────────────────────────
  const persistOrder = useCallback((order: PanelId[]) => {
    const now = new Date().toISOString();
    lastLocalChangeAt.current = Date.now();
    writeLocalStorage({ panelOrder: order, updatedAt: now });

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!userId) return;
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            command_center_layout: { panelOrder: order, updatedAt: now } as any,
          } as any)
          .eq('user_id', userId);

        if (error) throw error;
      } catch {
        toast({ variant: 'destructive', description: 'Failed to save layout. Your changes are saved locally.', duration: 3000 });
      }
    }, 1200);
  }, [userId]);

  // ── Public actions ───────────────────────────────────────────────
  const reorder = useCallback((activeId: string, overId: string) => {
    setPanelOrder(prev => {
      const oldIndex = prev.indexOf(activeId as PanelId);
      const newIndex = prev.indexOf(overId as PanelId);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const next = [...prev];
      const [removed] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, removed);
      persistOrder(next);
      return next;
    });
  }, [persistOrder]);

  const applyPreset = useCallback((presetKey: PresetKey) => {
    const preset = PRESETS[presetKey];
    const normalized = normalizeOrder(preset.order);
    setPanelOrder(normalized);
    persistOrder(normalized);
  }, [persistOrder]);

  const resetToDefault = useCallback(() => {
    setPanelOrder(DEFAULT_PANEL_ORDER);
    persistOrder(DEFAULT_PANEL_ORDER);
  }, [persistOrder]);

  const toggleEditMode = useCallback(() => {
    setEditMode(prev => !prev);
  }, []);

  return {
    panelOrder,
    editMode,
    isDragging,
    setIsDragging,
    toggleEditMode,
    setEditMode,
    reorder,
    applyPreset,
    resetToDefault,
  };
}
