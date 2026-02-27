import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the calling user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check caller is admin
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (roleRow?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "targetUserId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent deleting self or protected users
    if (targetUserId === caller.id) {
      return new Response(JSON.stringify({ error: "Cannot delete your own account from admin" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("is_protected")
      .eq("user_id", targetUserId)
      .single();

    if (targetProfile?.is_protected) {
      return new Response(JSON.stringify({ error: "Cannot delete protected user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All user-owned tables to clean
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
      await adminClient.from(table).delete().eq("user_id", targetUserId);
    }

    // FUB staged data
    const { data: importRuns } = await adminClient
      .from("fub_import_runs")
      .select("id")
      .eq("user_id", targetUserId);

    if (importRuns && importRuns.length > 0) {
      const runIds = importRuns.map((r: any) => r.id);
      await adminClient.from("fub_staged_leads").delete().in("import_run_id", runIds);
      await adminClient.from("fub_staged_deals").delete().in("import_run_id", runIds);
      await adminClient.from("fub_staged_tasks").delete().in("import_run_id", runIds);
      await adminClient.from("fub_import_runs").delete().eq("user_id", targetUserId);
    }

    await adminClient.from("admin_audit_events").delete().eq("admin_user_id", targetUserId);
    await adminClient.from("deal_participants").delete().eq("user_id", targetUserId);
    await adminClient.from("tasks").delete().eq("assigned_to_user_id", targetUserId);

    const { data: userLeads } = await adminClient.from("leads").select("id").eq("assigned_to_user_id", targetUserId);
    const { data: userDeals } = await adminClient.from("deals").select("id").eq("assigned_to_user_id", targetUserId);

    if (userLeads && userLeads.length > 0) {
      const leadIds = userLeads.map((l: any) => l.id);
      await adminClient.from("alerts").delete().in("related_lead_id", leadIds);
    }
    if (userDeals && userDeals.length > 0) {
      const dealIds = userDeals.map((d: any) => d.id);
      await adminClient.from("alerts").delete().in("related_deal_id", dealIds);
    }

    await adminClient.from("deals").delete().eq("assigned_to_user_id", targetUserId);
    await adminClient.from("leads").delete().eq("assigned_to_user_id", targetUserId);
    await adminClient.from("team_members").delete().eq("user_id", targetUserId);
    await adminClient.from("user_invitations").delete().eq("invited_by", targetUserId);
    await adminClient.from("user_roles").delete().eq("user_id", targetUserId);
    await adminClient.from("profiles").delete().eq("user_id", targetUserId);

    // Delete auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      console.error("Failed to delete auth user:", deleteError);
      return new Response(JSON.stringify({ error: "Failed to delete account" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log the admin action
    await adminClient.from("admin_audit_events").insert({
      admin_user_id: caller.id,
      action: "user_deleted",
      metadata: { targetUserId },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Admin delete user error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
