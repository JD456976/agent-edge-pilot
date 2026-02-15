/**
 * Noise Governor Layer — rate-limits non-urgent UI signals to prevent fatigue.
 * Pure display-frequency logic. No scoring changes.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type DriftFrequency = 'every_session' | '4_hours' | 'daily';
export type WeeklyReviewDefault = 'auto' | 'always_collapsed' | 'always_expanded';
export type StableHideAfter = 3 | 5 | 'never';

export interface NoisePrefs {
  driftFrequency: DriftFrequency;
  weeklyReviewDefault: WeeklyReviewDefault;
  stableHideAfterDays: StableHideAfter;
}

const NOISE_PREFS_KEY = 'dp-noise-prefs';

const DEFAULTS: NoisePrefs = {
  driftFrequency: '4_hours',
  weeklyReviewDefault: 'auto',
  stableHideAfterDays: 3,
};

export function getNoisePrefs(): NoisePrefs {
  try {
    const raw = localStorage.getItem(NOISE_PREFS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

export function setNoisePrefs(partial: Partial<NoisePrefs>): NoisePrefs {
  const current = getNoisePrefs();
  const next = { ...current, ...partial };
  localStorage.setItem(NOISE_PREFS_KEY, JSON.stringify(next));
  return next;
}

// ── Drift cooldown ─────────────────────────────────────────────────────────

interface DriftDisplayState {
  lastShownAt: string | null;
  lastSeverity: string | null;
  lastSummaryHash: string | null;
}

const DRIFT_STATE_KEY = 'dp-drift-display-state';

function getDriftDisplayState(): DriftDisplayState {
  try {
    const raw = localStorage.getItem(DRIFT_STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { lastShownAt: null, lastSeverity: null, lastSummaryHash: null };
}

function setDriftDisplayState(state: DriftDisplayState) {
  localStorage.setItem(DRIFT_STATE_KEY, JSON.stringify(state));
}

function cooldownMs(freq: DriftFrequency): number {
  switch (freq) {
    case 'every_session': return 0;
    case '4_hours': return 4 * 60 * 60 * 1000;
    case 'daily': return 24 * 60 * 60 * 1000;
  }
}

const SEVERITY_RANK: Record<string, number> = { quiet: 0, moderate: 1, attention_needed: 2 };

export function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

export interface DriftSuppression {
  suppressed: boolean;
  reason: string | null;
  lastShownAt: string | null;
}

export function checkDriftSuppression(
  severity: string,
  summaryHash: string,
): DriftSuppression {
  const prefs = getNoisePrefs();
  const state = getDriftDisplayState();
  const cd = cooldownMs(prefs.driftFrequency);

  // No cooldown configured
  if (cd === 0) {
    markDriftShown(severity, summaryHash);
    return { suppressed: false, reason: null, lastShownAt: state.lastShownAt };
  }

  const now = Date.now();
  const lastShown = state.lastShownAt ? new Date(state.lastShownAt).getTime() : 0;
  const elapsed = now - lastShown;

  // Severity escalation bypasses cooldown
  const prevRank = SEVERITY_RANK[state.lastSeverity ?? 'quiet'] ?? 0;
  const currRank = SEVERITY_RANK[severity] ?? 0;
  if (currRank > prevRank) {
    markDriftShown(severity, summaryHash);
    return { suppressed: false, reason: null, lastShownAt: state.lastShownAt };
  }

  // Summary changed materially
  if (state.lastSummaryHash && summaryHash !== state.lastSummaryHash) {
    markDriftShown(severity, summaryHash);
    return { suppressed: false, reason: null, lastShownAt: state.lastShownAt };
  }

  // Still within cooldown
  if (elapsed < cd) {
    const freqLabel = prefs.driftFrequency === '4_hours' ? '4-hour' : '24-hour';
    return {
      suppressed: true,
      reason: `${freqLabel} cooldown active — last shown ${formatTimeAgo(state.lastShownAt!)}`,
      lastShownAt: state.lastShownAt,
    };
  }

  markDriftShown(severity, summaryHash);
  return { suppressed: false, reason: null, lastShownAt: state.lastShownAt };
}

export function markDriftShown(severity: string, summaryHash: string) {
  setDriftDisplayState({
    lastShownAt: new Date().toISOString(),
    lastSeverity: severity,
    lastSummaryHash: summaryHash,
  });
}

// ── Weekly review day-of-week gating ───────────────────────────────────────

const WEEKLY_REVIEW_PREF_KEY = 'dp-weekly-review-expanded-week';

export function getWeeklyReviewDefaultExpanded(): boolean {
  const prefs = getNoisePrefs();
  if (prefs.weeklyReviewDefault === 'always_expanded') return true;
  if (prefs.weeklyReviewDefault === 'always_collapsed') return false;

  // Auto: Mon (1) and Fri (5)
  const day = new Date().getDay();
  return day === 1 || day === 5;
}

export function getWeeklyReviewUserOverride(): boolean | null {
  try {
    const raw = localStorage.getItem(WEEKLY_REVIEW_PREF_KEY);
    if (!raw) return null;
    const { week, expanded } = JSON.parse(raw);
    const currentWeek = getISOWeek();
    if (week === currentWeek) return expanded;
  } catch {}
  return null;
}

export function setWeeklyReviewUserOverride(expanded: boolean) {
  localStorage.setItem(WEEKLY_REVIEW_PREF_KEY, JSON.stringify({ week: getISOWeek(), expanded }));
}

function getISOWeek(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${weekNo}`;
}

// ── Stable status noise filter ─────────────────────────────────────────────

const STABLE_DAYS_KEY = 'dp-consecutive-stable-days';
const STABLE_LAST_STATUS_KEY = 'dp-stable-last-status';

export interface StableFilter {
  hidden: boolean;
  consecutiveDays: number;
  reason: string | null;
}

export function checkStableFilter(currentStatus: string): StableFilter {
  const prefs = getNoisePrefs();
  if (prefs.stableHideAfterDays === 'never') {
    return { hidden: false, consecutiveDays: 0, reason: null };
  }

  try {
    const lastStatus = localStorage.getItem(STABLE_LAST_STATUS_KEY);
    let days = parseInt(localStorage.getItem(STABLE_DAYS_KEY) || '0', 10);

    if (currentStatus === 'Holding' || currentStatus === 'Stabilizing') {
      // "Stable-ish" statuses
      if (lastStatus === currentStatus) {
        days += 1;
      } else if (lastStatus === 'Holding' || lastStatus === 'Stabilizing') {
        // Still in stable family
        days += 1;
      } else {
        days = 1;
      }
    } else {
      days = 0;
    }

    localStorage.setItem(STABLE_DAYS_KEY, String(days));
    localStorage.setItem(STABLE_LAST_STATUS_KEY, currentStatus);

    const threshold = prefs.stableHideAfterDays as number;
    if (days >= threshold) {
      return {
        hidden: true,
        consecutiveDays: days,
        reason: `Stable for ${days} consecutive days — hiding status bar`,
      };
    }

    return { hidden: false, consecutiveDays: days, reason: null };
  } catch {
    return { hidden: false, consecutiveDays: 0, reason: null };
  }
}

// ── Generic insight surfacing ──────────────────────────────────────────────

interface InsightCheck {
  key: string;
  contentHash: string;
  severity?: string;
}

const INSIGHT_PREFIX = 'dp-insight-';

export interface InsightSurfaceResult {
  shouldShow: boolean;
  seenCount: number;
  reason: string | null;
}

export function shouldSurfaceInsight({ key, contentHash, severity }: InsightCheck): InsightSurfaceResult {
  const storageKey = INSIGHT_PREFIX + key;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      localStorage.setItem(storageKey, JSON.stringify({ hash: contentHash, count: 1, lastShownAt: new Date().toISOString() }));
      return { shouldShow: true, seenCount: 1, reason: null };
    }
    const state = JSON.parse(raw);
    if (state.hash !== contentHash) {
      localStorage.setItem(storageKey, JSON.stringify({ hash: contentHash, count: 1, lastShownAt: new Date().toISOString() }));
      return { shouldShow: true, seenCount: 1, reason: null };
    }
    const count = (state.count || 0) + 1;
    localStorage.setItem(storageKey, JSON.stringify({ ...state, count, lastShownAt: new Date().toISOString() }));
    if (count >= 3) {
      return {
        shouldShow: false,
        seenCount: count,
        reason: `Seen ${count} times with no change — auto-collapsed`,
      };
    }
    return { shouldShow: true, seenCount: count, reason: null };
  } catch {
    return { shouldShow: true, seenCount: 0, reason: null };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
