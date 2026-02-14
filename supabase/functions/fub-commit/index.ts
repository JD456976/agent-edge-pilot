import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startTime = Date.now();

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

    // Verify run belongs to user and is staged
    const { data: run, error: runErr } = await svc.from("fub_import_runs")
      .select("*").eq("id", import_run_id).eq("user_id", userId).single();
    if (runErr || !run) throw new Error("Import run not found");
    if (run.status !== "staged") throw new Error(`Run is ${run.status}, cannot commit`);

    // Check reviewer role - block commit
    const { data: hasReviewer } = await svc.rpc("has_role", { _user_id: userId, _role: "reviewer" });
    if (hasReviewer) throw new Error("Review mode: imports disabled");

    // Fetch all staged data
    const [{ data: stagedLeads }, { data: stagedDeals }, { data: stagedTasks }] = await Promise.all([
      svc.from("fub_staged_leads").select("*").eq("import_run_id", import_run_id),
      svc.from("fub_staged_deals").select("*").eq("import_run_id", import_run_id),
      svc.from("fub_staged_tasks").select("*").eq("import_run_id", import_run_id),
    ]);

    // Check for unresolved conflicts
    const unresolvedLeads = (stagedLeads || []).filter(l => l.match_status === "conflict" && !l.resolution);
    const unresolvedDeals = (stagedDeals || []).filter(d => d.match_status === "conflict" && !d.resolution);
    const unresolvedTasks = (stagedTasks || []).filter(t => t.match_status === "conflict" && !t.resolution);
    if (unresolvedLeads.length || unresolvedDeals.length || unresolvedTasks.length) {
      throw new Error(`Unresolved conflicts: ${unresolvedLeads.length} leads, ${unresolvedDeals.length} deals, ${unresolvedTasks.length} tasks. Resolve before committing.`);
    }

    let committed = { leads: 0, deals: 0, tasks: 0, participants: 0 };

    // --- COMMIT LEADS ---
    for (const sl of (stagedLeads || [])) {
      const norm = sl.normalized as any;
      const resolution = sl.resolution || (sl.match_status === "new" ? "create_new" : sl.match_status === "matched" ? "match_existing" : "skip");

      if (resolution === "skip") continue;

      if (resolution === "create_new") {
        await svc.from("leads").insert({
          assigned_to_user_id: userId,
          name: norm.name || "Unknown",
          source: norm.source || "FUB Import",
          engagement_score: norm.engagementScore || 0,
          last_contact_at: norm.lastContactAt || new Date().toISOString(),
          status_tags: ["fub-import"],
        });
        committed.leads++;
      } else if (resolution === "match_existing" && sl.matched_lead_id) {
        // Update non-sensitive fields only
        await svc.from("leads").update({
          source: norm.source || undefined,
          last_contact_at: norm.lastContactAt || undefined,
          last_activity_at: new Date().toISOString(),
        }).eq("id", sl.matched_lead_id).eq("assigned_to_user_id", userId);
        committed.leads++;
      }
    }

    // --- COMMIT DEALS ---
    for (const sd of (stagedDeals || [])) {
      const norm = sd.normalized as any;
      const resolution = sd.resolution || (sd.match_status === "new" ? "create_new" : sd.match_status === "matched" ? "match_existing" : "skip");

      if (resolution === "skip") continue;

      if (resolution === "create_new") {
        const { data: newDeal } = await svc.from("deals").insert({
          assigned_to_user_id: userId,
          title: norm.title || "Untitled Deal",
          price: norm.price || 0,
          stage: norm.stage || "offer",
          close_date: norm.closeDate || new Date(Date.now() + 30 * 86400000).toISOString(),
        }).select("id").single();

        // Create participant for importing user
        if (newDeal) {
          await svc.from("deal_participants").insert({
            deal_id: newDeal.id,
            user_id: userId,
            role: "primary_agent",
            split_percent: 100,
          });
          committed.participants++;
        }
        committed.deals++;
      } else if (resolution === "match_existing" && sd.matched_deal_id) {
        // Update non-sensitive fields only (never overwrite commission)
        const updates: any = {};
        if (norm.price) updates.price = norm.price;
        if (norm.closeDate) updates.close_date = norm.closeDate;
        updates.last_touched_at = new Date().toISOString();
        await svc.from("deals").update(updates).eq("id", sd.matched_deal_id).eq("assigned_to_user_id", userId);
        committed.deals++;
      }
    }

    // --- COMMIT TASKS ---
    for (const st of (stagedTasks || [])) {
      const norm = st.normalized as any;
      const resolution = st.resolution || (st.match_status === "new" ? "create_new" : st.match_status === "matched" ? "match_existing" : "skip");

      if (resolution === "skip") continue;

      if (resolution === "create_new") {
        await svc.from("tasks").insert({
          assigned_to_user_id: userId,
          title: norm.title || "Untitled Task",
          type: norm.type || "follow_up",
          due_at: norm.dueAt || new Date().toISOString(),
          completed_at: norm.completedAt || null,
        });
        committed.tasks++;
      } else if (resolution === "match_existing" && st.matched_task_id) {
        const updates: any = { due_at: norm.dueAt };
        if (norm.completedAt) updates.completed_at = norm.completedAt;
        await svc.from("tasks").update(updates).eq("id", st.matched_task_id).eq("assigned_to_user_id", userId);
        committed.tasks++;
      }
    }

    // Mark run committed with counts and timing
    const durationMs = Date.now() - startTime;
    await svc.from("fub_import_runs").update({
      status: "committed",
      committed_counts: committed,
      committed_at: new Date().toISOString(),
      duration_ms: durationMs,
    }).eq("id", import_run_id);

    // Audit log
    await svc.from("admin_audit_events").insert({
      admin_user_id: userId,
      action: "import_committed",
      metadata: { import_run_id, committed },
    });

    return new Response(
      JSON.stringify({ success: true, committed }),
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
