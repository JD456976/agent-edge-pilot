import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Use service role to delete all user data and auth account
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Delete user data from all tables (order matters for foreign keys)
    const tablesToClean = [
      { table: "activity_events", column: "user_id" },
      { table: "self_opt_action_outcomes", column: "user_id" },
      { table: "self_opt_behavior_signals", column: "user_id" },
      { table: "self_opt_preferences", column: "user_id" },
      { table: "network_telemetry_events", column: "user_id" },
      { table: "network_participation", column: "user_id" },
      { table: "scoring_preferences", column: "user_id" },
      { table: "commission_defaults", column: "user_id" },
      { table: "agent_intelligence_profile", column: "user_id" },
      { table: "fub_watchlist", column: "user_id" },
      { table: "fub_ignored_changes", column: "user_id" },
      { table: "fub_conflict_resolutions", column: "user_id" },
      { table: "fub_sync_state", column: "user_id" },
      { table: "crm_integrations", column: "user_id" },
      { table: "admin_audit_events", column: "admin_user_id" },
      { table: "deal_participants", column: "user_id" },
      { table: "tasks", column: "assigned_to_user_id" },
      { table: "alerts", column: "organization_id" }, // handled below
      { table: "deals", column: "assigned_to_user_id" },
      { table: "leads", column: "assigned_to_user_id" },
      { table: "user_roles", column: "user_id" },
      { table: "team_members", column: "user_id" },
      { table: "user_invitations", column: "invited_by" },
    ];

    // Delete staged import data
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

    // Delete from each table
    for (const { table, column } of tablesToClean) {
      if (table === "alerts") continue; // skip alerts, handle separately
      await adminClient.from(table).delete().eq(column, userId);
    }

    // Delete alerts related to user's leads/deals (already deleted, so just clean orphans)
    // These were cascade-dependent, but we clean up explicitly
    await adminClient.from("alerts").delete().is("related_lead_id", null).is("related_deal_id", null);

    // Delete profile
    await adminClient.from("profiles").delete().eq("user_id", userId);

    // Delete auth user
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
