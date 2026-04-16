import { useState, useEffect, useCallback, useRef } from 'react';
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

export interface PresetConfig {
  label: string;
  description: string;
  order: PanelId[];
  hiddenPanels: PanelId[];
}

export const PRESETS: Record<PresetKey, PresetConfig> = {
  default: {
    label: 'Default',
    description: 'Balanced view for daily operations',
    order: DEFAULT_PANEL_ORDER,
    hiddenPanels: [],
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
    hiddenPanels: ['income-volatility', 'pipeline-fragility', 'listing-performance', 'learning-transparency', 'network-benchmarks', 'agent-profile', 'income-patterns', 'market-signals', 'weekly-review', 'end-of-day'],
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
    hiddenPanels: ['opportunity-radar', 'referral-conversion', 'learning-transparency', 'network-benchmarks', 'agent-profile', 'income-patterns', 'market-signals', 'weekly-review', 'end-of-day'],
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
    hiddenPanels: ['opportunity-radar', 'referral-conversion', 'listing-performance', 'learning-transparency', 'network-benchmarks', 'agent-profile', 'income-patterns', 'market-signals', 'weekly-review', 'end-of-day'],
  },
};

// ── Panel Labels (shared) ─────────────────────────────────────────────
export const PANEL_LABELS: Record<PanelId, string> = {
  'autopilot': 'Autopilot',
  'prepared-actions': 'Prepared Actions',
  'money-at-risk': 'Income at Risk',
  'opportunity-heat': 'Hot Lead Radar',
  'income-forecast': 'Income Forecast',
  'stability-score': 'Business Health',
  'end-of-day': 'End of Day Review',
  'execution-queue': 'Priority Queue',
  'income-volatility': 'Income Consistency',
  'pipeline-fragility': 'Deal Health',
  'lead-decay': 'Lead Follow-Up Gaps',
  'operational-load': 'Workload Check',
  'deal-failure': 'At-Risk Deals',
  'ghosting-risk': 'Going Silent',
  'referral-conversion': 'Referral Tracker',
  'listing-performance': 'Listing Tracker',
  'time-allocation': 'Time Planner',
  'opportunity-radar': 'Opportunity Finder',
  'income-protection': 'Income Shield',
  'market-conditions': 'Market Pulse',
  'learning-transparency': 'How It Works',
  'network-benchmarks': 'Peer Comparison',
  'weekly-review': 'Weekly Review',
  'agent-profile': 'My Profile',
  'income-patterns': 'Income Trends',
  'market-signals': 'Market Signals',
};

// ── Storage / Validation ──────────────────────────────────────────────
const STORAGE_KEY = 'dp-panel-layout-v2';

interface PersistedLayout {
  panelOrder: PanelId[];
  hiddenPanels: PanelId[];
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

function normalizeHidden(hidden: unknown[]): PanelId[] {
  return (hidden as string[]).filter(id => isValidPanelId(id)) as PanelId[];
}

function readLocalStorage(): PersistedLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.panelOrder)) {
      return {
        panelOrder: parsed.panelOrder,
        hiddenPanels: Array.isArray(parsed.hiddenPanels) ? parsed.hiddenPanels : [],
        updatedAt: parsed.updatedAt || '',
      };
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
  const [hiddenPanels, setHiddenPanels] = useState<Set<PanelId>>(() => {
    const cached = readLocalStorage();
    return cached ? new Set(normalizeHidden(cached.hiddenPanels)) : new Set<PanelId>();
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
          const dbHidden = Array.isArray(dbLayout?.hiddenPanels) ? dbLayout.hiddenPanels : [];
          const dbUpdatedAt = dbLayout?.updatedAt || '';

          if (dbOrder) {
            if (lastLocalChangeAt.current === 0) {
              const local = readLocalStorage();
              const localIsNewer = local?.updatedAt && dbUpdatedAt && local.updatedAt > dbUpdatedAt;

              if (!localIsNewer) {
                const normalized = normalizeOrder(dbOrder);
                const normalizedHidden = normalizeHidden(dbHidden);
                setPanelOrder(normalized);
                setHiddenPanels(new Set(normalizedHidden));
                writeLocalStorage({ panelOrder: normalized, hiddenPanels: normalizedHidden, updatedAt: dbUpdatedAt });
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
  const persistLayout = useCallback((order: PanelId[], hidden: PanelId[]) => {
    const now = new Date().toISOString();
    lastLocalChangeAt.current = Date.now();
    writeLocalStorage({ panelOrder: order, hiddenPanels: hidden, updatedAt: now });

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!userId) return;
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            command_center_layout: { panelOrder: order, hiddenPanels: hidden, updatedAt: now } as any,
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
      setHiddenPanels(currentHidden => {
        persistLayout(next, Array.from(currentHidden));
        return currentHidden;
      });
      return next;
    });
  }, [persistLayout]);

  const togglePanelVisibility = useCallback((panelId: PanelId) => {
    setHiddenPanels(prev => {
      const next = new Set(prev);
      if (next.has(panelId)) {
        next.delete(panelId);
      } else {
        next.add(panelId);
      }
      setPanelOrder(currentOrder => {
        persistLayout(currentOrder, Array.from(next));
        return currentOrder;
      });
      return next;
    });
  }, [persistLayout]);

  const applyPreset = useCallback((presetKey: PresetKey) => {
    const preset = PRESETS[presetKey];
    const normalized = normalizeOrder(preset.order);
    const hidden = normalizeHidden(preset.hiddenPanels);
    setPanelOrder(normalized);
    setHiddenPanels(new Set(hidden));
    persistLayout(normalized, hidden);
  }, [persistLayout]);

  const resetToDefault = useCallback(() => {
    setPanelOrder(DEFAULT_PANEL_ORDER);
    setHiddenPanels(new Set());
    persistLayout(DEFAULT_PANEL_ORDER, []);
  }, [persistLayout]);

  const showAllPanels = useCallback(() => {
    setHiddenPanels(new Set());
    setPanelOrder(currentOrder => {
      persistLayout(currentOrder, []);
      return currentOrder;
    });
  }, [persistLayout]);

  const toggleEditMode = useCallback(() => {
    setEditMode(prev => !prev);
  }, []);

  const isPanelHidden = useCallback((panelId: PanelId) => hiddenPanels.has(panelId), [hiddenPanels]);

  const visibleCount = panelOrder.filter(id => !hiddenPanels.has(id)).length;

  return {
    panelOrder,
    hiddenPanels,
    editMode,
    isDragging,
    setIsDragging,
    toggleEditMode,
    setEditMode,
    reorder,
    togglePanelVisibility,
    isPanelHidden,
    applyPreset,
    resetToDefault,
    showAllPanels,
    visibleCount,
    totalCount: DEFAULT_PANEL_ORDER.length,
  };
}
