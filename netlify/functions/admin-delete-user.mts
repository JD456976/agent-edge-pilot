import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

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
    // Verify caller
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
    }

    // Verify caller is admin
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (roleRow?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: CORS });
    }

    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "targetUserId required" }), { status: 400, headers: CORS });
    }

    if (targetUserId === caller.id) {
      return new Response(JSON.stringify({ error: "Cannot delete your own account" }), { status: 400, headers: CORS });
    }

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("is_protected")
      .eq("user_id", targetUserId)
      .single();

    if (targetProfile?.is_protected) {
      return new Response(JSON.stringify({ error: "Cannot delete protected user" }), { status: 403, headers: CORS });
    }

    // Clean up user-owned tables
    const userTables = [
      "activity_events", "ai_follow_up_drafts", "fub_activity_log", "fub_appointments",
      "fub_push_log", "fub_webhook_events", "fub_watchlist", "fub_ignored_changes",
      "fub_conflict_resolutions", "fub_sync_state", "self_opt_action_outcomes",
      "self_opt_behavior_signals", "self_opt_preferences", "network_telemetry_events",
      "network_participation", "scoring_preferences", "commission_defaults",
      "agent_intelligence_profile", "crm_integrations", "import_dedup_rules",
      "intel_briefs", "user_entitlements",
    ];

    for (const table of userTables) {
      await adminClient.from(table as any).delete().eq("user_id", targetUserId);
    }

    // FUB staged data
    const { data: importRuns } = await adminClient
      .from("fub_import_runs" as any)
      .select("id")
      .eq("user_id", targetUserId);

    if (importRuns && importRuns.length > 0) {
      const runIds = (importRuns as any[]).map((r) => r.id);
      await adminClient.from("fub_staged_leads" as any).delete().in("import_run_id", runIds);
      await adminClient.from("fub_staged_deals" as any).delete().in("import_run_id", runIds);
      await adminClient.from("fub_staged_tasks" as any).delete().in("import_run_id", runIds);
      await adminClient.from("fub_import_runs" as any).delete().eq("user_id", targetUserId);
    }

    await adminClient.from("admin_audit_events" as any).delete().eq("admin_user_id", targetUserId);
    await adminClient.from("deal_participants" as any).delete().eq("user_id", targetUserId);
    await adminClient.from("tasks" as any).delete().eq("assigned_to_user_id", targetUserId);

    const { data: userLeads } = await adminClient.from("leads" as any).select("id").eq("assigned_to_user_id", targetUserId);
    const { data: userDeals } = await adminClient.from("deals" as any).select("id").eq("assigned_to_user_id", targetUserId);

    if (userLeads && (userLeads as any[]).length > 0) {
      const leadIds = (userLeads as any[]).map((l) => l.id);
      await adminClient.from("alerts" as any).delete().in("related_lead_id", leadIds);
    }
    if (userDeals && (userDeals as any[]).length > 0) {
      const dealIds = (userDeals as any[]).map((d) => d.id);
      await adminClient.from("alerts" as any).delete().in("related_deal_id", dealIds);
    }

    await adminClient.from("deals" as any).delete().eq("assigned_to_user_id", targetUserId);
    await adminClient.from("leads" as any).delete().eq("assigned_to_user_id", targetUserId);
    await adminClient.from("team_members" as any).delete().eq("user_id", targetUserId);
    await adminClient.from("user_invitations" as any).delete().eq("invited_by", targetUserId);
    await adminClient.from("user_roles" as any).delete().eq("user_id", targetUserId);
    await adminClient.from("profiles" as any).delete().eq("user_id", targetUserId);

    // Delete auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      console.error("Failed to delete auth user:", deleteError);
      return new Response(JSON.stringify({ error: "Failed to delete auth account: " + deleteError.message }), {
        status: 500, headers: CORS,
      });
    }

    // Audit log
    await adminClient.from("admin_audit_events" as any).insert({
      admin_user_id: caller.id,
      action: "user_deleted",
      metadata: { targetUserId },
    });

    return new Response(JSON.stringify({ success: true }), { headers: CORS });
  } catch (err: any) {
    console.error("admin-delete-user error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500, headers: CORS,
    });
  }
};

export const config: Config = {
  path: "/api/admin-delete-user",
};
