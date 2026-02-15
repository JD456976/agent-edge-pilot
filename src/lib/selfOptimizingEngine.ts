/**
 * Self-Optimizing Engine — Computes agent-specific "personal best practices"
 * from action outcome data. All analysis is deterministic, bucketed, and
 * confidence-scored. Never overrides base scoring; applies bounded adjustments.
 *
 * SAFETY: Max adjustment ±10 points. Requires minimum sample sizes.
 * PRIVACY: Agent-specific only. No cross-agent data.
 */

// ── Types ────────────────────────────────────────────────────────────

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';
export type OptChannel = 'call' | 'text' | 'email' | 'none';
export type OptActionType = 'call' | 'text' | 'email' | 'schedule_task' | 'log_touch' | 'follow_up' | 'recovery_plan';

export interface TimeWindow {
  hourStart: number;
  hourEnd: number;
  successRate: number;
  sampleSize: number;
  confidence: ConfidenceBand;
}

export interface ChannelEffectiveness {
  channel: OptChannel;
  context: string; // e.g., 'hot_lead', 'at_risk_deal', 'warm_lead', 'general'
  successRate: number;
  sampleSize: number;
  confidence: ConfidenceBand;
}

export interface ActionTypeEffectiveness {
  actionType: OptActionType;
  context: string;
  completionRate: number;
  positiveOutcomeRate: number;
  sampleSize: number;
  confidence: ConfidenceBand;
}

export interface FrictionSignal {
  actionType: OptActionType;
  channel: OptChannel;
  dismissRate: number;
  sampleSize: number;
  suggestion: string;
}

export interface PersonalPattern {
  id: string;
  title: string;
  description: string;
  confidence: ConfidenceBand;
  sampleSize: number;
  category: 'time' | 'channel' | 'action' | 'behavior';
}

export interface Nudge {
  id: string;
  message: string;
  explanation: string;
  confidence: ConfidenceBand;
  sampleSize: number;
  category: 'time' | 'channel' | 'behavior' | 'outcome';
  dismissible: true;
}

export interface PriorityAdjustment {
  reason: string;
  adjustment: number; // -10 to +10
  confidence: ConfidenceBand;
}

export interface OptimizedDefaults {
  preferredTab: 'call' | 'text' | 'email' | 'task' | 'notes';
  preferredTone: 'direct' | 'friendly' | 'professional';
  preferredLength: 'short' | 'medium' | 'detailed';
  followUpTimingBucket: string;
}

export interface SelfOptAnalysis {
  bestTimeWindows: TimeWindow[];
  bestChannelsByContext: ChannelEffectiveness[];
  bestActionsByContext: ActionTypeEffectiveness[];
  frictionSignals: FrictionSignal[];
  patterns: PersonalPattern[];
  nudges: Nudge[];
  isActive: boolean;
  totalOutcomes: number;
}

// ── Outcome record (matches DB shape) ────────────────────────────────

export interface ActionOutcomeRecord {
  id: string;
  created_at: string;
  action_source: string;
  entity_type: string;
  entity_id: string;
  action_type: string;
  channel: string;
  time_to_execute_bucket: string | null;
  executed: boolean;
  execution_result: string | null;
  short_term_effect: string | null;
  long_term_effect: string | null;
  money_impact_bucket: string | null;
  notes_key: string | null;
}

export interface SelfOptPreferences {
  enabled: boolean;
  nudge_level: 'minimal' | 'balanced' | 'proactive';
  coaching_tone: 'direct' | 'friendly' | 'professional';
  allow_time_of_day_optimization: boolean;
  allow_channel_optimization: boolean;
  allow_priority_reweighting: boolean;
}

// ── Constants ────────────────────────────────────────────────────────

const MIN_SAMPLE_HIGH = 20;
const MIN_SAMPLE_MEDIUM = 10;
const MIN_SAMPLE_LOW = 3;
const MAX_ADJUSTMENT = 10;

