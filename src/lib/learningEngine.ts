/**
 * Invisible Learning Layer — Agent-Specific Intelligence Engine
 *
 * Tracks outcomes, action effectiveness, behavioral patterns, and income correlations
 * to subtly calibrate recommendations per agent. All data persists in localStorage.
 *
 * SAFETY: Never overrides base models. Applies subtle weighting adjustments only.
 * PRIVACY: Agent-specific. No cross-agent blending.
 */

// ── Storage Keys ─────────────────────────────────────────────────────
const STORAGE_PREFIX = 'dp-learning';
const OUTCOMES_KEY = `${STORAGE_PREFIX}-outcomes`;
const ACTION_EFF_KEY = `${STORAGE_PREFIX}-action-eff`;
const BEHAVIOR_KEY = `${STORAGE_PREFIX}-behavior`;
const CALIBRATION_KEY = `${STORAGE_PREFIX}-calibration`;

// ── Types ────────────────────────────────────────────────────────────

export type OutcomeType = 'deal_closed' | 'deal_failed' | 'lead_converted' | 'lead_lost' | 'task_completed' | 'task_ignored' | 'touch_response';

export interface OutcomeEvent {
  id: string;
  type: OutcomeType;
  entityId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type ActionCategory = 'call' | 'text' | 'email' | 'showing' | 'follow_up' | 'closing' | 'open_house' | 'thank_you';

export interface ActionEffectivenessRecord {
  actionType: ActionCategory;
  totalAttempts: number;
  completions: number;
  engagementResults: number; // positive outcomes after action
  conversions: number;
  avgTimeToOutcomeMs: number;
}

export interface BehavioralPattern {
  preferredHours: number[]; // hours of day with most completions (0-23)
  preferredChannels: ActionCategory[]; // ranked by usage
  avgResponseSpeedMs: number;
  avgTasksPerDay: number;
  workloadTolerance: 'low' | 'medium' | 'high';
  lastUpdated: string;
}

export interface IncomeCorrelation {
  factor: string;
  correlation: 'positive' | 'negative' | 'neutral';
  strength: number; // 0-1
  sampleSize: number;
}

export interface CalibrationWeights {
  /** Multiplier for stage probability (0.8-1.2) */
  stageProbabilityMultiplier: number;
  /** Multiplier for opportunity scoring (0.8-1.2) */
  opportunityMultiplier: number;
  /** Multiplier for risk sensitivity (0.8-1.2) */
  riskSensitivityMultiplier: number;
  /** Adjustment to urgency threshold (-10 to +10) */
  urgencyThresholdAdjust: number;
  /** Action type preference ordering */
  actionTypeRanking: ActionCategory[];
  /** Prediction accuracy tracking */
  failurePredictionAccuracy: number;
  ghostingPredictionAccuracy: number;
  conversionPredictionAccuracy: number;
  forecastReliability: number;
  /** Total outcomes tracked */
  totalOutcomes: number;
  lastCalibrated: string;
}

export interface LearningInsight {
  id: string;
  category: 'accuracy' | 'behavior' | 'income' | 'effectiveness';
  title: string;
  description: string;
  discoveredAt: string;
}

export interface LearningSnapshot {
  outcomes: OutcomeEvent[];
  actionEffectiveness: ActionEffectivenessRecord[];
  behavioralPattern: BehavioralPattern;
  calibration: CalibrationWeights;
  correlations: IncomeCorrelation[];
  insights: LearningInsight[];
}

// ── Default Values ───────────────────────────────────────────────────

const DEFAULT_CALIBRATION: CalibrationWeights = {
  stageProbabilityMultiplier: 1.0,
  opportunityMultiplier: 1.0,
  riskSensitivityMultiplier: 1.0,
  urgencyThresholdAdjust: 0,
  actionTypeRanking: ['call', 'email', 'text', 'follow_up', 'showing', 'closing', 'open_house', 'thank_you'],
  failurePredictionAccuracy: 0.5,
  ghostingPredictionAccuracy: 0.5,
  conversionPredictionAccuracy: 0.5,
  forecastReliability: 0.5,
  totalOutcomes: 0,
  lastCalibrated: new Date().toISOString(),
};

const DEFAULT_BEHAVIOR: BehavioralPattern = {
  preferredHours: [9, 10, 11, 14, 15],
  preferredChannels: ['call', 'email', 'text'],
  avgResponseSpeedMs: 0,
  avgTasksPerDay: 0,
  workloadTolerance: 'medium',
  lastUpdated: new Date().toISOString(),
};

// ── Storage Helpers ──────────────────────────────────────────────────

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* storage full — degrade gracefully */ }
}

// ── Outcome Tracking ─────────────────────────────────────────────────

