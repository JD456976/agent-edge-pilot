import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

/** Delete from a table silently — skips if table doesn't exist or delete fails */
async function safeDelete(
  client: ReturnType<typeof createClient>,
  table: string,
  column: string,
  value: string
): Promise<void> {
  try {
    await (client.from(table as any).delete() as any).eq(column, value);
  } catch {
    // Table may not exist in this project — skip
  }
}

async function safeDeleteIn(
  client: ReturnType<typeof createClient>,
  table: string,
  column: string,
  values: string[]
): Promise<void> {
  if (values.length === 0) return;
  try {
    await (client.from(table as any).delete() as any).in(column, values);
  } catch {
    // Table may not exist — skip
  }
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
  }

  const supabaseUrl = Netlify.env.get("VITE_SUPABASE_URL") || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = Netlify.env.get("VITE_SUPABASE_ANON_KEY") || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return new Response(
      JSON.stringify({ error: "Server not configured — Supabase env vars missing" }),
      { status: 500, headers: CORS }
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: CORS });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Verify caller identity
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
    }

    // Verify caller is admin
    const { data: roleRow } = await adminClient
      .from("user_roles" as any)
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    // Also allow owner emails as a fallback
    const OWNER_EMAILS = ["craig219@comcast.net", "jason.craig@chinattirealty.com", "jdog45@gmail.com", "claude.dev@chinattirealty.com"];
    const callerProfile = await adminClient.from("profiles" as any).select("email").eq("user_id", caller.id).maybeSingle();
    const callerEmail = (callerProfile.data as any)?.email || "";
    const isOwner = OWNER_EMAILS.some(e => e.toLowerCase() === callerEmail.toLowerCase());

    if (roleRow?.role !== "admin" && !isOwner) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: CORS });
    }

    const body = await req.json();
    const { targetUserId } = body;
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "targetUserId required" }), { status: 400, headers: CORS });
    }

    if (targetUserId === caller.id) {
      return new Response(JSON.stringify({ error: "Cannot delete your own account" }), { status: 400, headers: CORS });
    }

    // Check protected flag
    const { data: targetProfile } = await adminClient
      .from("profiles" as any)
      .select("is_protected")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if ((targetProfile as any)?.is_protected) {
      return new Response(JSON.stringify({ error: "Cannot delete protected user" }), { status: 403, headers: CORS });
    }

    // ── Clean up user-owned tables (all wrapped — skip gracefully if table missing) ──

    const userOwnedTables = [
      "activity_events",
      "ai_follow_up_drafts",
      "fub_activity_log",
      "fub_appointments",
      "fub_push_log",
      "fub_webhook_events",
      "fub_watchlist",
      "fub_ignored_changes",
      "fub_conflict_resolutions",
      "fub_sync_state",
      "self_opt_action_outcomes",
      "self_opt_behavior_signals",
      "self_opt_preferences",
      "network_telemetry_events",
      "network_participation",
      "scoring_preferences",
      "commission_defaults",
      "agent_intelligence_profile",
      "crm_integrations",
      "import_dedup_rules",
      "intel_briefs",
      "user_entitlements",
    ];

    for (const table of userOwnedTables) {
      await safeDelete(adminClient, table, "user_id", targetUserId);
    }

    // FUB import runs + staged data
    try {
      const { data: importRuns } = await adminClient
        .from("fub_import_runs" as any)
        .select("id")
        .eq("user_id", targetUserId);

      if (importRuns && (importRuns as any[]).length > 0) {
        const runIds = (importRuns as any[]).map((r: any) => r.id);
        await safeDeleteIn(adminClient, "fub_staged_leads", "import_run_id", runIds);
        await safeDeleteIn(adminClient, "fub_staged_deals", "import_run_id", runIds);
        await safeDeleteIn(adminClient, "fub_staged_tasks", "import_run_id", runIds);
        await safeDelete(adminClient, "fub_import_runs", "user_id", targetUserId);
      }
    } catch {
      // table may not exist
    }

    // Other associated records
    await safeDelete(adminClient, "admin_audit_events", "admin_user_id", targetUserId);
    await safeDelete(adminClient, "deal_participants", "user_id", targetUserId);
    await safeDelete(adminClient, "tasks", "assigned_to_user_id", targetUserId);

    // Alerts linked to user's leads/deals
    try {
      const { data: userLeads } = await adminClient.from("leads" as any).select("id").eq("assigned_to_user_id", targetUserId);
      const { data: userDeals } = await adminClient.from("deals" as any).select("id").eq("assigned_to_user_id", targetUserId);
      if (userLeads && (userLeads as any[]).length > 0) {
        await safeDeleteIn(adminClient, "alerts", "related_lead_id", (userLeads as any[]).map((l: any) => l.id));
      }
      if (userDeals && (userDeals as any[]).length > 0) {
        await safeDeleteIn(adminClient, "alerts", "related_deal_id", (userDeals as any[]).map((d: any) => d.id));
      }
    } catch {
      // tables may not exist
    }

    await safeDelete(adminClient, "deals", "assigned_to_user_id", targetUserId);
    await safeDelete(adminClient, "leads", "assigned_to_user_id", targetUserId);
    await safeDelete(adminClient, "team_members", "user_id", targetUserId);
    await safeDelete(adminClient, "user_invitations", "invited_by", targetUserId);
    await safeDelete(adminClient, "user_roles", "user_id", targetUserId);

    // Profile row (core — not wrapped, we want to know if this fails)
    const { error: profileDeleteError } = await adminClient
      .from("profiles" as any)
      .delete()
      .eq("user_id", targetUserId);

    if (profileDeleteError) {
      console.error("Profile delete failed:", profileDeleteError);
      // Non-fatal — still proceed to delete auth user
    }

    // Delete auth user (this is the definitive step)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      console.error("Auth user delete failed:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to delete auth account: " + deleteError.message }),
        { status: 500, headers: CORS }
      );
    }

    // Audit log (best-effort)
    try {
      await adminClient.from("admin_audit_events" as any).insert({
        admin_user_id: caller.id,
        action: "user_deleted",
        metadata: { targetUserId },
      });
    } catch {
      // not critical
    }

    return new Response(JSON.stringify({ success: true }), { headers: CORS });

  } catch (err: any) {
    console.error("admin-delete-user error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: CORS }
    );
  }
};

export const config: Config = {
  path: "/api/admin-delete-user",
};