// ── Confidence Helper ────────────────────────────────────────────────

function getConfidence(n: number): ConfidenceBand {
  if (n >= MIN_SAMPLE_HIGH) return 'HIGH';
  if (n >= MIN_SAMPLE_MEDIUM) return 'MEDIUM';
  if (n >= MIN_SAMPLE_LOW) return 'LOW';
  return 'LOW';
}

// ── Time Window Analysis ─────────────────────────────────────────────

export function computeBestTimeWindows(outcomes: ActionOutcomeRecord[]): TimeWindow[] {
  const executed = outcomes.filter(o => o.executed);
  if (executed.length < MIN_SAMPLE_LOW) return [];

  // Bucket by 3-hour windows
  const windows: Record<string, { total: number; positive: number }> = {};
  const windowDefs: [number, number, string][] = [
    [6, 9, '6am–9am'], [9, 12, '9am–12pm'], [12, 15, '12pm–3pm'],
    [15, 18, '3pm–6pm'], [18, 21, '6pm–9pm'],
  ];

  for (const o of executed) {
    const hour = new Date(o.created_at).getHours();
    const def = windowDefs.find(([s, e]) => hour >= s && hour < e);
    if (!def) continue;
    const key = def[2];
    if (!windows[key]) windows[key] = { total: 0, positive: 0 };
    windows[key].total++;
    if (o.short_term_effect && o.short_term_effect !== 'none') windows[key].positive++;
  }

  return Object.entries(windows)
    .filter(([, v]) => v.total >= MIN_SAMPLE_LOW)
    .map(([label, v]) => {
      const def = windowDefs.find(d => d[2] === label)!;
      return {
        hourStart: def[0],
        hourEnd: def[1],
        successRate: v.positive / v.total,
        sampleSize: v.total,
        confidence: getConfidence(v.total),
      };
    })
    .sort((a, b) => b.successRate - a.successRate);
}

// ── Channel Analysis ─────────────────────────────────────────────────

function inferContext(entityType: string, outcomes: ActionOutcomeRecord[]): string {
  // Simple context heuristic based on entity type
  return entityType === 'lead' ? 'lead' : 'deal';
}

export function computeBestChannels(outcomes: ActionOutcomeRecord[]): ChannelEffectiveness[] {
  const executed = outcomes.filter(o => o.executed && o.channel !== 'none');
  if (executed.length < MIN_SAMPLE_LOW) return [];

  const buckets: Record<string, { total: number; positive: number }> = {};

  for (const o of executed) {
    const ctx = inferContext(o.entity_type, outcomes);
    const key = `${o.channel}|${ctx}`;
    if (!buckets[key]) buckets[key] = { total: 0, positive: 0 };
    buckets[key].total++;
    if (o.short_term_effect && o.short_term_effect !== 'none') buckets[key].positive++;
  }

  return Object.entries(buckets)
    .filter(([, v]) => v.total >= MIN_SAMPLE_LOW)
    .map(([key, v]) => {
      const [channel, context] = key.split('|');
      return {
        channel: channel as OptChannel,
        context,
        successRate: v.positive / v.total,
        sampleSize: v.total,
        confidence: getConfidence(v.total),
      };
    })
    .sort((a, b) => b.successRate - a.successRate);
}

// ── Action Type Analysis ─────────────────────────────────────────────

