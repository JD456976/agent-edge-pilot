import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { Deal, DealParticipant } from '@/types';
import { resolvePersonalCommission } from '@/lib/commissionResolver';

interface Props {
  deals: Deal[];
  participants: DealParticipant[];
  userId: string;
  annualTarget?: number;
}

interface MonthPoint {
  label: string;
  month: number;
  optimistic: number;
  expected: number;
  conservative: number;
}

function formatK(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function ScenarioBandChart({ deals, participants, userId, annualTarget }: Props) {
  const data = useMemo(() => {
    const now = new Date();
    const activeDeals = deals.filter(d => d.stage !== 'closed');
    const closedDeals = deals.filter(d => d.stage === 'closed');

    const months: MonthPoint[] = [];

    // Historical: last 2 months + current
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
        optimistic: total,
        expected: total,
        conservative: total,
      });
    }

    // Future 6 months using close_probability
    for (let offset = 1; offset <= 6; offset++) {
      const m = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);

      let optimistic = 0;
      let expected = 0;
      let conservative = 0;

      for (const deal of activeDeals) {
        const closeDate = new Date(deal.closeDate);
        if (closeDate < m || closeDate > mEnd) continue;

        const comm = deal.userCommission ?? deal.commission ?? 0;
        const prob = (deal.closeProbability ?? 70) / 100;

        // Optimistic (emerald, solid): all deals close at full value
        optimistic += comm;

        // Expected (indigo, solid): weighted by close probability
        expected += comm * prob;

        // Conservative (amber, dashed): only 70%+ probability deals
        if (prob >= 0.7) {
          conservative += comm * prob;
        }
      }

      months.push({
        label: m.toLocaleDateString('en-US', { month: 'short' }),
        month: offset,
        optimistic: Math.round(optimistic),
        expected: Math.round(expected),
        conservative: Math.round(conservative),
      });
    }

    return months;
  }, [deals, participants, userId]);

  const futureData = data.filter(d => d.month > 0);
  const totalOptimistic = futureData.reduce((s, d) => s + d.optimistic, 0);
  const totalExpected = futureData.reduce((s, d) => s + d.expected, 0);
  const totalConservative = futureData.reduce((s, d) => s + d.conservative, 0);

  const monthlyTarget = annualTarget ? Math.round(annualTarget / 12) : undefined;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-[3px] h-4 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500" />
        <h3 className="text-sm font-semibold tracking-[-0.02em] text-foreground">
          Income Scenarios
        </h3>
        <span className="ml-auto text-[11px] text-muted-foreground">Next 6 months</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Best Case</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full bg-indigo-500" />
          <span className="text-muted-foreground">Expected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded-full bg-amber-500 border-t border-dashed border-amber-500" />
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
              name === 'optimistic' ? 'Best Case' : name === 'expected' ? 'Expected' : 'Conservative',
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

          {/* Optimistic — emerald solid */}
          <Area
            type="monotone"
            dataKey="optimistic"
            stroke="#10B981"
            strokeWidth={2}
            fill="url(#optimisticGrad)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
          {/* Expected — indigo solid */}
          <Area
            type="monotone"
            dataKey="expected"
            stroke="#6366F1"
            strokeWidth={2}
            fill="url(#expectedGrad)"
            dot={false}
            activeDot={{ r: 4, stroke: '#6366F1', strokeWidth: 2, fill: '#1E293B' }}
          />
          {/* Conservative — amber dashed */}
          <Area
            type="monotone"
            dataKey="conservative"
            stroke="#F59E0B"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            fill="none"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Summary stat boxes */}
      <div className="flex gap-2 mt-3">
        <div className="flex-1 rounded-lg p-2.5 text-center" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)' }}>
          <p className="text-[10px] text-emerald-400/80 mb-0.5">Best Case</p>
          <p className="text-sm font-bold text-emerald-400">{formatK(totalOptimistic)}</p>
        </div>
        <div className="flex-1 rounded-lg p-2.5 text-center border border-indigo-500/20" style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)' }}>
          <p className="text-[10px] text-indigo-300/80 mb-0.5">Expected</p>
          <p className="text-sm font-bold text-indigo-300">{formatK(totalExpected)}</p>
        </div>
        <div className="flex-1 rounded-lg p-2.5 text-center" style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
          <p className="text-[10px] text-amber-400/80 mb-0.5">Conservative</p>
          <p className="text-sm font-bold text-amber-400">{formatK(totalConservative)}</p>
        </div>
      </div>
    </div>
  );
}
