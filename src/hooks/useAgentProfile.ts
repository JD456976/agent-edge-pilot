import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Deal, Lead } from '@/types';
import type { StabilityResult } from '@/lib/stabilityModel';
import type { ForecastSummary } from '@/lib/forecastModel';
import type { MoneyModelResult } from '@/lib/moneyModel';

export interface AgentProfile {
  activeDaysLast30: number;
  avgDailyActions: number;
  bestTimeOfDayBucket: string | null;
  preferredChannelCallPct: number;
  preferredChannelTextPct: number;
  preferredChannelEmailPct: number;
  avgResponseTimeBucket: string | null;
  leadConversionRateEstimate: number;
  dealCloseRateEstimate: number;
  avgTimeToCloseBucket: string | null;
  stabilityTrend: 'improving' | 'stable' | 'declining';
  incomeTrend: 'rising' | 'flat' | 'declining';
  riskTolerance: 'low' | 'medium' | 'high';
  lastUpdated: string;
}

const DEFAULT_PROFILE: AgentProfile = {
  activeDaysLast30: 0,
  avgDailyActions: 0,
  bestTimeOfDayBucket: null,
  preferredChannelCallPct: 33,
  preferredChannelTextPct: 33,
  preferredChannelEmailPct: 34,
  avgResponseTimeBucket: null,
  leadConversionRateEstimate: 0,
  dealCloseRateEstimate: 0,
  avgTimeToCloseBucket: null,
  stabilityTrend: 'stable',
  incomeTrend: 'flat',
  riskTolerance: 'medium',
  lastUpdated: new Date().toISOString(),
};

