import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const eventType = body.event || body.type || "unknown";
    const fubId = body.personId?.toString() || body.dealId?.toString() || body.id?.toString() || null;
    const entityType = body.personId ? "lead" : body.dealId ? "deal" : body.taskId ? "task" : "unknown";

    // Look up user by FUB integration — webhook needs a user_id mapping
    // FUB webhooks include an accountId we can use
    const accountId = body.accountId?.toString();
    let userId: string | null = null;

    if (accountId) {
      // Find user with this FUB account connected
      const { data: integrations } = await serviceClient
        .from("crm_integrations")
        .select("user_id")
        .eq("status", "connected")
        .limit(10);

      // For single-user setups, use the first connected user
      if (integrations && integrations.length > 0) {
        userId = integrations[0].user_id;
      }
    }

    if (!userId) {
      // Fallback: store with a placeholder, process later
      console.warn("No user mapping found for webhook event");
      return new Response(JSON.stringify({ received: true, warning: "no_user_mapping" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store the webhook event
    await serviceClient.from("fub_webhook_events").insert({
      user_id: userId,
      event_type: eventType,
      fub_id: fubId,
      entity_type: entityType,
      payload: body,
    });

    // Process common events immediately
    if (eventType === "peopleCreated" || eventType === "peopleUpdated") {
      // Update drift detection state
      await serviceClient.from("fub_sync_state").upsert({
        user_id: userId,
        drift_reason: `Webhook: ${eventType} for ${fubId}`,
        last_delta_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    if (eventType === "dealsCreated" || eventType === "dealsUpdated" || eventType === "dealsClosed") {
      await serviceClient.from("fub_sync_state").upsert({
        user_id: userId,
        drift_reason: `Webhook: ${eventType} for deal ${fubId}`,
        last_delta_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    return new Response(JSON.stringify({ received: true, event: eventType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
