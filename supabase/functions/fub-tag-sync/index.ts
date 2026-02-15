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

    const { lead_ids } = await req.json();
    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) throw new Error("lead_ids array required");
    if (lead_ids.length > 50) throw new Error("Maximum 50 leads per sync");

    const { data: leads } = await serviceClient.from("leads")
      .select("id, name, status_tags, lead_temperature, imported_from")
      .in("id", lead_ids);
    if (!leads || leads.length === 0) throw new Error("No leads found");

    const fubAuth = `Basic ${btoa(apiKey + ":")}`;
    const fubHeaders = { Authorization: fubAuth, "Content-Type": "application/json", Accept: "application/json" };

    const results: { id: string; name: string; ok: boolean; error?: string }[] = [];

    for (const lead of leads) {
      const fubId = lead.imported_from?.startsWith("fub:") ? lead.imported_from.replace("fub:", "") : null;
      if (!fubId) {
        results.push({ id: lead.id, name: lead.name, ok: false, error: "Not linked to FUB" });
        continue;
      }

      // Build tags: combine status_tags + temperature tag
      const tags: string[] = [...(lead.status_tags || [])];
      if (lead.lead_temperature) {
        tags.push(`dp:${lead.lead_temperature}`);
      }

      try {
        const res = await fetch(`https://api.followupboss.com/v1/people/${fubId}`, {
          method: "PUT",
          headers: fubHeaders,
          body: JSON.stringify({ tags }),
        });
        const data = await res.json();
        results.push({ id: lead.id, name: lead.name, ok: res.ok, error: res.ok ? undefined : JSON.stringify(data) });
      } catch (e: any) {
        results.push({ id: lead.id, name: lead.name, ok: false, error: e?.message || "Network error" });
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
