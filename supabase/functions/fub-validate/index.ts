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
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("FUB_ENCRYPTION_KEY");
    if (!encryptionKey) throw new Error("Encryption key not configured");

    // Get authenticated user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    // Decrypt key server-side
    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { data: apiKey, error: decryptError } = await serviceClient.rpc("get_decrypted_api_key", {
      p_user_id: user.id,
      p_encryption_key: encryptionKey,
    });

    if (decryptError || !apiKey) {
      await serviceClient
        .from("crm_integrations")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      throw new Error("No API key found. Please save your key first.");
    }

    // Call FUB API to validate
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
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ valid: false, message: "Invalid API key" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const account = await fubResponse.json();

    await serviceClient
      .from("crm_integrations")
      .update({ status: "connected", last_validated_at: now, updated_at: now })
      .eq("user_id", user.id);

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
