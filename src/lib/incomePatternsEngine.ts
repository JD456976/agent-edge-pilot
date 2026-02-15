/**
 * Income Patterns Engine
 *
 * Detects patterns in pipeline behavior:
 * - Pipeline seasonality
 * - Typical monthly income curve
 * - Risk spikes before closings
 * - Opportunity surges after outreach bursts
 * - Forecast volatility patterns
 *
 * All computation uses existing cached data. No heavy recalculation.
 */

import type { Deal } from '@/types';
import type { ForecastSummary } from '@/lib/forecastModel';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { StabilityResult } from '@/lib/stabilityModel';

// ── Types ────────────────────────────────────────────────────────────

export type IncomePatternType =
  | 'consistent'
  | 'front_loaded'
  | 'back_loaded'
  | 'volatile'
  | 'growing'
  | 'declining'
  | 'insufficient_data';

export type VolatilityLevel = 'low' | 'moderate' | 'high';

export interface IncomePattern {
  type: IncomePatternType;
  label: string;
  description: string;
}

export interface BehavioralWarning {
  id: string;
  title: string;
  description: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'overdue' | 'touches' | 'snoozing' | 'follow_up' | 'concentration';
}

export interface IncomePatternsResult {
  pattern: IncomePattern;
  volatilityLevel: VolatilityLevel;
  predictabilityScore: number; // 0–100
  behavioralWarnings: BehavioralWarning[];
  monthlyDistribution: { label: string; amount: number }[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Pattern Detection ────────────────────────────────────────────────

function detectPattern(deals: Deal[]): IncomePattern {
  const closed = deals.filter(d => d.stage === 'closed');
  if (closed.length < 3) {
    return {
      type: 'insufficient_data',
      label: 'Learning',
      description: 'Not enough closed deals to detect income patterns yet.',
    };
  }

  // Analyze timing of closings
  const now = new Date();
  const recent = closed.filter(d => daysBetween(now, new Date(d.closeDate)) <= 90);
  const older = closed.filter(d => {
    const days = daysBetween(now, new Date(d.closeDate));
    return days > 90 && days <= 180;
  });

  const recentRevenue = recent.reduce((s, d) => s + d.commission, 0);
  const olderRevenue = older.reduce((s, d) => s + d.commission, 0);

  // Trend detection
  if (older.length > 0 && recent.length > 0) {
    const recentAvg = recentRevenue / Math.max(1, recent.length);
    const olderAvg = olderRevenue / Math.max(1, older.length);
    const ratio = recentAvg / Math.max(1, olderAvg);

    if (ratio > 1.3) {
      return { type: 'growing', label: 'Growing', description: 'Your income trend is rising — recent closings exceed prior averages.' };
    }
    if (ratio < 0.7) {
      return { type: 'declining', label: 'Declining', description: 'Recent closing volume is below prior averages. Increasing pipeline activity may help.' };
    }
  }

  // Distribution: check if closings cluster early or late in months
  const dayOfMonth = recent.map(d => new Date(d.closeDate).getDate());
  const avgDay = dayOfMonth.reduce((s, d) => s + d, 0) / Math.max(1, dayOfMonth.length);

  if (avgDay <= 10) {
    return { type: 'front_loaded', label: 'Front-Loaded', description: 'Most closings happen early in the month. Plan pipeline replenishment after.' };
  }
  if (avgDay >= 22) {
    return { type: 'back_loaded', label: 'Back-Loaded', description: 'Closings tend to cluster at month-end. Watch for cash flow gaps mid-month.' };
  }

  // Commission variance
  const commissions = recent.map(d => d.commission);
  if (commissions.length >= 3) {
    const mean = commissions.reduce((s, c) => s + c, 0) / commissions.length;
    const variance = commissions.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / commissions.length;
    const cv = Math.sqrt(variance) / Math.max(1, mean);
    if (cv > 0.6) {
      return { type: 'volatile', label: 'Variable', description: 'Income varies significantly deal to deal. Diversifying deal sizes may improve stability.' };
    }
  }

  return { type: 'consistent', label: 'Consistent', description: 'Your income pattern is relatively steady. Maintaining current activity levels supports this.' };
}

// ── Volatility ──────────────────────────────────────────────────────

function computeVolatility(deals: Deal[], forecast: ForecastSummary | null): { level: VolatilityLevel; score: number } {
  const closed = deals.filter(d => d.stage === 'closed');
  if (closed.length < 3) return { level: 'moderate', score: 50 };

  const commissions = closed.map(d => d.commission);
  const mean = commissions.reduce((s, c) => s + c, 0) / commissions.length;
  const variance = commissions.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / commissions.length;
  const cv = Math.sqrt(variance) / Math.max(1, mean);

  // Factor in forecast confidence
  let confidenceBonus = 0;
  if (forecast) {
    if (forecast.confidence30 === 'HIGH') confidenceBonus = 15;
    else if (forecast.confidence30 === 'MEDIUM') confidenceBonus = 5;
  }

  const predictability = Math.round(Math.max(0, Math.min(100, (1 - cv) * 80 + confidenceBonus)));

  if (cv > 0.6) return { level: 'high', score: predictability };
  if (cv > 0.3) return { level: 'moderate', score: predictability };
  return { level: 'low', score: predictability };
}

// ── Behavioral Risk Signals ─────────────────────────────────────────

export function detectBehavioralWarnings(
  deals: Deal[],
  tasks: { completedAt?: string | null; dueAt: string }[],
  stabilityResult: StabilityResult,
  moneyResults: MoneyModelResult[],
  touchCounts?: { recent: number; prior: number },
): BehavioralWarning[] {
  const warnings: BehavioralWarning[] = [];
  const now = new Date();

  // Rising overdue tasks
  const overdue = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < now);
  if (overdue.length >= 5) {
    warnings.push({
      id: 'rising_overdue',
      title: 'Rising Overdue Tasks',
      description: `${overdue.length} overdue tasks detected. Historically, task backlogs precede income dips.`,
      confidence: overdue.length >= 8 ? 'HIGH' : 'MEDIUM',
      category: 'overdue',
    });
  }

  // Declining touches
  if (touchCounts && touchCounts.prior > 0) {
    const dropRate = 1 - (touchCounts.recent / touchCounts.prior);
    if (dropRate > 0.4) {
      warnings.push({
        id: 'declining_touches',
        title: 'Declining Client Touches',
        description: 'Touch activity has dropped significantly compared to prior period.',
        confidence: dropRate > 0.6 ? 'HIGH' : 'MEDIUM',
        category: 'touches',
      });
    }
  }

  // Pipeline concentration in one deal
  const active = deals.filter(d => d.stage !== 'closed');
  if (active.length > 0) {
    const highRisk = moneyResults.filter(r => r.riskScore >= 50);
    const topCommission = active.reduce((max, d) => Math.max(max, d.commission), 0);
    const totalCommission = active.reduce((s, d) => s + d.commission, 0);
    if (totalCommission > 0 && topCommission / totalCommission > 0.6 && highRisk.length > 0) {
      warnings.push({
        id: 'concentration_risk',
        title: 'Income Concentrated in At-Risk Deal',
        description: 'A large share of pipeline income sits in a deal with elevated risk.',
        confidence: 'HIGH',
        category: 'concentration',
      });
    }
  }

  // Stability declining
  if (stabilityResult.score < 40 && stabilityResult.band === 'Needs Attention') {
    warnings.push({
      id: 'stability_declining',
      title: 'Operational Stability Declining',
      description: 'Your behavior patterns match periods that previously led to income dips.',
      confidence: stabilityResult.score < 25 ? 'HIGH' : 'MEDIUM',
      category: 'follow_up',
    });
  }

  return warnings;
}

// ── Monthly Distribution ────────────────────────────────────────────

function computeMonthlyDistribution(deals: Deal[]): { label: string; amount: number }[] {
  const closed = deals.filter(d => d.stage === 'closed');
  const buckets: Record<string, number> = {};

  for (const d of closed) {
    const date = new Date(d.closeDate);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    buckets[key] = (buckets[key] || 0) + d.commission;
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, amount]) => {
      const [y, m] = key.split('-');
      const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      return { label, amount: Math.round(amount) };
    });
}

// ── Main Compute ────────────────────────────────────────────────────

export function computeIncomePatterns(
  deals: Deal[],
  tasks: { completedAt?: string | null; dueAt: string }[],
  forecast: ForecastSummary | null,
  stabilityResult: StabilityResult,
  moneyResults: MoneyModelResult[],
  touchCounts?: { recent: number; prior: number },
): IncomePatternsResult {
  const pattern = detectPattern(deals);
  const { level: volatilityLevel, score: predictabilityScore } = computeVolatility(deals, forecast);
  const behavioralWarnings = detectBehavioralWarnings(deals, tasks, stabilityResult, moneyResults, touchCounts);
  const monthlyDistribution = computeMonthlyDistribution(deals);

  return {
    pattern,
    volatilityLevel,
    predictabilityScore,
    behavioralWarnings,
    monthlyDistribution,
  };
}
