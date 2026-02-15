import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchFub(apiKey: string, endpoint: string, limit = 20) {
  try {
    const res = await fetch(`https://api.followupboss.com/v1/${endpoint}?limit=${limit}&sort=-created`, {
      headers: {
        Authorization: `Basic ${btoa(apiKey + ":")}`,
        Accept: "application/json",
      },
    });
    if (res.status === 429) throw new Error("rate_limited");
    if (!res.ok) return [];
    const data = await res.json();
    return data.people || data.deals || data.tasks || data.events || data[endpoint] || [];
  } catch (e) {
    if (e instanceof Error && e.message === "rate_limited") throw e;
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const encryptionKey = Deno.env.get("FUB_ENCRYPTION_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Server config error");
    if (!encryptionKey) throw new Error("Encryption key not configured");

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");
    const userId = user.id;

    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { data: apiKey, error: decryptError } = await serviceClient.rpc("get_decrypted_api_key", {
      p_user_id: userId,
      p_encryption_key: encryptionKey,
    });

    if (decryptError || !apiKey) throw new Error("No API key found");

    // Check integration status
    const { data: integration } = await serviceClient
      .from("crm_integrations")
      .select("status")
      .eq("user_id", userId)
      .single();

    if (integration?.status !== "connected") {
      throw new Error("Integration not validated. Please validate first.");
    }

    let body: { limit?: number } = { limit: 20 };
    try { body = await req.json(); } catch { /* use defaults */ }
    const limit = Math.min(body.limit || 20, 50);

    // Fetch in parallel
    const [rawPeople, rawDeals, rawTasks] = await Promise.all([
      fetchFub(apiKey, "people", limit),
      fetchFub(apiKey, "deals", limit),
      fetchFub(apiKey, "tasks", limit),
    ]);

    // Normalize into preview payloads
    const preview_leads = (rawPeople as any[]).map((p: any) => ({
      fub_id: p.id,
      name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown",
      email: p.emails?.[0]?.value || "",
      phone: p.phones?.[0]?.value || "",
      source: p.source || "",
      stage: p.stage || "",
      created: p.created || "",
    }));

    const preview_deals = (rawDeals as any[]).map((d: any) => ({
      fub_id: d.id,
      name: d.name || d.title || "Untitled",
      price: d.price || d.value || 0,
      stage: d.stage || d.stageCategory || "",
      person: d.person?.name || "",
      created: d.created || "",
    }));

    const preview_tasks = (rawTasks as any[]).map((t: any) => ({
      fub_id: t.id,
      title: t.name || t.subject || t.text || "Untitled",
      type: t.type || "",
      due_date: t.dueDate || t.due || "",
      completed: t.isCompleted || false,
      person: t.person?.name || "",
    }));

    // Update sync state
    await serviceClient.from("fub_sync_state").upsert({
      user_id: userId,
      last_preview_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return new Response(
      JSON.stringify({
        preview_leads,
        preview_deals,
        preview_tasks,
        counts: {
          leads: preview_leads.length,
          deals: preview_deals.length,
          tasks: preview_tasks.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "rate_limited" ? 429 : 400;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
