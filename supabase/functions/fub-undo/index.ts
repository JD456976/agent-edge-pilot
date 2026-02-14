import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Server config error");

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");
    const userId = claimsData.claims.sub as string;

    const { import_run_id } = await req.json();
    if (!import_run_id) throw new Error("Missing import_run_id");

    const svc = createClient(supabaseUrl, serviceKey);

    // Verify run belongs to user and is committed
    const { data: run, error: runErr } = await svc.from("fub_import_runs")
      .select("*").eq("id", import_run_id).eq("user_id", userId).single();
    if (runErr || !run) throw new Error("Import run not found");
    if (run.status !== "committed") throw new Error(`Run is ${run.status}, cannot undo`);
    if (run.undone_at) throw new Error("Already undone");

    // Check 10-minute window
    const committedAt = new Date(run.committed_at).getTime();
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    if (now - committedAt > tenMinutes) {
      throw new Error("Undo window expired (10 minutes). Contact support if needed.");
    }

    // Check no newer import run exists
    const { data: newerRuns } = await svc.from("fub_import_runs")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "committed")
      .gt("committed_at", run.committed_at)
      .limit(1);
    if (newerRuns && newerRuns.length > 0) {
      throw new Error("A newer import has been committed. Cannot undo this run.");
    }

    // Check reviewer role
    const { data: hasReviewer } = await svc.rpc("has_role", { _user_id: userId, _role: "reviewer" });
    if (hasReviewer) throw new Error("Review mode: undo disabled");

    let undone = { leads: 0, deals: 0, tasks: 0, participants: 0 };

    // Delete ONLY records created by this import run (not matched/linked ones)
    // Leads created by this import
    const { data: importedLeads } = await svc.from("leads")
      .select("id")
      .eq("import_run_id", import_run_id)
      .eq("imported_from", "fub")
      .eq("assigned_to_user_id", userId);

    if (importedLeads && importedLeads.length > 0) {
      const leadIds = importedLeads.map(l => l.id);
      // Delete related alerts first
      await svc.from("alerts").delete().in("related_lead_id", leadIds);
      // Delete related tasks
      await svc.from("tasks").delete().in("related_lead_id", leadIds);
      // Delete leads
      const { count } = await svc.from("leads").delete({ count: "exact" }).in("id", leadIds);
      undone.leads = count || 0;
    }

    // Deals created by this import
    const { data: importedDeals } = await svc.from("deals")
      .select("id")
      .eq("import_run_id", import_run_id)
      .eq("imported_from", "fub")
      .eq("assigned_to_user_id", userId);

    if (importedDeals && importedDeals.length > 0) {
      const dealIds = importedDeals.map(d => d.id);
      // Delete participants first
      const { count: pCount } = await svc.from("deal_participants").delete({ count: "exact" }).in("deal_id", dealIds);
      undone.participants = pCount || 0;
      // Delete related alerts
      await svc.from("alerts").delete().in("related_deal_id", dealIds);
      // Delete related tasks
      await svc.from("tasks").delete().in("related_deal_id", dealIds);
      // Delete deals
      const { count } = await svc.from("deals").delete({ count: "exact" }).in("id", dealIds);
      undone.deals = count || 0;
    }

    // Tasks created by this import (standalone, not already deleted above)
    const { count: taskCount } = await svc.from("tasks")
      .delete({ count: "exact" })
      .eq("import_run_id", import_run_id)
      .eq("imported_from", "fub")
      .eq("assigned_to_user_id", userId);
    undone.tasks = taskCount || 0;

    // Mark run as undone
    await svc.from("fub_import_runs").update({
      undone_at: new Date().toISOString(),
      undone_by: userId,
    }).eq("id", import_run_id);

    // Audit log
    await svc.from("admin_audit_events").insert({
      admin_user_id: userId,
      action: "import_undone",
      metadata: { import_run_id, undone },
    });

    return new Response(
      JSON.stringify({ success: true, undone }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
