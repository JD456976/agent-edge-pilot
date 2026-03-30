import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { Deal, DealParticipant } from '@/types';
import { computeForecastBatch } from '@/lib/forecastModel';
import { cn } from '@/lib/utils';

interface Props {
  deals: Deal[];
  participants: DealParticipant[];
  userId: string;
  annualTarget?: number;
}

interface MonthPoint {
  label: string;
  month: number;
  pessimistic: number;
  expected: number;
  optimistic: number;
}

function formatK(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function ScenarioBandChart({ deals, participants, userId, annualTarget }: Props) {
  const data = useMemo(() => {
    const now = new Date();
    const activeDeals = deals.filter(d => d.stage !== 'closed');
    const closedDeals = deals.filter(d => d.stage === 'closed');

    // Build 6-month projection
    const months: MonthPoint[] = [];

    // Historical closed income for last 2 months
    for (let offset = -2; offset <= 0; offset++) {
      const m = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
      const closedInMonth = closedDeals.filter(d => {
        const cd = new Date(d.closeDate);
        return cd >= m && cd <= mEnd;
      });
      const total = closedInMonth.reduce((s, d) => s + (d.userCommission ?? d.commission ?? 0), 0);
      months.push({
        label: m.toLocaleDateString('en-US', { month: 'short' }),
        month: offset,
        pessimistic: total,
        expected: total,
        optimistic: total,
      });
    }

    // Future months: use pipeline probability
    const forecast = computeForecastBatch(deals, participants, userId);
    if (!forecast) return months;

    for (let offset = 1; offset <= 5; offset++) {
      const m = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);

      let pessimistic = 0;
      let expected = 0;
      let optimistic = 0;

      for (const contrib of forecast.topContributors) {
        const closeDate = new Date(contrib.closeDate);
        if (closeDate >= m && closeDate <= mEnd) {
          const commission = contrib.expectedPersonalCommission;
          const prob = contrib.stageProbability;

          // Pessimistic: only high-probability deals at reduced rate
          pessimistic += commission * Math.max(0, prob - 0.2);
          // Expected: probability-weighted
          expected += commission * prob;
          // Optimistic: boosted probability
          optimistic += commission * Math.min(1, prob + 0.2);
        }
      }

      months.push({
        label: m.toLocaleDateString('en-US', { month: 'short' }),
        month: offset,
        pessimistic: Math.round(pessimistic),
        expected: Math.round(expected),
        optimistic: Math.round(optimistic),
      });
    }

    return months;
  }, [deals, participants, userId]);

  const monthlyTarget = annualTarget ? Math.round(annualTarget / 12) : undefined;
  const maxVal = Math.max(...data.map(d => d.optimistic), monthlyTarget ?? 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-[3px] h-4 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500" />
        <h3 className="text-sm font-semibold tracking-[-0.02em] text-foreground">
          Income Scenarios
        </h3>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Optimistic</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full bg-indigo-500" />
          <span className="text-muted-foreground">Expected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">Conservative</span>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
          <defs>
            <linearGradient id="optimisticGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="expectedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#6366F1" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="pessimisticGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatK}
            tick={{ fontSize: 10, fill: '#64748B' }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 10,
              fontSize: 12,
              color: '#E2E8F0',
            }}
            formatter={(value: number, name: string) => [
              formatK(value),
              name === 'optimistic' ? 'Optimistic' : name === 'expected' ? 'Expected' : 'Conservative',
            ]}
            labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
          />

          {monthlyTarget && (
            <ReferenceLine
              y={monthlyTarget}
              stroke="#7C3AED"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{
                value: `Target ${formatK(monthlyTarget)}/mo`,
                position: 'right',
                fontSize: 10,
                fill: '#A78BFA',
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="optimistic"
            stroke="#10B981"
            strokeWidth={1.5}
            fill="url(#optimisticGrad)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="expected"
            stroke="#6366F1"
            strokeWidth={2}
            fill="url(#expectedGrad)"
            dot={false}
            activeDot={{ r: 4, stroke: '#6366F1', strokeWidth: 2, fill: '#1E293B' }}
          />
          <Area
            type="monotone"
            dataKey="pessimistic"
            stroke="#F59E0B"
            strokeWidth={1.5}
            fill="url(#pessimisticGrad)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Summary pills */}
      <div className="flex gap-2 mt-3">
        {data.filter(d => d.month > 0).length > 0 && (() => {
          const futureData = data.filter(d => d.month > 0);
          const totalExpected = futureData.reduce((s, d) => s + d.expected, 0);
          const totalOptimistic = futureData.reduce((s, d) => s + d.optimistic, 0);
          const totalPessimistic = futureData.reduce((s, d) => s + d.pessimistic, 0);
          return (
            <>
              <div className="flex-1 rounded-lg p-2 text-center" style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
                <p className="text-[10px] text-amber-400/80">Conservative</p>
                <p className="text-sm font-bold text-amber-400">{formatK(totalPessimistic)}</p>
              </div>
              <div className="flex-1 rounded-lg p-2 text-center border border-indigo-500/20" style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)' }}>
                <p className="text-[10px] text-indigo-300/80">Expected</p>
                <p className="text-sm font-bold text-indigo-300">{formatK(totalExpected)}</p>
              </div>
              <div className="flex-1 rounded-lg p-2 text-center" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)' }}>
                <p className="text-[10px] text-emerald-400/80">Optimistic</p>
                <p className="text-sm font-bold text-emerald-400">{formatK(totalOptimistic)}</p>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
