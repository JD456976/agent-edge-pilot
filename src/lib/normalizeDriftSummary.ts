/**
 * Normalizes a drift summary from any source (edge function, DB cache, legacy)
 * into a stable shape that UI components can safely consume.
 */

export interface NormalizedCounts {
  new: number;
  updated: number;
  conflicts: number;
  total: number;
}

export interface NormalizedDriftSummary {
  severity: 'quiet' | 'moderate' | 'attention_needed';
  drift_reason: string;
  counts: NormalizedCounts;
  checked_at: string | null;
  last_successful_at: string | null;
  top_items: any[];
  all_items: any[];
  by_type: { leads: any[]; deals: any[]; tasks: any[] };
}

function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

export function normalizeDriftSummary(raw: any): NormalizedDriftSummary {
  if (!raw || typeof raw !== 'object') {
    return {
      severity: 'quiet',
      drift_reason: '',
      counts: { new: 0, updated: 0, conflicts: 0, total: 0 },
      checked_at: null,
      last_successful_at: null,
      top_items: [],
      all_items: [],
      by_type: { leads: [], deals: [], tasks: [] },
    };
  }

  const c = raw.counts ?? {};

  const newCount = clampNumber(
    Number(c.new ?? c.new_items ?? c.newCount ?? 0), 0, 999999
  );
  const updatedCount = clampNumber(
    Number(c.updated ?? c.updated_items ?? c.updatedCount ?? 0), 0, 999999
  );
  const conflictCount = clampNumber(
    Number(c.conflict ?? c.conflicts ?? c.conflict_items ?? 0), 0, 999999
  );
  const total = clampNumber(
    Number(c.total ?? newCount + updatedCount + conflictCount), 0, 999999
  );

  const severity = (['quiet', 'moderate', 'attention_needed'] as const).includes(raw.severity)
    ? raw.severity
    : 'quiet';

  const allItems = Array.isArray(raw.all_items) ? raw.all_items
    : Array.isArray(raw.items) ? raw.items
    : [];

  const topItems = Array.isArray(raw.top_items) ? raw.top_items : [];

  const byType = raw.by_type ?? raw.byType ?? {};

  return {
    severity,
    drift_reason: typeof raw.drift_reason === 'string' ? raw.drift_reason : '',
    counts: { new: newCount, updated: updatedCount, conflicts: conflictCount, total },
    checked_at: raw.checked_at ?? raw.timestamps?.checked_at ?? null,
    last_successful_at: raw.last_successful_at ?? raw.timestamps?.last_successful_at ?? null,
    top_items: topItems,
    all_items: allItems,
    by_type: {
      leads: Array.isArray(byType.leads) ? byType.leads : [],
      deals: Array.isArray(byType.deals) ? byType.deals : [],
      tasks: Array.isArray(byType.tasks) ? byType.tasks : [],
    },
  };
}
