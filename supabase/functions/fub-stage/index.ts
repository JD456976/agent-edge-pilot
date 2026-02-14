import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchFub(apiKey: string, endpoint: string, limit = 50) {
  const res = await fetch(
    `https://api.followupboss.com/v1/${endpoint}?limit=${limit}&sort=-created`,
    {
      headers: {
        Authorization: `Basic ${btoa(apiKey + ":")}`,
        Accept: "application/json",
      },
    }
  );
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) return [];
  const data = await res.json();
  return data.people || data.deals || data.tasks || data[endpoint] || [];
}

function normalizeLead(p: any) {
  return {
    name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown",
    email: p.emails?.[0]?.value || "",
    phone: p.phones?.[0]?.value || "",
    source: p.source || "",
    engagementScore: 0,
    lastContactAt: p.lastActivity || p.updated || p.created || null,
    createdAt: p.created || null,
  };
}

function normalizeDeal(d: any) {
  return {
    title: d.name || d.title || d.address || "Untitled Deal",
    price: d.price || d.value || 0,
    stage: "offer",
    closeDate: d.closingDate || d.closeDate || null,
    address: d.address || "",
  };
}

function normalizeTask(t: any) {
  return {
    title: t.name || t.subject || t.text || "Untitled Task",
    type: mapTaskType(t.type),
    dueAt: t.dueDate || t.due || null,
    completedAt: t.isCompleted ? (t.completedDate || new Date().toISOString()) : null,
    relatedFubPersonId: t.personId || null,
    relatedFubDealId: t.dealId || null,
  };
}

