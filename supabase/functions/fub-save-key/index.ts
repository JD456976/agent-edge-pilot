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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const encryptionKey = Deno.env.get("FUB_ENCRYPTION_KEY");

    if (!supabaseUrl || !anonKey) return new Response(JSON.stringify({ error: "Server config error: missing URL or anon key" }), { status: 500, headers: corsHeaders });
    if (!serviceKey) return new Response(JSON.stringify({ error: "Server config error: missing service key" }), { status: 500, headers: corsHeaders });
    if (!encryptionKey) return new Response(JSON.stringify({ error: "Server config error: missing encryption key" }), { status: 500, headers: corsHeaders });

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const userId = user.id;

    const { api_key } = await req.json();
    if (!api_key || typeof api_key !== "string" || api_key.trim().length < 4) {
      throw new Error("Invalid API key");
    }

    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { error } = await serviceClient.rpc("store_encrypted_api_key", {
      p_user_id: userId,
      p_api_key: api_key.trim(),
      p_encryption_key: encryptionKey,
    });

    if (error) throw new Error(`Storage failed: ${error.message}`);

    return new Response(
      JSON.stringify({ success: true, last4: api_key.trim().slice(-4) }),
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
