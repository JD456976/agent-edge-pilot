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

    const fubAuth = `Basic ${btoa(apiKey + ":")}`;

    // Fetch appointments from FUB
    const now = new Date();
    const startDate = now.toISOString().split("T")[0];
    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const fubRes = await fetch(
      `https://api.followupboss.com/v1/appointments?startDate=${startDate}&endDate=${endDate}&limit=50&sort=startDate`,
      { headers: { Authorization: fubAuth, Accept: "application/json" } }
    );

    if (!fubRes.ok) {
      if (fubRes.status === 429) throw new Error("Rate limited by FUB");
      throw new Error(`FUB API error: ${fubRes.status}`);
    }

    const data = await fubRes.json();
    const appointments = data.appointments || data._embedded?.appointments || [];

    // Map and store
    const mapped = appointments.map((a: any) => ({
      user_id: user.id,
      fub_id: a.id?.toString() || "",
      title: a.title || a.subject || "Appointment",
      description: a.description || a.notes || null,
      start_at: a.startDate || a.start || now.toISOString(),
      end_at: a.endDate || a.end || null,
      location: a.location || null,
      attendees: a.attendees || a.people || [],
    }));

    if (mapped.length > 0) {
      // Delete old and re-insert for this user (simple full sync)
      await serviceClient.from("fub_appointments").delete().eq("user_id", user.id);
      await serviceClient.from("fub_appointments").insert(mapped);
    }

    return new Response(JSON.stringify({ count: mapped.length, appointments: mapped }), {
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