export function computeBestActions(outcomes: ActionOutcomeRecord[]): ActionTypeEffectiveness[] {
  const buckets: Record<string, { total: number; executed: number; positive: number }> = {};

  for (const o of outcomes) {
    const ctx = inferContext(o.entity_type, outcomes);
    const key = `${o.action_type}|${ctx}`;
    if (!buckets[key]) buckets[key] = { total: 0, executed: 0, positive: 0 };
    buckets[key].total++;
    if (o.executed) {
      buckets[key].executed++;
      if (o.short_term_effect && o.short_term_effect !== 'none') buckets[key].positive++;
    }
  }

  return Object.entries(buckets)
    .filter(([, v]) => v.total >= MIN_SAMPLE_LOW)
    .map(([key, v]) => {
      const [actionType, context] = key.split('|');
      return {
        actionType: actionType as OptActionType,
        context,
        completionRate: v.executed / v.total,
        positiveOutcomeRate: v.executed > 0 ? v.positive / v.executed : 0,
        sampleSize: v.total,
        confidence: getConfidence(v.total),
      };
    })
    .sort((a, b) => b.positiveOutcomeRate - a.positiveOutcomeRate);
}

// ── Friction Signals ─────────────────────────────────────────────────

export function computeFrictionSignals(outcomes: ActionOutcomeRecord[]): FrictionSignal[] {
  const buckets: Record<string, { total: number; dismissed: number }> = {};

  for (const o of outcomes) {
    const key = `${o.action_type}|${o.channel}`;
    if (!buckets[key]) buckets[key] = { total: 0, dismissed: 0 };
    buckets[key].total++;
    if (o.execution_result === 'dismissed' || o.execution_result === 'skipped') {
      buckets[key].dismissed++;
    }
  }

  return Object.entries(buckets)
    .filter(([, v]) => v.total >= MIN_SAMPLE_LOW && v.dismissed / v.total > 0.3)
    .map(([key, v]) => {
      const [actionType, channel] = key.split('|');
      const rate = v.dismissed / v.total;
      return {
        actionType: actionType as OptActionType,
        channel: channel as OptChannel,
        dismissRate: rate,
        sampleSize: v.total,
        suggestion: rate > 0.5
          ? `Consider reducing ${actionType} recommendations via ${channel} — frequently dismissed.`
          : `${actionType} via ${channel} is sometimes dismissed. May need different framing.`,
      };
    });
}

// ── Pattern Discovery ────────────────────────────────────────────────

export function discoverPatterns(
  timeWindows: TimeWindow[],
  channels: ChannelEffectiveness[],
  actions: ActionTypeEffectiveness[],
): PersonalPattern[] {
  const patterns: PersonalPattern[] = [];

  // Best time window
  if (timeWindows.length > 0 && timeWindows[0].confidence !== 'LOW') {
    const best = timeWindows[0];
    const label = `${best.hourStart > 12 ? best.hourStart - 12 : best.hourStart}${best.hourStart >= 12 ? 'pm' : 'am'}–${best.hourEnd > 12 ? best.hourEnd - 12 : best.hourEnd}${best.hourEnd >= 12 ? 'pm' : 'am'}`;
    patterns.push({
      id: 'best-time',
      title: `Peak Performance: ${label}`,
      description: `${Math.round(best.successRate * 100)}% of actions in this window produce positive outcomes.`,
      confidence: best.confidence,
      sampleSize: best.sampleSize,
      category: 'time',
    });
  }

  // Best channel
  if (channels.length > 0 && channels[0].confidence !== 'LOW') {
    const best = channels[0];
    patterns.push({
      id: 'best-channel',
      title: `Best Channel: ${best.channel}`,
      description: `${best.channel} produces ${Math.round(best.successRate * 100)}% positive outcomes for ${best.context}s.`,
      confidence: best.confidence,
      sampleSize: best.sampleSize,
      category: 'channel',
    });
  }

  // Best action type
  if (actions.length > 0 && actions[0].confidence !== 'LOW') {
    const best = actions[0];
    patterns.push({
      id: 'best-action',
      title: `Strongest Move: ${best.actionType.replace('_', ' ')}`,
      description: `${Math.round(best.positiveOutcomeRate * 100)}% positive outcome rate for ${best.context}s.`,
      confidence: best.confidence,
      sampleSize: best.sampleSize,
      category: 'action',
    });
  }

  return patterns;
}

// ── Nudge Generation ─────────────────────────────────────────────────

