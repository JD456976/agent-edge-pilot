import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");
    const userId = claimsData.claims.sub as string;

    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { data: apiKey, error: decryptError } = await serviceClient.rpc("get_decrypted_api_key", {
      p_user_id: userId,
      p_encryption_key: encryptionKey,
    });

    if (decryptError || !apiKey) {
      await serviceClient
        .from("crm_integrations")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      throw new Error("No API key found. Please save your key first.");
    }

    const fubResponse = await fetch("https://api.followupboss.com/v1/me", {
      headers: {
        Authorization: `Basic ${btoa(apiKey + ":")}`,
        Accept: "application/json",
      },
    });

    if (fubResponse.status === 429) {
      throw new Error("Rate limited by Follow Up Boss. Please try again in a moment.");
    }

    const now = new Date().toISOString();

    if (!fubResponse.ok) {
      await serviceClient
        .from("crm_integrations")
        .update({ status: "invalid", last_validated_at: now, updated_at: now })
        .eq("user_id", userId);

      return new Response(
        JSON.stringify({ valid: false, message: "Invalid API key" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const account = await fubResponse.json();

    await serviceClient
      .from("crm_integrations")
      .update({ status: "connected", last_validated_at: now, updated_at: now })
      .eq("user_id", userId);

    // Update sync state
    await serviceClient.from("fub_sync_state").upsert({
      user_id: userId,
      last_validated_at: now,
      updated_at: now,
    }, { onConflict: "user_id" });

    return new Response(
      JSON.stringify({
        valid: true,
        account: {
          name: account.name || account.firstName || "Unknown",
          email: account.email || "",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
