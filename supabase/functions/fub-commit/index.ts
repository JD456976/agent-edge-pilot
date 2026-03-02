import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");
    const userId = user.id;

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

    const committed = { leads: 0, deals: 0, tasks: 0, participants: 0, defaults_applied: 0 };
    const failures: { type: string; title: string; error: string; retryable: boolean }[] = [];
    const importedAt = new Date().toISOString();

    // Load user commission defaults for backfill
    const { data: userDefaults } = await svc.from("commission_defaults")
      .select("*").eq("user_id", userId).maybeSingle();
    const defaultRate = userDefaults ? Number((userDefaults as any).default_commission_rate) || 0 : 0;
    const defaultSplit = userDefaults ? Number((userDefaults as any).default_split) || 100 : 100;

    // --- COMMIT LEADS ---
    for (const sl of (stagedLeads || [])) {
      const norm = sl.normalized as any;
      const resolution = sl.resolution || (sl.match_status === "new" ? "create_new" : sl.match_status === "matched" ? "match_existing" : "skip");

      if (resolution === "skip") continue;

      try {
        if (resolution === "create_new") {
          // Build the full tag list: real FUB tags + "fub-import" marker
          const fubTags: string[] = Array.isArray(norm.fubTags) ? norm.fubTags : [];
          const allTags = ['fub-import', ...fubTags.filter((t: string) => t && t.trim())];

          await svc.from("leads").insert({
            assigned_to_user_id: userId,
            name: norm.name || "Unknown",
            source: norm.source || "FUB Import",
            engagement_score: norm.engagementScore || 0,
            last_contact_at: norm.lastContactAt || new Date().toISOString(),
            status_tags: allTags,
            lead_temperature: norm.leadTemperature || null,
            imported_from: `fub:${sl.fub_id}`,
            import_run_id: import_run_id,
            imported_at: importedAt,
          });
          committed.leads++;
        } else if (resolution === "match_existing" && sl.matched_lead_id) {
          // Fetch existing tags to merge
          const { data: existingLead } = await svc.from('leads')
            .select('status_tags, lead_temperature')
            .eq('id', sl.matched_lead_id)
            .single();

          const existingTags: string[] = (existingLead as any)?.status_tags || [];
          const newFubTags: string[] = Array.isArray(norm.fubTags) ? norm.fubTags : [];
          const mergedTags = Array.from(new Set([...existingTags, ...newFubTags]));

          const updates: any = {
            source: norm.source || undefined,
            last_contact_at: norm.lastContactAt || undefined,
            last_activity_at: new Date().toISOString(),
            status_tags: mergedTags,
          };
          // Only update temperature if FUB gave us one and we don't have one yet
          if (norm.leadTemperature && !(existingLead as any)?.lead_temperature) {
            updates.lead_temperature = norm.leadTemperature;
          }
          await svc.from("leads").update(updates).eq("id", sl.matched_lead_id).eq("assigned_to_user_id", userId);
          committed.leads++;
        }
      } catch (e: any) {
        failures.push({
          type: "lead",
          title: norm.name || "Unknown Lead",
          error: e.message || "Unknown error",
          retryable: /timeout|5\d\d|429/i.test(e.message || ""),
        });
      }
    }

    // --- COMMIT DEALS ---
    for (const sd of (stagedDeals || [])) {
      const norm = sd.normalized as any;
      const resolution = sd.resolution || (sd.match_status === "new" ? "create_new" : sd.match_status === "matched" ? "match_existing" : "skip");

      if (resolution === "skip") continue;

      try {
        if (resolution === "create_new") {
          const dealPrice = norm.price || 0;
          // Safe backfill: apply commission defaults if deal has price and defaults exist
          const applyDefaults = defaultRate > 0 && dealPrice > 0;
          const commissionRate = applyDefaults ? defaultRate : null;
          const commissionAmount = applyDefaults ? Math.round(dealPrice * (defaultRate / 100)) : 0;

          const { data: newDeal } = await svc.from("deals").insert({
            assigned_to_user_id: userId,
            title: norm.title || "Untitled Deal",
            price: dealPrice,
            stage: norm.stage || "offer",
            close_date: norm.closeDate || new Date(Date.now() + 30 * 86400000).toISOString(),
            commission_amount: commissionAmount,
            commission_rate: commissionRate,
            imported_from: `fub:${sd.fub_id}`,
            import_run_id: import_run_id,
            imported_at: importedAt,
          }).select("id").single();

          if (newDeal) {
            await svc.from("deal_participants").insert({
              deal_id: newDeal.id,
              user_id: userId,
              role: "primary_agent",
              split_percent: defaultSplit,
            });
            committed.participants++;

            if (applyDefaults) {
              committed.defaults_applied++;
            }
          }
          committed.deals++;
        } else if (resolution === "match_existing" && sd.matched_deal_id) {
          // Never overwrite existing deal commission fields or participants
          const updates: any = {};
          if (norm.price) updates.price = norm.price;
          if (norm.closeDate) updates.close_date = norm.closeDate;
          updates.last_touched_at = new Date().toISOString();
          await svc.from("deals").update(updates).eq("id", sd.matched_deal_id).eq("assigned_to_user_id", userId);
          committed.deals++;
        }
      } catch (e: any) {
        failures.push({
          type: "deal",
          title: norm.title || "Unknown Deal",
          error: e.message || "Unknown error",
          retryable: /timeout|5\d\d|429/i.test(e.message || ""),
        });
      }
    }

    // --- COMMIT TASKS ---
    for (const st of (stagedTasks || [])) {
      const norm = st.normalized as any;
      const resolution = st.resolution || (st.match_status === "new" ? "create_new" : st.match_status === "matched" ? "match_existing" : "skip");

      if (resolution === "skip") continue;

      try {
        if (resolution === "create_new") {
          await svc.from("tasks").insert({
            assigned_to_user_id: userId,
            title: norm.title || "Untitled Task",
            type: norm.type || "follow_up",
            due_at: norm.dueAt || new Date().toISOString(),
            completed_at: norm.completedAt || null,
            imported_from: `fub:${st.fub_id}`,
            import_run_id: import_run_id,
            imported_at: importedAt,
          });
          committed.tasks++;
        } else if (resolution === "match_existing" && st.matched_task_id) {
          const updates: any = { due_at: norm.dueAt };
          if (norm.completedAt) updates.completed_at = norm.completedAt;
          await svc.from("tasks").update(updates).eq("id", st.matched_task_id).eq("assigned_to_user_id", userId);
          committed.tasks++;
        }
      } catch (e: any) {
        failures.push({
          type: "task",
          title: norm.title || "Unknown Task",
          error: e.message || "Unknown error",
          retryable: /timeout|5\d\d|429/i.test(e.message || ""),
        });
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
      metadata: { import_run_id, committed, failures: failures.length },
    });

    // Audit: commission defaults applied during import
    if (committed.defaults_applied > 0) {
      await svc.from("admin_audit_events").insert({
        admin_user_id: userId,
        action: "import_applied_commission_defaults",
        metadata: { import_run_id, deals_affected: committed.defaults_applied, default_rate: defaultRate, default_split: defaultSplit },
      });
    }

    // Update sync state
    await svc.from("fub_sync_state").upsert({
      user_id: userId,
      last_commit_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return new Response(
      JSON.stringify({ success: true, committed, failures: failures.length > 0 ? failures : undefined }),
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
