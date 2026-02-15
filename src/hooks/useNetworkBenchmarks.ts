import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface BenchmarkMetrics {
  median_time_to_first_touch_hot?: string | null;
  conversion_rate_by_channel?: Record<string, number> | null;
  deal_close_rate?: number | null;
  autopilot_completion_rate?: number | null;
  follow_up_task_completion_rate?: number | null;
  cohort_event_count?: number;
}

export interface NetworkBenchmark {
  cohortKey: string;
  cohortSize: number;
  period: string;
  windowStart: string;
  windowEnd: string;
  metrics: BenchmarkMetrics;
}

export function useNetworkBenchmarks() {
  const { user } = useAuth();
  const [benchmark, setBenchmark] = useState<NetworkBenchmark | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await (supabase.from('network_benchmarks' as any)
        .select('*')
        .eq('cohort_key', 'all_agents')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() as any);

      if (data) {
        setBenchmark({
          cohortKey: data.cohort_key,
          cohortSize: data.cohort_size,
          period: data.period,
          windowStart: data.window_start,
          windowEnd: data.window_end,
          metrics: data.metrics as BenchmarkMetrics,
        });
      }
      setLoading(false);
    })();
  }, [user?.id]);

  return { benchmark, loading };
}