export function generateNudges(
  prefs: SelfOptPreferences,
  timeWindows: TimeWindow[],
  channels: ChannelEffectiveness[],
  actions: ActionTypeEffectiveness[],
  friction: FrictionSignal[],
): Nudge[] {
  if (!prefs.enabled) return [];
  const nudges: Nudge[] = [];
  const maxNudges = prefs.nudge_level === 'minimal' ? 1 : prefs.nudge_level === 'balanced' ? 2 : 3;

  // Time-based nudge
  if (prefs.allow_time_of_day_optimization && timeWindows.length > 0) {
    const best = timeWindows[0];
    if (best.confidence !== 'LOW') {
      const label = `${best.hourStart > 12 ? best.hourStart - 12 : best.hourStart}${best.hourStart >= 12 ? 'pm' : 'am'}`;
      nudges.push({
        id: 'nudge-time',
        message: `You get better results when you execute actions around ${label}.`,
        explanation: `Based on ${best.sampleSize} tracked actions, ${Math.round(best.successRate * 100)}% of actions in this window produced positive outcomes.`,
        confidence: best.confidence,
        sampleSize: best.sampleSize,
        category: 'time',
        dismissible: true,
      });
    }
  }

  // Channel nudge
  if (prefs.allow_channel_optimization && channels.length >= 2) {
    const best = channels[0];
    const other = channels.find(c => c.channel !== best.channel);
    if (best.confidence !== 'LOW' && other) {
      nudges.push({
        id: 'nudge-channel',
        message: `${capitalize(best.channel)} has been getting better responses than ${other.channel} this period.`,
        explanation: `${capitalize(best.channel)}: ${Math.round(best.successRate * 100)}% success vs ${capitalize(other.channel)}: ${Math.round(other.successRate * 100)}% success (${best.sampleSize} + ${other.sampleSize} events).`,
        confidence: best.confidence,
        sampleSize: best.sampleSize + other.sampleSize,
        category: 'channel',
        dismissible: true,
      });
    }
  }

  // Friction-based nudge
  if (friction.length > 0) {
    const top = friction[0];
    nudges.push({
      id: 'nudge-friction',
      message: top.suggestion,
      explanation: `${Math.round(top.dismissRate * 100)}% dismiss rate across ${top.sampleSize} recommendations.`,
      confidence: getConfidence(top.sampleSize),
      sampleSize: top.sampleSize,
      category: 'behavior',
      dismissible: true,
    });
  }

  return nudges.slice(0, maxNudges);
}

// ── Priority Adjustment ──────────────────────────────────────────────

export function computePriorityAdjustment(
  prefs: SelfOptPreferences,
  actionType: string,
  channel: string,
  hour: number,
  channels: ChannelEffectiveness[],
  timeWindows: TimeWindow[],
): PriorityAdjustment | null {
  if (!prefs.enabled || !prefs.allow_priority_reweighting) return null;

  let adjustment = 0;
  const reasons: string[] = [];

  // Time optimization
  if (prefs.allow_time_of_day_optimization && timeWindows.length > 0) {
    const matchingWindow = timeWindows.find(w => hour >= w.hourStart && hour < w.hourEnd);
    if (matchingWindow && matchingWindow.confidence !== 'LOW') {
      const timeAdj = Math.round((matchingWindow.successRate - 0.5) * 10);
      adjustment += Math.max(-5, Math.min(5, timeAdj));
      if (timeAdj > 0) reasons.push('optimal time window');
    }
  }

  // Channel optimization
  if (prefs.allow_channel_optimization && channels.length > 0) {
    const matchingChannel = channels.find(c => c.channel === channel);
    if (matchingChannel && matchingChannel.confidence !== 'LOW') {
      const chanAdj = Math.round((matchingChannel.successRate - 0.5) * 10);
      adjustment += Math.max(-5, Math.min(5, chanAdj));
      if (chanAdj > 0) reasons.push(`${channel} works well for you`);
    }
  }

  if (adjustment === 0) return null;

  return {
    reason: reasons.length > 0
      ? `Optimized for you: ${reasons.join(', ')}.`
      : 'Based on your personal effectiveness data.',
    adjustment: Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, adjustment)),
    confidence: getConfidence(
      Math.max(
        ...(channels.map(c => c.sampleSize).concat(timeWindows.map(t => t.sampleSize))),
        0,
      ),
    ),
  };
}

