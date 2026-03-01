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

    const { channel, fub_person_id, message, subject, body, entity_id, entity_type } = await req.json();
    if (!fub_person_id) throw new Error("fub_person_id required");
    if (!channel || !["text", "email"].includes(channel)) throw new Error("channel must be 'text' or 'email'");

    const fubAuth = `Basic ${btoa(apiKey + ":")}`;
    let fubResponse: Response;
    let fubResult: Record<string, unknown>;

    if (channel === "text") {
      if (!message?.trim()) throw new Error("message required for text");
      fubResponse = await fetch("https://api.followupboss.com/v1/textMessages", {
        method: "POST",
        headers: {
          Authorization: fubAuth,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personId: fub_person_id,
          message: message.trim(),
        }),
      });
    } else {
      if (!body?.trim()) throw new Error("body required for email");
      fubResponse = await fetch("https://api.followupboss.com/v1/emails", {
        method: "POST",
        headers: {
          Authorization: fubAuth,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personId: fub_person_id,
          subject: subject || "Follow-up",
          body: body.trim(),
        }),
      });
    }

    fubResult = await fubResponse.json();

    if (!fubResponse.ok) {
      const errMsg = (fubResult as any)?.message || (fubResult as any)?.error || `FUB API error ${fubResponse.status}`;
      throw new Error(errMsg);
    }

    // Log the push
    if (entity_id) {
      await serviceClient.from("fub_push_log").insert({
        user_id: user.id,
        entity_id,
        entity_type: entity_type || "lead",
        action: `send_${channel}`,
        status: "success",
        fub_id: fub_person_id.toString(),
        fields_pushed: { channel, ...(channel === "text" ? { message } : { subject, body }) },
      });

      // Update last_touched_at
      const table = entity_type === "deal" ? "deals" : "leads";
      await serviceClient.from(table).update({ last_touched_at: new Date().toISOString() }).eq("id", entity_id);
    }

    // Also log as activity_event
    if (entity_id) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      await serviceClient.from("activity_events").insert({
        user_id: user.id,
        organization_id: profile?.organization_id || user.id,
        entity_type: entity_type || "lead",
        entity_id,
        touch_type: channel,
        note: channel === "text" ? `Sent via FUB: ${message}` : `Sent email via FUB: ${subject}`,
      });
    }

    return new Response(JSON.stringify({ success: true, fubResult }), {
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
