import type { Config } from "@netlify/functions";

const CORS = {
  "Access-Control-Allow-Origin": "https://market-compass-app.netlify.app",
  "Access-Control-Allow-Headers": "Content-Type, X-Federation-Token",
  "Content-Type": "application/json",
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
  }

  // Validate federation token
  const token = req.headers.get("X-Federation-Token");
  const expected = Netlify.env.get("DP_FEDERATION_TOKEN");
  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
  }

  const { query, userEmail } = await req.json().catch(() => ({}));
  if (!userEmail || !query || query.trim().length < 2) {
    return new Response(JSON.stringify({ clients: [] }), { status: 200, headers: CORS });
  }

  // Query DP Supabase — server-side with service role key bypasses RLS
  const supabaseUrl = Netlify.env.get("SUPABASE_URL") || "https://dqcrhjbsrufmkgqbfsyn.supabase.co";
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  const authKey = serviceKey || anonKey;

  if (!authKey) {
    return new Response(JSON.stringify({ error: "DP database not configured" }), { status: 500, headers: CORS });
  }

  try {
    // First find the user_id by email
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(userEmail)}&select=user_id&limit=1`,
      { headers: { apikey: authKey, Authorization: `Bearer ${authKey}` } }
    );
    const profiles = await profileRes.json();
    const userId = profiles?.[0]?.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ clients: [], note: "No matching Deal Pilot account" }), { status: 200, headers: CORS });
    }

    // Search leads for that user
    const q = query.trim().toLowerCase();
    const leadsRes = await fetch(
      `${supabaseUrl}/rest/v1/leads?user_id=eq.${userId}&or=(name.ilike.*${encodeURIComponent(q)}*,email_primary.ilike.*${encodeURIComponent(q)}*)&select=id,name,email_primary,source,phone_mobile,lead_temperature&limit=10&order=last_touched_at.desc.nullslast`,
      { headers: { apikey: authKey, Authorization: `Bearer ${authKey}` } }
    );
    const leads = await leadsRes.json();

    const clients = (leads || []).map((l: any) => {
      const parts = (l.name || "").trim().split(/\s+/);
      return {
        first_name: parts[0] || "",
        last_name: parts.slice(1).join(" ") || "",
        email: l.email_primary || "",
        phone: l.phone_mobile || "",
        source: l.source || "",
        temperature: l.lead_temperature || "",
      };
    });

    return new Response(JSON.stringify({ clients }), { status: 200, headers: CORS });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Search failed" }), { status: 500, headers: CORS });
  }
};

export const config: Config = {
  path: "/api/federated-search",
};
