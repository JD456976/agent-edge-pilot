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
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");
    const userId = user.id;

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

    const committedAtStr = run.committed_at;
    let deleted = { leads: 0, deals: 0, tasks: 0, participants: 0 };
    let skipped_edited = { leads: 0, deals: 0, tasks: 0 };
    let skipped_matched = { leads: 0, deals: 0, tasks: 0 };

    // --- UNDO LEADS ---
    const { data: importedLeads } = await svc.from("leads")
      .select("id, last_modified_at")
      .eq("import_run_id", import_run_id)
      .eq("imported_from", "fub")
      .eq("assigned_to_user_id", userId);

    if (importedLeads && importedLeads.length > 0) {
      const toDelete: string[] = [];
      for (const l of importedLeads) {
        if (l.last_modified_at && new Date(l.last_modified_at).getTime() > new Date(committedAtStr).getTime()) {
          skipped_edited.leads++;
        } else {
          toDelete.push(l.id);
        }
      }
      if (toDelete.length > 0) {
        await svc.from("alerts").delete().in("related_lead_id", toDelete);
        await svc.from("tasks").delete().in("related_lead_id", toDelete);
        const { count } = await svc.from("leads").delete({ count: "exact" }).in("id", toDelete);
        deleted.leads = count || 0;
      }
    }

    // Count matched leads (not created by import, so not deletable)
    const { data: stagedMatchedLeads } = await svc.from("fub_staged_leads")
      .select("id")
      .eq("import_run_id", import_run_id)
      .eq("match_status", "matched");
    skipped_matched.leads = stagedMatchedLeads?.length || 0;

    // --- UNDO DEALS ---
    const { data: importedDeals } = await svc.from("deals")
      .select("id, last_modified_at")
      .eq("import_run_id", import_run_id)
      .eq("imported_from", "fub")
      .eq("assigned_to_user_id", userId);

    if (importedDeals && importedDeals.length > 0) {
      const toDelete: string[] = [];
      for (const d of importedDeals) {
        if (d.last_modified_at && new Date(d.last_modified_at).getTime() > new Date(committedAtStr).getTime()) {
          skipped_edited.deals++;
        } else {
          toDelete.push(d.id);
        }
      }
      if (toDelete.length > 0) {
        const { count: pCount } = await svc.from("deal_participants").delete({ count: "exact" }).in("deal_id", toDelete);
        deleted.participants = pCount || 0;
        await svc.from("alerts").delete().in("related_deal_id", toDelete);
        await svc.from("tasks").delete().in("related_deal_id", toDelete);
        const { count } = await svc.from("deals").delete({ count: "exact" }).in("id", toDelete);
        deleted.deals = count || 0;
      }
    }

    const { data: stagedMatchedDeals } = await svc.from("fub_staged_deals")
      .select("id")
      .eq("import_run_id", import_run_id)
      .eq("match_status", "matched");
    skipped_matched.deals = stagedMatchedDeals?.length || 0;

    // --- UNDO TASKS ---
    const { data: importedTasks } = await svc.from("tasks")
      .select("id, last_modified_at")
      .eq("import_run_id", import_run_id)
      .eq("imported_from", "fub")
      .eq("assigned_to_user_id", userId);

    if (importedTasks && importedTasks.length > 0) {
      const toDelete: string[] = [];
      for (const t of importedTasks) {
        if (t.last_modified_at && new Date(t.last_modified_at).getTime() > new Date(committedAtStr).getTime()) {
          skipped_edited.tasks++;
        } else {
          toDelete.push(t.id);
        }
      }
      if (toDelete.length > 0) {
        const { count } = await svc.from("tasks").delete({ count: "exact" }).in("id", toDelete);
        deleted.tasks = count || 0;
      }
    }

    const { data: stagedMatchedTasks } = await svc.from("fub_staged_tasks")
      .select("id")
      .eq("import_run_id", import_run_id)
      .eq("match_status", "matched");
    skipped_matched.tasks = stagedMatchedTasks?.length || 0;

    // Mark run as undone
    await svc.from("fub_import_runs").update({
      undone_at: new Date().toISOString(),
      undone_by: userId,
    }).eq("id", import_run_id);

    // Audit log
    await svc.from("admin_audit_events").insert({
      admin_user_id: userId,
      action: "import_undone",
      metadata: { import_run_id, deleted, skipped_edited, skipped_matched },
    });

    return new Response(
      JSON.stringify({ success: true, deleted, skipped_edited, skipped_matched }),
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