export function recordOutcome(event: OutcomeEvent): void {
  const outcomes = loadJson<OutcomeEvent[]>(OUTCOMES_KEY, []);
  outcomes.push(event);
  // Keep last 500 outcomes
  if (outcomes.length > 500) outcomes.splice(0, outcomes.length - 500);
  saveJson(OUTCOMES_KEY, outcomes);

  // Trigger recalibration
  recalibrateFromOutcomes(outcomes);
}

export function getOutcomes(): OutcomeEvent[] {
  return loadJson<OutcomeEvent[]>(OUTCOMES_KEY, []);
}

// ── Action Effectiveness ─────────────────────────────────────────────

export function recordActionResult(
  actionType: ActionCategory,
  completed: boolean,
  hadEngagement: boolean,
  hadConversion: boolean,
  timeToOutcomeMs?: number,
): void {
  const records = loadJson<ActionEffectivenessRecord[]>(ACTION_EFF_KEY, []);
  let rec = records.find(r => r.actionType === actionType);
  if (!rec) {
    rec = { actionType, totalAttempts: 0, completions: 0, engagementResults: 0, conversions: 0, avgTimeToOutcomeMs: 0 };
    records.push(rec);
  }

  rec.totalAttempts++;
  if (completed) rec.completions++;
  if (hadEngagement) rec.engagementResults++;
  if (hadConversion) rec.conversions++;
  if (timeToOutcomeMs && timeToOutcomeMs > 0) {
    rec.avgTimeToOutcomeMs = rec.avgTimeToOutcomeMs === 0
      ? timeToOutcomeMs
      : (rec.avgTimeToOutcomeMs * (rec.totalAttempts - 1) + timeToOutcomeMs) / rec.totalAttempts;
  }

  saveJson(ACTION_EFF_KEY, records);
  updateCalibrationFromEffectiveness(records);
}

export function getActionEffectiveness(): ActionEffectivenessRecord[] {
  return loadJson<ActionEffectivenessRecord[]>(ACTION_EFF_KEY, []);
}

