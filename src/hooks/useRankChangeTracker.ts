import { useRef, useMemo } from 'react';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';

const RANK_STORAGE_KEY = 'dp-rank-snapshot';

interface RankSnapshot {
  deals: Record<string, number>; // dealId -> riskScore
  leads: Record<string, number>; // leadId -> opportunityScore
  timestamp: string;
}

export interface RankChange {
  id: string;
  previousScore: number;
  currentScore: number;
  delta: number;
  isNew: boolean;
  movedIntoTop5: boolean;
}

function loadSnapshot(): RankSnapshot | null {
  try {
    const raw = localStorage.getItem(RANK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSnapshot(snapshot: RankSnapshot) {
  localStorage.setItem(RANK_STORAGE_KEY, JSON.stringify(snapshot));
}

export function useRankChangeTracker(
  moneyResults: MoneyModelResult[],
  opportunityResults: OpportunityHeatResult[],
) {
  const previousRef = useRef<RankSnapshot | null>(null);
  const savedRef = useRef(false);

  // Load previous on first call
  if (previousRef.current === null && !savedRef.current) {
    previousRef.current = loadSnapshot();
  }

  const previous = previousRef.current;

  // Compute changes
  const dealChanges = useMemo(() => {
    if (!previous) return new Map<string, RankChange>();
    const changes = new Map<string, RankChange>();
    const top5Ids = new Set(moneyResults.slice(0, 5).map(r => r.dealId));

    moneyResults.slice(0, 20).forEach(r => {
      const prev = previous.deals[r.dealId];
      if (prev === undefined) {
        changes.set(r.dealId, { id: r.dealId, previousScore: 0, currentScore: r.riskScore, delta: r.riskScore, isNew: true, movedIntoTop5: top5Ids.has(r.dealId) });
      } else {
        const delta = r.riskScore - prev;
        if (Math.abs(delta) > 10 || (top5Ids.has(r.dealId) && !Object.keys(previous.deals).slice(0, 5).includes(r.dealId))) {
          changes.set(r.dealId, { id: r.dealId, previousScore: prev, currentScore: r.riskScore, delta, isNew: false, movedIntoTop5: top5Ids.has(r.dealId) });
        }
      }
    });
    return changes;
  }, [moneyResults, previous]);

  const leadChanges = useMemo(() => {
    if (!previous) return new Map<string, RankChange>();
    const changes = new Map<string, RankChange>();
    const top5Ids = new Set(opportunityResults.slice(0, 5).map(r => r.leadId));

    opportunityResults.slice(0, 20).forEach(r => {
      const prev = previous.leads[r.leadId];
      if (prev === undefined) {
        changes.set(r.leadId, { id: r.leadId, previousScore: 0, currentScore: r.opportunityScore, delta: r.opportunityScore, isNew: true, movedIntoTop5: top5Ids.has(r.leadId) });
      } else {
        const delta = r.opportunityScore - prev;
        if (Math.abs(delta) > 10 || (top5Ids.has(r.leadId) && !Object.keys(previous.leads).slice(0, 5).includes(r.leadId))) {
          changes.set(r.leadId, { id: r.leadId, previousScore: prev, currentScore: r.opportunityScore, delta, isNew: false, movedIntoTop5: top5Ids.has(r.leadId) });
        }
      }
    });
    return changes;
  }, [opportunityResults, previous]);

  // Save current snapshot (delayed to capture "previous" on first render)
  useMemo(() => {
    if (savedRef.current) return;
    if (moneyResults.length === 0 && opportunityResults.length === 0) return;

    const timer = setTimeout(() => {
      const snapshot: RankSnapshot = {
        deals: {},
        leads: {},
        timestamp: new Date().toISOString(),
      };
      moneyResults.slice(0, 20).forEach(r => { snapshot.deals[r.dealId] = r.riskScore; });
      opportunityResults.slice(0, 20).forEach(r => { snapshot.leads[r.leadId] = r.opportunityScore; });
      saveSnapshot(snapshot);
      savedRef.current = true;
    }, 3000);

    return () => clearTimeout(timer);
  }, [moneyResults, opportunityResults]);

  return { dealChanges, leadChanges };
}
