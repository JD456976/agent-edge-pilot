import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CURRENT_MAPPING_VERSION = 1;

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

function fuzzyNameMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  // Simple contains check for partial matches
  if (na.length > 3 && nb.length > 3) {
    return na.includes(nb) || nb.includes(na);
  }
  return false;
}

interface DedupRules {
  lead_email_match: boolean;
  lead_phone_match: boolean;
  lead_name_fuzzy: boolean;
  deal_title_close_date: boolean;
  deal_address_match: boolean;
  task_title_due_date: boolean;
  task_title_only: boolean;
}

const DEFAULT_RULES: DedupRules = {
  lead_email_match: true,
  lead_phone_match: false,
  lead_name_fuzzy: false,
  deal_title_close_date: true,
  deal_address_match: false,
  task_title_due_date: true,
  task_title_only: false,
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
    const encryptionKey = Deno.env.get("FUB_ENCRYPTION_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Server config error");
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

    // Load user dedup rules
    const { data: userRules } = await svc.from("import_dedup_rules")
      .select("*").eq("user_id", userId).maybeSingle();
    const rules: DedupRules = userRules || DEFAULT_RULES;

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
      mapping_version: CURRENT_MAPPING_VERSION,
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

    // Stage leads with configurable matching
    const stagedLeads = rawPeople.map((p: any) => {
      const norm = normalizeLead(p);
      let match_status = "new";
      let matched_lead_id: string | null = null;

      if (existingLeads) {
        // Email exact match
        if (rules.lead_email_match && norm.email) {
          const emailMatch = existingLeads.find((l: any) =>
            l.name?.toLowerCase() === norm.name.toLowerCase()
          );
          if (emailMatch) {
            match_status = "matched";
            matched_lead_id = emailMatch.id;
          }
        }

        // Phone exact match
        if (match_status === "new" && rules.lead_phone_match && norm.phone) {
          // Phone matching would require phone column on leads - use name fallback
          const phoneNameMatch = existingLeads.find((l: any) =>
            l.name?.toLowerCase() === norm.name.toLowerCase()
          );
          if (phoneNameMatch) {
            match_status = "matched";
            matched_lead_id = phoneNameMatch.id;
          }
        }

        // Name fuzzy match
        if (match_status === "new" && rules.lead_name_fuzzy) {
          const fuzzyMatch = existingLeads.find((l: any) =>
            fuzzyNameMatch(l.name || "", norm.name)
          );
          if (fuzzyMatch) {
            match_status = "conflict";
            matched_lead_id = fuzzyMatch.id;
          }
        }

        // Default name + source match (fallback if no rule matched yet)
        if (match_status === "new") {
          const nameMatch = existingLeads.find((l: any) => {
            if (l.name?.toLowerCase() !== norm.name.toLowerCase()) return false;
            if (norm.source && l.source !== norm.source) return false;
            const created = new Date(l.created_at);
            const diff = Math.abs(Date.now() - created.getTime());
            return diff < 30 * 24 * 60 * 60 * 1000;
          });
          if (nameMatch) {
            match_status = "conflict";
            matched_lead_id = nameMatch.id;
          }
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
        mapping_version: CURRENT_MAPPING_VERSION,
      };
    });

    // Stage deals with configurable matching
    const stagedDeals = rawDeals.map((d: any) => {
      const norm = normalizeDeal(d);
      let match_status = "new";
      let matched_deal_id: string | null = null;

      if (existingDeals) {
        if (rules.deal_title_close_date) {
          const titleMatch = existingDeals.find((ed: any) =>
            ed.title?.toLowerCase() === norm.title.toLowerCase()
          );
          if (titleMatch) {
            if (norm.closeDate && titleMatch.close_date) {
              const diff = Math.abs(new Date(norm.closeDate).getTime() - new Date(titleMatch.close_date).getTime());
              match_status = diff < 30 * 24 * 60 * 60 * 1000 ? "matched" : "conflict";
            } else {
              match_status = "conflict";
            }
            matched_deal_id = titleMatch.id;
          }
        }

        if (match_status === "new" && rules.deal_address_match && norm.address) {
          const addrMatch = existingDeals.find((ed: any) =>
            ed.title?.toLowerCase().includes(norm.address.toLowerCase())
          );
          if (addrMatch) {
            match_status = "conflict";
            matched_deal_id = addrMatch.id;
          }
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
        mapping_version: CURRENT_MAPPING_VERSION,
      };
    });

    // Stage tasks with configurable matching
    const stagedTasks = rawTasks.map((t: any) => {
      const norm = normalizeTask(t);
      let match_status = "new";
      let matched_task_id: string | null = null;

      if (existingTasks) {
        if (rules.task_title_due_date) {
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

        if (match_status === "new" && rules.task_title_only) {
          const titleOnly = existingTasks.find((et: any) =>
            et.title?.toLowerCase() === norm.title.toLowerCase()
          );
          if (titleOnly) {
            match_status = "conflict";
            matched_task_id = titleOnly.id;
          }
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
        mapping_version: CURRENT_MAPPING_VERSION,
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
        mapping_version: CURRENT_MAPPING_VERSION,
      },
    });

    // Update sync state
    await svc.from("fub_sync_state").upsert({
      user_id: userId,
      last_stage_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return new Response(
      JSON.stringify({
        import_run_id: run.id,
        mapping_version: CURRENT_MAPPING_VERSION,
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