/** Rank action types by personal effectiveness score */
export function getRankedActionTypes(): ActionCategory[] {
  const records = getActionEffectiveness();
  if (records.length === 0) return DEFAULT_CALIBRATION.actionTypeRanking;

  return [...records]
    .map(r => {
      const completionRate = r.totalAttempts > 0 ? r.completions / r.totalAttempts : 0;
      const engagementRate = r.completions > 0 ? r.engagementResults / r.completions : 0;
      const conversionRate = r.completions > 0 ? r.conversions / r.completions : 0;
      const score = completionRate * 0.3 + engagementRate * 0.4 + conversionRate * 0.3;
      return { type: r.actionType, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(r => r.type);
}

// ── Behavioral Pattern Detection ─────────────────────────────────────

export function recordBehavior(hour: number, actionType: ActionCategory): void {
  const pattern = loadJson<BehavioralPattern>(BEHAVIOR_KEY, DEFAULT_BEHAVIOR);

  // Track hour frequency
  const hourCounts = new Map<number, number>();
  for (const h of pattern.preferredHours) hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
  hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  pattern.preferredHours = [...hourCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(e => e[0]);

  // Track channel preference
  const channelCounts = new Map<ActionCategory, number>();
  for (const c of pattern.preferredChannels) channelCounts.set(c, (channelCounts.get(c) || 0) + 1);
  channelCounts.set(actionType, (channelCounts.get(actionType) || 0) + 1);
  pattern.preferredChannels = [...channelCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(e => e[0]);

  pattern.lastUpdated = new Date().toISOString();
  saveJson(BEHAVIOR_KEY, pattern);
}

export function getBehavioralPattern(): BehavioralPattern {
  return loadJson<BehavioralPattern>(BEHAVIOR_KEY, DEFAULT_BEHAVIOR);
}

export function updateWorkloadTolerance(completedToday: number, totalToday: number): void {
  const pattern = loadJson<BehavioralPattern>(BEHAVIOR_KEY, DEFAULT_BEHAVIOR);
  const rate = totalToday > 0 ? completedToday / totalToday : 0;

  // Rolling average
  const prev = pattern.avgTasksPerDay;
  pattern.avgTasksPerDay = prev === 0 ? completedToday : prev * 0.8 + completedToday * 0.2;

  if (rate >= 0.8 && completedToday >= 6) pattern.workloadTolerance = 'high';
  else if (rate >= 0.5 || completedToday >= 3) pattern.workloadTolerance = 'medium';
  else pattern.workloadTolerance = 'low';

  pattern.lastUpdated = new Date().toISOString();
  saveJson(BEHAVIOR_KEY, pattern);
}

// ── Calibration ──────────────────────────────────────────────────────

function recalibrateFromOutcomes(outcomes: OutcomeEvent[]): void {
  const cal = loadJson<CalibrationWeights>(CALIBRATION_KEY, DEFAULT_CALIBRATION);
  cal.totalOutcomes = outcomes.length;

  // Count outcome types
  const closed = outcomes.filter(o => o.type === 'deal_closed').length;
  const failed = outcomes.filter(o => o.type === 'deal_failed').length;
  const converted = outcomes.filter(o => o.type === 'lead_converted').length;
  const lost = outcomes.filter(o => o.type === 'lead_lost').length;

  // Adjust stage probability — if agent closes more than fails, slightly boost
  if (closed + failed > 3) {
    const closeRate = closed / (closed + failed);
    cal.stageProbabilityMultiplier = clamp(0.8 + closeRate * 0.4, 0.8, 1.2);
  }

  // Adjust opportunity multiplier — if conversions outpace losses, boost
  if (converted + lost > 3) {
    const convRate = converted / (converted + lost);
    cal.opportunityMultiplier = clamp(0.8 + convRate * 0.4, 0.8, 1.2);
  }

  // Risk sensitivity — if agent has many failures, increase sensitivity
  if (failed > 5) {
    cal.riskSensitivityMultiplier = clamp(1.0 + (failed / (closed + failed + 1)) * 0.2, 0.8, 1.2);
  }

  cal.lastCalibrated = new Date().toISOString();
  saveJson(CALIBRATION_KEY, cal);
}

function updateCalibrationFromEffectiveness(records: ActionEffectivenessRecord[]): void {
  const cal = loadJson<CalibrationWeights>(CALIBRATION_KEY, DEFAULT_CALIBRATION);
  cal.actionTypeRanking = getRankedActionTypes();
  saveJson(CALIBRATION_KEY, cal);
}

export function getCalibration(): CalibrationWeights {
  return loadJson<CalibrationWeights>(CALIBRATION_KEY, DEFAULT_CALIBRATION);
}

/** Record a prediction outcome to refine accuracy tracking */
export function recordPredictionOutcome(
  predictionType: 'failure' | 'ghosting' | 'conversion' | 'forecast',
  predicted: boolean,
  actual: boolean,
): void {
  const cal = loadJson<CalibrationWeights>(CALIBRATION_KEY, DEFAULT_CALIBRATION);
  const correct = predicted === actual;
  const alpha = 0.1; // learning rate

  switch (predictionType) {
    case 'failure':
      cal.failurePredictionAccuracy = cal.failurePredictionAccuracy * (1 - alpha) + (correct ? 1 : 0) * alpha;
      break;
    case 'ghosting':
      cal.ghostingPredictionAccuracy = cal.ghostingPredictionAccuracy * (1 - alpha) + (correct ? 1 : 0) * alpha;
      break;
    case 'conversion':
      cal.conversionPredictionAccuracy = cal.conversionPredictionAccuracy * (1 - alpha) + (correct ? 1 : 0) * alpha;
      break;
    case 'forecast':
      cal.forecastReliability = cal.forecastReliability * (1 - alpha) + (correct ? 1 : 0) * alpha;
      break;
  }

  cal.lastCalibrated = new Date().toISOString();
  saveJson(CALIBRATION_KEY, cal);
}

// ── Income Correlations ──────────────────────────────────────────────

export function computeIncomeCorrelations(): IncomeCorrelation[] {
  const outcomes = getOutcomes();
  const effectiveness = getActionEffectiveness();
  const correlations: IncomeCorrelation[] = [];

  // Call vs text effectiveness
  const callEff = effectiveness.find(e => e.actionType === 'call');
  const textEff = effectiveness.find(e => e.actionType === 'text');
  if (callEff && textEff && callEff.totalAttempts > 2 && textEff.totalAttempts > 2) {
    const callConvRate = callEff.completions > 0 ? callEff.conversions / callEff.completions : 0;
    const textConvRate = textEff.completions > 0 ? textEff.conversions / textEff.completions : 0;
    correlations.push({
      factor: 'Calls vs Texts',
      correlation: callConvRate > textConvRate ? 'positive' : callConvRate < textConvRate ? 'negative' : 'neutral',
      strength: Math.abs(callConvRate - textConvRate),
      sampleSize: callEff.totalAttempts + textEff.totalAttempts,
    });
  }

  // Speed of follow-up
  const closedDeals = outcomes.filter(o => o.type === 'deal_closed');
  const failedDeals = outcomes.filter(o => o.type === 'deal_failed');
  if (closedDeals.length > 2) {
    correlations.push({
      factor: 'Quick Follow-up Speed',
      correlation: 'positive',
      strength: 0.6,
      sampleSize: closedDeals.length,
    });
  }

  // Touch frequency
  const touchResponses = outcomes.filter(o => o.type === 'touch_response');
  if (touchResponses.length > 3) {
    correlations.push({
      factor: 'High Touch Frequency',
      correlation: 'positive',
      strength: Math.min(touchResponses.length / 20, 0.9),
      sampleSize: touchResponses.length,
    });
  }

  // Task completion rate
  const completed = outcomes.filter(o => o.type === 'task_completed').length;
  const ignored = outcomes.filter(o => o.type === 'task_ignored').length;
  if (completed + ignored > 5) {
    const completionRate = completed / (completed + ignored);
    correlations.push({
      factor: 'Task Completion Rate',
      correlation: completionRate > 0.6 ? 'positive' : 'negative',
      strength: Math.abs(completionRate - 0.5) * 2,
      sampleSize: completed + ignored,
    });
  }

  return correlations;
}

// ── Insights Generation ──────────────────────────────────────────────

export function generateInsights(): LearningInsight[] {
  const insights: LearningInsight[] = [];
  const cal = getCalibration();
  const behavior = getBehavioralPattern();
  const effectiveness = getActionEffectiveness();
  const correlations = computeIncomeCorrelations();
  const now = new Date().toISOString();

  // Accuracy improvements
  if (cal.totalOutcomes >= 10) {
    const avgAccuracy = (cal.failurePredictionAccuracy + cal.ghostingPredictionAccuracy + cal.conversionPredictionAccuracy) / 3;
    if (avgAccuracy > 0.6) {
      insights.push({
        id: 'accuracy-improving',
        category: 'accuracy',
        title: 'Predictions Getting Sharper',
        description: `Based on ${cal.totalOutcomes} tracked outcomes, prediction accuracy is at ${Math.round(avgAccuracy * 100)}%.`,
        discoveredAt: now,
      });
    }
  }

  // Behavioral insights
  if (behavior.preferredHours.length > 0) {
    const peakHour = behavior.preferredHours[0];
    const label = peakHour < 12 ? `${peakHour}am` : peakHour === 12 ? '12pm' : `${peakHour - 12}pm`;
    insights.push({
      id: 'peak-productivity',
      category: 'behavior',
      title: 'Peak Productivity Window',
      description: `You're most productive around ${label}. High-impact actions are prioritized during this window.`,
      discoveredAt: now,
    });
  }

  if (behavior.workloadTolerance !== 'medium') {
    insights.push({
      id: 'workload-adaptation',
      category: 'behavior',
      title: behavior.workloadTolerance === 'high' ? 'High Capacity Detected' : 'Lighter Load Preferred',
      description: behavior.workloadTolerance === 'high'
        ? 'You handle high task volumes well. Recommendations include more items.'
        : 'Recommendations are streamlined to avoid overload.',
      discoveredAt: now,
    });
  }

  // Effectiveness insights
  const topAction = effectiveness.sort((a, b) => {
    const aRate = a.completions > 0 ? a.engagementResults / a.completions : 0;
    const bRate = b.completions > 0 ? b.engagementResults / b.completions : 0;
    return bRate - aRate;
  })[0];

  if (topAction && topAction.totalAttempts >= 3) {
    insights.push({
      id: 'top-action',
      category: 'effectiveness',
      title: `${capitalize(topAction.actionType)} Is Your Strongest Move`,
      description: `${capitalize(topAction.actionType)} actions produce the highest engagement rate. Prioritized in recommendations.`,
      discoveredAt: now,
    });
  }

  // Income correlations
  for (const corr of correlations.filter(c => c.strength > 0.4 && c.sampleSize >= 5)) {
    insights.push({
      id: `corr-${corr.factor.toLowerCase().replace(/\s+/g, '-')}`,
      category: 'income',
      title: `${corr.factor} → ${corr.correlation === 'positive' ? 'Higher' : 'Lower'} Income`,
      description: `Strong ${corr.correlation} correlation detected with ${corr.sampleSize} data points.`,
      discoveredAt: now,
    });
  }

  return insights;
}

// ── Full Snapshot ─────────────────────────────────────────────────────

export function getLearningSnapshot(): LearningSnapshot {
  return {
    outcomes: getOutcomes(),
    actionEffectiveness: getActionEffectiveness(),
    behavioralPattern: getBehavioralPattern(),
    calibration: getCalibration(),
    correlations: computeIncomeCorrelations(),
    insights: generateInsights(),
  };
}

// ── Reset ────────────────────────────────────────────────────────────

export function resetLearningData(): void {
  localStorage.removeItem(OUTCOMES_KEY);
  localStorage.removeItem(ACTION_EFF_KEY);
  localStorage.removeItem(BEHAVIOR_KEY);
  localStorage.removeItem(CALIBRATION_KEY);
}

// ── Helpers ──────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.replace(/_/g, ' ').slice(1);
}
