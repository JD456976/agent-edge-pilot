import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("FUB_ENCRYPTION_KEY")!;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { data: apiKey } = await serviceClient.rpc("get_decrypted_api_key", {
      p_user_id: user.id,
      p_encryption_key: encryptionKey,
    });
    if (!apiKey) throw new Error("No FUB API key configured");

    const fubAuth = `Basic ${btoa(apiKey + ":")}`;

    // Fetch recent calls for analytics
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const callsRes = await fetch(
      `https://api.followupboss.com/v1/calls?limit=100&sort=-created&dateFrom=${thirtyDaysAgo.toISOString().split("T")[0]}`,
      { headers: { Authorization: fubAuth, Accept: "application/json" } }
    );

    if (!callsRes.ok) throw new Error(`FUB API error: ${callsRes.status}`);

    const callsData = await callsRes.json();
    const calls = callsData.calls || [];

    // Compute smart number metrics
    let totalDuration = 0;
    let totalCalls = calls.length;
    let answeredCalls = 0;
    let inboundCalls = 0;
    let outboundCalls = 0;
    const hourBuckets: Record<number, number> = {};
    const dayBuckets: Record<number, number> = {};
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    for (const call of calls) {
      const duration = call.duration || 0;
      totalDuration += duration;
      if (duration > 0) answeredCalls++;
      if (call.isIncoming) inboundCalls++;
      else outboundCalls++;

      const callDate = new Date(call.created || call.dateCreated);
      const hour = callDate.getHours();
      const day = callDate.getDay();
      hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
      dayBuckets[day] = (dayBuckets[day] || 0) + 1;

      if (call.responseTime) {
        totalResponseTime += call.responseTime;
        responseTimeCount++;
      }
    }

    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
    const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
    const avgResponseTime = responseTimeCount > 0 ? Math.round(totalResponseTime / responseTimeCount) : null;

    // Find best hour and day
    const bestHour = Object.entries(hourBuckets).sort(([, a], [, b]) => b - a)[0];
    const bestDay = Object.entries(dayBuckets).sort(([, a], [, b]) => b - a)[0];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const metrics = {
      totalCalls,
      answeredCalls,
      answerRate,
      avgDurationSeconds: avgDuration,
      inboundCalls,
      outboundCalls,
      avgResponseTimeSeconds: avgResponseTime,
      bestTimeOfDay: bestHour ? `${parseInt(bestHour[0])}:00` : null,
      bestDayOfWeek: bestDay ? dayNames[parseInt(bestDay[0])] : null,
      callsPerDay: totalCalls > 0 ? Math.round(totalCalls / 30 * 10) / 10 : 0,
      hourDistribution: hourBuckets,
      period: "30d",
    };

    // Update agent intelligence profile with call metrics
    await serviceClient.from("agent_intelligence_profile").upsert({
      user_id: user.id,
      avg_response_time_bucket: avgResponseTime
        ? avgResponseTime < 300 ? "under_5m" : avgResponseTime < 900 ? "5_15m" : avgResponseTime < 3600 ? "15_60m" : "over_1h"
        : null,
      best_time_of_day_bucket: bestHour ? (parseInt(bestHour[0]) < 12 ? "morning" : parseInt(bestHour[0]) < 17 ? "afternoon" : "evening") : null,
      preferred_channel_call_pct: totalCalls > 0 ? 100 : 0,
      last_updated: now.toISOString(),
    }, { onConflict: "user_id" });

    return new Response(JSON.stringify(metrics), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
