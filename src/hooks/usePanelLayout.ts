import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  | 'weekly-review';

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
      'opportunity-heat',
      'opportunity-radar',
      'lead-decay',
      'referral-conversion',
      'autopilot',
      'execution-queue',
      'money-at-risk',
      'income-forecast',
      'stability-score',
      'income-volatility',
      'pipeline-fragility',
      'operational-load',
      'deal-failure',
      'ghosting-risk',
      'listing-performance',
      'time-allocation',
      'income-protection',
      'market-conditions',
      'learning-transparency',
      'network-benchmarks',
      'weekly-review',
      'end-of-day',
    ],
  },
  listing: {
    label: 'Listing-heavy',
    description: 'Listings and deal management first',
    order: [
      'listing-performance',
      'money-at-risk',
      'income-protection',
      'pipeline-fragility',
      'deal-failure',
      'autopilot',
      'execution-queue',
      'opportunity-heat',
      'income-forecast',
      'stability-score',
      'income-volatility',
      'lead-decay',
      'operational-load',
      'ghosting-risk',
      'referral-conversion',
      'time-allocation',
      'opportunity-radar',
      'market-conditions',
      'learning-transparency',
      'network-benchmarks',
      'weekly-review',
      'end-of-day',
    ],
  },
  stability: {
    label: 'Stability-first',
    description: 'Risk management and income protection',
    order: [
      'stability-score',
      'income-protection',
      'money-at-risk',
      'deal-failure',
      'ghosting-risk',
      'operational-load',
      'income-volatility',
      'pipeline-fragility',
      'autopilot',
      'execution-queue',
      'opportunity-heat',
      'income-forecast',
      'lead-decay',
      'referral-conversion',
      'listing-performance',
      'time-allocation',
      'opportunity-radar',
      'market-conditions',
      'learning-transparency',
      'network-benchmarks',
      'weekly-review',
      'end-of-day',
    ],
  },
};

const STORAGE_KEY = 'dp-panel-layout';

function isValidOrder(order: unknown): order is PanelId[] {
  if (!Array.isArray(order)) return false;
  const valid = new Set(DEFAULT_PANEL_ORDER);
  return order.every(id => valid.has(id as PanelId));
}

function normalizeOrder(order: PanelId[]): PanelId[] {
  // Ensure all panels present, remove unknown
  const valid = new Set(DEFAULT_PANEL_ORDER);
  const filtered = order.filter(id => valid.has(id));
  const missing = DEFAULT_PANEL_ORDER.filter(id => !filtered.includes(id));
  return [...filtered, ...missing];
}

export function usePanelLayout(userId?: string) {
  const [panelOrder, setPanelOrder] = useState<PanelId[]>(DEFAULT_PANEL_ORDER);
  const [loaded, setLoaded] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load: DB → localStorage → default
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Try localStorage first for fast load
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (isValidOrder(parsed)) {
            setPanelOrder(normalizeOrder(parsed));
          }
        }
      } catch {}

      // Then try DB
      if (userId) {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('command_center_layout')
            .eq('user_id', userId)
            .maybeSingle();

          if (!cancelled && data?.command_center_layout) {
            const dbOrder = (data as any).command_center_layout;
            if (isValidOrder(dbOrder)) {
              const normalized = normalizeOrder(dbOrder as PanelId[]);
              setPanelOrder(normalized);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
            }
          }
        } catch {}
      }

      if (!cancelled) setLoaded(true);
    }

    load();
    return () => { cancelled = true; };
  }, [userId]);

  // Save with debounce
  const persistOrder = useCallback((order: PanelId[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!userId) return;
      await supabase
        .from('profiles')
        .update({ command_center_layout: order as any } as any)
        .eq('user_id', userId);
    }, 1000);
  }, [userId]);

  const updateOrder = useCallback((newOrder: PanelId[]) => {
    const normalized = normalizeOrder(newOrder);
    setPanelOrder(normalized);
    persistOrder(normalized);
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

  return { panelOrder, updateOrder, applyPreset, resetToDefault, loaded };
}