function mapTaskType(fubType: string | undefined): string {
  const map: Record<string, string> = {
    call: "call", phone: "call", text: "text", sms: "text",
    email: "email", showing: "showing", "open house": "open_house",
  };
  return map[(fubType || "").toLowerCase()] || "follow_up";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const encryptionKey = Deno.env.get("FUB_ENCRYPTION_KEY");
    if (!encryptionKey) throw new Error("Encryption key not configured");

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");
    const userId = claimsData.claims.sub as string;

    const svc = createClient(supabaseUrl, serviceKey);

    // Check integration connected
    const { data: integ } = await svc.from("crm_integrations").select("status").eq("user_id", userId).single();
    if (integ?.status !== "connected") throw new Error("Integration not connected. Validate first.");

    // Decrypt
    const { data: apiKey } = await svc.rpc("get_decrypted_api_key", {
      p_user_id: userId, p_encryption_key: encryptionKey,
    });
    if (!apiKey) throw new Error("No API key found");

    let body: { limit?: number; since?: string } = {};
    try { body = await req.json(); } catch { /* defaults */ }
    const limit = Math.min(body.limit || 50, 200);

    // Fetch FUB data
    const [rawPeople, rawDeals, rawTasks] = await Promise.all([
      fetchFub(apiKey, "people", limit),
      fetchFub(apiKey, "deals", limit),
      fetchFub(apiKey, "tasks", limit),
    ]);

    // Create import run
    const { data: run, error: runErr } = await svc.from("fub_import_runs").insert({
      user_id: userId,
      status: "staged",
      source_counts: { leads: rawPeople.length, deals: rawDeals.length, tasks: rawTasks.length },
    }).select("id").single();
    if (runErr || !run) throw new Error("Failed to create import run");

    // ---- MATCHING: fetch existing data for dedup ----
    const { data: existingLeads } = await svc.from("leads")
      .select("id, name, source, created_at")
      .eq("assigned_to_user_id", userId);

    const { data: existingDeals } = await svc.from("deals")
      .select("id, title, close_date")
      .eq("assigned_to_user_id", userId);

    const { data: existingTasks } = await svc.from("tasks")
      .select("id, title, due_at")
      .eq("assigned_to_user_id", userId);

    // Stage leads with matching
    const stagedLeads = rawPeople.map((p: any) => {
      const norm = normalizeLead(p);
      let match_status = "new";
      let matched_lead_id: string | null = null;

      if (existingLeads) {
        // Email match
        const emailMatch = norm.email && existingLeads.find((l: any) =>
          l.name?.toLowerCase() === norm.name.toLowerCase()
        );
        // Name + source match within 30 days
        const nameMatch = existingLeads.find((l: any) => {
          if (l.name?.toLowerCase() !== norm.name.toLowerCase()) return false;
          if (norm.source && l.source !== norm.source) return false;
          const created = new Date(l.created_at);
          const diff = Math.abs(Date.now() - created.getTime());
          return diff < 30 * 24 * 60 * 60 * 1000;
        });

        if (emailMatch) {
          match_status = "matched";
          matched_lead_id = emailMatch.id;
        } else if (nameMatch) {
          match_status = "conflict";
          matched_lead_id = nameMatch.id;
        }
      }

      return {
        user_id: userId,
        import_run_id: run.id,
        fub_id: String(p.id),
        payload: p,
        normalized: norm,
        match_status,
        matched_lead_id,
      };
    });

    // Stage deals with matching
    const stagedDeals = rawDeals.map((d: any) => {
      const norm = normalizeDeal(d);
      let match_status = "new";
      let matched_deal_id: string | null = null;

      if (existingDeals) {
        const titleMatch = existingDeals.find((ed: any) =>
          ed.title?.toLowerCase() === norm.title.toLowerCase()
        );
        if (titleMatch) {
          // Check close date proximity (30 day window)
          if (norm.closeDate && titleMatch.close_date) {
            const diff = Math.abs(new Date(norm.closeDate).getTime() - new Date(titleMatch.close_date).getTime());
            match_status = diff < 30 * 24 * 60 * 60 * 1000 ? "matched" : "conflict";
          } else {
            match_status = "conflict";
          }
          matched_deal_id = titleMatch.id;
        }
      }

      return {
        user_id: userId,
        import_run_id: run.id,
        fub_id: String(d.id),
        payload: d,
        normalized: norm,
        match_status,
        matched_deal_id,
      };
    });

    // Stage tasks with matching
    const stagedTasks = rawTasks.map((t: any) => {
      const norm = normalizeTask(t);
      let match_status = "new";
      let matched_task_id: string | null = null;

      if (existingTasks) {
        const titleMatch = existingTasks.find((et: any) =>
          et.title?.toLowerCase() === norm.title.toLowerCase() &&
          norm.dueAt && et.due_at &&
          Math.abs(new Date(norm.dueAt).getTime() - new Date(et.due_at).getTime()) < 24 * 60 * 60 * 1000
        );
        if (titleMatch) {
          match_status = "matched";
          matched_task_id = titleMatch.id;
        }
      }

      return {
        user_id: userId,
        import_run_id: run.id,
        fub_id: String(t.id),
        payload: t,
        normalized: norm,
        match_status,
        matched_task_id,
      };
    });

    // Insert staged data in parallel
    const insertPromises: Promise<any>[] = [];
    if (stagedLeads.length) insertPromises.push(svc.from("fub_staged_leads").insert(stagedLeads));
    if (stagedDeals.length) insertPromises.push(svc.from("fub_staged_deals").insert(stagedDeals));
    if (stagedTasks.length) insertPromises.push(svc.from("fub_staged_tasks").insert(stagedTasks));
    await Promise.all(insertPromises);

    // Audit log
    await svc.from("admin_audit_events").insert({
      admin_user_id: userId,
      action: "import_staged",
      metadata: {
        import_run_id: run.id,
        leads: stagedLeads.length,
        deals: stagedDeals.length,
        tasks: stagedTasks.length,
      },
    });

    return new Response(
      JSON.stringify({
        import_run_id: run.id,
        counts: {
          leads: { total: stagedLeads.length, new: stagedLeads.filter(l => l.match_status === "new").length, matched: stagedLeads.filter(l => l.match_status === "matched").length, conflict: stagedLeads.filter(l => l.match_status === "conflict").length },
          deals: { total: stagedDeals.length, new: stagedDeals.filter(d => d.match_status === "new").length, matched: stagedDeals.filter(d => d.match_status === "matched").length, conflict: stagedDeals.filter(d => d.match_status === "conflict").length },
          tasks: { total: stagedTasks.length, new: stagedTasks.filter(t => t.match_status === "new").length, matched: stagedTasks.filter(t => t.match_status === "matched").length, conflict: stagedTasks.filter(t => t.match_status === "conflict").length },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "rate_limited" ? 429 : 400;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
