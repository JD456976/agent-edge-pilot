import { describe, it, expect } from 'vitest';
import { normalizeDriftSummary } from '@/lib/normalizeDriftSummary';

describe('normalizeDriftSummary', () => {
  it('handles null/undefined', () => {
    const r = normalizeDriftSummary(null);
    expect(r.counts).toEqual({ new: 0, updated: 0, conflicts: 0, total: 0 });
    expect(r.severity).toBe('quiet');
    expect(r.all_items).toEqual([]);
  });

  it('handles empty object', () => {
    const r = normalizeDriftSummary({});
    expect(r.counts.total).toBe(0);
    expect(r.top_items).toEqual([]);
  });

  it('handles missing counts', () => {
    const r = normalizeDriftSummary({ severity: 'moderate', drift_reason: 'test' });
    expect(r.counts).toEqual({ new: 0, updated: 0, conflicts: 0, total: 0 });
    expect(r.severity).toBe('moderate');
  });

  it('handles counts.new missing', () => {
    const r = normalizeDriftSummary({ counts: { updated: 3, conflict: 1, total: 4 } });
    expect(r.counts.new).toBe(0);
    expect(r.counts.updated).toBe(3);
    expect(r.counts.conflicts).toBe(1);
  });

  it('handles legacy key names', () => {
    const r = normalizeDriftSummary({ counts: { new_items: 2, updated_items: 1, conflict_items: 3 } });
    expect(r.counts.new).toBe(2);
    expect(r.counts.updated).toBe(1);
    expect(r.counts.conflicts).toBe(3);
    expect(r.counts.total).toBe(6);
  });

  it('computes total when missing', () => {
    const r = normalizeDriftSummary({ counts: { new: 1, updated: 2, conflict: 3 } });
    expect(r.counts.total).toBe(6);
  });

  it('preserves items arrays', () => {
    const items = [{ label: 'test' }];
    const r = normalizeDriftSummary({ all_items: items, top_items: items });
    expect(r.all_items).toEqual(items);
    expect(r.top_items).toEqual(items);
  });

  it('handles NaN values', () => {
    const r = normalizeDriftSummary({ counts: { new: NaN, updated: 'abc', conflict: undefined } });
    expect(r.counts.new).toBe(0);
    expect(r.counts.updated).toBe(0);
    expect(r.counts.conflicts).toBe(0);
  });
});
