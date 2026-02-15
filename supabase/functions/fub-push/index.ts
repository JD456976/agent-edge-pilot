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
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");
    const userId = user.id;

    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { data: apiKey } = await serviceClient.rpc("get_decrypted_api_key", {
      p_user_id: userId,
      p_encryption_key: encryptionKey,
    });
    if (!apiKey) throw new Error("No FUB API key configured");

    const { entity_type, entity_id, action, fields } = await req.json();
    if (!entity_type || !entity_id || !action) throw new Error("Missing entity_type, entity_id, or action");

    const fubAuth = `Basic ${btoa(apiKey + ":")}`;
    const fubHeaders = { Authorization: fubAuth, "Content-Type": "application/json", Accept: "application/json" };

    let fubEndpoint = "";
    let fubMethod = "PUT";
    let fubBody: Record<string, unknown> = {};
    let fubId: string | null = null;

    // Resolve FUB ID from local entity
    if (entity_type === "lead") {
      const { data: lead } = await serviceClient.from("leads").select("name, notes, source, lead_temperature, imported_from").eq("id", entity_id).single();
      if (!lead) throw new Error("Lead not found");
      // Check if imported from FUB
      fubId = lead.imported_from?.startsWith("fub:") ? lead.imported_from.replace("fub:", "") : null;

      if (action === "update" && fubId) {
        fubEndpoint = `https://api.followupboss.com/v1/people/${fubId}`;
        fubBody = fields || {};
      } else if (action === "create") {
        fubEndpoint = "https://api.followupboss.com/v1/people";
        fubMethod = "POST";
        fubBody = {
          firstName: lead.name?.split(" ")[0] || "",
          lastName: lead.name?.split(" ").slice(1).join(" ") || "",
          source: lead.source || "Deal Pilot",
          ...(fields || {}),
        };
      }
    } else if (entity_type === "deal") {
      const { data: deal } = await serviceClient.from("deals").select("title, price, stage, close_date, imported_from").eq("id", entity_id).single();
      if (!deal) throw new Error("Deal not found");
      fubId = deal.imported_from?.startsWith("fub:") ? deal.imported_from.replace("fub:", "") : null;

      if (action === "update" && fubId) {
        fubEndpoint = `https://api.followupboss.com/v1/deals/${fubId}`;
        fubBody = fields || {};
      } else if (action === "create") {
        fubEndpoint = "https://api.followupboss.com/v1/deals";
        fubMethod = "POST";
        fubBody = {
          name: deal.title,
          price: deal.price,
          ...(fields || {}),
        };
      }
    } else if (entity_type === "note") {
      // Push a note to a FUB person
      fubEndpoint = "https://api.followupboss.com/v1/notes";
      fubMethod = "POST";
      fubBody = {
        personId: fields?.fub_person_id,
        body: fields?.body || "",
        subject: fields?.subject || "Deal Pilot Note",
      };
    }

    if (!fubEndpoint) throw new Error("Could not determine FUB endpoint");

    const fubResponse = await fetch(fubEndpoint, {
      method: fubMethod,
      headers: fubHeaders,
      body: JSON.stringify(fubBody),
    });

    const responseData = await fubResponse.json();

    // Log the push
    await serviceClient.from("fub_push_log").insert({
      user_id: userId,
      entity_type,
      entity_id,
      fub_id: fubId || responseData?.id?.toString() || null,
      action,
      fields_pushed: fubBody,
      status: fubResponse.ok ? "success" : "error",
      error_message: fubResponse.ok ? null : JSON.stringify(responseData),
    });

    if (!fubResponse.ok) {
      throw new Error(`FUB API error (${fubResponse.status}): ${JSON.stringify(responseData)}`);
    }

    return new Response(JSON.stringify({ success: true, fub_id: responseData?.id, data: responseData }), {
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
