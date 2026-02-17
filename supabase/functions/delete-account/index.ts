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

    // Verify the user with their JWT
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // All user-owned tables to clean (order: no-FK tables first, then FK-dependent)
    const userTables = [
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
    ];

    // Delete from simple user_id tables
    for (const table of userTables) {
      await adminClient.from(table).delete().eq("user_id", userId);
    }

    // FUB staged data (child tables first due to FK on import_run_id)
    const { data: importRuns } = await adminClient
      .from("fub_import_runs")
      .select("id")
      .eq("user_id", userId);

    if (importRuns && importRuns.length > 0) {
      const runIds = importRuns.map((r: any) => r.id);
      await adminClient.from("fub_staged_leads").delete().in("import_run_id", runIds);
      await adminClient.from("fub_staged_deals").delete().in("import_run_id", runIds);
      await adminClient.from("fub_staged_tasks").delete().in("import_run_id", runIds);
      await adminClient.from("fub_import_runs").delete().eq("user_id", userId);
    }

    // Admin audit events
    await adminClient.from("admin_audit_events").delete().eq("admin_user_id", userId);

    // Deal participants
    await adminClient.from("deal_participants").delete().eq("user_id", userId);

    // Tasks
    await adminClient.from("tasks").delete().eq("assigned_to_user_id", userId);

    // Get lead/deal IDs for alert cleanup
    const { data: userLeads } = await adminClient.from("leads").select("id").eq("assigned_to_user_id", userId);
    const { data: userDeals } = await adminClient.from("deals").select("id").eq("assigned_to_user_id", userId);

    if (userLeads && userLeads.length > 0) {
      const leadIds = userLeads.map((l: any) => l.id);
      await adminClient.from("alerts").delete().in("related_lead_id", leadIds);
    }
    if (userDeals && userDeals.length > 0) {
      const dealIds = userDeals.map((d: any) => d.id);
      await adminClient.from("alerts").delete().in("related_deal_id", dealIds);
    }

    // Deals and leads
    await adminClient.from("deals").delete().eq("assigned_to_user_id", userId);
    await adminClient.from("leads").delete().eq("assigned_to_user_id", userId);

    // Team memberships and invitations
    await adminClient.from("team_members").delete().eq("user_id", userId);
    await adminClient.from("user_invitations").delete().eq("invited_by", userId);
    await adminClient.from("user_roles").delete().eq("user_id", userId);

    // Profile
    await adminClient.from("profiles").delete().eq("user_id", userId);

    // Delete auth user (cascades remaining FK references)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Failed to delete auth user:", deleteError);
      return new Response(JSON.stringify({ error: "Failed to delete account" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Delete account error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
