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

    const { fub_person_id, entity_id, limit = 20 } = await req.json();
    if (!fub_person_id) throw new Error("fub_person_id required");

    const fubAuth = `Basic ${btoa(apiKey + ":")}`;

    // Fetch calls
    const [callsRes, emailsRes, textsRes] = await Promise.all([
      fetch(`https://api.followupboss.com/v1/calls?personId=${fub_person_id}&limit=${limit}&sort=-created`, {
        headers: { Authorization: fubAuth, Accept: "application/json" },
      }),
      fetch(`https://api.followupboss.com/v1/emails?personId=${fub_person_id}&limit=${limit}&sort=-created`, {
        headers: { Authorization: fubAuth, Accept: "application/json" },
      }),
      fetch(`https://api.followupboss.com/v1/textMessages?personId=${fub_person_id}&limit=${limit}&sort=-created`, {
        headers: { Authorization: fubAuth, Accept: "application/json" },
      }),
    ]);

    const [calls, emails, texts] = await Promise.all([
      callsRes.ok ? callsRes.json() : { calls: [] },
      emailsRes.ok ? emailsRes.json() : { emails: [] },
      textsRes.ok ? textsRes.json() : { textmessages: [] },
    ]);

    // Normalize into unified activity format
    const activities: Array<{
      fub_id: string;
      activity_type: string;
      direction: string;
      subject: string | null;
      body_preview: string | null;
      duration_seconds: number | null;
      occurred_at: string;
    }> = [];

    for (const c of (calls.calls || [])) {
      activities.push({
        fub_id: c.id?.toString() || "",
        activity_type: "call",
        direction: c.isIncoming ? "inbound" : "outbound",
        subject: null,
        body_preview: c.note || null,
        duration_seconds: c.duration || null,
        occurred_at: c.created || c.dateCreated || new Date().toISOString(),
      });
    }

    for (const e of (emails.emails || [])) {
      activities.push({
        fub_id: e.id?.toString() || "",
        activity_type: "email",
        direction: e.isIncoming ? "inbound" : "outbound",
        subject: e.subject || null,
        body_preview: (e.body || e.textBody || "").slice(0, 200),
        duration_seconds: null,
        occurred_at: e.created || e.dateCreated || new Date().toISOString(),
      });
    }

    for (const t of (texts.textmessages || texts.textMessages || [])) {
      activities.push({
        fub_id: t.id?.toString() || "",
        activity_type: "text",
        direction: t.isIncoming ? "inbound" : "outbound",
        subject: null,
        body_preview: (t.message || t.body || "").slice(0, 200),
        duration_seconds: null,
        occurred_at: t.created || t.dateCreated || new Date().toISOString(),
      });
    }

    // Sort by date descending
    activities.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

    // Store in fub_activity_log if entity_id provided
    if (entity_id && activities.length > 0) {
      const rows = activities.slice(0, 50).map(a => ({
        user_id: user.id,
        fub_id: a.fub_id,
        entity_type: "lead",
        entity_id,
        activity_type: a.activity_type,
        direction: a.direction,
        subject: a.subject,
        body_preview: a.body_preview,
        duration_seconds: a.duration_seconds,
        occurred_at: a.occurred_at,
      }));

      // Upsert to avoid duplicates
      await serviceClient.from("fub_activity_log").upsert(rows, {
        onConflict: "id",
        ignoreDuplicates: true,
      });
    }

    return new Response(JSON.stringify({ activities: activities.slice(0, limit) }), {
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
