import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function addNoise(value: number, scale = 0.05): number {
  const noise = (Math.random() - 0.5) * 2 * scale * Math.max(value, 1);
  return Math.round((value + noise) * 100) / 100;
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

// Playbook situation definitions (must match network_playbook_templates)
const SITUATION_PATTERNS: Record<string, { triggerBuckets: string[]; minEvents: number }> = {
  untouched_hot_lead_48h: { triggerBuckets: ['untouched_hot_lead'], minEvents: 10 },
  closing_3d_open_issues: { triggerBuckets: ['closing_soon'], minEvents: 10 },
  high_money_risk_pending: { triggerBuckets: ['high_money_risk'], minEvents: 10 },
  lead_decay_spike: { triggerBuckets: ['lead_decay'], minEvents: 10 },
  ghost_risk_high: { triggerBuckets: ['untouched_hot_lead', 'lead_decay'], minEvents: 10 },
  pipeline_gap_30_60: { triggerBuckets: ['overdue_task', 'lead_decay'], minEvents: 10 },
};

// Default playbook steps per situation (predefined, no user free text)
const DEFAULT_PLAYBOOK_STEPS: Record<string, any[]> = {
  untouched_hot_lead_48h: [
    { step_order: 1, action_type: 'call', timing_bucket: 'now', follow_up_required: true, recommended_follow_up_timing_bucket: 'same_day', notes_key: 'initial_outreach' },
    { step_order: 2, action_type: 'text', timing_bucket: 'under_1h', follow_up_required: true, recommended_follow_up_timing_bucket: 'next_day', notes_key: 'follow_up_text' },
    { step_order: 3, action_type: 'schedule_task', timing_bucket: 'next_day', follow_up_required: false, recommended_follow_up_timing_bucket: null, notes_key: 'schedule_showing' },
  ],
  closing_3d_open_issues: [
    { step_order: 1, action_type: 'call', timing_bucket: 'now', follow_up_required: true, recommended_follow_up_timing_bucket: 'same_day', notes_key: 'status_check' },
    { step_order: 2, action_type: 'request_docs', timing_bucket: 'same_day', follow_up_required: true, recommended_follow_up_timing_bucket: 'next_day', notes_key: 'document_collection' },
    { step_order: 3, action_type: 'email', timing_bucket: 'same_day', follow_up_required: false, recommended_follow_up_timing_bucket: null, notes_key: 'closing_confirmation' },
  ],
  high_money_risk_pending: [
    { step_order: 1, action_type: 'call', timing_bucket: 'now', follow_up_required: true, recommended_follow_up_timing_bucket: 'same_day', notes_key: 'risk_assessment' },
    { step_order: 2, action_type: 'email', timing_bucket: 'under_1h', follow_up_required: true, recommended_follow_up_timing_bucket: 'next_day', notes_key: 'action_plan' },
    { step_order: 3, action_type: 'schedule_task', timing_bucket: 'next_day', follow_up_required: false, recommended_follow_up_timing_bucket: null, notes_key: 'milestone_review' },
  ],
  lead_decay_spike: [
    { step_order: 1, action_type: 'call', timing_bucket: 'now', follow_up_required: true, recommended_follow_up_timing_bucket: 'same_day', notes_key: 'reengagement_call' },
    { step_order: 2, action_type: 'text', timing_bucket: 'same_day', follow_up_required: true, recommended_follow_up_timing_bucket: 'next_day', notes_key: 'value_reminder' },
  ],
  ghost_risk_high: [
    { step_order: 1, action_type: 'text', timing_bucket: 'now', follow_up_required: true, recommended_follow_up_timing_bucket: 'same_day', notes_key: 'gentle_check_in' },
    { step_order: 2, action_type: 'call', timing_bucket: 'same_day', follow_up_required: true, recommended_follow_up_timing_bucket: 'next_day', notes_key: 'direct_outreach' },
    { step_order: 3, action_type: 'email', timing_bucket: 'next_day', follow_up_required: false, recommended_follow_up_timing_bucket: null, notes_key: 'summary_update' },
  ],
  pipeline_gap_30_60: [
    { step_order: 1, action_type: 'schedule_task', timing_bucket: 'now', follow_up_required: true, recommended_follow_up_timing_bucket: 'same_day', notes_key: 'prospecting_block' },
    { step_order: 2, action_type: 'call', timing_bucket: 'same_day', follow_up_required: true, recommended_follow_up_timing_bucket: 'next_day', notes_key: 'past_client_outreach' },
  ],
};

function deriveEffectiveness(events: any[], situationKey: string): { band: string; confidence: string } {
  const relevant = events.filter((e: any) => {
    const pattern = SITUATION_PATTERNS[situationKey];
    if (!pattern) return false;
    return pattern.triggerBuckets.includes(e.trigger_bucket);
  });
  
  if (relevant.length < 10) return { band: 'low', confidence: 'LOW' };
  
  const positiveOutcomes = relevant.filter((e: any) => 
    e.outcome_bucket === 'converted' || e.outcome_bucket === 'closed'
  );
  const rate = positiveOutcomes.length / relevant.length;
  
  const band = rate >= 0.5 ? 'high' : rate >= 0.25 ? 'medium' : 'low';
  const confidence = relevant.length >= 50 ? 'HIGH' : relevant.length >= 25 ? 'MEDIUM' : 'LOW';
  
  return { band, confidence };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

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
    const K = 25;
    if (userIds.length < K) {
      return new Response(JSON.stringify({ ok: true, message: `Cohort too small (${userIds.length} < ${K})` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

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

    // ── Benchmark Metrics ──
    const touchEvents = events.filter((e: any) => e.event_type === 'touch_logged');
    const conversionEvents = events.filter((e: any) => e.event_type === 'lead_converted');
    const lostEvents = events.filter((e: any) => e.event_type === 'lead_lost');
    const closedEvents = events.filter((e: any) => e.event_type === 'deal_closed');
    const cancelledEvents = events.filter((e: any) => e.event_type === 'deal_cancelled');
    const taskEvents = events.filter((e: any) => e.event_type === 'task_completed');
    const autopilotStarted = events.filter((e: any) => e.event_type === 'autopilot_action_started');
    const autopilotCompleted = events.filter((e: any) => e.event_type === 'autopilot_action_completed');

    const hotTouchTimes = touchEvents
      .filter((e: any) => e.opportunity_bucket === 'hot' && e.time_to_action_bucket)
      .map((e: any) => e.time_to_action_bucket);

    const channelConversions: Record<string, boolean[]> = {};
    for (const e of [...conversionEvents, ...lostEvents] as any[]) {
      const ch = e.channel || 'none';
      if (!channelConversions[ch]) channelConversions[ch] = [];
      channelConversions[ch].push(e.event_type === 'lead_converted');
    }
    const conversionByChannel: Record<string, number> = {};
    for (const [ch, outcomes] of Object.entries(channelConversions)) {
      if (outcomes.length >= 5) conversionByChannel[ch] = addNoise(bucketRate(outcomes));
    }

    const dealOutcomes = [...closedEvents, ...cancelledEvents];
    const dealCloseRate = dealOutcomes.length >= 5 ? addNoise(closedEvents.length / dealOutcomes.length) : null;
    const autopilotRate = autopilotStarted.length >= 5 ? addNoise(autopilotCompleted.length / autopilotStarted.length) : null;
    const taskCompletionRate = taskEvents.length >= 5
      ? addNoise(taskEvents.length / Math.max(events.filter((e: any) => e.entity_type === 'task').length, 1))
      : null;

    // Risk recovery rate
    const highRiskEvents = events.filter((e: any) => e.risk_bucket === 'high');
    const recoveredEvents = events.filter((e: any) => 
      e.risk_bucket === 'low' || e.risk_bucket === 'medium'
    );
    const riskRecoveryRate = highRiskEvents.length >= 5
      ? addNoise(recoveredEvents.length / Math.max(highRiskEvents.length, 1))
      : null;

    const metrics = {
      median_time_to_first_touch_hot: hotTouchTimes.length >= 5 ? medianBucket(hotTouchTimes) : null,
      conversion_rate_by_channel: Object.keys(conversionByChannel).length > 0 ? conversionByChannel : null,
      deal_close_rate: dealCloseRate,
      autopilot_completion_rate: autopilotRate,
      follow_up_task_completion_rate: taskCompletionRate,
      risk_recovery_rate_7d: riskRecoveryRate,
      cohort_event_count: events.length,
    };

    const cohortKey = "all_agents";
    await admin.from("network_benchmarks").insert({
      cohort_key: cohortKey,
      cohort_size: userIds.length,
      period: "weekly",
      window_start: weekAgo.toISOString(),
      window_end: now.toISOString(),
      metrics,
    });

    // ── Derive Playbooks ──
    const playbooksGenerated: string[] = [];
    for (const [situationKey, pattern] of Object.entries(SITUATION_PATTERNS)) {
      const relevantEvents = events.filter((e: any) => 
        pattern.triggerBuckets.includes(e.trigger_bucket)
      );
      
      if (relevantEvents.length < pattern.minEvents) continue;
      
      const { band, confidence } = deriveEffectiveness(events, situationKey);
      const steps = DEFAULT_PLAYBOOK_STEPS[situationKey];
      if (!steps) continue;

      await admin.from("network_playbooks").insert({
        cohort_key: cohortKey,
        situation_key: situationKey,
        cohort_size: userIds.length,
        period: "weekly",
        window_start: weekAgo.toISOString(),
        window_end: now.toISOString(),
        playbook_steps: steps,
        effectiveness_band: band,
        confidence_band: confidence,
        guardrails: { max_actions_per_day: 5, cooldown_hours: 4 },
      });
      playbooksGenerated.push(situationKey);
    }

    return new Response(JSON.stringify({ 
      ok: true, cohort_size: userIds.length, metrics,
      playbooks_generated: playbooksGenerated,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
