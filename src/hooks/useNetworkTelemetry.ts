import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type EventType = 'task_completed' | 'touch_logged' | 'lead_converted' | 'lead_lost' | 'deal_closed' | 'deal_cancelled' | 'autopilot_action_started' | 'autopilot_action_completed';
type EntityType = 'lead' | 'deal' | 'task';
type Channel = 'call' | 'text' | 'email' | 'showing' | 'note' | 'none';
type TimeBucket = 'under_5m' | 'under_1h' | 'same_day' | 'next_day' | '2_3_days' | '4_7_days' | 'over_7_days';
type MoneyBucket = 'under_1k' | '1k_3k' | '3k_7k' | '7k_15k' | '15k_plus';
type RiskBucket = 'low' | 'medium' | 'high';
type OpportunityBucket = 'watch' | 'warm' | 'hot';
type WorkloadBucket = 'stable' | 'watch' | 'strained' | 'overloaded';

interface TelemetryEvent {
  event_type: EventType;
  entity_type: EntityType;
  channel?: Channel | null;
  stage?: string | null;
  time_to_action_bucket?: TimeBucket | null;
  response_time_bucket?: TimeBucket | null;
  outcome_bucket?: string | null;
  money_bucket?: MoneyBucket | null;
  risk_bucket?: RiskBucket | null;
  opportunity_bucket?: OpportunityBucket | null;
  workload_bucket?: WorkloadBucket | null;
  region_bucket?: string | null;
}

interface NetworkParticipation {
  optedIn: boolean;
  useNetworkPriors: boolean;
  loading: boolean;
}

export function useNetworkTelemetry() {
  const { user } = useAuth();
  const [participation, setParticipation] = useState<NetworkParticipation>({
    optedIn: false,
    useNetworkPriors: false,
    loading: true,
  });

  // Load participation status
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await (supabase.from('network_participation' as any)
        .select('opted_in, use_network_priors')
        .eq('user_id', user.id)
        .maybeSingle() as any);
      setParticipation({
        optedIn: data?.opted_in ?? false,
        useNetworkPriors: data?.use_network_priors ?? false,
        loading: false,
      });
    })();
  }, [user?.id]);

  const setOptedIn = useCallback(async (value: boolean) => {
    if (!user?.id) return;
    await (supabase.from('network_participation' as any).upsert({
      user_id: user.id,
      opted_in: value,
      opted_in_at: value ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'user_id' }) as any);
    setParticipation(p => ({ ...p, optedIn: value }));
  }, [user?.id]);

  const setUseNetworkPriors = useCallback(async (value: boolean) => {
    if (!user?.id) return;
    await (supabase.from('network_participation' as any).upsert({
      user_id: user.id,
      use_network_priors: value,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'user_id' }) as any);
    setParticipation(p => ({ ...p, useNetworkPriors: value }));
  }, [user?.id]);

  const deleteMyData = useCallback(async () => {
    if (!user?.id) return;
    await (supabase.from('network_telemetry_events' as any).delete().eq('user_id', user.id) as any);
    await setOptedIn(false);
  }, [user?.id, setOptedIn]);

  // Emit telemetry event (only if opted in)
  const emit = useCallback(async (event: TelemetryEvent) => {
    if (!user?.id || !participation.optedIn) return;
    await (supabase.from('network_telemetry_events' as any).insert({
      user_id: user.id,
      org_id: null,
      ...event,
    } as any) as any);
  }, [user?.id, participation.optedIn]);

  return {
    participation,
    emit,
    setOptedIn,
    setUseNetworkPriors,
    deleteMyData,
  };
}

// Utility to compute money bucket from commission amount
export function toMoneyBucket(commission: number): MoneyBucket {
  if (commission < 1000) return 'under_1k';
  if (commission < 3000) return '1k_3k';
  if (commission < 7000) return '3k_7k';
  if (commission < 15000) return '7k_15k';
  return '15k_plus';
}

export function toRiskBucket(riskScore: number): RiskBucket {
  if (riskScore >= 60) return 'high';
  if (riskScore >= 30) return 'medium';
  return 'low';
}

export function toOpportunityBucket(score: number): OpportunityBucket {
  if (score >= 60) return 'hot';
  if (score >= 35) return 'warm';
  return 'watch';
}

export function toTimeBucket(minutesElapsed: number): TimeBucket {
  if (minutesElapsed < 5) return 'under_5m';
  if (minutesElapsed < 60) return 'under_1h';
  if (minutesElapsed < 1440) return 'same_day';
  if (minutesElapsed < 2880) return 'next_day';
  if (minutesElapsed < 4320) return '2_3_days';
  if (minutesElapsed < 10080) return '4_7_days';
  return 'over_7_days';
}