export function useAgentProfile(
  userId: string | undefined,
  deals: Deal[],
  leads: Lead[],
  tasks: { completedAt?: string | null; dueAt: string; type?: string }[],
  stabilityResult: StabilityResult,
  forecast: ForecastSummary | null,
  moneyResults: MoneyModelResult[],
) {
  const [profile, setProfile] = useState<AgentProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);

  // Load from DB
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await (supabase
        .from('agent_intelligence_profile' as any)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle() as any);

      if (data) {
        setProfile({
          activeDaysLast30: data.active_days_last_30 ?? 0,
          avgDailyActions: Number(data.avg_daily_actions ?? 0),
          bestTimeOfDayBucket: data.best_time_of_day_bucket,
          preferredChannelCallPct: Number(data.preferred_channel_call_pct ?? 33),
          preferredChannelTextPct: Number(data.preferred_channel_text_pct ?? 33),
          preferredChannelEmailPct: Number(data.preferred_channel_email_pct ?? 34),
          avgResponseTimeBucket: data.avg_response_time_bucket,
          leadConversionRateEstimate: Number(data.lead_conversion_rate_estimate ?? 0),
          dealCloseRateEstimate: Number(data.deal_close_rate_estimate ?? 0),
          avgTimeToCloseBucket: data.avg_time_to_close_bucket,
          stabilityTrend: data.stability_trend ?? 'stable',
          incomeTrend: data.income_trend ?? 'flat',
          riskTolerance: data.risk_tolerance ?? 'medium',
          lastUpdated: data.last_updated ?? new Date().toISOString(),
        });
      }
      setLoading(false);
    })();
  }, [userId]);

  // Recompute and persist profile (weekly-equivalent: called on mount, debounced)
  const refreshProfile = useCallback(async () => {
    if (!userId) return;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Active days: days with completed tasks in last 30
    const completedRecent = tasks.filter(t => t.completedAt && new Date(t.completedAt) >= thirtyDaysAgo);
    const activeDays = new Set(completedRecent.map(t => new Date(t.completedAt!).toDateString())).size;
    const avgDaily = activeDays > 0 ? Math.round((completedRecent.length / activeDays) * 10) / 10 : 0;

    // Channel preferences from task types
    const callTasks = tasks.filter(t => t.type === 'call').length;
    const textTasks = tasks.filter(t => t.type === 'text').length;
    const emailTasks = tasks.filter(t => t.type === 'email').length;
    const totalTyped = callTasks + textTasks + emailTasks || 1;

    // Lead conversion & deal close rates
    const totalLeads = leads.length || 1;
    const converted = leads.filter(l => l.statusTags?.includes('converted')).length;
    const convRate = Math.round((converted / totalLeads) * 100) / 100;

    const totalDeals = deals.length || 1;
    const closed = deals.filter(d => d.stage === 'closed').length;
    const closeRate = Math.round((closed / totalDeals) * 100) / 100;

    // Stability trend
    const stabilityTrend: 'improving' | 'stable' | 'declining' =
      stabilityResult.score >= 75 ? 'improving' :
      stabilityResult.score >= 50 ? 'stable' : 'declining';

    // Income trend from forecast
    const projected = forecast?.next30 ?? 0;
    const prior = forecast?.next90 ? (forecast.next90 - projected) / 2 : 0;
    const incomeTrend: 'rising' | 'flat' | 'declining' =
      projected > prior * 1.2 ? 'rising' :
      projected < prior * 0.8 ? 'declining' : 'flat';

    // Risk tolerance from deal risk profile
    const highRiskDeals = moneyResults.filter(r => r.riskScore >= 60).length;
    const activeDeals = deals.filter(d => d.stage !== 'closed').length || 1;
    const riskTolerance: 'low' | 'medium' | 'high' =
      highRiskDeals / activeDeals > 0.4 ? 'high' :
      highRiskDeals / activeDeals > 0.15 ? 'medium' : 'low';

    // Avg time to close
    const closedDeals = deals.filter(d => d.stage === 'closed');
    let avgTimeToCloseBucket: string | null = null;
    if (closedDeals.length >= 2) {
      const avgDays = closedDeals.reduce((s, d) => {
        const created = new Date(d.createdAt || d.closeDate);
        const closedAt = new Date(d.closeDate);
        return s + Math.max(0, (closedAt.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      }, 0) / closedDeals.length;
      if (avgDays <= 30) avgTimeToCloseBucket = 'under_30d';
      else if (avgDays <= 60) avgTimeToCloseBucket = '30_60d';
      else if (avgDays <= 90) avgTimeToCloseBucket = '60_90d';
      else avgTimeToCloseBucket = 'over_90d';
    }

    const updated: AgentProfile = {
      activeDaysLast30: activeDays,
      avgDailyActions: avgDaily,
      bestTimeOfDayBucket: null, // computed from self-opt data
      preferredChannelCallPct: Math.round((callTasks / totalTyped) * 100),
      preferredChannelTextPct: Math.round((textTasks / totalTyped) * 100),
      preferredChannelEmailPct: Math.round((emailTasks / totalTyped) * 100),
      avgResponseTimeBucket: null,
      leadConversionRateEstimate: convRate,
      dealCloseRateEstimate: closeRate,
      avgTimeToCloseBucket,
      stabilityTrend,
      incomeTrend,
      riskTolerance,
      lastUpdated: now.toISOString(),
    };

    setProfile(updated);

    // Persist
    await (supabase.from('agent_intelligence_profile' as any).upsert({
      user_id: userId,
      active_days_last_30: updated.activeDaysLast30,
      avg_daily_actions: updated.avgDailyActions,
      best_time_of_day_bucket: updated.bestTimeOfDayBucket,
      preferred_channel_call_pct: updated.preferredChannelCallPct,
      preferred_channel_text_pct: updated.preferredChannelTextPct,
      preferred_channel_email_pct: updated.preferredChannelEmailPct,
      avg_response_time_bucket: updated.avgResponseTimeBucket,
      lead_conversion_rate_estimate: updated.leadConversionRateEstimate,
      deal_close_rate_estimate: updated.dealCloseRateEstimate,
      avg_time_to_close_bucket: updated.avgTimeToCloseBucket,
      stability_trend: updated.stabilityTrend,
      income_trend: updated.incomeTrend,
      risk_tolerance: updated.riskTolerance,
      last_updated: updated.lastUpdated,
    }, { onConflict: 'user_id' }) as any);
  }, [userId, deals, leads, tasks, stabilityResult, forecast, moneyResults]);

  // Auto-refresh on mount (simulates weekly update)
  useEffect(() => {
    if (!userId || loading) return;
    const lastUpdated = new Date(profile.lastUpdated);
    const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate > 24) {
      refreshProfile();
    }
  }, [userId, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetProfile = useCallback(async () => {
    if (!userId) return;
    await (supabase.from('agent_intelligence_profile' as any).delete().eq('user_id', userId) as any);
    setProfile(DEFAULT_PROFILE);
  }, [userId]);

  const exportProfile = useCallback(() => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent-intelligence-profile.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [profile]);

  return { profile, loading, refreshProfile, resetProfile, exportProfile };
}
