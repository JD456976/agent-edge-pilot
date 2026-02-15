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

    const { fub_person_id, action_plan_id } = await req.json();
    if (!fub_person_id || !action_plan_id) throw new Error("fub_person_id and action_plan_id required");

    const fubAuth = `Basic ${btoa(apiKey + ":")}`;

    // Assign action plan to person in FUB
    const fubRes = await fetch("https://api.followupboss.com/v1/actionPlans", {
      method: "POST",
      headers: {
        Authorization: fubAuth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        personId: parseInt(fub_person_id),
        actionPlanId: parseInt(action_plan_id),
      }),
    });

    if (!fubRes.ok) {
      const errData = await fubRes.json().catch(() => ({}));
      throw new Error(`FUB error (${fubRes.status}): ${JSON.stringify(errData)}`);
    }

    const result = await fubRes.json();

    // Also fetch available action plans for reference
    const plansRes = await fetch("https://api.followupboss.com/v1/actionPlans?limit=50", {
      headers: { Authorization: fubAuth, Accept: "application/json" },
    });
    const plans = plansRes.ok ? await plansRes.json() : { actionPlans: [] };

    return new Response(JSON.stringify({
      success: true,
      result,
      availablePlans: (plans.actionPlans || plans._embedded?.actionPlans || []).map((p: any) => ({
        id: p.id,
        name: p.name || p.title,
        stepCount: p.steps?.length || 0,
      })),
    }), {
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
