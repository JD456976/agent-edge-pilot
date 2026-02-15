import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Light differential privacy: add bounded noise to a value
function addNoise(value: number, scale = 0.05): number {
  const noise = (Math.random() - 0.5) * 2 * scale * Math.max(value, 1);
  return Math.round((value + noise) * 100) / 100;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function bucketRate(arr: boolean[]): number {
  if (arr.length === 0) return 0;
  return arr.filter(Boolean).length / arr.length;
}

const TIME_BUCKET_ORDER = ['under_5m', 'under_1h', 'same_day', 'next_day', '2_3_days', '4_7_days', 'over_7_days'];

function medianBucket(buckets: string[]): string {
  if (buckets.length === 0) return 'unknown';
  const indices = buckets.map(b => TIME_BUCKET_ORDER.indexOf(b)).filter(i => i >= 0);
  if (indices.length === 0) return 'unknown';
  indices.sort((a, b) => a - b);
  const mid = Math.floor(indices.length / 2);
  const medIdx = indices.length % 2 ? indices[mid] : Math.round((indices[mid - 1] + indices[mid]) / 2);
  return TIME_BUCKET_ORDER[medIdx] || 'unknown';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Only aggregate for opted-in users
    const { data: participants } = await admin
      .from("network_participation")
      .select("user_id")
      .eq("opted_in", true);

    if (!participants || participants.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No opted-in users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = participants.map((p: any) => p.user_id);

    // K-anonymity threshold
    const K = 25;
    if (userIds.length < K) {
      return new Response(JSON.stringify({ ok: true, message: `Cohort too small (${userIds.length} < ${K})` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch recent telemetry for opted-in users
    const { data: events } = await admin
      .from("network_telemetry_events")
      .select("*")
      .in("user_id", userIds)
      .gte("created_at", weekAgo.toISOString())
      .limit(10000);

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No events in window" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute aggregated metrics
    const touchEvents = events.filter((e: any) => e.event_type === 'touch_logged');
    const conversionEvents = events.filter((e: any) => e.event_type === 'lead_converted');
    const lostEvents = events.filter((e: any) => e.event_type === 'lead_lost');
    const closedEvents = events.filter((e: any) => e.event_type === 'deal_closed');
    const cancelledEvents = events.filter((e: any) => e.event_type === 'deal_cancelled');
    const taskEvents = events.filter((e: any) => e.event_type === 'task_completed');
    const autopilotStarted = events.filter((e: any) => e.event_type === 'autopilot_action_started');
    const autopilotCompleted = events.filter((e: any) => e.event_type === 'autopilot_action_completed');

    // Time to first touch by lead bucket
    const hotTouchTimes = touchEvents
      .filter((e: any) => e.opportunity_bucket === 'hot' && e.time_to_action_bucket)
      .map((e: any) => e.time_to_action_bucket);

    // Conversion rate by channel
    const channelConversions: Record<string, boolean[]> = {};
    for (const e of [...conversionEvents, ...lostEvents] as any[]) {
      const ch = e.channel || 'none';
      if (!channelConversions[ch]) channelConversions[ch] = [];
      channelConversions[ch].push(e.event_type === 'lead_converted');
    }

    const conversionByChannel: Record<string, number> = {};
    for (const [ch, outcomes] of Object.entries(channelConversions)) {
      if (outcomes.length >= 5) {
        conversionByChannel[ch] = addNoise(bucketRate(outcomes));
      }
    }

    // Deal close rate
    const dealOutcomes = [...closedEvents, ...cancelledEvents];
    const dealCloseRate = dealOutcomes.length >= 5
      ? addNoise(closedEvents.length / dealOutcomes.length)
      : null;

    // Autopilot completion rate
    const autopilotRate = autopilotStarted.length >= 5
      ? addNoise(autopilotCompleted.length / autopilotStarted.length)
      : null;

    // Task completion rate
    const uniqueUsers = new Set(events.map((e: any) => e.user_id));
    const taskCompletionRate = taskEvents.length >= 5
      ? addNoise(taskEvents.length / Math.max(events.filter((e: any) => e.entity_type === 'task').length, 1))
      : null;

    const metrics = {
      median_time_to_first_touch_hot: hotTouchTimes.length >= 5 ? medianBucket(hotTouchTimes) : null,
      conversion_rate_by_channel: Object.keys(conversionByChannel).length > 0 ? conversionByChannel : null,
      deal_close_rate: dealCloseRate,
      autopilot_completion_rate: autopilotRate,
      follow_up_task_completion_rate: taskCompletionRate,
      cohort_event_count: events.length,
    };

    // Upsert benchmark
    const cohortKey = "all_agents";
    await admin.from("network_benchmarks").insert({
      cohort_key: cohortKey,
      cohort_size: userIds.length,
      period: "weekly",
      window_start: weekAgo.toISOString(),
      window_end: now.toISOString(),
      metrics,
    });

    return new Response(JSON.stringify({ ok: true, cohort_size: userIds.length, metrics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
