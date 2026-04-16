import { useEffect, useCallback, useMemo, useRef } from 'react';
import type { Deal, Lead, Task } from '@/types';
import {
  recordOutcome,
  recordActionResult,
  recordBehavior,
  updateWorkloadTolerance,
  recordPredictionOutcome,
  getCalibration,
  getLearningSnapshot,
  resetLearningData,
  OUTCOMES_KEY,
  ACTION_EFF_KEY,
  BEHAVIOR_KEY,
  CALIBRATION_KEY,
  type OutcomeType,
  type ActionCategory,
  type CalibrationWeights,
  type LearningSnapshot,
} from '@/lib/learningEngine';

/**
 * Hook that silently tracks agent outcomes, task completions, and behavioral
 * patterns to calibrate the learning engine. Exposes calibration weights
 * for use by Autopilot, Flight Plan, and Execution Queue.
 *
 * Persists to Supabase as write-through backup; localStorage is primary read source.
 */
export function useAgentLearning(
  deals: Deal[],
  leads: Lead[],
  tasks: Task[],
  userId?: string,
) {
  const flushTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Hydrate localStorage from Supabase on mount ────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      try {
        const { data: prefs } = await supabase
          .from('self_opt_preferences' as any)
          .select('calibration_weights, behavioral_pattern, action_effectiveness, outcomes')
          .eq('user_id', userId)
          .maybeSingle() as any;

        if (cancelled || !prefs) return;

        // Only hydrate if localStorage is empty — localStorage is always primary
        if (prefs.calibration_weights && Object.keys(prefs.calibration_weights).length > 0 && !localStorage.getItem(CALIBRATION_KEY)) {
          localStorage.setItem(CALIBRATION_KEY, JSON.stringify(prefs.calibration_weights));
        }
        if (prefs.behavioral_pattern && Object.keys(prefs.behavioral_pattern).length > 0 && !localStorage.getItem(BEHAVIOR_KEY)) {
          localStorage.setItem(BEHAVIOR_KEY, JSON.stringify(prefs.behavioral_pattern));
        }
        if (prefs.action_effectiveness && Array.isArray(prefs.action_effectiveness) && prefs.action_effectiveness.length > 0 && !localStorage.getItem(ACTION_EFF_KEY)) {
          localStorage.setItem(ACTION_EFF_KEY, JSON.stringify(prefs.action_effectiveness));
        }
        if (prefs.outcomes && Array.isArray(prefs.outcomes) && prefs.outcomes.length > 0 && !localStorage.getItem(OUTCOMES_KEY)) {
          localStorage.setItem(OUTCOMES_KEY, JSON.stringify(prefs.outcomes));
        }
      } catch {
        // Silent — never block the user
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // ── Debounced flush to Supabase ────────────────────────────────────
  const flushToSupabase = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(async () => {
      if (!userId) return;
      try {
        const calibration = JSON.parse(localStorage.getItem(CALIBRATION_KEY) || '{}');
        const behavior = JSON.parse(localStorage.getItem(BEHAVIOR_KEY) || '{}');
        const actionEff = JSON.parse(localStorage.getItem(ACTION_EFF_KEY) || '[]');
        const outcomes = JSON.parse(localStorage.getItem(OUTCOMES_KEY) || '[]');

        await supabase
          .from('self_opt_preferences' as any)
          .upsert({
            user_id: userId,
            calibration_weights: calibration,
            behavioral_pattern: behavior,
            action_effectiveness: actionEff,
            outcomes: outcomes,
            updated_at: new Date().toISOString(),
          } as any, { onConflict: 'user_id' });
      } catch {
        // Silent — never throw over learning sync
      }
    }, 5 * 60 * 1000); // 5 minutes debounce
  }, [userId]);

  // ── Flush on page unload ───────────────────────────────────────────
  useEffect(() => {
    const handleUnload = () => {
      if (!userId) return;
      try {
        const calibration = localStorage.getItem(CALIBRATION_KEY);
        const behavior = localStorage.getItem(BEHAVIOR_KEY);
        const actionEff = localStorage.getItem(ACTION_EFF_KEY);
        const outcomes = localStorage.getItem(OUTCOMES_KEY);

        if (calibration || behavior) {
          // Best-effort upsert — may not complete before tab closes
          supabase
            .from('self_opt_preferences' as any)
            .upsert({
              user_id: userId,
              calibration_weights: calibration ? JSON.parse(calibration) : {},
              behavioral_pattern: behavior ? JSON.parse(behavior) : {},
              action_effectiveness: actionEff ? JSON.parse(actionEff) : [],
              outcomes: outcomes ? JSON.parse(outcomes) : [],
              updated_at: new Date().toISOString(),
            } as any, { onConflict: 'user_id' })
            .then(() => {});
        }
      } catch {
        // Silent
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [userId]);

  // ── Auto-detect deal outcomes ──────────────────────────────────────
  useEffect(() => {
    const tracked = new Set<string>();
    try {
      const raw = localStorage.getItem('dp-learning-tracked-ids');
      if (raw) JSON.parse(raw).forEach((id: string) => tracked.add(id));
    } catch { /* */ }

    let changed = false;
    for (const deal of deals) {
      if (tracked.has(deal.id)) continue;
      if (deal.stage === 'closed') {
        recordOutcome({ id: `dc-${deal.id}`, type: 'deal_closed', entityId: deal.id, timestamp: new Date().toISOString() });
        tracked.add(deal.id);
        changed = true;
      }
    }

    for (const lead of leads) {
      if (tracked.has(lead.id)) continue;
      const hasRelatedDeal = deals.some(d => d.stage !== 'closed' && d.title?.toLowerCase().includes(lead.name?.toLowerCase()));
      if (lead.leadTemperature === 'hot' && hasRelatedDeal) {
        // Heuristic: hot lead with a matching deal title → likely converted
      }
    }

    if (changed) {
      try {
        localStorage.setItem('dp-learning-tracked-ids', JSON.stringify([...tracked]));
      } catch { /* */ }
      flushToSupabase();
    }
  }, [deals, leads, flushToSupabase]);

  // ── Auto-track daily workload tolerance ────────────────────────────
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const todayTasks = tasks.filter(t => {
      const due = new Date(t.dueAt);
      due.setHours(0, 0, 0, 0);
      return due.toISOString() === todayStr;
    });
    const completed = todayTasks.filter(t => t.completedAt).length;
    if (todayTasks.length > 0) {
      updateWorkloadTolerance(completed, todayTasks.length);
    }
  }, [tasks]);

  // ── Exposed Actions ────────────────────────────────────────────────

  const trackTaskCompletion = useCallback((taskType: string, hadEngagement = false, hadConversion = false) => {
    const hour = new Date().getHours();
    const cat = taskType as ActionCategory;
    recordBehavior(hour, cat);
    recordActionResult(cat, true, hadEngagement, hadConversion);
    recordOutcome({
      id: `tc-${Date.now()}`,
      type: 'task_completed',
      entityId: `task-${Date.now()}`,
      timestamp: new Date().toISOString(),
    });
    flushToSupabase();
  }, [flushToSupabase]);

  const trackTaskIgnored = useCallback((taskId: string) => {
    recordOutcome({
      id: `ti-${taskId}`,
      type: 'task_ignored',
      entityId: taskId,
      timestamp: new Date().toISOString(),
    });
    flushToSupabase();
  }, [flushToSupabase]);

  const trackTouchResponse = useCallback((entityId: string) => {
    recordOutcome({
      id: `tr-${entityId}-${Date.now()}`,
      type: 'touch_response',
      entityId,
      timestamp: new Date().toISOString(),
    });
    flushToSupabase();
  }, [flushToSupabase]);

  const trackPrediction = useCallback((
    type: 'failure' | 'ghosting' | 'conversion' | 'forecast',
    predicted: boolean,
    actual: boolean,
  ) => {
    recordPredictionOutcome(type, predicted, actual);
    flushToSupabase();
  }, [flushToSupabase]);

  const calibration = useMemo((): CalibrationWeights => getCalibration(), [deals, tasks]);

  const snapshot = useMemo((): LearningSnapshot => getLearningSnapshot(), [deals, tasks]);

  const resetLearning = useCallback(async () => {
    resetLearningData();
    // Also clear Supabase
    if (userId) {
      try {
        await supabase
          .from('self_opt_preferences' as any)
          .upsert({
            user_id: userId,
            calibration_weights: {},
            behavioral_pattern: {},
            action_effectiveness: [],
            outcomes: [],
            updated_at: new Date().toISOString(),
          } as any, { onConflict: 'user_id' });
      } catch {
        // Silent
      }
    }
  }, [userId]);

  return {
    calibration,
    snapshot,
    trackTaskCompletion,
    trackTaskIgnored,
    trackTouchResponse,
    trackPrediction,
    resetLearning,
  };
}
