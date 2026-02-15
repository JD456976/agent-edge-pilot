import { describe, it, expect } from 'vitest';
import {
  clampMoney,
  clampScore,
  computePersonalCommissionTotal,
  computeStageProbability,
  computeRiskScore,
  computeConfidence,
  computeMoneyModel,
} from '@/lib/moneyModel';
import type { Deal, DealParticipant } from '@/types';

const baseDeal: Deal = {
  id: 'deal-1',
  title: 'Test Deal',
  stage: 'pending',
  price: 500000,
  commission: 15000,
  closeDate: new Date(Date.now() + 5 * 86400000).toISOString(),
  riskLevel: 'yellow',
  assignedToUserId: 'user-1',
  milestoneStatus: { inspection: 'unknown', financing: 'unknown', appraisal: 'unknown' },
};

const participant: DealParticipant = {
  id: 'p-1',
  dealId: 'deal-1',
  userId: 'user-1',
  role: 'primary_agent',
  splitPercent: 50,
};

describe('clampMoney', () => {
  it('clamps NaN to 0', () => expect(clampMoney(NaN)).toBe(0));
  it('clamps negative to 0', () => expect(clampMoney(-100)).toBe(0));
  it('passes positive through', () => expect(clampMoney(5000)).toBe(5000));
});

describe('clampScore', () => {
  it('clamps NaN to 0', () => expect(clampScore(NaN)).toBe(0));
  it('clamps above 100 to 100', () => expect(clampScore(150)).toBe(100));
  it('clamps negative to 0', () => expect(clampScore(-10)).toBe(0));
});

describe('computePersonalCommissionTotal', () => {
  it('returns 0 when no participant', () => {
    const r = computePersonalCommissionTotal(baseDeal, [], 'user-1');
    expect(r.total).toBe(0);
    expect(r.hasParticipant).toBe(false);
  });

  it('computes split correctly', () => {
    const r = computePersonalCommissionTotal(baseDeal, [participant], 'user-1');
    expect(r.total).toBe(7500); // 15000 * 50%
    expect(r.hasParticipant).toBe(true);
  });

  it('applies referral fee before split', () => {
    const deal = { ...baseDeal, referralFeePercent: 20 };
    const r = computePersonalCommissionTotal(deal, [participant], 'user-1');
    expect(r.total).toBe(6000); // 15000 * 0.8 * 0.5
  });

  it('uses override when present', () => {
    const p = { ...participant, commissionOverride: 3000 };
    const r = computePersonalCommissionTotal(baseDeal, [p], 'user-1');
    expect(r.total).toBe(3000);
  });

  it('detects split over 100%', () => {
    const p2: DealParticipant = { ...participant, id: 'p-2', userId: 'user-2', splitPercent: 60 };
    const r = computePersonalCommissionTotal(baseDeal, [participant, p2], 'user-1');
    expect(r.splitWarning).toBe(true);
  });
});

describe('computeStageProbability', () => {
  it('returns 0.80 for pending', () => {
    expect(computeStageProbability(baseDeal)).toBe(0.90); // within 7 days
  });

  it('returns default for unknown stage', () => {
    const deal = { ...baseDeal, stage: 'unknown' as any, closeDate: new Date(Date.now() + 30 * 86400000).toISOString() };
    expect(computeStageProbability(deal)).toBe(0.20);
  });
});

describe('computeRiskScore', () => {
  it('adds points for milestone uncertainty', () => {
    const { score } = computeRiskScore(baseDeal);
    expect(score).toBeGreaterThanOrEqual(60); // 3 milestones unknown = 60, plus close proximity
  });
});

describe('computeConfidence', () => {
  it('returns low when no participant', () => {
    expect(computeConfidence(baseDeal, false, false)).toBe('low');
  });

  it('returns high when all data present', () => {
    const deal = {
      ...baseDeal,
      lastTouchedAt: new Date().toISOString(),
      milestoneStatus: { inspection: 'complete' as const, financing: 'approved' as const, appraisal: 'complete' as const },
    };
    expect(computeConfidence(deal, true, false)).toBe('high');
  });
});

describe('computeMoneyModel full', () => {
  it('never returns NaN', () => {
    const result = computeMoneyModel(baseDeal, [participant], 'user-1');
    expect(Number.isFinite(result.personalCommissionTotal)).toBe(true);
    expect(Number.isFinite(result.expectedPersonalCommission)).toBe(true);
    expect(Number.isFinite(result.personalCommissionAtRisk)).toBe(true);
    expect(Number.isFinite(result.riskScore)).toBe(true);
    expect(result.personalCommissionAtRisk).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 at risk when no participant', () => {
    const result = computeMoneyModel(baseDeal, [], 'user-1');
    expect(result.personalCommissionAtRisk).toBe(0);
    expect(result.confidence).toBe('low');
  });
});
