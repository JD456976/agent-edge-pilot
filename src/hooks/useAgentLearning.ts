import { useEffect, useCallback, useMemo } from 'react';
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
  type OutcomeType,
  type ActionCategory,
  type CalibrationWeights,
  type LearningSnapshot,
} from '@/lib/learningEngine';

/**
 * Hook that silently tracks agent outcomes, task completions, and behavioral
 * patterns to calibrate the learning engine. Exposes calibration weights
 * for use by Autopilot, Flight Plan, and Execution Queue.
 */
export function useAgentLearning(
  deals: Deal[],
  leads: Lead[],
  tasks: Task[],
) {
  // ── Auto-detect deal outcomes ──────────────────────────────────────
  // Track closed/failed deals by comparing stage changes via a ref
  useEffect(() => {
    // We detect newly closed or newly failed deals each time the list updates
    // by looking at the current state. The learning engine deduplicates via entityId.
    const outcomes = new Set<string>();
    try {
      const raw = localStorage.getItem('dp-learning-tracked-ids');
      if (raw) JSON.parse(raw).forEach((id: string) => outcomes.add(id));
    } catch { /* */ }

    let changed = false;
    for (const deal of deals) {
      if (outcomes.has(deal.id)) continue;
      if (deal.stage === 'closed') {
        recordOutcome({ id: `dc-${deal.id}`, type: 'deal_closed', entityId: deal.id, timestamp: new Date().toISOString() });
        outcomes.add(deal.id);
        changed = true;
      }
    }

    // Track leads that converted (have related deal)
    for (const lead of leads) {
      if (outcomes.has(lead.id)) continue;
      const hasRelatedDeal = deals.some(d => d.stage !== 'closed' && d.title?.toLowerCase().includes(lead.name?.toLowerCase()));
      if (lead.leadTemperature === 'hot' && hasRelatedDeal) {
        // Heuristic: hot lead with a matching deal title → likely converted
      }
    }

    if (changed) {
      try {
        localStorage.setItem('dp-learning-tracked-ids', JSON.stringify([...outcomes]));
      } catch { /* */ }
    }
  }, [deals, leads]);

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
  }, []);

  const trackTaskIgnored = useCallback((taskId: string) => {
    recordOutcome({
      id: `ti-${taskId}`,
      type: 'task_ignored',
      entityId: taskId,
      timestamp: new Date().toISOString(),
    });
  }, []);

  const trackTouchResponse = useCallback((entityId: string) => {
    recordOutcome({
      id: `tr-${entityId}-${Date.now()}`,
      type: 'touch_response',
      entityId,
      timestamp: new Date().toISOString(),
    });
  }, []);

  const trackPrediction = useCallback((
    type: 'failure' | 'ghosting' | 'conversion' | 'forecast',
    predicted: boolean,
    actual: boolean,
  ) => {
    recordPredictionOutcome(type, predicted, actual);
  }, []);

  const calibration = useMemo((): CalibrationWeights => getCalibration(), [deals, tasks]);

  const snapshot = useMemo((): LearningSnapshot => getLearningSnapshot(), [deals, tasks]);

  const resetLearning = useCallback(() => {
    resetLearningData();
  }, []);

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
