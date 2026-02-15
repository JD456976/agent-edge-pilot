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
    const userId = user.id;

    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { data: apiKey } = await serviceClient.rpc("get_decrypted_api_key", {
      p_user_id: userId,
      p_encryption_key: encryptionKey,
    });
    if (!apiKey) throw new Error("No FUB API key configured");

    const { lead_id, action_plan_id } = await req.json();
    if (!lead_id) throw new Error("lead_id required");

    // Get lead info
    const { data: lead } = await serviceClient.from("leads")
      .select("name, imported_from, last_contact_at, last_touched_at, engagement_score, lead_temperature")
      .eq("id", lead_id).single();
    if (!lead) throw new Error("Lead not found");

    const fubId = lead.imported_from?.startsWith("fub:") ? lead.imported_from.replace("fub:", "") : null;
    if (!fubId) throw new Error("Lead is not linked to FUB");

    const fubAuth = `Basic ${btoa(apiKey + ":")}`;
    const fubHeaders = { Authorization: fubAuth, "Content-Type": "application/json", Accept: "application/json" };

    const results: { actionPlan?: any; note?: any } = {};

    // If action_plan_id provided, assign it
    if (action_plan_id) {
      const apRes = await fetch(`https://api.followupboss.com/v1/actionPlans/${action_plan_id}/assign`, {
        method: "POST",
        headers: fubHeaders,
        body: JSON.stringify({ personIds: [parseInt(fubId)] }),
      });
      results.actionPlan = await apRes.json();
      if (!apRes.ok) throw new Error(`Failed to assign action plan: ${JSON.stringify(results.actionPlan)}`);
    }

    // Always add a recovery note
    const daysSinceContact = lead.last_contact_at
      ? Math.round((Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const noteBody = [
      `⚠️ Ghosting Recovery — triggered by Deal Pilot`,
      `Client has been unresponsive for ${daysSinceContact ?? "unknown"} days.`,
      `Temperature: ${lead.lead_temperature || "unknown"} | Engagement: ${lead.engagement_score}/100`,
      action_plan_id ? `Action plan #${action_plan_id} assigned.` : "No action plan assigned — manual follow-up recommended.",
    ].join("\n");

    const noteRes = await fetch("https://api.followupboss.com/v1/notes", {
      method: "POST",
      headers: fubHeaders,
      body: JSON.stringify({
        personId: parseInt(fubId),
        body: noteBody,
        subject: "Ghosting Recovery",
      }),
    });
    results.note = await noteRes.json();

    return new Response(JSON.stringify({ success: true, ...results }), {
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
