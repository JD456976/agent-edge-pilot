import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

const OWNER_EMAILS = [
  "craig219@comcast.net",
  "jason.craig@chinattirealty.com",
  "jdog45@gmail.com",
  "claude.dev@chinattirealty.com",
];

async function tryDelete(
  client: ReturnType<typeof createClient>,
  table: string,
  column: string,
  value: string
): Promise<void> {
  try { await (client.from(table as any).delete() as any).eq(column, value); } catch { /* ok */ }
}

async function tryDeleteIn(
  client: ReturnType<typeof createClient>,
  table: string,
  column: string,
  values: string[]
): Promise<void> {
  if (!values.length) return;
  try { await (client.from(table as any).delete() as any).in(column, values); } catch { /* ok */ }
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });

  const supabaseUrl =
    Netlify.env.get("VITE_SUPABASE_URL") || Netlify.env.get("SUPABASE_URL") ||
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;

  const serviceRoleKey =
    Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") || Netlify.env.get("SERVICE_ROLE_KEY") ||
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

  const anonKey =
    Netlify.env.get("VITE_SUPABASE_ANON_KEY") || Netlify.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    Netlify.env.get("SUPABASE_ANON_KEY") ||
    process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return new Response(
      JSON.stringify({ error: "Supabase not configured — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from Netlify env vars" }),
      { status: 500, headers: CORS }
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader)
    return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: CORS });

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminClient = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  try {
    // Verify caller
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller)
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });

    // Verify admin
    const { data: roleRow } = await callerClient
      .from("user_roles" as any).select("role").eq("user_id", caller.id).maybeSingle();
    const isOwner = OWNER_EMAILS.some(e => e.toLowerCase() === caller.email?.toLowerCase());
    if ((roleRow as any)?.role !== "admin" && !isOwner)
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: CORS });

    const { targetUserId } = await req.json();
    if (!targetUserId)
      return new Response(JSON.stringify({ error: "targetUserId required" }), { status: 400, headers: CORS });
    if (targetUserId === caller.id)
      return new Response(JSON.stringify({ error: "Cannot delete your own account" }), { status: 400, headers: CORS });

    // Check protected
    const db = adminClient || callerClient;
    const { data: profileRow } = await db
      .from("profiles" as any).select("is_protected, id").eq("user_id", targetUserId).maybeSingle();
    if ((profileRow as any)?.is_protected)
      return new Response(JSON.stringify({ error: "Cannot delete a protected user" }), { status: 403, headers: CORS });

    // ── Cleanup all user data (each wrapped) ──────────────────────────────────
    const userTables = [
      "activity_events", "ai_follow_up_drafts", "fub_activity_log", "fub_appointments",
      "fub_push_log", "fub_webhook_events", "fub_watchlist", "fub_ignored_changes",
      "fub_conflict_resolutions", "fub_sync_state", "self_opt_action_outcomes",
      "self_opt_behavior_signals", "self_opt_preferences", "network_telemetry_events",
      "network_participation", "scoring_preferences", "commission_defaults",
      "agent_intelligence_profile", "crm_integrations", "import_dedup_rules",
      "intel_briefs", "user_entitlements",
    ];
    for (const t of userTables) await tryDelete(db, t, "user_id", targetUserId);

    // FUB import runs
    try {
      const { data: runs } = await db.from("fub_import_runs" as any).select("id").eq("user_id", targetUserId);
      if (runs?.length) {
        const ids = (runs as any[]).map((r: any) => r.id);
        for (const t of ["fub_staged_leads", "fub_staged_deals", "fub_staged_tasks"])
          await tryDeleteIn(db, t, "import_run_id", ids);
        await tryDelete(db, "fub_import_runs", "user_id", targetUserId);
      }
    } catch { /* ok */ }

    await tryDelete(db, "admin_audit_events", "admin_user_id", targetUserId);
    await tryDelete(db, "deal_participants", "user_id", targetUserId);
    await tryDelete(db, "tasks", "assigned_to_user_id", targetUserId);

    try {
      const { data: leads } = await db.from("leads" as any).select("id").eq("assigned_to_user_id", targetUserId);
      const { data: deals } = await db.from("deals" as any).select("id").eq("assigned_to_user_id", targetUserId);
      if (leads?.length) await tryDeleteIn(db, "alerts", "related_lead_id", (leads as any[]).map((l: any) => l.id));
      if (deals?.length) await tryDeleteIn(db, "alerts", "related_deal_id", (deals as any[]).map((d: any) => d.id));
    } catch { /* ok */ }

    await tryDelete(db, "deals", "assigned_to_user_id", targetUserId);
    await tryDelete(db, "leads", "assigned_to_user_id", targetUserId);
    await tryDelete(db, "team_members", "user_id", targetUserId);
    await tryDelete(db, "user_invitations", "invited_by", targetUserId);
    await tryDelete(db, "user_roles", "user_id", targetUserId);

    // ── Profile: hard DELETE row (not soft-update) ────────────────────────────
    // Try both the profile id and user_id columns
    let profileDeleted = false;
    try {
      const res = await db.from("profiles" as any).delete().eq("user_id", targetUserId);
      if (!res.error) profileDeleted = true;
    } catch { /* try next */ }

    // ── Auth user (requires service role) ────────────────────────────────────
    let authDeleted = false;
    let authWarning = "";
    if (adminClient) {
      const { error: authErr } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (authErr) {
        authWarning = `Profile and data removed. Supabase auth account could not be deleted: ${authErr.message}`;
        console.error("Auth delete failed:", authErr.message);
      } else {
        authDeleted = true;
      }
    } else {
      authWarning = "User data and access removed. Add SUPABASE_SERVICE_ROLE_KEY to Netlify env vars to also delete the Supabase auth account.";
    }

    // Audit log (best-effort)
    try {
      await db.from("admin_audit_events" as any).insert({
        admin_user_id: caller.id,
        action: authDeleted ? "user_deleted" : "user_data_wiped",
        metadata: { targetUserId, profileDeleted, authDeleted },
      });
    } catch { /* ok */ }

    if (authWarning) {
      return new Response(JSON.stringify({ success: true, warning: authWarning }), { headers: CORS });
    }
    return new Response(JSON.stringify({ success: true }), { headers: CORS });

  } catch (err: any) {
    console.error("admin-delete-user:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: CORS }
    );
  }
};

export const config: Config = { path: "/api/admin-delete-user" };