// ── Optimized Defaults ───────────────────────────────────────────────

export function computeOptimizedDefaults(
  prefs: SelfOptPreferences,
  channels: ChannelEffectiveness[],
  entityType: 'deal' | 'lead',
): OptimizedDefaults {
  const defaults: OptimizedDefaults = {
    preferredTab: 'call',
    preferredTone: prefs.coaching_tone,
    preferredLength: 'medium',
    followUpTimingBucket: 'same_day',
  };

  if (!prefs.enabled) return defaults;

  // Find best channel for this entity type
  if (prefs.allow_channel_optimization && channels.length > 0) {
    const contextChannels = channels.filter(c => c.context === entityType || c.context === 'general');
    if (contextChannels.length > 0) {
      const best = contextChannels[0];
      const tabMap: Record<string, 'call' | 'text' | 'email'> = { call: 'call', text: 'text', email: 'email' };
      defaults.preferredTab = tabMap[best.channel] || 'call';
    }
  }

  return defaults;
}

// ── Full Analysis ────────────────────────────────────────────────────

export function computeSelfOptAnalysis(
  outcomes: ActionOutcomeRecord[],
  prefs: SelfOptPreferences,
): SelfOptAnalysis {
  if (!prefs.enabled || outcomes.length < MIN_SAMPLE_LOW) {
    return {
      bestTimeWindows: [],
      bestChannelsByContext: [],
      bestActionsByContext: [],
      frictionSignals: [],
      patterns: [],
      nudges: [],
      isActive: prefs.enabled,
      totalOutcomes: outcomes.length,
    };
  }

  const timeWindows = computeBestTimeWindows(outcomes);
  const channels = computeBestChannels(outcomes);
  const actions = computeBestActions(outcomes);
  const friction = computeFrictionSignals(outcomes);
  const patterns = discoverPatterns(timeWindows, channels, actions);
  const nudges = generateNudges(prefs, timeWindows, channels, actions, friction);

  return {
    bestTimeWindows: timeWindows,
    bestChannelsByContext: channels,
    bestActionsByContext: actions,
    frictionSignals: friction,
    patterns,
    nudges,
    isActive: true,
    totalOutcomes: outcomes.length,
  };
}

// ── Export Learning Summary ──────────────────────────────────────────

export function exportLearningSummary(analysis: SelfOptAnalysis): string {
  const summary = {
    exportedAt: new Date().toISOString(),
    totalOutcomesTracked: analysis.totalOutcomes,
    bestTimeWindows: analysis.bestTimeWindows.map(w => ({
      window: `${w.hourStart}:00–${w.hourEnd}:00`,
      successRate: `${Math.round(w.successRate * 100)}%`,
      confidence: w.confidence,
      sampleSize: w.sampleSize,
    })),
    bestChannels: analysis.bestChannelsByContext.map(c => ({
      channel: c.channel,
      context: c.context,
      successRate: `${Math.round(c.successRate * 100)}%`,
      confidence: c.confidence,
    })),
    bestActions: analysis.bestActionsByContext.map(a => ({
      action: a.actionType,
      context: a.context,
      positiveOutcomeRate: `${Math.round(a.positiveOutcomeRate * 100)}%`,
      confidence: a.confidence,
    })),
    learnedPatterns: analysis.patterns.map(p => ({
      title: p.title,
      confidence: p.confidence,
    })),
  };
  return JSON.stringify(summary, null, 2);
}

// ── Helpers ──────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
