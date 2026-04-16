import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  computeSelfOptAnalysis,
  computeOptimizedDefaults,
  exportLearningSummary,
  type SelfOptPreferences,
  type SelfOptAnalysis,
  type ActionOutcomeRecord,
  type OptimizedDefaults,
} from '@/lib/selfOptimizingEngine';

const DEFAULT_PREFS: SelfOptPreferences = {
  enabled: false,
  nudge_level: 'balanced',
  coaching_tone: 'professional',
  allow_time_of_day_optimization: true,
  allow_channel_optimization: true,
  allow_priority_reweighting: true,
};

export function useSelfOptimizing(userId?: string) {
  const [prefs, setPrefs] = useState<SelfOptPreferences>(DEFAULT_PREFS);
  const [outcomes, setOutcomes] = useState<ActionOutcomeRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load preferences and outcomes
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function load() {
      try {
        // Load preferences
        const { data: prefData } = await supabase
          .from('self_opt_preferences' as any)
          .select('*')
          .eq('user_id', userId)
          .maybeSingle() as any;

        if (!cancelled && prefData) {
          setPrefs({
            enabled: prefData.enabled ?? false,
            nudge_level: prefData.nudge_level ?? 'balanced',
            coaching_tone: prefData.coaching_tone ?? 'professional',
            allow_time_of_day_optimization: prefData.allow_time_of_day_optimization ?? true,
            allow_channel_optimization: prefData.allow_channel_optimization ?? true,
            allow_priority_reweighting: prefData.allow_priority_reweighting ?? true,
          });
        }

        // Load recent outcomes (last 500)
        const { data: outcomeData } = await supabase
          .from('self_opt_action_outcomes' as any)
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(500) as any;

        if (!cancelled && outcomeData) {
          setOutcomes(outcomeData);
        }
      } catch {
        // Tables may not exist yet — fail silently, use defaults
      }
      if (!cancelled) setLoaded(true);
    }

    load();
    return () => { cancelled = true; };
  }, [userId]);

  // Compute analysis
  const analysis = useMemo((): SelfOptAnalysis => {
    return computeSelfOptAnalysis(outcomes, prefs);
  }, [outcomes, prefs]);

  // Update preferences
  const updatePrefs = useCallback(async (updates: Partial<SelfOptPreferences>) => {
    if (!userId) return;
    const newPrefs = { ...prefs, ...updates };
    setPrefs(newPrefs);

    try {
      await supabase
        .from('self_opt_preferences' as any)
        .upsert({
          user_id: userId,
          ...newPrefs,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });
    } catch { /* table may not exist */ }
  }, [userId, prefs]);

  // Record an action outcome
  const recordOutcome = useCallback(async (outcome: Omit<ActionOutcomeRecord, 'id' | 'created_at'>) => {
    if (!userId || !prefs.enabled) return;

    try {
      const { data } = await supabase
        .from('self_opt_action_outcomes' as any)
        .insert({ user_id: userId, ...outcome } as any)
        .select().single() as any;
      if (data) setOutcomes(prev => [data, ...prev].slice(0, 500));
    } catch { /* table may not exist */ }
  }, [userId, prefs.enabled]);

  // Record daily behavior signal
  const recordDailySignal = useCallback(async (signal: {
    touches_count: number;
    calls_count: number;
    texts_count: number;
    emails_count: number;
    overdue_tasks_count: number;
    money_at_risk_band?: string;
    stability_band?: string;
    eod_completed: boolean;
  }) => {
    if (!userId || !prefs.enabled) return;

    const today = new Date().toISOString().split('T')[0];

    try {
      await supabase
        .from('self_opt_behavior_signals' as any)
        .upsert({ user_id: userId, date: today, ...signal } as any, { onConflict: 'user_id,date' });
    } catch { /* table may not exist */ }
  }, [userId, prefs.enabled]);

  // Get optimized defaults for a context
  const getOptimizedDefaults = useCallback((entityType: 'deal' | 'lead'): OptimizedDefaults => {
    return computeOptimizedDefaults(prefs, analysis.bestChannelsByContext, entityType);
  }, [prefs, analysis.bestChannelsByContext]);

  // Reset learning data
  const resetLearning = useCallback(async () => {
    if (!userId) return;

    try {
      await supabase.from('self_opt_action_outcomes' as any).delete().eq('user_id', userId);
      await supabase.from('self_opt_behavior_signals' as any).delete().eq('user_id', userId);
    } catch { /* table may not exist */ }
    setOutcomes([]);
  }, [userId]);

  // Export summary
  const exportSummary = useCallback((): string => {
    return exportLearningSummary(analysis);
  }, [analysis]);

  return {
    prefs,
    analysis,
    loaded,
    updatePrefs,
    recordOutcome,
    recordDailySignal,
    getOptimizedDefaults,
    resetLearning,
    exportSummary,
  };
}
