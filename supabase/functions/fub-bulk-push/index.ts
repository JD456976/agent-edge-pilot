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

    const { entities } = await req.json();
    if (!entities || !Array.isArray(entities) || entities.length === 0) throw new Error("entities array required");
    if (entities.length > 50) throw new Error("Maximum 50 entities per batch");

    const fubAuth = `Basic ${btoa(apiKey + ":")}`;
    const fubHeaders = { Authorization: fubAuth, "Content-Type": "application/json", Accept: "application/json" };

    const results: { entity_id: string; entity_type: string; ok: boolean; fub_id?: string; error?: string }[] = [];

    for (const { entity_type, entity_id } of entities) {
      try {
        let fubEndpoint = "";
        let fubMethod = "PUT";
        let fubBody: Record<string, unknown> = {};
        let fubId: string | null = null;

        if (entity_type === "lead") {
          const { data: lead } = await serviceClient.from("leads")
            .select("name, source, status_tags, lead_temperature, imported_from")
            .eq("id", entity_id).single();
          if (!lead) { results.push({ entity_id, entity_type, ok: false, error: "Not found" }); continue; }
          fubId = lead.imported_from?.startsWith("fub:") ? lead.imported_from.replace("fub:", "") : null;

          if (fubId) {
            fubEndpoint = `https://api.followupboss.com/v1/people/${fubId}`;
            const tags = [...(lead.status_tags || [])];
            if (lead.lead_temperature) tags.push(`dp:${lead.lead_temperature}`);
            fubBody = { tags, source: lead.source };
          } else {
            fubEndpoint = "https://api.followupboss.com/v1/people";
            fubMethod = "POST";
            fubBody = {
              firstName: lead.name?.split(" ")[0] || "",
              lastName: lead.name?.split(" ").slice(1).join(" ") || "",
              source: lead.source || "Deal Pilot",
            };
          }
        } else if (entity_type === "deal") {
          const { data: deal } = await serviceClient.from("deals")
            .select("title, price, stage, close_date, imported_from")
            .eq("id", entity_id).single();
          if (!deal) { results.push({ entity_id, entity_type, ok: false, error: "Not found" }); continue; }
          fubId = deal.imported_from?.startsWith("fub:") ? deal.imported_from.replace("fub:", "") : null;

          if (fubId) {
            fubEndpoint = `https://api.followupboss.com/v1/deals/${fubId}`;
            fubBody = { price: deal.price, stage: deal.stage };
          } else {
            fubEndpoint = "https://api.followupboss.com/v1/deals";
            fubMethod = "POST";
            fubBody = { name: deal.title, price: deal.price };
          }
        } else {
          results.push({ entity_id, entity_type, ok: false, error: "Unknown entity_type" });
          continue;
        }

        const res = await fetch(fubEndpoint, { method: fubMethod, headers: fubHeaders, body: JSON.stringify(fubBody) });
        const data = await res.json();

        // Log
        await serviceClient.from("fub_push_log").insert({
          user_id: userId, entity_type, entity_id,
          fub_id: fubId || data?.id?.toString() || null,
          action: fubId ? "update" : "create",
          fields_pushed: fubBody,
          status: res.ok ? "success" : "error",
          error_message: res.ok ? null : JSON.stringify(data),
        });

        results.push({ entity_id, entity_type, ok: res.ok, fub_id: fubId || data?.id?.toString(), error: res.ok ? undefined : JSON.stringify(data) });
      } catch (e: any) {
        results.push({ entity_id, entity_type, ok: false, error: e?.message || "Unknown error" });
      }
    }

    const succeeded = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    return new Response(JSON.stringify({ succeeded, failed, results }), {
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
